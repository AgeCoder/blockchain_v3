import asyncio
import websockets
import json
import logging
import uuid
import os
import socket
import time
import duckdb
import gzip
import aiohttp
from websockets.exceptions import ConnectionClosedError
from models.block import Block
from models.blockchain import Blockchain
from models.transaction import Transaction
from models.transaction_pool import TransactionPool
from core.config import BOOT_NODE

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def get_public_ip():
    """Get the public IP address of the current machine."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

class PubSub:
    def __init__(self, blockchain, transaction_pool):
        host = os.environ.get('HOST', get_public_ip())
        self.blockchain = blockchain
        self.transaction_pool = transaction_pool
        self.node_id = str(uuid.uuid4())
        self.peer_nodes = {}  # uri -> websocket
        self.known_peers = set()
        self.peers_file = "peers.json"
        self.boot_node_uri = BOOT_NODE
        self.max_retries = 3
        self.websocket_port = 5001 if os.environ.get('PEER') != 'True' else 6001
        self.my_uri = f"ws://{host}:{self.websocket_port}"
        self.server = None
        self.loop = None
        self.processed_transactions = set()  # Track processed transaction IDs
        self.syncing_chain = False
        self.blocks_in_transit = set()
        self.tx_pool_syncing = False  # Track transaction pool sync state
        self.last_tx_pool_request = 0  # Timestamp of last MSG_REQUEST_TX_POOL
        self.tx_pool_request_cooldown = 5  # Seconds between requests
        # New attributes for peer reliability and chunk sizing
        self.peer_reliability = {}  # uri -> failure_count
        self.chunk_size = 10  # Initial chunk size (blocks)
        self.min_chunk_size = 5
        self.max_chunk_size = 50
        self.chunk_size_increment = 5
        self.chunk_size_decrement = 5
        # DuckDB setup keep the difernt db for peer and non-peer
        self.db_file = "./database/blockchain.db" if os.environ.get('PEER') != 'True' else "./database/peer_blockchain.db"
        self.conn = duckdb.connect(self.db_file)
        self.initialize_db()
        # Message Types
        self.MSG_NEW_BLOCK = "NEW_BLOCK"
        self.MSG_NEW_TX = "NEW_TX"
        self.MSG_REQUEST_CHAIN = "REQUEST_CHAIN"
        self.MSG_RESPONSE_CHAIN = "RESPONSE_CHAIN"
        self.MSG_REGISTER_PEER = "REGISTER_PEER"
        self.MSG_PEER_LIST = "PEER_LIST"
        self.MSG_REQUEST_TX_POOL = "REQUEST_TX_POOL"
        self.MSG_RESPONSE_TX_POOL = "RESPONSE_TX_POOL"
        self.MSG_REQUEST_CHAIN_LENGTH = "REQUEST_CHAIN_LENGTH"
        self.MSG_RESPONSE_CHAIN_LENGTH = "RESPONSE_CHAIN_LENGTH"
        self.MSG_REQUEST_BLOCKS = "REQUEST_BLOCKS"
        self.MSG_RESPONSE_BLOCKS = "RESPONSE_BLOCKS"
        self.MSG_REQUEST_TX = "REQUEST_TX"
        self.MSG_RESPONSE_TX = "RESPONSE_TX"

    def initialize_db(self):
        """Initialize DuckDB table for blockchain storage."""
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS blocks (
                index INTEGER,
                timestamp BIGINT,
                data JSON,
                last_hash VARCHAR,
                hash VARCHAR,
                nonce BIGINT,
                difficulty INTEGER,
                height INTEGER,
                version INTEGER,
                merkle_root VARCHAR,
                tx_count INTEGER,
                PRIMARY KEY (index)
            )
        """)
        self.save_block_to_db(Block.from_json(self.blockchain.chain[0].to_json()))  # Save genesis block

    def save_block_to_db(self, block):
        """Save a block to DuckDB."""
        try:
            self.conn.execute("""
                INSERT OR REPLACE INTO blocks (
                    index, timestamp, data, last_hash, hash, nonce,
                    difficulty, height, version, merkle_root, tx_count
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                block.height,
                block.timestamp,
                json.dumps(block.data),
                block.last_hash,
                block.hash,
                block.nonce,
                block.difficulty,
                block.height,
                block.version,
                block.merkle_root,
                block.tx_count
            ))
            logger.info(f"Saved block {block.height} to DuckDB")
        except Exception as e:
            logger.error(f"Error saving block to DuckDB: {e}")

    def load_blockchain_from_db(self):
        """Load blockchain from DuckDB."""
        try:
            result = self.conn.execute("SELECT COUNT(*) FROM blocks").fetchone()
            if not result or result[0] == 0:
                logger.info("No blocks found in DuckDB, starting with genesis block")
                return [Block.from_json(self.blockchain.chain[0].to_json())]  # Return genesis block as Block object
            
            #   Load all blocks if they exist
            result = self.conn.execute("SELECT * FROM blocks ORDER BY index").fetchall()
            chain = []
            for row in result:
                block_data = {
                    "index": row[0],
                    "timestamp": row[1],
                    "data": json.loads(row[2]),
                    "last_hash": row[3],
                    "hash": row[4],
                    "nonce": row[5],
                    "difficulty": row[6],
                    "height": row[7],
                    "version": row[8],
                    "merkle_root": row[9],
                    "tx_count": row[10]
                }
                block = Block.from_json(block_data)
                chain.append(block)
            logger.info(f"Loaded {len(chain)} blocks from DuckDB")
            return chain
        except Exception as e:
            logger.error(f"Error loading blockchain from DuckDB: {e}")
            return [Block.from_json(self.blockchain.chain[0].to_json())]  # Fallback to genesis block  # Fallback to genesis block

    def compress_data(self, data):
        """Compress data using gzip."""
        return gzip.compress(json.dumps(data).encode('utf-8'))

    def decompress_data(self, compressed_data):
        """Decompress data using gzip."""
        return json.loads(gzip.decompress(compressed_data).decode('utf-8'))

    def update_peer_reliability(self, uri, success=True):
        """Update peer reliability score."""
        if uri not in self.peer_reliability:
            self.peer_reliability[uri] = 0
        if not success:
            self.peer_reliability[uri] += 1
            if self.peer_reliability[uri] >= 5:  # Deprioritize after 5 failures
                logger.warning(f"Peer {uri} marked as unreliable (failures: {self.peer_reliability[uri]})")
        else:
            self.peer_reliability[uri] = max(0, self.peer_reliability[uri] - 1)  # Reduce failure count on success

    def adjust_chunk_size(self, success=True):
        """Adjust chunk size based on sync success."""
        if success:
            self.chunk_size = min(self.max_chunk_size, self.chunk_size + self.chunk_size_increment)
            logger.debug(f"Increased chunk size to {self.chunk_size}")
        else:
            self.chunk_size = max(self.min_chunk_size, self.chunk_size - self.chunk_size_decrement)
            logger.debug(f"Decreased chunk size to {self.chunk_size}")

    def create_message(self, msg_type, data):
        """Create a JSON formatted message with compression."""
        message = {"type": msg_type, "data": data, "from": self.node_id}
        compressed_data = self.compress_data(message)
        return compressed_data

    def parse_message(self, message):
        """Parse and decompress incoming message."""
        try:
            if isinstance(message, bytes):
                return self.decompress_data(message)
            return json.loads(message)
        except Exception as e:
            logger.error(f"Error parsing message: {e}")
            raise json.JSONDecodeError("Invalid message", message, 0)

    def save_peers(self):
        """Save the list of known peers to a file."""
        try:
            with open(self.peers_file, "w") as f:
                json.dump(list(self.known_peers), f)
        except Exception as e:
            logger.error(f"Error saving peers: {e}")

    def load_peers(self):
        """Load the list of known peers from a file."""
        try:
            if os.path.exists(self.peers_file):
                with open(self.peers_file, "r") as f:
                    peers = json.load(f)
                    return set(peers)
            return set()
        except Exception as e:
            logger.error(f"Error loading peers: {e}")
            return set()

    async def fetch_blocks_from_peer(self, uri, start_height, end_height):
        """Fetch a chunk of blocks from a peer."""
        try:
            async with aiohttp.ClientSession() as session:
                # Simulate WebSocket request using HTTP for parallel fetching
                async with session.post(f"{uri}/request_blocks", json={"start_height": start_height, "end_height": end_height}) as response:
                    if response.status == 200:
                        compressed_data = await response.read()
                        blocks_data = self.decompress_data(compressed_data)
                        blocks = [Block.from_json(block_data) for block_data in blocks_data]
                        self.update_peer_reliability(uri, success=True)
                        self.adjust_chunk_size(success=True)
                        return blocks
                    else:
                        self.update_peer_reliability(uri, success=False)
                        self.adjust_chunk_size(success=False)
                        return []
        except Exception as e:
            logger.error(f"Failed to fetch blocks from {uri}: {e}")
            self.update_peer_reliability(uri, success=False)
            self.adjust_chunk_size(success=False)
            return []

    async def sync_with_peers(self):
        """Synchronize blockchain with peers, fetching chunks in parallel."""
        local_chain = self.load_blockchain_from_db()
        try:
            self.blockchain.replace_chain(local_chain)
        except Exception as e:
            logger.error(f"Failed to set local chain: {e}")
            local_chain = [Block.from_json(self.blockchain.chain[0].to_json())]  # Fallback to genesis
        local_length = len(local_chain)
        chains = {}
        tasks = []

        #   Request chain lengths from all peers
        for uri in self.peer_nodes:
            if uri not in self.peer_reliability or self.peer_reliability[uri] < 5 and uri != self.my_uri:  #  Do not request from self
                tasks.append(self.request_chain_length(uri))

        responses = await asyncio.gather(*tasks, return_exceptions=True)
        for uri, response in zip(self.peer_nodes.keys(), responses):
            if isinstance(response, int) and response > local_length:
                chains[uri] = response
                logger.debug(f"Peer {uri} has chain length {response}")

        if not chains:
            logger.info("No peers have a longer chain")
            return

        #   If only one peer is available, request the entire chain from them
        print(len(chains))
        if len(chains) == 1:
            selected_peer = list(chains.keys())[0]
            if selected_peer == self.my_uri:  #   Check if it's not self before proceeding
                logger.info("Only peer is self, not syncing")
                return
            logger.info(f"Only one peer available ({selected_peer}), requesting full chain")
            try:
                #   Request the entire chain from the single peer
                async with websockets.connect(selected_peer) as ws:
                    await ws.send(self.create_message(self.MSG_REQUEST_CHAIN, None))
                    response = await ws.recv()
                    msg = self.parse_message(response)
                    if msg['type'] == self.MSG_RESPONSE_CHAIN:
                        received_chain = [Block.from_json(block_data) for block_data in msg['data']]
                        if len(received_chain) > len(self.blockchain.chain):
                            logger.info(f"Received full chain of length {len(received_chain)} from {selected_peer}")
                            self.blockchain.utxo_set.clear()
                            self.blockchain.replace_chain(received_chain)
                            for block in received_chain:
                                self.save_block_to_db(block)
                            self.transaction_pool.clear_blockchain_transactions(self.blockchain)
                            logger.info(f"Successfully synced full chain from {selected_peer}")
                            return
            except Exception as e:
                logger.error(f"Failed to get full chain from single peer {selected_peer}: {e}")

            #   Original chunk-based sync logic for multiple peers
            selected_peer = max(chains, key=chains.get)
            longest_length = chains[selected_peer]
            logger.info(f"Selected peer {selected_peer} with chain length {longest_length}")

            #   Rest of the original chunk-based sync logic remains the same...
            start_index = local_length
            missing_blocks = []
            while start_index < longest_length:
                end_index = min(start_index + self.chunk_size, longest_length)
                logger.debug(f"Fetching blocks {start_index} to {end_index-1} from {selected_peer}")
                blocks = await self.fetch_blocks_from_peer(selected_peer, start_index, end_index)
                if blocks:
                    missing_blocks.extend(blocks)
                    start_index = end_index
                    self.update_peer_reliability(selected_peer, success=True)
                    self.adjust_chunk_size(success=True)
                else:
                    logger.warning(f"Failed to fetch blocks {start_index} to {end_index-1}, retrying")
                    self.update_peer_reliability(selected_peer, success=False)
                    self.adjust_chunk_size(success=False)
                    await asyncio.sleep(1)
            if missing_blocks:
                potential_chain = local_chain + missing_blocks
                try:
                    self.blockchain.utxo_set.clear()
                    self.blockchain.replace_chain(potential_chain)
                    for block in missing_blocks:
                        self.save_block_to_db(block)
                    self.transaction_pool.clear_blockchain_transactions(self.blockchain)
                    logger.info(f"Synced {len(missing_blocks)} missing blocks, new chain length: {len(self.blockchain.chain)}")
                    if not self.tx_pool_syncing and time.time() - self.last_tx_pool_request > self.tx_pool_request_cooldown:
                        self.tx_pool_syncing = True
                        await self.broadcast(self.create_message(self.MSG_REQUEST_TX_POOL, None))
                        self.last_tx_pool_request = time.time()
                except Exception as e:
                    logger.error(f"Failed to sync chain: {e}")
            else:
                logger.warning("No missing blocks received from peer")
            """Synchronize blockchain with peers, fetching chunks in parallel."""
            local_chain = self.load_blockchain_from_db()
            try:
                self.blockchain.replace_chain(local_chain)
            except Exception as e:
                logger.error(f"Failed to set local chain: {e}")
                local_chain = [self.blockchain.chain[0]]  # Fallback to genesis
            local_length = len(local_chain)
            chains = {}
            tasks = []
            #   Request chain lengths from all peers
            for uri in self.peer_nodes:
                if uri not in self.peer_reliability or self.peer_reliability[uri] < 5:
                    tasks.append(self.request_chain_length(uri))
            responses = await asyncio.gather(*tasks, return_exceptions=True)
            for uri, response in zip(self.peer_nodes.keys(), responses):
                if isinstance(response, int) and response > local_length:
                    chains[uri] = response
                    logger.debug(f"Peer {uri} has chain length {response}")
            if not chains:
                logger.info("No peers have a longer chain")
                return
            #   Select the peer with the longest chain
            selected_peer = max(chains, key=chains.get)
            longest_length = chains[selected_peer]
            logger.info(f"Selected peer {selected_peer} with chain length {longest_length}")
            #   Fetch all missing blocks in chunks
            start_index = local_length
            missing_blocks = []
            while start_index < longest_length:
                end_index = min(start_index + self.chunk_size, longest_length)
                logger.debug(f"Fetching...")
            """Synchronize blockchain with peers, fetching chunks in parallel."""
            local_chain = self.load_blockchain_from_db()
            try:
                self.blockchain.replace_chain(local_chain)
            except Exception as e:
                logger.error(f"Failed to set local chain: {e}")
                local_chain = [self.blockchain.chain[0]]  # Fallback to genesis
            local_length = len(local_chain)
            chains = {}
            tasks = []

            # Request chain lengths from all peers
            for uri in self.peer_nodes:
                if uri not in self.peer_reliability or self.peer_reliability[uri] < 5:
                    tasks.append(self.request_chain_length(uri))

            responses = await asyncio.gather(*tasks, return_exceptions=True)
            for uri, response in zip(self.peer_nodes.keys(), responses):
                if isinstance(response, int) and response > local_length:
                    chains[uri] = response
                    logger.debug(f"Peer {uri} has chain length {response}")

            if not chains:
                logger.info("No peers have a longer chain")
                return

            print(len(chains))
            if len(chains) == 1:
                selected_peer = list(chains.keys())[0]
                logger.info(f"Only one peer available ({selected_peer}), requesting full chain")
                try:
                    # Request the entire chain from the single peer
                    async with websockets.connect(selected_peer) as ws:
                        await ws.send(self.create_message(self.MSG_REQUEST_CHAIN, None))
                        response = await ws.recv()
                        msg = self.parse_message(response)
                        if msg['type'] == self.MSG_RESPONSE_CHAIN:
                            received_chain = [Block.from_json(block_data) for block_data in msg['data']]
                            if len(received_chain) > len(self.blockchain.chain):
                                logger.info(f"Received full chain of length {len(received_chain)} from {selected_peer}")
                                self.blockchain.utxo_set.clear()
                                self.blockchain.replace_chain(received_chain)
                                for block in received_chain:
                                    self.save_block_to_db(block)
                                self.transaction_pool.clear_blockchain_transactions(self.blockchain)
                                logger.info(f"Successfully synced full chain from {selected_peer}")
                                return
                except Exception as e:
                    logger.error(f"Failed to get full chain from single peer {selected_peer}: {e}")

            # Original chunk-based sync logic for multiple peers
            selected_peer = max(chains, key=chains.get)
            longest_length = chains[selected_peer]
            logger.info(f"Selected peer {selected_peer} with chain length {longest_length}")

            # Rest of the original chunk-based sync logic remains the same...
            start_index = local_length
            missing_blocks = []
            while start_index < longest_length:
                end_index = min(start_index + self.chunk_size, longest_length)
                logger.debug(f"Fetching blocks {start_index} to {end_index-1} from {selected_peer}")
                blocks = await self.fetch_blocks_from_peer(selected_peer, start_index, end_index)
                if blocks:
                    missing_blocks.extend(blocks)
                    start_index = end_index
                    self.update_peer_reliability(selected_peer, success=True)
                    self.adjust_chunk_size(success=True)
                else:
                    logger.warning(f"Failed to fetch blocks {start_index} to {end_index-1}, retrying")
                    self.update_peer_reliability(selected_peer, success=False)
                    self.adjust_chunk_size(success=False)
                    await asyncio.sleep(1)

            if missing_blocks:
                potential_chain = local_chain + missing_blocks
                try:
                    self.blockchain.utxo_set.clear()
                    self.blockchain.replace_chain(potential_chain)
                    for block in missing_blocks:
                        self.save_block_to_db(block)
                    self.transaction_pool.clear_blockchain_transactions(self.blockchain)
                    logger.info(f"Synced {len(missing_blocks)} missing blocks, new chain length: {len(self.blockchain.chain)}")
                    if not self.tx_pool_syncing and time.time() - self.last_tx_pool_request > self.tx_pool_request_cooldown:
                        self.tx_pool_syncing = True
                        await self.broadcast(self.create_message(self.MSG_REQUEST_TX_POOL, None))
                        self.last_tx_pool_request = time.time()
                except Exception as e:
                    logger.error(f"Failed to sync chain: {e}")
            else:
                logger.warning("No missing blocks received from peer")
                """Synchronize blockchain with peers, fetching chunks in parallel."""
                local_chain = self.load_blockchain_from_db()
                try:
                    self.blockchain.replace_chain(local_chain)
                except Exception as e:
                    logger.error(f"Failed to set local chain: {e}")
                    local_chain = [self.blockchain.chain[0]]  # Fallback to genesis
                local_length = len(local_chain)
                chains = {}
                tasks = []

                # Request chain lengths from all peers
                for uri in self.peer_nodes:
                    if uri not in self.peer_reliability or self.peer_reliability[uri] < 5:
                        tasks.append(self.request_chain_length(uri))

                responses = await asyncio.gather(*tasks, return_exceptions=True)
                for uri, response in zip(self.peer_nodes.keys(), responses):
                    if isinstance(response, int) and response > local_length:
                        chains[uri] = response
                        logger.debug(f"Peer {uri} has chain length {response}")

                if not chains:
                    logger.info("No peers have a longer chain")
                    return

                # Select the peer with the longest chain
                selected_peer = max(chains, key=chains.get)
                longest_length = chains[selected_peer]
                logger.info(f"Selected peer {selected_peer} with chain length {longest_length}")

                # Fetch all missing blocks in chunks
                start_index = local_length
                missing_blocks = []
                while start_index < longest_length:
                    end_index = min(start_index + self.chunk_size, longest_length)
                    logger.debug(f"Fetching blocks {start_index} to {end_index-1} from {selected_peer}")
                    blocks = await self.fetch_blocks_from_peer(selected_peer, start_index, end_index)
                    if blocks:
                        missing_blocks.extend(blocks)
                        start_index = end_index
                        self.update_peer_reliability(selected_peer, success=True)
                        self.adjust_chunk_size(success=True)
                    else:
                        logger.warning(f"Failed to fetch blocks {start_index} to {end_index-1}, retrying")
                        self.update_peer_reliability(selected_peer, success=False)
                        self.adjust_chunk_size(success=False)
                        await asyncio.sleep(1)

                if missing_blocks:
                    potential_chain = local_chain + missing_blocks
                    try:
                        self.blockchain.utxo_set.clear()
                        self.blockchain.replace_chain(potential_chain)
                        for block in missing_blocks:
                            self.save_block_to_db(block)
                        self.transaction_pool.clear_blockchain_transactions(self.blockchain)
                        logger.info(f"Synced {len(missing_blocks)} missing blocks, new chain length: {len(self.blockchain.chain)}")
                        # Request tx pool to ensure sync
                        if not self.tx_pool_syncing and time.time() - self.last_tx_pool_request > self.tx_pool_request_cooldown:
                            self.tx_pool_syncing = True
                            await self.broadcast(self.create_message(self.MSG_REQUEST_TX_POOL, None))
                            self.last_tx_pool_request = time.time()
                    except Exception as e:
                        logger.error(f"Failed to sync chain: {e}")
                else:
                    logger.warning("No missing blocks received from peer")

    async def request_chain_length(self, uri):
        """Request chain length from a peer."""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{uri}/chain_length") as response:
                    if response.status == 200:
                        return await response.json()
                    return 0
        except Exception:
            return 0

    async def handle_message(self, message, websocket):
        """Handle incoming messages based on their type."""
        try:
            msg = self.parse_message(message)
            msg_type = msg['type']
            logger.info(f"Received message type: {msg_type}")
            from_id = msg.get('from', 'unknown')
            logger.debug(f"Received message of type {msg_type} from {from_id}")
            data = msg['data']
            peer_uri = f"ws://{websocket.remote_address[0]}:{websocket.remote_address[1]}"

            if msg_type == self.MSG_NEW_BLOCK:
                block = Block.from_json(data)
                last_block = self.blockchain.chain[-1]
                if block.hash == last_block.hash:
                    logger.info("Duplicate block received. Skipping.")
                    return
                potential_chain = self.blockchain.chain[:]
                potential_chain.append(block)
                try:
                    for tx_json in block.data:
                        tx = Transaction.from_json(tx_json)
                        if not tx.is_coinbase:
                            input_data = tx.input
                            prev_tx_ids = input_data.get('prev_tx_ids', [])
                            input_address = input_data.get('address')
                            input_amount = input_data.get('amount', 0)
                            utxo_amount = 0
                            for prev_tx_id in prev_tx_ids:
                                if prev_tx_id not in self.blockchain.utxo_set or input_address not in self.blockchain.utxo_set[prev_tx_id]:
                                    await websocket.send(self.create_message(self.MSG_REQUEST_TX, prev_tx_id))
                                    logger.info(f"Requested missing transaction {prev_tx_id}")
                                    return
                                utxo_amount += self.blockchain.utxo_set[prev_tx_id].get(input_address, 0)
                            if input_amount > utxo_amount:
                                raise ValueError(f"Invalid transaction input: input amount {input_amount} exceeds UTXO amount {utxo_amount}")
                    self.blockchain.replace_chain(potential_chain)
                    self.save_block_to_db(block)  # Save new block to DuckDB
                    self.transaction_pool.clear_blockchain_transactions(self.blockchain)
                    await self.broadcast(self.create_message(self.MSG_NEW_BLOCK, data), exclude=websocket)
                except Exception as e:
                    logger.error(f"Failed to replace chain: {e}")

            if msg_type == self.MSG_NEW_TX:
                transaction = Transaction.from_json(data)
                tx_id = transaction.id
                tx_time = transaction.input.get('timestamp', 0)
                logger.debug(f"Transaction ID: {tx_id}, Timestamp: {tx_time}")
                existing_tx = self.transaction_pool.transaction_map.get(tx_id)
                if existing_tx:
                    logger.debug(f"Existing transaction found: {existing_tx.input['timestamp']}")
                    if tx_time > existing_tx.input['timestamp']:
                        try:
                            Transaction.is_valid(transaction)
                            self.transaction_pool.set_transaction(transaction)
                            await self.broadcast(self.create_message(self.MSG_NEW_TX, data), exclude=websocket)
                            if time.time() - self.last_tx_pool_request > self.tx_pool_request_cooldown:
                                self.tx_pool_syncing = True
                                await self.broadcast(self.create_message(self.MSG_REQUEST_TX_POOL, None))
                                self.last_tx_pool_request = time.time()
                        except Exception as e:
                            logger.error(f"Failed to update transaction {tx_id}: {e}")
                elif tx_id not in self.processed_transactions:
                    try:
                        Transaction.is_valid(transaction)
                        self.transaction_pool.set_transaction(transaction)
                        self.processed_transactions.add(tx_id)
                        await self.broadcast(self.create_message(self.MSG_NEW_TX, data), exclude=websocket)
                        if time.time() - self.last_tx_pool_request > self.tx_pool_request_cooldown:
                            self.tx_pool_syncing = True
                            await self.broadcast(self.create_message(self.MSG_REQUEST_TX_POOL, None))
                            self.last_tx_pool_request = time.time()
                    except Exception as e:
                        logger.error(f"Failed to add transaction {tx_id}: {e}")
            elif msg_type == self.MSG_REQUEST_CHAIN:
                chain_data = [block.to_json() for block in self.blockchain.chain]
                await websocket.send(self.create_message(self.MSG_RESPONSE_CHAIN, chain_data))

            elif msg_type == self.MSG_RESPONSE_CHAIN:
                try:
                    received_chain = [Block.from_json(block_data) for block_data in data]
                    if len(received_chain) > len(self.blockchain.chain) and not self.syncing_chain:
                        logger.info(f"Received longer chain of length {len(received_chain)}")
                        self.syncing_chain = True
                        self.blockchain.utxo_set.clear()
                        self.blockchain.replace_chain(received_chain)
                        for block in received_chain:
                            self.save_block_to_db(block)  # Save received chain to DuckDB
                        self.transaction_pool.clear_blockchain_transactions(self.blockchain)
                        if not self.tx_pool_syncing and time.time() - self.last_tx_pool_request > self.tx_pool_request_cooldown:
                            self.tx_pool_syncing = True
                            await self.broadcast(self.create_message(self.MSG_REQUEST_TX_POOL, None))
                            self.last_tx_pool_request = time.time()
                    else:
                        logger.debug("Received chain not longer or syncing, ignoring")
                except Exception as e:
                    logger.error(f"Failed to replace chain with received chain: {e}")
                finally:
                    self.syncing_chain = False

            elif msg_type == self.MSG_REQUEST_TX_POOL:
                tx_pool_data = [tx.to_json() for tx in self.transaction_pool.transaction_map.values()]
                await websocket.send(self.create_message(self.MSG_RESPONSE_TX_POOL, tx_pool_data))

            elif msg_type == self.MSG_RESPONSE_TX_POOL:
                if not self.tx_pool_syncing:
                    logger.debug("Ignoring RESPONSE_TX_POOL as not syncing")
                    return
                added_count = 0
                for tx_data in data:
                    try:
                        transaction = Transaction.from_json(tx_data)
                        tx_id = transaction.id
                        tx_time = transaction.input.get('timestamp', 0)
                        existing_tx = self.transaction_pool.transaction_map.get(tx_id)
                        if existing_tx:
                            if tx_time > existing_tx.input['timestamp']:
                                Transaction.is_valid(transaction)
                                self.transaction_pool.set_transaction(transaction)
                                added_count += 1
                        elif tx_id not in self.processed_transactions:
                            Transaction.is_valid(transaction)
                            self.transaction_pool.set_transaction(transaction)
                            self.processed_transactions.add(tx_id)
                            added_count += 1
                    except Exception as e:
                        logger.error(f"Failed to add or update transaction from peer: {e}")
                logger.info(f"Successfully added or updated {added_count} transactions to pool from peer")
                if added_count == 0:
                    self.tx_pool_syncing = False
                elif time.time() - self.last_tx_pool_request > self.tx_pool_request_cooldown:
                    await self.broadcast(self.create_message(self.MSG_REQUEST_TX_POOL, None))
                    self.last_tx_pool_request = time.time()

            elif msg_type == self.MSG_PEER_LIST:
                for peer_uri in data:
                    if peer_uri != self.node_id and peer_uri != self.my_uri and peer_uri not in self.peer_nodes and peer_uri not in self.known_peers:
                        self.known_peers.add(peer_uri)
                        self.save_peers()
                        asyncio.create_task(self.connect_to_peer(peer_uri))

            elif msg_type == self.MSG_REQUEST_CHAIN_LENGTH:
                await websocket.send(self.create_message(self.MSG_RESPONSE_CHAIN_LENGTH, len(self.blockchain.chain)))

            elif msg_type == self.MSG_RESPONSE_CHAIN_LENGTH:
                peer_length = data
                local_length = len(self.blockchain.chain)
                if peer_length > local_length and not self.syncing_chain:
                    await websocket.send(self.create_message(self.MSG_REQUEST_BLOCKS, local_length))
                    self.syncing_chain = True

            elif msg_type == self.MSG_REQUEST_BLOCKS:
                start_height = data
                print(len(self.peer_nodes))
                # If start_height is 0, we might be responding to a full chain request
                if  len(self.peer_nodes) == 1:
                    # Only one peer connected, send the entire chain
                    logger.info(f"Sending full blockchain to peer {websocket.remote_address}")
                    blocks_to_send = self.blockchain.chain[1:]  # Remove genesis block
                     # Remove genesis block
                else:
                    # Default chunked behavior
                    end_height = min(start_height + self.chunk_size, len(self.blockchain.chain))
                    blocks_to_send = self.blockchain.chain[start_height:end_height]
                    logger.debug(f"Sending blocks {start_height} to {end_height-1} to peer {websocket.remote_address}")
                
                blocks_data = [block.to_json() for block in blocks_to_send]
                await websocket.send(self.create_message(self.MSG_RESPONSE_BLOCKS, blocks_data))

            elif msg_type == self.MSG_RESPONSE_BLOCKS:
                received_blocks_data = data
                if received_blocks_data:
                    try:
                        received_blocks = []
                        for block_data in received_blocks_data:
                            try:
                                block = Block.from_json(block_data)
                                for tx_json in block.data:
                                    tx = Transaction.from_json(tx_json)
                                    Transaction.is_valid(tx)
                                received_blocks.append(block)
                            except Exception as e:
                                logger.warning(f"Skipping invalid block: {e}")
                                continue
                        potential_chain = self.blockchain.chain[:]
                        if received_blocks and received_blocks[0].height <= self.blockchain.current_height:
                            logger.warning(f"Ignoring blocks with invalid height {received_blocks[0].height}")
                            self.syncing_chain = False
                            return
                        potential_chain += received_blocks
                        logger.debug(f"Received {len(received_blocks)} blocks, attempting to replace chain")
                        self.blockchain.utxo_set.clear()
                        self.blockchain.replace_chain(potential_chain)
                        for block in received_blocks:
                            self.save_block_to_db(block)
                        self.transaction_pool.clear_blockchain_transactions(self.blockchain)
                        logger.info(f"Replaced chain with {len(potential_chain)} blocks")
                        if not self.tx_pool_syncing and time.time() - self.last_tx_pool_request > self.tx_pool_request_cooldown:
                            self.tx_pool_syncing = True
                            await self.broadcast(self.create_message(self.MSG_REQUEST_TX_POOL, None))
                            self.last_tx_pool_request = time.time()
                        self.update_peer_reliability(peer_uri, success=True)
                        self.adjust_chunk_size(success=True)
                    except Exception as e:
                        logger.error(f"Error adding received blocks: {e}")
                        self.update_peer_reliability(peer_uri, success=False)
                        self.adjust_chunk_size(success=False)
                else:
                    logger.warning(f"No blocks received from {peer_uri}")
                    self.update_peer_reliability(peer_uri, success=False)
                    self.adjust_chunk_size(success=False)
                self.syncing_chain = False
                
            elif msg_type == self.MSG_REQUEST_TX:
                tx_id = data
                tx = self.transaction_pool.transaction_map.get(tx_id)
                if tx:
                    await websocket.send(self.create_message(self.MSG_RESPONSE_TX, tx.to_json()))
                    logger.info(f"Sent transaction {tx_id} to peer")
                else:
                    logger.warning(f"Requested transaction {tx_id} not found in pool")

            elif msg_type == self.MSG_RESPONSE_TX:
                try:
                    transaction = Transaction.from_json(data)
                    tx_id = transaction.id
                    Transaction.is_valid(transaction)
                    self.transaction_pool.set_transaction(transaction)
                    self.processed_transactions.add(tx_id)
                    logger.info(f"Added transaction {tx_id} from peer")
                except Exception as e:
                    logger.error(f"Failed to process received transaction {data.get('id', 'unknown')}: {e}")

        except json.JSONDecodeError:
            logger.error(f"Invalid JSON message received: {message}")
        except Exception as e:
            logger.error(f"Error handling message: {e}")

    async def broadcast(self, message, exclude=None):
        """Broadcast a message to all connected peers."""
        logger.info(f"Broadcasting message to {len(self.peer_nodes)} peers: {list(self.peer_nodes.keys())}")
        failed_peers = []
        for uri, peer in list(self.peer_nodes.items()):
            if peer != exclude:
                try:
                    await peer.send(message)
                    logger.debug(f"Sent message to peer {uri}")
                    self.update_peer_reliability(uri, success=True)
                except ConnectionClosedError:
                    logger.warning(f"Connection closed by peer {uri}, removing")
                    failed_peers.append(uri)
                except Exception as e:
                    logger.error(f"Failed to send message to {uri}: {e}, marking for retry")
                    failed_peers.append(uri)
                    self.update_peer_reliability(uri, success=False)
        for uri in failed_peers:
            await self.remove_peer(uri)
        if not self.peer_nodes and not self.tx_pool_syncing and time.time() - self.last_tx_pool_request > self.tx_pool_request_cooldown:
            self.tx_pool_syncing = True
            asyncio.create_task(self.broadcast(self.create_message(self.MSG_REQUEST_TX_POOL, None)))
            self.last_tx_pool_request = time.time()

    async def remove_peer(self, uri):
        """Remove a peer from the connected peers list."""
        if uri in self.peer_nodes:
            try:
                await self.peer_nodes[uri].close()
            except:
                pass
            del self.peer_nodes[uri]
            self.known_peers.discard(uri)
            self.save_peers()
            logger.info(f"Peer {uri} removed from known peers")

    async def connection_handler(self, websocket):
        """Handle new WebSocket connections."""
        try:
            peer_uri = f"ws://{websocket.remote_address[0]}:{websocket.remote_address[1]}"
            self.peer_nodes[peer_uri] = websocket
            logger.info(f"New peer connected: {peer_uri}")
            await websocket.send(self.create_message(self.MSG_REQUEST_CHAIN_LENGTH, None))
            if not self.tx_pool_syncing and time.time() - self.last_tx_pool_request > self.tx_pool_request_cooldown:
                self.tx_pool_syncing = True
                await websocket.send(self.create_message(self.MSG_REQUEST_TX_POOL, None))
                self.last_tx_pool_request = time.time()
            async for message in websocket:
                await self.handle_message(message, websocket)
        except ConnectionClosedError:
            logger.warning(f"Peer disconnected: {peer_uri}")
            await self.remove_peer(peer_uri)
        except Exception as e:
            logger.error(f"Error in connection handler for {peer_uri}: {e}")
            await self.remove_peer(peer_uri)

    async def register_with_boot_node(self, uri, my_uri, retries=0):
        """Register with the boot node."""
        if retries >= self.max_retries:
            logger.error(f"Max retries reached for boot node {uri}")
            return
        try:
            websocket = await websockets.connect(uri)
            await websocket.send(self.create_message(self.MSG_REGISTER_PEER, my_uri))
            async for message in websocket:
                await self.handle_message(message, websocket)
        except Exception as e:
            logger.error(f" He to register with boot node: {e}, retry {retries + 1}/{self.max_retries}")
            await asyncio.sleep(5)
            await self.register_with_boot_node(uri, my_uri, retries + 1)

    async def connect_to_peer(self, uri, retries=0):
        """Connect to a peer node."""
        if uri in self.peer_nodes or retries >= self.max_retries:
            if retries >= self.max_retries:
                logger.info(f"Max retries reached for peer {uri}, removing from known peers")
                self.known_peers.discard(uri)
                self.save_peers()
            return
        try:
            websocket = await websockets.connect(uri)
            self.peer_nodes[uri] = websocket
            logger.info(f"Connected to peer {uri}")
            try:
                await websocket.send(self.create_message(self.MSG_REQUEST_CHAIN_LENGTH, None))
                if not self.tx_pool_syncing and time.time() - self.last_tx_pool_request > self.tx_pool_request_cooldown:
                    self.tx_pool_syncing = True
                    await websocket.send(self.create_message(self.MSG_REQUEST_TX_POOL, None))
                    self.last_tx_pool_request = time.time()
            except Exception as e:
                logger.error(f"Failed to send requests to {uri}: {e}")
                await self.remove_peer(uri)
                return
            async for message in websocket:
                await self.handle_message(message, websocket)
        except ConnectionClosedError:
            logger.warning(f"Connection closed by peer {uri}")
            await self.remove_peer(uri)
            await asyncio.sleep(10)
            await self.connect_to_peer(uri, retries + 1)
        except Exception as e:
            logger.error(f"Failed to connect to {uri}: {e}, retry {retries + 1}/{self.max_retries}")
            await asyncio.sleep(10)
            await self.connect_to_peer(uri, retries + 1)

    async def start_server(self):
        """Start the WebSocket server."""
        self.server = await websockets.serve(self.connection_handler, "0.0.0.0", self.websocket_port)
        logger.info(f"WebSocket server started at port {self.websocket_port}")
        await self.sync_with_peers()  # Sync with peers on startup
        return self.server

    async def broadcast_transaction(self, transaction):
        """Broadcast a transaction to all peers."""
        message = self.create_message(self.MSG_NEW_TX, transaction.to_json())
        await self.broadcast(message)

    def broadcast_transaction_sync(self, transaction):
        """Broadcast a transaction to all peers synchronously."""
        if self.loop:
            future = asyncio.run_coroutine_threadsafe(self.broadcast_transaction(transaction), self.loop)
            future.result()
            logger.info(f"Broadcasted transaction {transaction.id}")
        else:
            logger.error("Event loop not available for broadcasting")

    async def broadcast_block(self, block):
        """Broadcast a block to all peers."""
        message = self.create_message(self.MSG_NEW_BLOCK, block.to_json())
        await self.broadcast(message)

    def broadcast_block_sync(self, block):
        """Broadcast a block to all peers synchronously."""
        if self.loop:
            future = asyncio.run_coroutine_threadsafe(self.broadcast_block(block), self.loop)
            future.result()
            logger.info(f"Broadcasted block {block.hash}")
        else:
            logger.error("Event loop not available for broadcasting")

    async def run_peer_discovery(self):
        """Run peer discovery logic."""
        logger.info("Starting peer discovery...")
        if self.my_uri != self.boot_node_uri:
            asyncio.create_task(self.register_with_boot_node(self.boot_node_uri, self.my_uri))
        known_peers = self.load_peers()
        for peer_uri in known_peers:
            if peer_uri != self.my_uri and peer_uri != self.node_id:
                asyncio.create_task(self.connect_to_peer(peer_uri))

    def start_websocket_server(self):
        """Start the WebSocket server and peer discovery."""
        async def run_node():
            await self.start_server()
            await self.run_peer_discovery()

        self.loop = asyncio.get_event_loop()
        self.loop.run_until_complete(run_node())