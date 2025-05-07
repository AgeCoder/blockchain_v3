import logging
from models.transaction import Transaction

class TransactionPool:
    def __init__(self):
        self.transaction_map = {}
        self.logger = logging.getLogger(__name__)

    def set_transaction(self, transaction):
        if not isinstance(transaction, Transaction):
            raise ValueError("Invalid transaction type")

        Transaction.is_valid(transaction)

        if transaction.id in self.transaction_map:
            if transaction.input.get('timestamp') > self.transaction_map[transaction.id].input.get('timestamp'):
                self.transaction_map[transaction.id] = transaction
            return
        self.transaction_map[transaction.id] = transaction

    def existing_transaction(self, transaction):
        if not isinstance(transaction, Transaction):
             return False
        return transaction.id in self.transaction_map

    def transaction_data(self):
        return [transaction.to_json() for transaction in self.transaction_map.values()]

    def clear_blockchain_transactions(self, blockchain):
        for block in blockchain.chain:
            for tx_json in block.data:
                tx = Transaction.from_json(tx_json)
                if tx.id in self.transaction_map:
                    self.transaction_map.pop(tx.id)

    def get_priority_transactions(self):
        return sorted(self.transaction_map.values(), key=lambda tx: tx.fee / tx.size, reverse=True)

    def to_json(self):
        return {
            'transactions': self.transaction_data(),
            'count': len(self.transaction_map)
        }

    @staticmethod
    def pending_spends(transaction_map, address):
        amount = 0.0
        for tx in transaction_map.values():
            if tx.input.get('address') == address:
                for output_addr, output_amount in tx.output.items():
                    if output_addr != address:
                        amount += output_amount
        return amount
