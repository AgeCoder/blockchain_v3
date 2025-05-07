from fastapi import APIRouter, Depends, HTTPException
from typing import List, Dict
from models.transaction import Transaction
from models.transaction_pool import TransactionPool
from dependencies import get_transaction_pool, get_blockchain
from models.blockchain import Blockchain
from schemas.transaction import TransactionByAddressSchema
import time
router = APIRouter()

TransactionPoolDep = Depends(get_transaction_pool)
BlockchainDep = Depends(get_blockchain)

@router.get("/transactions", response_model=List[Dict], status_code=200)
async def route_transactions(transaction_pool: TransactionPool = TransactionPoolDep):
    return transaction_pool.transaction_data()

@router.get("/transactions/{tx_id}", status_code=200)
async def route_transaction_by_id(tx_id: str, transaction_pool: TransactionPool = TransactionPoolDep, blockchain: Blockchain = BlockchainDep):
    # Check in the transaction pool and blockchain
    transaction = transaction_pool.transaction_map.get(tx_id)
    if transaction:
        return transaction.to_json()
    # If not found in the transaction pool, check the blockchain
    for block in blockchain.chain:
        for tx in block.data:
            if tx["id"] == tx_id:
                return {
                    "id": tx["id"],
                    "input": tx["input"],
                    "output": tx["output"],
                    "status": "confirmed",
                    "blockHeight": block.height,
                    "timestamp": tx["input"].get("timestamp", block.timestamp),
                    "fee": tx.get("fee", 0),
                }
    return []

@router.post("/transactions/clear", status_code=200)
async def route_clear_transactions(
    transaction_pool: TransactionPool = TransactionPoolDep,
    blockchain: Blockchain = BlockchainDep
):
    transaction_pool.clear_blockchain_transactions(blockchain)
    return {"message": "Transaction pool cleared of blockchain transactions"}

@router.get("/transactions/add/{address}", response_model=List[TransactionByAddressSchema], status_code=200)
async def route_transactions_by_address(
    address: str,
    blockchain= BlockchainDep,
    transaction_pool= TransactionPoolDep
):
    transactions = []
    # Check transaction pool (pending transactions)
    for tx in transaction_pool.transaction_data():
        if tx["input"].get("address") == address or address in tx["output"]:
            tx_data = {
                "id": tx["id"],
                "input": tx["input"],
                "output": tx["output"],
                "status": "pending",
                "timestamp": tx["input"].get("timestamp", time.time() * 1000000),
                "fee": tx.get("fee", 0),
            }
            transactions.append(tx_data)
    # Check blockchain (confirmed transactions)
    for block in blockchain.chain:
        for tx in block.data:
            if tx["input"].get("address") == address or address in tx["output"]:
                tx_data = {
                    "id": tx["id"],
                    "input": tx["input"],
                    "output": tx["output"],
                    "status": "confirmed",
                    "blockHeight": block.height,
                    "timestamp": tx["input"].get("timestamp", block.timestamp),
                    "fee": tx.get("fee", 0),
                }
                transactions.append(tx_data)
    # Sort by timestamp (newest first)
    transactions.sort(key=lambda x: x.get("timestamp", 0), reverse=True)
    return transactions