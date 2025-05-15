import asyncio
import websockets
import json
import logging
import uuid
import os
import time
import duckdb
import gzip
import aiohttp
import miniupnpc
import requests
import stun
import base64
from websockets.exceptions import ConnectionClosedError
from models.block import Block
from models.blockchain import Blockchain
from models.transaction import Transaction
from models.transaction_pool import TransactionPool
from core.config import BOOT_NODE

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def get_public_ip():
    try:
        response = requests.get('https://api.ipify.org?format=json')
        return response.json()['ip']
    except Exception:
        return "127.0.0.1"

def open_port(port):
    try:
        u = miniupnpc.UPnP()
        u.discoverdelay = 200
        u.discover()
        u.selectigd()
        result = u.addportmapping(port, 'TCP', u.lanaddr, port, 'WebSocket P2P', '')
        if result:
            logger.info(f"Opened port {port} via UPnP for {u.lanaddr}")
        else:
            logger.error(f"UPnP port mapping failed for port {port}")
            logger.info(f"Please manually forward port {port} on your router to {u.lanaddr}")
    except Exception as e:
        logger.error(f"UPnP failed for port {port}: {str(e)}")
        logger.info(f"Please manually forward port {port} on your router")

class PubSub:
    def __init__(self, blockchain, transaction_pool):
        host = os.environ.get('HOST', get_public_ip())
        self.blockchain = blockchain
        self.transaction_pool = transaction_pool
        self.node_id = str(uuid.uuid4())
        self.peer_nodes = {}  # uri -> websocket
        self.relay_peers = {}  # uri -> boot_node_websocket for relay mode
        self.known_peers = set()
        self.peers_file = "peers.json"
        self.boot_node_uri = BOOT_NODE
        self.max_retries = 2
        self.websocket_port = 3221 if os.environ.get('PEER') != 'True' else 3232
        self.public_ip = None
        self.public_port = None
        self.my_uri = f"ws://127.0.0.1:{self.websocket_port}"
        self.server = None
        self.loop = None
        self.processed_transactions = set()
        self.syncing_chain = False
        self.blocks_in_transit = set()
        self.tx_pool_syncing = False
        self.last_tx_pool_request = 0
        self.tx_pool_request_cooldown = 5
        self.peer_reliability = {}
        self.chunk_size = 10
        self.min_chunk_size = 5
        self.max_chunk_size = 50
        self.chunk_size_increment = 5
        self.chunk_size_decrement = 5
        self.db_file = "blockchain.db" if os.environ.get('PEER') != 'True' else "peer_blockchain.db"
        self.conn = duckdb.connect(self.db_file)
        self.initialize_db()
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
        self.MSG_RELAY_FAILURE = "RELAY_FAILURE"
        
    async def initialize_async(self):
        self.public_ip, self.public_port = await self.get_public_ip_port()
        if self.public_ip and self.public_port:
            self.my_uri = f"ws://{self.public_ip}:{self.public_port}"
            logger.info(f"Updated my_uri with STUN: {self.my_uri}")
        else:
            self.public_ip = get_public_ip()
            self.public_port = self.websocket_port
            self.my_uri = f"ws://{self.public_ip}:{self.public_port}"
            logger.warning(f"STUN failed, using public IP from api.ipify.org: {self.my_uri}")
            
    async def turn_server(self):
        self.public_ip, self.public_port = await self.get_public_ip_port()
        if self.public_ip and self.public_port:
            self.my_uri = f"ws://{self.public_ip}:{self.public_port}"
            logger.info(f"Updated my_uri with STUN/TURN: {self.my_uri}")
        else:
            logger.warning(f"STUN/TURN failed, using default my_uri: {self.my_uri}")

    async def get_public_ip_port(self):
        try:
            nat_type, ext_ip, ext_port = stun.get_ip_info(
                stun_host="stun.l.google.com",
                stun_port=19302,
                source_port=self.websocket_port
            )
            logger.info(f"STUN: NAT Type: {nat_type}, Public IP: {ext_ip}, Public Port: {ext_port}")
            return ext_ip, ext_port
        except Exception as e:
            logger.error(f"STUN failed: {e}")
            return None, None

    def initialize_db(self):
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
        self.save_block_to_db(Block.from_json(self.blockchain.chain[0].to_json()))

    def save_block_to_db(self, block):
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
        try:
            result = self.conn.execute("SELECT COUNT(*) FROM blocks").fetchone()
            if not result or result[0] == 0:
                logger.info("No blocks found in DuckDB, starting with genesis block")
                return [Block.from_json(self.blockchain.chain[0].to_json())]
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
            return [Block.from_json(self.blockchain.chain[0].to_json())]

    def compress_data(self, data):
        return gzip.compress(json.dumps(data).encode('utf-8'))

    def decompress_data(self, compressed_data):
        return json.loads(gzip.decompress(compressed_data).decode('utf-8'))

    def update_peer_reliability(self, uri, success=True):
        if uri not in self.peer_reliability:
            self.peer_reliability[uri] = 0
        if not success:
            self.peer_reliability[uri] += 1
            if self.peer_reliability[uri] >= 5:
                logger.warning(f"Peer {uri} marked as unreliable (failures: {self.peer_reliability[uri]})")
        else:
            self.peer_reliability[uri] = max(0, self.peer_reliability[uri] - 1)

    def adjust_chunk_size(self, success=True):
        if success:
            self.chunk_size = min(self.max_chunk_size, self.chunk_size + self.chunk_size_increment)
            logger.debug(f"Increased chunk size to {self.chunk_size}")
        else:
            self.chunk_size = max(self.min_chunk_size, self.chunk_size - self.chunk_size_decrement)
            logger.debug(f"Decreased chunk size to {self.chunk_size}")

    def create_message(self, msg_type, data):
        message = {"type": msg_type, "data": data, "from": self.node_id}
        return self.compress_data(message)

    def parse_message(self, message):
        try:
            if isinstance(message, bytes):
                msg = self.decompress_data(message)
            else:
                msg = json.loads(message)
            return msg
        except Exception as e:
            logger.error(f"Error parsing message: {e}")
            raise json.JSONDecodeError("Invalid message", str(message), 0)

    def save_peers(self):
        try:
            with open(self.peers_file, "w") as f:
                json.dump(list(self.known_peers), f)
        except Exception as e:
            logger.error(f"Error saving peers: {e}")

    def load_peers(self):
        try:
            if os.path.exists(self.peers_file) and os.path.getsize(self.peers_file) > 0:
                with open(self.peers_file, "r") as f:
                    peers = json.load(f)
                    return set(peers) if isinstance(peers, list) else set()
            return set()
        except json.JSONDecodeError:
            logger.error(f"Invalid JSON in {self.peers_file}")
            return set()
        except Exception as e:
            logger.error(f"Error loading peers: {e}")
            return set()

    async def fetch_blocks_from_peer(self, uri, start_height, end_height):
        try:
            async with aiohttp.ClientSession() as session:
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
        local_chain = self.load_blockchain_from_db()
        try:
            self.blockchain.replace_chain(local_chain)
        except Exception as e:
            logger.error(f"Failed to set local chain: {e}")
            local_chain = [Block.from_json(self.blockchain.chain[0].to_json())]
        local_length = len(local_chain)
        chains = {}
        tasks = []

        for uri in self.peer_nodes:
            if uri not in self.peer_reliability or self.peer_reliability[uri] < 5 and uri != self.my_uri:
                tasks.append(self.request_chain_length(uri))

        responses = await asyncio.gather(*tasks, return_exceptions=True)
        for uri, response in zip(self.peer_nodes.keys(), responses):
            if isinstance(response, int) and response >= local_length:
                chains[uri] = response
                logger.debug(f"Peer {uri} has chain length {response}")

        if not chains:
            logger.info("No peers have a longer or equal chain")
            return

        if len(chains) == 1:
            selected_peer = list(chains.keys())[0]
            if selected_peer == self.my_uri:
                logger.info("Only peer is self, not syncing")
                return
            logger.info(f"Only one peer available ({selected_peer}), requesting full chain")
            try:
                async with websockets.connect(selected_peer) as ws:
                    await ws.send(self.create_message(self.MSG_REQUEST_CHAIN, None))
                    response = await ws.recv()
                    msg = self.parse_message(response)
                    if msg['type'] == self.MSG_RESPONSE_CHAIN:
                        received_chain = [Block.from_json(block_data) for block_data in msg['data']]
                        if len(received_chain) >= len(self.blockchain.chain):
                            logger.info(f"Received chain of length {len(received_chain)} from {selected_peer}")
                            self.blockchain.utxo_set.clear()
                            self.blockchain.replace_chain(received_chain)
                            for block in received_chain:
                                self.save_block_to_db(block)
                            self.transaction_pool.clear_blockchain_transactions(self.blockchain)
                            logger.info(f"Successfully synced full chain from {selected_peer}")
                            return
            except Exception as e:
                logger.error(f"Failed to get full chain from single peer {selected_peer}: {e}")

        selected_peer = max(chains, key=chains.get)
        longest_length = chains[selected_peer]
        logger.info(f"Selected peer {selected_peer} with chain length {longest_length}")

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

    async def request_chain_length(self, uri):
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{uri}/chain_length") as response:
                    if response.status == 200:
                        return await response.json()
                    return 0
        except Exception:
            return 0

    async def handle_message(self, message, websocket):
        try:
            msg = self.parse_message(message)
            msg_type = msg['type']
            logger.info(f"Received message type: {msg_type}")
            from_id = msg.get('from', 'unknown')
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
                    self.save_block_to_db(block)
                    self.transaction_pool.clear_blockchain_transactions(self.blockchain)
                    await self.broadcast(self.create_message(self.MSG_NEW_BLOCK, data), exclude=websocket)
                except Exception as e:
                    logger.error(f"Failed to replace chain: {e}")

            elif msg_type == self.MSG_NEW_TX:
                transaction = Transaction.from_json(data)
                tx_id = transaction.id
                tx_time = transaction.input.get('timestamp', 0)
                existing_tx = self.transaction_pool.transaction_map.get(tx_id)
                if existing_tx:
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
                    if len(received_chain) >= len(self.blockchain.chain) and not self.syncing_chain:
                        logger.info(f"Received chain of length {len(received_chain)}")
                        self.syncing_chain = True
                        self.blockchain.utxo_set.clear()
                        self.blockchain.replace_chain(received_chain)
                        for block in received_chain:
                            self.save_block_to_db(block)
                        self.transaction_pool.clear_blockchain_transactions(self.blockchain)
                        if not self.tx_pool_syncing and time.time() - self.last_tx_pool_request > self.tx_pool_request_cooldown:
                            self.tx_pool_syncing = True
                            await self.broadcast(self.create_message(self.MSG_REQUEST_TX_POOL, None))
                            self.last_tx_pool_request = time.time()
                    else:
                        logger.debug("Received chain not longer or equal or syncing, ignoring")
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
                logger.info(f"Added/updated {added_count} transactions to pool")
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
                if peer_length >= local_length and not self.syncing_chain:
                    await websocket.send(self.create_message(self.MSG_REQUEST_BLOCKS, local_length))
                    self.syncing_chain = True

            elif msg_type == self.MSG_REQUEST_BLOCKS:
                start_height = data
                if len(self.peer_nodes) == 1:
                    logger.info(f"Sending full blockchain to peer {websocket.remote_address}")
                    blocks_to_send = self.blockchain.chain[1:]
                else:
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
        logger.info(f"Broadcasting to {len(self.peer_nodes)} direct peers and {len(self.relay_peers)} relay peers")
        failed_peers = []
        relay_needed = []

        # Try direct communication
        for uri, peer in list(self.peer_nodes.items()):
            if peer != exclude:
                try:
                    await peer.send(message)
                    logger.debug(f"Sent message to peer {uri}")
                    self.update_peer_reliability(uri, success=True)
                except ConnectionClosedError:
                    logger.warning(f"Connection closed by peer {uri}, marking for relay")
                    relay_needed.append(uri)
                except Exception as e:
                    logger.error(f"Failed to send to {uri}: {e}, will try relay")
                    relay_needed.append(uri)

        # Handle relay peers
        for uri in list(self.relay_peers.keys()) + relay_needed:
            if uri != self.my_uri and (exclude is None or uri != exclude.remote_address[1]):
                if await self.relay_message(uri, message):
                    logger.debug(f"Successfully relayed message to {uri}")
                    self.update_peer_reliability(uri, success=True)
                else:
                    logger.error(f"Failed to relay message to {uri}")
                    failed_peers.append(uri)
                    self.update_peer_reliability(uri, success=False)

        # Clean up failed peers
        for uri in failed_peers:
            await self.remove_peer(uri)

        # Request TX pool sync if needed
        if not self.peer_nodes and not self.relay_peers and \
        not self.tx_pool_syncing and \
        time.time() - self.last_tx_pool_request > self.tx_pool_request_cooldown:
            self.tx_pool_syncing = True
            asyncio.create_task(self.broadcast(self.create_message(self.MSG_REQUEST_TX_POOL, None)))
            self.last_tx_pool_request = time.time()

    async def handle_relay_responses(self, boot_ws, target_uri):
        """Handle responses from the boot node for relayed messages."""
        print('hiiiiiiiiiiiiiiiiiiiiiiiii')
        try:
            async for response in boot_ws:
                try:
                    # Ensure message is decompressed if necessary
                    if isinstance(response, bytes):
                        msg = self.decompress_data(response)
                    else:
                        msg = json.loads(response)
                    msg_type = msg.get('type')
                    logger.info(f"Received relayed message from boot node for {target_uri}: {msg_type}")

                    if msg_type == self.MSG_RELAY_FAILURE:
                        failure_data = msg.get('data', {})
                        failed_uri = failure_data.get('target_uri')
                        reason = failure_data.get('reason', 'unknown')
                        if failed_uri == target_uri:
                            logger.warning(f"Relay failure for {failed_uri}: {reason}")
                            self.update_peer_reliability(failed_uri, success=False)
                            await self.remove_peer(failed_uri)
                            if failed_uri in self.relay_peers:
                                try:
                                    await self.relay_peers[failed_uri].close()
                                except:
                                    pass
                                del self.relay_peers[failed_uri]
                            return

                    # Process regular messages
                    ws_wrapper = type('obj', (object,), {
                        'remote_address': (target_uri.split(':')[1].replace('//', ''), int(target_uri.split(':')[-1])),
                        'send': lambda data: self.relay_message(target_uri, data),
                        'close': lambda: None
                    })
                    # Pass the raw response to handle_message to ensure proper parsing
                    await self.handle_message(self.compress_data(msg) if isinstance(response, bytes) else response, ws_wrapper)

                except json.JSONDecodeError as e:
                    logger.error(f"Invalid JSON response from boot node for {target_uri}: {e}")
                except Exception as e:
                    logger.error(f"Error handling relay response for {target_uri}: {e}")
                    self.update_peer_reliability(target_uri, success=False)

        except websockets.exceptions.ConnectionClosed as e:
            logger.warning(f"Boot node connection closed for relay to {target_uri}: {e}")
            # Attempt to reconnect
            if target_uri in self.relay_peers:
                del self.relay_peers[target_uri]
            await self.ensure_relay_connection(target_uri)
        except Exception as e:
            logger.error(f"Unexpected error in relay handler for {target_uri}: {e}")
        finally:
            if target_uri in self.relay_peers and not self.relay_peers[target_uri].closed:
                try:
                    await self.relay_peers[target_uri].close()
                except:
                    pass
                del self.relay_peers[target_uri]
                logger.info(f"Closed relay connection for {target_uri}")

    async def relay_message(self, target_uri, message):
        """Send a message via relay through the boot node."""
        if not await self.ensure_relay_connection(target_uri):
            logger.error(f"Cannot relay message to {target_uri}: no relay connection")
            return False

        boot_ws = self.relay_peers[target_uri]
        try:
            # Create relay message with base64 encoded payload
            relay_msg = {
                "type": "RELAY_MESSAGE",
                "data": {
                    "target_uri": target_uri,
                    "data": base64.b64encode(message).decode('utf-8')
                },
                "from": self.my_uri  # Use my_uri instead of node_id for consistency
            }

            # Send relay request to boot node
            await boot_ws.send(self.compress_data(relay_msg))
            logger.info(f"Relayed message to {target_uri} via boot node")
            return True
        except Exception as e:
            logger.error(f"Failed to relay message to {target_uri}: {e}")
            try:
                await boot_ws.close()
            except:
                pass
            if target_uri in self.relay_peers:
                del self.relay_peers[target_uri]
            return False

    async def remove_peer(self, uri):
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

    async def connect_to_peer(self, uri, retries=0):
        if uri == self.my_uri or uri in self.peer_nodes or retries >= self.max_retries -1:
            if uri == self.my_uri:
                logger.info(f"Skipping connection to self: {uri}")
                return
            if retries >= self.max_retries:
                logger.info(f"Max retries reached for peer {uri}, switching to relay mode")
                if await self.ensure_relay_connection(uri):
                    # Send initial messages via relay
                    await self.relay_message(uri, self.create_message(self.MSG_REQUEST_CHAIN_LENGTH, None))
                    if not self.tx_pool_syncing and time.time() - self.last_tx_pool_request > self.tx_pool_request_cooldown:
                        self.tx_pool_syncing = True
                        await self.relay_message(uri, self.create_message(self.MSG_REQUEST_TX_POOL, None))
                        self.last_tx_pool_request = time.time()
                    # Schedule chain sync retry if needed
                    # asyncio.create_task(self.retry_chain_sync(uri))
                return

        parsed_uri = uri
        try:
            logger.info(f"Connecting to peer {uri} via {parsed_uri} (retry {retries + 1}/{self.max_retries})")
            async with websockets.connect(parsed_uri, ping_interval=30, ping_timeout=60, max_size=1024*1024) as websocket:
                self.peer_nodes[uri] = websocket
                logger.info(f"Connected to peer {uri} via {parsed_uri}")
                await websocket.send(self.create_message(self.MSG_REQUEST_CHAIN_LENGTH, None))
                if not self.tx_pool_syncing and time.time() - self.last_tx_pool_request > self.tx_pool_request_cooldown:
                    self.tx_pool_syncing = True
                    await websocket.send(self.create_message(self.MSG_REQUEST_TX_POOL, None))
                    self.last_tx_pool_request = time.time()
                async for message in websocket:
                    await self.handle_message(message, websocket)
        except Exception as e:
            logger.error(f"Failed to connect to peer {uri} via {parsed_uri}: {e}")
            if retries + 1 < self.max_retries:
                await asyncio.sleep(2 * (2 ** retries))
                await self.connect_to_peer(uri, retries + 1)
            else:
                await self.connect_to_peer(uri, retries=self.max_retries)
    
    async def ensure_relay_connection(self, target_uri):
        """Ensure a relay connection exists for the target URI."""
        if target_uri in self.relay_peers and self.relay_peers[target_uri].closed:
            del self.relay_peers[target_uri]

        if target_uri not in self.relay_peers:
            try:
                boot_ws = await websockets.connect(
                    self.boot_node_uri,
                    max_size=1024*1024,
                    ping_interval=30,
                    ping_timeout=60
                )
                self.relay_peers[target_uri] = boot_ws
                logger.info(f"Established relay connection to {target_uri} via boot node")
                # Register with boot node to ensure it knows our URI
                await boot_ws.send(self.create_message(self.MSG_REGISTER_PEER, self.my_uri))
                # Start handling responses for this relay connection
                asyncio.create_task(self.handle_relay_responses(boot_ws, target_uri))
                return True
            except Exception as e:
                logger.error(f"Failed to establish relay connection for {target_uri}: {e}")
                return False
        return True

    async def register_with_boot_node(self, uri, my_uri, retries=0):
        if retries >= self.max_retries:
            logger.error(f"Max retries reached for boot node {uri}. Unable to register.")
            return
        try:
            public_ip, public_port = await self.get_public_ip_port()
            if public_ip and public_port:
                my_uri = f"ws://{public_ip}:{public_port}"
                logger.info(f"Updated my_uri with STUN/TURN: {my_uri}")
            else:
                logger.warning(f"Using original my_uri: {my_uri}")

            logger.info(f"Connecting to boot node {uri} (retry {retries + 1}/{self.max_retries})")
            async with websockets.connect(uri, ping_interval=30, ping_timeout=60, max_size=1024*1024) as websocket:
                logger.info(f"Connected to boot node {uri}")
                await websocket.send(self.create_message(self.MSG_REGISTER_PEER, my_uri))
                async for message in websocket:
                    msg = self.parse_message(message)
                    if msg['type'] == self.MSG_PEER_LIST:
                        peers = msg['data'] if msg.get('data') else []
                        logger.info(f"Received peer list from boot node ..: {peers}")
                        valid_peers = [p for p in peers if p.startswith('ws://') and p != my_uri]
                        self.known_peers.update(valid_peers)
                        self.save_peers()
                        for peer_uri in valid_peers:
                            asyncio.create_task(self.connect_to_peer(peer_uri))
        except Exception as e:
            logger.error(f"Failed to connect to boot node {uri}: {e}")
            await asyncio.sleep(5 * (2 ** retries))
            await self.register_with_boot_node(uri, my_uri, retries + 1)

    async def start_server(self):
        try:
            open_port(self.websocket_port)
        except Exception as e:
            logger.error(f"Failed to open port {self.websocket_port} via UPnP: {e}. Please forward manually.")
        await self.initialize_async()
        self.server = await websockets.serve(self.connection_handler, "0.0.0.0", self.websocket_port, max_size=1024*1024)
        logger.info(f"Peer node running at {self.my_uri}")
        await self.sync_with_peers()
        return self.server

    async def broadcast_transaction(self, transaction):
        message = self.create_message(self.MSG_NEW_TX, transaction.to_json())
        await self.broadcast(message)

    def broadcast_transaction_sync(self, transaction):
        if self.loop:
            future = asyncio.run_coroutine_threadsafe(self.broadcast_transaction(transaction), self.loop)
            future.result()
            logger.info(f"Broadcasted transaction {transaction.id}")
        else:
            logger.error("Event loop not available for broadcasting")

    async def broadcast_block(self, block):
        message = self.create_message(self.MSG_NEW_BLOCK, block.to_json())
        await self.broadcast(message)

    def broadcast_block_sync(self, block):
        if self.loop:
            future = asyncio.run_coroutine_threadsafe(self.broadcast_block(block), self.loop)
            future.result()
            logger.info(f"Broadcasted block {block.hash}")
        else:
            logger.error("Event loop not available for broadcasting")

    async def run_peer_discovery(self):
        logger.info("Starting peer discovery...")
        if self.my_uri != self.boot_node_uri:
            asyncio.create_task(self.register_with_boot_node(self.boot_node_uri, self.my_uri))
        known_peers = self.load_peers()
        for peer_uri in known_peers:
            if peer_uri != self.my_uri and peer_uri != self.node_id:
                asyncio.create_task(self.connect_to_peer(peer_uri))

    def start_websocket_server(self):
        async def run_node():
            await self.start_server()
            await self.run_peer_discovery()

        self.loop = asyncio.get_event_loop()
        self.loop.run_until_complete(run_node())