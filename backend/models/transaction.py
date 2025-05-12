import time
from uuid import uuid4
from typing import Dict, Optional, List, Any
import json
from core.config import (
    BLOCK_SUBSIDY, HALVING_INTERVAL, MIN_FEE,
    MINING_REWARD_INPUT, BASE_TX_SIZE, DEFAULT_FEE_RATE, PRIORITY_MULTIPLIERS
)
from web3 import Web3
from eth_account.messages import encode_defunct
from utils.cryptohash import crypto_hash
import logging
class Transaction:
    def __init__(
        self,
        sender_address: Optional[str] = None,
        public_key: Optional[str] = None,
        recipient: Optional[str] = None,
        amount: Optional[float] = None,
        id: Optional[str] = None,
        output: Optional[Dict[str, float]] = None,
        input: Optional[Dict[str, Any]] = None,
        fee: float = 0.0,
        size: int = 0,
        is_coinbase: bool = False,
        fee_rate: float = DEFAULT_FEE_RATE,
        signature: Optional[str] = None,
        blockchain: Any = None,
        transaction_pool: Any = None
    ):
        self.id = id or (f"coinbase_{str(uuid4())}" if is_coinbase else str(uuid4()))
        self.is_coinbase = is_coinbase
        self.fee = fee
        self.fee_rate = max(fee_rate, MIN_FEE / BASE_TX_SIZE) if not is_coinbase else 0
        self.recipient = recipient
        self.amount = amount
        self.recipients = [recipient] if recipient else []
        self.amounts = {recipient: amount} if recipient and amount is not None else {}
        self.blockchain = blockchain
        self.transaction_pool = transaction_pool
        self.sender_address = sender_address
        self.public_key = public_key
        self.signature = signature
        self.logger = logging.getLogger(__name__)
        if is_coinbase:
            if output is None or input is None:
                raise ValueError("Coinbase transaction requires output and input")
            self.output = output.copy() if output else {}
            self.input = input
            self.size = self._calculate_size()
            self.fee = 0.0
        else:
            if not self.recipient or self.amount is None or self.amount <= 0:
                raise ValueError("Invalid transaction parameters: recipient and positive amount required")

            if input is None or output is None:
                 if not sender_address or not public_key or not signature:
                    raise ValueError("Sender address, public key, and signature required for non-coinbase transaction")
                 if not all(c in "0123456789abcdefABCDEF" + "x" for c in signature.replace("0x", "")):
                    raise ValueError("Invalid signature format")
                 if not all(c in "0123456789abcdefABCDEF" + "x" for c in public_key.replace("0x", "")):
                    raise ValueError("Invalid public key format")

                 estimated_size = self._calculate_size()
                 self.fee = max(estimated_size * self.fee_rate, MIN_FEE)
                 required_amount = self.amount + self.fee

                 input_data = self._create_input(sender_address, public_key, signature, required_amount=required_amount)
                 self.input = input_data
                 total_input_amount = input_data.get('amount', 0.0)

                 change_amount = total_input_amount - required_amount
                 if change_amount < -1e-9:
                      raise ValueError(f"Calculated change amount is negative: {change_amount}")
                 change_amount = max(0.0, change_amount)

                 self.output = {self.recipient: self.amount}
                 if change_amount > 1e-9 and sender_address:
                      self.output[sender_address] = change_amount
                 elif change_amount > 1e-9 and not sender_address:
                      raise ValueError("Cannot create change output without sender address")

                 self.size = self._calculate_size()
                 

            else:
                self.output = output
                self.input = input
                self.size = self._calculate_size()
                self.fee = input.get('fees', 0.0)
                if not self.fee:
                     self.fee = max(BASE_TX_SIZE * self.fee_rate, MIN_FEE)

                total_input_amount = input.get('amount', 0.0)
                total_output_value = sum(self.output.values())
                if abs(total_input_amount - (total_output_value + self.fee)) < 0:
                     raise ValueError(f"Input amount {total_input_amount:.4f} does not match total output {total_output_value:.4f} + fee {self.fee:.4f}")


    def _create_output(self, sender_address: Optional[str], recipient: str, amount: float) -> Dict[str, float]:
        if not recipient or amount is None or amount <= 0:
            raise ValueError("Invalid transaction parameters: valid recipient and positive amount required")
        return {recipient: amount}

    def _create_input(self, sender_address: str, public_key: str, signature: str, required_amount: float) -> Dict:
        if not sender_address or not public_key or not signature:
            raise ValueError("Sender address, public key, and signature required for input creation")

        selected_utxos = []
        total_input = 0.0

        pending_spends = Transaction.pending_spends(self.transaction_pool, sender_address)
        balance = self.blockchain.calculate_balance(sender_address) - pending_spends
        if balance < required_amount:
            raise ValueError(f"Insufficient funds: available {balance:.4f}, required {required_amount:.4f}")
        
        if self.blockchain:
            for tx_id, outputs in self.blockchain.utxo_set.items():
                for addr, amount in outputs.items():
                    if addr == sender_address:
                        if amount <= 0:
                            raise ValueError(f"Invalid UTXO amount: {amount}")
                        selected_utxos.append((tx_id, amount))
                        total_input += amount
        
        if self.transaction_pool:
            for tx in self.transaction_pool.transaction_map.values():
                if tx.input and tx.input.get('address') == sender_address:
                    for addr, amount in tx.output.items():
                        if addr == sender_address:
                            if amount <= 0:
                                raise ValueError(f"Invalid transaction output amount: {amount}")
                            selected_utxos.append((tx.id, amount))

        if total_input < required_amount:
            raise ValueError(f"Insufficient funds: available {total_input:.4f}, required {required_amount:.4f}")
        if not selected_utxos:
            raise ValueError("No valid UTXOs found")

       
        prev_tx_ids = [tx_id for tx_id, _ in selected_utxos]

        return {
            'timestamp': time.time_ns(),
            'amount': balance, 
            'fee': self.fee, 
            'address': sender_address,
            'public_key': public_key,
            'signature': signature,
            'prev_tx_ids': prev_tx_ids 
        }


    def _calculate_size(self) -> int:
        input_size = 0
        if hasattr(self, 'input') and self.input:
            input_size = len(str(self.input.get('prev_tx_ids', []))) * 50 + len(str(self.input))
        output_size = 0
        if hasattr(self, 'output') and self.output:
             output_size = len(str(self.output)) + sum(len(addr) for addr in self.output.keys()) * 20

        return max(BASE_TX_SIZE, input_size + output_size)

    @staticmethod
    def is_valid(transaction, blockchain=None, transaction_pool=None) -> bool:
        if transaction.is_coinbase:
            outputs = list(transaction.output.items())
            block_height = transaction.input.get('block_height', 0)
            subsidy = BLOCK_SUBSIDY // (2 ** (block_height // HALVING_INTERVAL))
            total_fees = transaction.input.get('fees', 0.0)

            if len(outputs) != 1 or outputs[0][1] <= 0:
                raise ValueError("Invalid coinbase transaction output")
            if abs(outputs[0][1] - (subsidy + total_fees)) > 1e-9:
                raise ValueError(f"Coinbase output {outputs[0][1]:.4f} does not match subsidy {subsidy:.4f} + fees {total_fees:.4f}")
            return True

        if transaction.input and transaction.input.get('address') == MINING_REWARD_INPUT.get('address'):
            raise ValueError("Mining reward should only be part of coinbase transaction")

        if not hasattr(transaction, 'input') or not transaction.input or not hasattr(transaction, 'output') or not transaction.output:
             raise ValueError("Transaction must have input and output")

        if not transaction.input.get('address') or not transaction.input.get('public_key') or not transaction.input.get('signature'):
            raise ValueError("Sender address, public key, and signature required for non-coinbase transaction input")

        output_total_excluding_change = sum(amount for recipient, amount in transaction.output.items() if recipient != transaction.input.get('address'))


        input_amount = transaction.input.get('amount', 0.0)
        transaction_fee = transaction.fee

        if output_total_excluding_change < 0 or input_amount < 0 or transaction_fee < MIN_FEE:
            raise ValueError(f"Invalid values: output excluding change {output_total_excluding_change:.4f}, input {input_amount:.4f}, fee {transaction_fee:.4f}")

        total_output_value = sum(transaction.output.values())
        if abs(input_amount - (total_output_value + transaction_fee)) < 0:
             raise ValueError(f"Input amount {input_amount:.4f} does not match total output {total_output_value:.4f} + fee {transaction_fee:.4f}")


        prev_tx_ids = transaction.input.get('prev_tx_ids', [])
        if not isinstance(prev_tx_ids, list):
             raise ValueError("Invalid prev_tx_ids format in transaction input")

        if not prev_tx_ids:
            raise ValueError("Transaction input missing prev_tx_ids")

        if blockchain:
            for tx_id in prev_tx_ids:
                if tx_id not in blockchain.utxo_set:
                    if transaction_pool and any(tx.id == tx_id for tx in transaction_pool.transaction_map.values()):
                        continue
                    raise ValueError(f"Unknown UTXO: {tx_id}")
                if transaction.input.get('address') not in blockchain.utxo_set.get(tx_id, {}):
                    raise ValueError(f"UTXO {tx_id} does not belong to sender")

            actual_spent_utxo_total = 0.0
            for tx_id in prev_tx_ids:
                 if tx_id in transaction_pool.transaction_map:
                    continue
                 elif tx_id in blockchain.utxo_set and transaction.input.get('address') in blockchain.utxo_set.get(tx_id, {}):
                      actual_spent_utxo_total += blockchain.utxo_set[tx_id][transaction.input['address']]
                 else:
                      raise ValueError(f"Consistency error: UTXO {tx_id} for sender not found during total input verification.")
            pending_spends = Transaction.pending_spends(transaction_pool, transaction.input['address'])
            actual_spent_utxo_total -= pending_spends

            if abs(input_amount - actual_spent_utxo_total) < 0:
                 logging.warning(f"Input amount {input_amount:.4f} is less than actual spent UTXO total {actual_spent_utxo_total:.4f}.")
                 raise ValueError(f"Input amount {input_amount:.4f} does not match the sum of spent UTXO amounts {actual_spent_utxo_total:.4f}")


        priority = "medium"
        for p_key, multiplier in PRIORITY_MULTIPLIERS.items():
             if abs(transaction.fee_rate - (DEFAULT_FEE_RATE * multiplier)) < 1e-9:
                  priority = p_key
                  break

        recipient_address = None
        transaction_amount = None
        if hasattr(transaction, 'output') and isinstance(transaction.output, dict):
             for addr, val in transaction.output.items():
                  if transaction.input and addr != transaction.input.get('address'):
                       recipient_address = addr
                       transaction_amount = val
                       break
                  if not transaction.input:
                       recipient_address = addr
                       transaction_amount = val
                       break

        if recipient_address is None or transaction_amount is None:
             raise ValueError("Could not determine recipient or amount for signature verification.")

        message_to_verify = f"{recipient_address}:{(transaction_amount + 0.00001):.5f}:{priority}:{transaction.public_key}"

        w3 = Web3()
        try:
             recovered_address = w3.eth.account.recover_message(encode_defunct(text=message_to_verify), signature=transaction.input['signature'])
             if recovered_address.lower() != transaction.input.get('address', '').lower():
                raise ValueError("Invalid signature")
        except Exception as e:
            raise ValueError(f"Signature verification failed: {e}")
        logging.info(f"Transaction {transaction.id} verified successfully")
        return True

    @staticmethod
    def create_coinbase(miner_address: str, block_height: int, total_fees: float = 0.0) -> 'Transaction':
        subsidy = BLOCK_SUBSIDY // (2 ** (block_height // HALVING_INTERVAL))
        total_reward = subsidy + total_fees

        if total_reward <= 0:
            raise ValueError("Total reward must be positive for coinbase transaction")

        coinbase_input = {
            'timestamp': time.time_ns(),
            'address': 'coinbase',
            'public_key': 'coinbase',
            'signature': 'coinbase',
            'coinbase_data': f'Height:{block_height}',
            'block_height': block_height,
            'subsidy': subsidy,
            'fees': total_fees
        }

        if not miner_address:
            raise ValueError("Miner address is required for coinbase transaction")

        output = {miner_address: total_reward}
        return Transaction(
            input=coinbase_input,
            output=output,
            fee=0.0,
            size=BASE_TX_SIZE,
            is_coinbase=True,
        )

    def to_json(self) -> Dict:
        return {
            'id': self.id,
            'input': self.input,
            'output': self.output,
            'fee': self.fee,
            'size': self.size,
            'is_coinbase': self.is_coinbase,
        }

    @classmethod
    def from_json(cls, transaction_dict: Dict) -> 'Transaction':
        input_data_from_json = transaction_dict.get('input')
        input_dict = input_data_from_json if isinstance(input_data_from_json, dict) else {}

        output_dict_raw = transaction_dict.get('output', {})
        output_dict = {}
        if isinstance(output_dict_raw, dict):
             for addr, val in output_dict_raw.items():
                  try:
                       output_dict[addr] = float(val)
                  except (ValueError, TypeError):
                       raise ValueError(f"Invalid amount format in transaction output for address {addr}: {val}")
        else:
             raise ValueError("Transaction output format is invalid")


        is_coinbase = transaction_dict.get('is_coinbase', input_dict.get('address') == 'coinbase')

        sender_address = input_dict.get('address') if not is_coinbase else None
        public_key = input_dict.get('public_key') if not is_coinbase else None
        signature = input_dict.get('signature') if not is_coinbase else None

        recipient = None
        amount = None
        if not is_coinbase and output_dict:
            try:
                if sender_address:
                    for addr, val in output_dict.items():
                        if addr != sender_address:
                            recipient = addr
                            amount = val
                            break
                    if recipient is None and output_dict:
                         recipient = next(iter(output_dict))
                         amount = output_dict[recipient]
                else:
                    if output_dict:
                         recipient = next(iter(output_dict))
                         amount = output_dict[recipient]

            except StopIteration:
                pass

        fee_raw = transaction_dict.get('fee', 0.0)
        try:
             fee = float(fee_raw)
        except (ValueError, TypeError):
             raise ValueError(f"Invalid fee format in transaction: {fee_raw}")


        return cls(
            id=transaction_dict['id'],
            output=output_dict,
            input=input_dict,
            fee=fee,
            size=transaction_dict.get('size', 0),
            is_coinbase=is_coinbase,
            sender_address=sender_address,
            public_key=public_key,
            signature=signature,
            recipient=recipient,
            amount=amount
        )

    @staticmethod
    def pending_spends(transaction_pool: Any, address: str) -> float:
        pending_spends = 0.0
        for tx in transaction_pool.transaction_map.values():
            if tx.input and tx.input.get("address") == address:
                for output_addr, amount in tx.output.items():
                    if output_addr != address:
                        pending_spends += amount + tx.fee
        return pending_spends