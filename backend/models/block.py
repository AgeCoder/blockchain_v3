import time
import logging
import json
from utils.cryptohash import crypto_hash
from core.config import MINRATE, BLOCK_SIZE_LIMIT, TARGET_BLOCK_TIME, BLOCK_SUBSIDY, HALVING_INTERVAL
from utils.hex_to_binary import hex_to_binary
from models.transaction import Transaction

GENESIS_DATA = {
    "data": [
        {
            "id": "genesis_initial_tx",
            "input": {
                "address": "coinbase",
                "block_height": 0,
                "coinbase_data": "Initial funding",
                "fees": 0,
                "public_key": "coinbase",
                "signature": "coinbase",
                "subsidy": 50,
                "timestamp": 1746707304053502800,
            },
            "is_coinbase": True,
            "output": {
                "0xb169392F5D2EbC032cF6afc4645159eE2033C395": 50
            },
            "fee": 0,
            "size": 250
        }
    ],
    "difficulty": 3,
    "height": 0,
    "last_hash": "d89f504b7499128eb40c973e0b5a7ec84e54c65449ae5da894b3dec0b3e2858a",# genesis_last_hash
    "nonce": 0,
    "timestamp": 1746707304053502800,
    "tx_count": 1,
    "version": 1
}

GENESIS_DATA["merkle_root"] = crypto_hash(json.dumps(GENESIS_DATA["data"][0], sort_keys=True))
GENESIS_DATA["hash"] = crypto_hash(
    GENESIS_DATA["timestamp"],
    GENESIS_DATA["last_hash"],
    GENESIS_DATA["data"],
    GENESIS_DATA["difficulty"],
    GENESIS_DATA["nonce"],
    GENESIS_DATA["height"],
    GENESIS_DATA["version"],
    GENESIS_DATA["merkle_root"],
    GENESIS_DATA["tx_count"]
)

class Block:
    def __init__(self, timestamp, last_hash, hash, data, difficulty, nonce,
                 height=None, version=None, merkle_root=None, tx_count=None):
        self.timestamp = timestamp
        self.last_hash = last_hash
        self.hash = hash
        self.data = data
        self.difficulty = max(1, difficulty)
        self.nonce = nonce
        self.height = height if height is not None else 0
        self.version = version if version is not None else 1
        self.merkle_root = merkle_root if merkle_root is not None else self.calculate_merkle_root()
        self.tx_count = tx_count if tx_count is not None else len(data)
        self.logger = logging.getLogger(__name__)
        self.validate_block()

    def validate_block(self):
        if self.height < 0:
            raise ValueError("Block height cannot be negative")
        if self.difficulty < 1:
            raise ValueError("Block difficulty cannot be less than 1")
        if self.tx_count != len(self.data):
            raise ValueError("Transaction count does not match data length")
        if not isinstance(self.data, list):
            raise ValueError("Block data must be a list")
        if not all(isinstance(tx, dict) for tx in self.data):
            raise ValueError("All transactions in block data must be dictionaries")
        if not isinstance(self.hash, str) or len(self.hash) != 64:
            raise ValueError("Block hash must be a 64-character hexadecimal string")
        if not isinstance(self.last_hash, str) or len(self.last_hash) != 64:
            raise ValueError("Last block hash must be a 64-character hexadecimal string")
        if not isinstance(self.merkle_root, str) or len(self.merkle_root) != 64:
            raise ValueError("Merkle root must be a 64-character hexadecimal string")
        if not isinstance(self.nonce, int) or self.nonce < 0:
            raise ValueError("Nonce must be a non-negative integer")
        if not isinstance(self.timestamp, int) or self.timestamp < 0:
            raise ValueError("Timestamp must be a non-negative integer")
        if not isinstance(self.version, int) or self.version < 1:
            raise ValueError("Version must be a positive integer")
        if not isinstance(self.tx_count, int) or self.tx_count < 0:
            raise ValueError("Transaction count must be a non-negative integer")
        

    def to_json(self):
        return {
            'timestamp': self.timestamp,
            'last_hash': self.last_hash,
            'hash': self.hash,
            'data': self.data,
            'difficulty': self.difficulty,
            'nonce': self.nonce,
            'height': self.height,
            'version': getattr(self, 'version', 1),  # Ensure version exists
            'merkle_root': self.merkle_root,
            'tx_count': len(self.data)
        }

    @staticmethod
    def mine_block(last_block, data):
        if not isinstance(last_block, Block):
            raise ValueError("Invalid last block")

        serialized_data = [tx.to_json() if not isinstance(tx, dict) else tx for tx in data]
        if len(json.dumps(serialized_data).encode('utf-8')) > BLOCK_SIZE_LIMIT:
            raise ValueError(f"Block data exceeds size limit of {BLOCK_SIZE_LIMIT} bytes")

        timestamp = time.time_ns()
        last_hash = last_block.hash
        nonce = 0
        height = last_block.height + 1
        version = 1
        merkle_root = Block.calculate_merkle_root(serialized_data)
        difficulty = Block.adjust_difficulty(last_block, { 
            'height': height,
            'timestamp': timestamp,
        } )
        tx_count = len(data)

        hash = crypto_hash(
            timestamp, last_hash, serialized_data, difficulty, nonce, height, version, merkle_root, tx_count
        )

        while hex_to_binary(hash)[:difficulty] != '0' * difficulty:
            nonce += 1
            timestamp = time.time_ns()
            difficulty = Block.adjust_difficulty(last_block,{ 
            'height': height,
            'timestamp': timestamp,
        })
            hash = crypto_hash(
                timestamp, last_hash, serialized_data, difficulty, nonce, height, version, merkle_root, tx_count
            )

        return Block(
            timestamp, last_hash, hash, serialized_data, difficulty, nonce, height, version, merkle_root, tx_count
        )

    @staticmethod
    def calculate_merkle_root(data):
        if not data:
            return crypto_hash('')

        hashes = []
        for tx in data:
            tx_json = tx if isinstance(tx, dict) else tx.to_json()
            serialized_tx = json.dumps(tx_json, sort_keys=True, separators=(',', ':'), default=lambda x: f"{x:.4f}" if isinstance(x, float) else x)
            tx_hash = crypto_hash(serialized_tx)
            hashes.append(tx_hash)

        while len(hashes) > 1:
            temp = []
            for i in range(0, len(hashes), 2):
                if i + 1 < len(hashes):
                    temp.append(crypto_hash(hashes[i] + hashes[i + 1]))
                else:
                    temp.append(hashes[i])
            hashes = temp

        return hashes[0]

    @classmethod
    def genesis(cls):
        return cls(
            timestamp=GENESIS_DATA["timestamp"],
            last_hash=GENESIS_DATA["last_hash"],
            hash=GENESIS_DATA["hash"],
            data=GENESIS_DATA["data"],
            difficulty=GENESIS_DATA["difficulty"],
            nonce=GENESIS_DATA["nonce"],
            height=GENESIS_DATA["height"],
            version=GENESIS_DATA["version"],
            merkle_root=GENESIS_DATA["merkle_root"],
            tx_count=GENESIS_DATA["tx_count"]
        )


    @staticmethod
    def from_json(block_json):
        return Block(
            timestamp=block_json['timestamp'],
            last_hash=block_json['last_hash'],
            hash=block_json['hash'],
            data=block_json['data'],
            difficulty=block_json['difficulty'],
            nonce=block_json['nonce'],
            height=block_json.get('height', 0),
            version=block_json.get('version', 1),
            merkle_root=block_json.get('merkle_root', '0' * 64),
            tx_count=block_json.get('tx_count', len(block_json['data']))
        )

    # @staticmethod
    # def adjust_difficulty(last_block, new_timestamp):
    #     time_diff = (new_timestamp - last_block.timestamp) / 1_000_000_000
    #     if time_diff < MINRATE:
    #         return last_block.difficulty + 1
    #     if last_block.difficulty > 1 and time_diff > TARGET_BLOCK_TIME * 2:
    #         return last_block.difficulty - 1
    #     return last_block.difficulty
    @staticmethod
    def adjust_difficulty(last_block, new_block):
        """
        Adjusts difficulty only every DIFFICULTY_INTERVAL blocks,
        and only if the time difference exceeds a 5% threshold.
        """
        TARGET_BLOCK_TIME = 9  # seconds
        DIFFICULTY_INTERVAL = 9  # blocks
        MIN_DIFFICULTY = 1
        SIGNIFICANT_CHANGE_THRESHOLD = 0.05  # 5%
        
        # Only adjust difficulty every N blocks
        if new_block['height'] % DIFFICULTY_INTERVAL != 0:
            return last_block.difficulty

        # Calculate time difference in seconds
        time_diff = (new_block['timestamp'] - last_block.timestamp) / 1_000_000_000

        # Expected total time for interval
        expected_time = TARGET_BLOCK_TIME * DIFFICULTY_INTERVAL

        # Prevent division by zero
        time_diff = max(1, time_diff)

        # Calculate proportional change
        ratio = expected_time / time_diff
        proposed_difficulty = last_block.difficulty * ratio

        # Check if change exceeds threshold
        percent_change = abs(proposed_difficulty - last_block.difficulty) / last_block.difficulty
        if percent_change < SIGNIFICANT_CHANGE_THRESHOLD:
            return last_block.difficulty

        # Clamp between 0.5x and 2x per interval
        max_difficulty = last_block.difficulty * 2
        min_difficulty = max(MIN_DIFFICULTY, last_block.difficulty / 2)
        new_difficulty = max(min_difficulty, min(max_difficulty, int(proposed_difficulty)))

        return int(new_difficulty)



    @staticmethod
    def is_valid_block(last_block, block):
        if not isinstance(last_block, Block) or not isinstance(block, Block):
            raise ValueError("Invalid block types")

        if block.last_hash != last_block.hash:
            raise ValueError("Last hash mismatch")

        if hex_to_binary(block.hash)[:block.difficulty] != '0' * block.difficulty:
            raise ValueError("Proof of work requirement not met")
        #CHANGE MUST NOT GO OVER 5% OF LAST BLOCK DIFFICULTY
        if block.difficulty > last_block.difficulty * 2 or block.difficulty < last_block.difficulty / 2:
            raise ValueError("Difficulty adjustment exceeds 5% of last block difficulty")

        if block.timestamp <= last_block.timestamp:
            raise ValueError("Block timestamp must be greater than last block timestamp")
        
        if block.timestamp > time.time_ns():
            raise ValueError("Block timestamp cannot be in the future")
        
        if block.height != last_block.height + 1:
            raise ValueError("Block height must be one greater than last block height")

        calculated_merkle_root = Block.calculate_merkle_root(block.data)
        if block.merkle_root != calculated_merkle_root:
            raise ValueError(f"Invalid Merkle root: expected {calculated_merkle_root}, got {block.merkle_root}")

        if len(json.dumps(block.data).encode('utf-8')) > BLOCK_SIZE_LIMIT:
            raise ValueError(f"Block data exceeds size limit of {BLOCK_SIZE_LIMIT} bytes")

        reconstructed_hash = crypto_hash(
            block.timestamp, block.last_hash, block.data, block.difficulty, block.nonce,
            block.height, block.version, block.merkle_root, block.tx_count
        )

        if reconstructed_hash != block.hash:
            raise ValueError("Block hash mismatch")

        coinbase_count = 0
        total_fees = 0.0
        coinbase_tx = None
        for tx_json in block.data:
            tx = Transaction.from_json(tx_json)
            Transaction.is_valid(tx)
            if tx.is_coinbase:
                coinbase_count += 1
                if coinbase_count > 1:
                    raise ValueError("Multiple coinbase transactions")
                coinbase_tx = tx
            else:
                total_fees += tx.fee

        if coinbase_tx:
            subsidy = BLOCK_SUBSIDY // (2 ** (block.height // HALVING_INTERVAL))
            total_output = sum(v for k, v in coinbase_tx.output.items())
            if total_output > subsidy + total_fees:
                raise ValueError(f"Invalid coinbase output: {total_output} exceeds {subsidy} + {total_fees}")

        if coinbase_count == 0 and block.height > 0:
            raise ValueError("Missing coinbase transaction")