import logging
from models.transaction import Transaction
from models.block import Block
from core.config import (
    BLOCK_SUBSIDY, HALVING_INTERVAL, MINING_REWARD_INPUT
)
import json
import time

class Blockchain:
    def __init__(self):
        self.chain = [Block.genesis()]
        self.utxo_set = {}
        self.current_height = 0
        self.difficulty_adjustment_blocks = []
        self.logger = logging.getLogger(__name__)
        self.initialize_utxo_set()

    def initialize_utxo_set(self):
        self.utxo_set = {}
        genesis_block = self.chain[0]
        for tx_json in genesis_block.data:
            try:
                tx = Transaction.from_json(tx_json)
                if tx.output:
                    self.utxo_set[tx.id] = tx.output
            except Exception as e:
                 self.logger.error(f"Error initializing UTXO from genesis transaction {tx_json.get('id', 'unknown')}: {str(e)}")
                 pass

    def add_block(self, transactions, transaction_pool=None):
        last_block = self.chain[-1]

        validated_transactions = []
        total_fees = 0
        for tx in transactions:
            if not isinstance(tx, Transaction):
                 self.logger.warning(f"Skipping non-Transaction object in block data: {type(tx)}")
                 continue

            try:
                Transaction.is_valid(tx, self, transaction_pool)
                validated_transactions.append(tx)
                if not tx.is_coinbase:
                    total_fees += tx.fee

            except (ValueError, TypeError) as validation_error:
                 self.logger.warning(f"Transaction validation failed for {tx.id} during block creation: {str(validation_error)}. Skipping transaction.")
            except Exception as e:
                 self.logger.error(f"Unexpected error validating transaction {tx.id} during block creation: {str(e)}. Skipping transaction.")

        has_coinbase = any(tx.is_coinbase for tx in validated_transactions)
        if not has_coinbase and last_block.height > 0:
             miner_address = "miner_address_placeholder"
             try:
                 coinbase_tx = Transaction.create_coinbase(miner_address, last_block.height + 1, total_fees)
                 validated_transactions.insert(0, coinbase_tx)
                 self.logger.info(f"Added coinbase transaction for miner {miner_address} with reward {coinbase_tx.output.get(miner_address, 0)}.")
             except Exception as e:
                  self.logger.error(f"Failed to create coinbase transaction: {str(e)}")
                  pass

        validated_transactions_json = [tx.to_json() for tx in validated_transactions]

        if not validated_transactions_json and last_block.height > 0:
             self.logger.warning("Attempted to mine a block with no valid transactions and failed to create coinbase.")
             raise Exception("Cannot mine a non-genesis block without valid transactions or a coinbase transaction.")
        elif not validated_transactions_json and last_block.height == 0:
             self.logger.warning("Mining genesis block with no transactions.")
             pass


        try:
            new_block = Block.mine_block(last_block, validated_transactions_json)
            self.chain.append(new_block)
            self.current_height = new_block.height
            self.update_utxo_set(new_block)
            self.logger.info(f"Successfully added block {new_block.height} with hash {new_block.hash[:8]}...")
            return new_block
        except Exception as e:
            self.logger.error(f"Error mining or adding block after {last_block.height}: {str(e)}")
            raise Exception(f"Mining failed: {str(e)}")


    def update_utxo_set(self, block):
        for tx_json in block.data:
            try:
                tx = Transaction.from_json(tx_json)

                if not tx.is_coinbase and hasattr(tx, 'input') and tx.input:
                    input_address = tx.input.get('address')
                    prev_tx_ids = tx.input.get('prev_tx_ids', [])
                    for prev_tx_id in prev_tx_ids:
                        if prev_tx_id in self.utxo_set:
                            if input_address in self.utxo_set[prev_tx_id]:
                                del self.utxo_set[prev_tx_id][input_address]
                                if not self.utxo_set[prev_tx_id]:
                                    del self.utxo_set[prev_tx_id]

                if hasattr(tx, 'output') and tx.output:
                    self.utxo_set[tx.id] = tx.output

            except Exception as e:
                self.logger.error(f"UTXO update failed for tx {tx_json.get('id', 'unknown')}: {str(e)}")
                continue

    def rebuild_utxo_set(self, chain):
        temp_utxo = {}
        for block in chain:
            for tx_json in block.data:
                try:
                    tx = Transaction.from_json(tx_json)
                    Transaction.is_valid(tx, blockchain=None, transaction_pool=None)
                    if not tx.is_coinbase:
                        if not hasattr(tx, 'input') or not isinstance(tx.input, dict):
                             raise ValueError(f"Transaction {tx.id} is missing required input data structure during rebuild.")

                        input_data = tx.input
                        if not (input_data and 'address' in input_data and 'prev_tx_ids' in input_data):
                            raise ValueError(f"Invalid transaction input format in tx {tx.id}")
                        input_address = input_data['address']
                        prev_tx_ids = input_data['prev_tx_ids']
                        if not isinstance(prev_tx_ids, list):
                             raise ValueError(f"Invalid prev_tx_ids format for transaction {tx.id} during rebuild.")

                        for prev_tx_id in prev_tx_ids:
                            if prev_tx_id in temp_utxo and input_address in temp_utxo.get(prev_tx_id, {}):
                                del temp_utxo[prev_tx_id][input_address]
                                if not temp_utxo[prev_tx_id]:
                                    del temp_utxo[prev_tx_id]
                            else:
                                 raise ValueError(f"Invalid transaction input: UTXO {prev_tx_id} for address {input_address} not found or already spent during rebuild (tx {tx.id})")
                    if tx.output:
                        if not isinstance(tx.output, dict):
                             raise ValueError(f"Transaction {tx.id} has invalid output format during rebuild.")

                        if tx.id in temp_utxo:
                            self.logger.warning(f"Duplicate transaction ID {tx.id} encountered during UTXO rebuild. Overwriting.")
                        temp_utxo[tx.id] = tx.output
                except Exception as e:
                     raise Exception(f"Failed to rebuild UTXO set for chain: Transaction {tx_json.get('id', 'unknown')} invalid: {str(e)}")
        return temp_utxo

    def replace_chain(self, chain, transaction_pool=None):
        old_chain = self.chain[:]
        old_utxo_set = self.utxo_set.copy()
        old_height = self.current_height
        try:
            if len(chain) <= len(self.chain):
                raise ValueError("New chain must be longer")
            self.is_valid_chain(chain, transaction_pool)
            new_utxo_set = self.rebuild_utxo_set(chain)
            self.chain = chain
            self.utxo_set = new_utxo_set
            self.current_height = len(chain) - 1
            self.logger.info(f"Replaced chain with {self.current_height} blocks")
        except Exception as e:
            self.logger.error(f"Error replacing chain: {str(e)}")
            self.chain = old_chain
            self.utxo_set = old_utxo_set
            self.current_height = old_height
            raise Exception(f"Chain replacement failed: {str(e)}")

    def calculate_difficulty(self):
        self.logger.warning("Using placeholder calculate_difficulty method.")
        if len(self.chain) < 2:
            return self.chain[-1].difficulty
        last_block = self.chain[-1]
        time_diff = (time.time_ns() - last_block.timestamp) / 1_000_000_000
        if time_diff < 60:
            return last_block.difficulty + 1
        elif time_diff > 1200 and last_block.difficulty > 1:
            return last_block.difficulty - 1
        return last_block.difficulty


    def to_json(self):
        return {
            'chain': [block.to_json() for block in self.chain],
            'utxo_set': self.utxo_set,
            'current_height': self.current_height
        }

    @staticmethod
    def from_json(blockchain_json):
        blockchain = Blockchain()
        chain_data = blockchain_json.get('chain', [])
        if not isinstance(chain_data, list):
             raise ValueError("Invalid chain data format in blockchain JSON")
        blockchain.chain = [Block.from_json(block) for block in chain_data]
        utxo_set_data = blockchain_json.get('utxo_set', {})
        if not isinstance(utxo_set_data, dict):
             raise ValueError("Invalid UTXO set data format in blockchain JSON")
        blockchain.utxo_set = utxo_set_data
        blockchain.current_height = blockchain_json.get('current_height', len(blockchain.chain) - 1)
        blockchain.initialize_utxo_set()
        return blockchain

    @staticmethod
    def is_valid_chain(chain, transaction_pool=None):
        if not chain or chain[0].to_json() != Block.genesis().to_json():
            raise ValueError("Invalid genesis block")
        utxo_set = {}
        expected_height = 0

        for i, block in enumerate(chain):
            if i > 0:
                Block.is_valid_block(chain[i-1], block)
            if block.height != expected_height:
                raise ValueError(f"Incorrect height at block {i}")
            expected_height += 1
            has_coinbase = False
            block_total_fees = 0.0
            coinbase_reward = 0.0
            for tx_json in block.data:
                try:
                    tx = Transaction.from_json(tx_json)
                    current_transaction_pool = transaction_pool if i == len(chain) - 1 else None
                    Transaction.is_valid(tx, None, current_transaction_pool)
                    if tx.is_coinbase:
                        if has_coinbase:
                            raise ValueError("Multiple coinbase transactions")
                        has_coinbase = True
                        if not isinstance(tx.output, dict) or not tx.output:
                             raise ValueError("Invalid coinbase transaction output format")
                        coinbase_reward = float(list(tx.output.values())[0])
                    else:
                        block_total_fees += tx.fee
                        input_data = tx.input
                        if not isinstance(input_data, dict) or 'address' not in input_data or 'prev_tx_ids' not in input_data:
                            raise ValueError(f"Invalid input data format for non-coinbase transaction {tx.id}")

                        prev_tx_ids = input_data.get('prev_tx_ids', [])
                        if not isinstance(prev_tx_ids, list):
                             raise ValueError(f"Invalid prev_tx_ids format for transaction {tx.id}")

                        for prev_tx_id in prev_tx_ids:
                            if prev_tx_id not in utxo_set:
                                raise ValueError(f"Invalid input for tx {tx.id}: UTXO {prev_tx_id} not found")
                            if input_data['address'] not in utxo_set.get(prev_tx_id, {}):
                                 raise ValueError(f"UTXO {prev_tx_id} does not belong to sender of tx {tx.id}")
                            del utxo_set[prev_tx_id][input_data['address']]
                            if not utxo_set[prev_tx_id]:
                                utxo_set.pop(prev_tx_id, None)
                        if has_coinbase:
                            
                            subsidy = BLOCK_SUBSIDY // (2 ** (block.height // HALVING_INTERVAL))
                            expected_coinbase_reward = subsidy + block_total_fees
                            if abs(coinbase_reward - expected_coinbase_reward) < 0:
                                raise ValueError(f"Invalid coinbase reward: got {coinbase_reward:.4f}, expected {expected_coinbase_reward:.4f} (Subsidy: {subsidy:.4f}, Fees: {block_total_fees:.4f})")

                except Exception as e:
                     logging.getLogger(__name__).error(f"Transaction validation failed for block {block.height}: {str(e)}")
                     raise Exception(f"Transaction validation failed in block {block.height}: {str(e)}")
            if not has_coinbase and i > 0:
                raise ValueError("Missing coinbase transaction")
            for tx_json in block.data:
                 tx = Transaction.from_json(tx_json)
                 if tx.output:
                    if tx.id in utxo_set:
                         logging.getLogger(__name__).warning(f"Duplicate transaction ID {tx.id} encountered during chain validation UTXO update. Overwriting.")
                    utxo_set[tx.id] = tx.output

        return True

    @staticmethod
    def calculate_total_subsidy(block_count):
        total = 0
        if block_count == 0:
            return total
        halvings = block_count // HALVING_INTERVAL
        for i in range(halvings + 1):
            blocks_in_period = min(HALVING_INTERVAL, block_count - i * HALVING_INTERVAL)
            if blocks_in_period <= 0:
                break
            subsidy = BLOCK_SUBSIDY // (2 ** i)
            total += blocks_in_period * subsidy
        return total

    def calculate_balance(self, address):
        balance = 0.0
        for tx_id, outputs in self.utxo_set.items():
            for output_addr, amount in outputs.items():
                if output_addr == address:
                    balance += amount
        return balance
