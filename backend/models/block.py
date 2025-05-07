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
                "timestamp": 1
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
    "last_hash": "genesis_last_hash",
    "nonce": 0,
    "timestamp": 1,
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
        difficulty = Block.adjust_difficulty(last_block, timestamp)
        nonce = 0
        height = last_block.height + 1
        version = 1
        merkle_root = Block.calculate_merkle_root(serialized_data)
        tx_count = len(data)

        hash = crypto_hash(
            timestamp, last_hash, serialized_data, difficulty, nonce, height, version, merkle_root, tx_count
        )

        while hex_to_binary(hash)[:difficulty] != '0' * difficulty:
            nonce += 1
            timestamp = time.time_ns()
            difficulty = Block.adjust_difficulty(last_block, timestamp)
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
        genesis_tx = Transaction(
            id="genesis_initial_tx",
            input={
                "address": "coinbase",
                "block_height": 0,
                "coinbase_data": "Initial funding",
                "fees": 0,
                "public_key": "coinbase",
                "signature": "coinbase",
                "subsidy": 50,
                "timestamp": 1746597308686237000
            },
            output={"0xb169392F5D2EbC032cF6afc4645159eE2033C397": 50},
            is_coinbase=True
        )
        return cls(
            timestamp=1,
            last_hash='genesis_last_hash',
            hash=crypto_hash(1, 'genesis_last_hash', [genesis_tx.id]),
            data=[genesis_tx.to_json()],
            difficulty=3,
            nonce=0,
            height=0,
            version=1,
            merkle_root=crypto_hash(genesis_tx.id)
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

    @staticmethod
    def adjust_difficulty(last_block, new_timestamp):
        time_diff = (new_timestamp - last_block.timestamp) / 1_000_000_000
        if time_diff < MINRATE:
            return last_block.difficulty + 1
        if last_block.difficulty > 1 and time_diff > TARGET_BLOCK_TIME * 2:
            return last_block.difficulty - 1
        return last_block.difficulty

    @staticmethod
    def is_valid_block(last_block, block):
        if not isinstance(last_block, Block) or not isinstance(block, Block):
            raise ValueError("Invalid block types")

        if block.last_hash != last_block.hash:
            raise ValueError("Last hash mismatch")

        if hex_to_binary(block.hash)[:block.difficulty] != '0' * block.difficulty:
            raise ValueError("Proof of work requirement not met")

        if abs(last_block.difficulty - block.difficulty) > 1:
            raise ValueError("Difficulty adjustment too large")

        if block.height != last_block.height + 1:
            raise ValueError("Invalid block height")

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
