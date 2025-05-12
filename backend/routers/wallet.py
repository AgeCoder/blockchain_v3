from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict
from models.transaction import Transaction
from models.blockchain import Blockchain
from models.transaction_pool import TransactionPool
from services.pubsub import PubSub
from services.fee_rate_estimator import FeeRateEstimator
from core.config import PRIORITY_MULTIPLIERS
from dependencies import get_blockchain, get_transaction_pool, get_pubsub, get_fee_rate_estimator
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

class WalletInfoResponse(BaseModel):
    address: str
    balance: float
    pending_spends: float

class TransactRequest(BaseModel):
    recipient: str
    amount: float
    signature: str
    public_key: str
    priority: str = "medium"
    address: str

class TransactResponse(BaseModel):
    message: str
    transaction: Dict
    fee: float
    size: int
    timestamp: int
    balance_info: Dict

@router.get("/wallet/info/{address}", response_model=WalletInfoResponse, status_code=200)
async def route_wallet_info(
    address: str,
    blockchain: Blockchain = Depends(get_blockchain),
    transaction_pool: TransactionPool = Depends(get_transaction_pool)
):
    confirmed_balance = blockchain.calculate_balance(address)
    pending_spends = sum(
        amount + tx.fee
        for tx in transaction_pool.transaction_map.values()
        if tx.input and tx.input.get("address") == address
        for output_addr, amount in tx.output.items()
        if output_addr != address
    )
    return {
        "address": address,
        "balance": confirmed_balance,
        "pending_spends": pending_spends
    }

@router.post("/wallet/transact", response_model=TransactResponse, status_code=200)
async def route_wallet_transact(
    request: TransactRequest,
    blockchain: Blockchain = Depends(get_blockchain),
    transaction_pool: TransactionPool = Depends(get_transaction_pool),
    pubsub: PubSub = Depends(get_pubsub),
    fee_rate_estimator: FeeRateEstimator = Depends(get_fee_rate_estimator)
):
    print("Received transaction request:", request)
    sender_address = request.address
    base_fee_rate = fee_rate_estimator.get_fee_rate()
    priority_multiplier = PRIORITY_MULTIPLIERS.get(request.priority, 1.0)
    fee_rate = base_fee_rate * priority_multiplier
    confirmed_balance = blockchain.calculate_balance(sender_address)
    pending_tx_spends = sum(
        amount + tx.fee
        for tx in transaction_pool.transaction_map.values()
        if tx.input and tx.input.get("address") == sender_address
        for output_addr, amount in tx.output.items()
        if output_addr != sender_address
    )
    available_balance = confirmed_balance - pending_tx_spends

    if request.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    if available_balance < 0:
        raise HTTPException(status_code=400, detail=f"Insufficient funds: {available_balance:.4f}")
    if request.amount > available_balance:
        raise HTTPException(status_code=400, detail=f"Insufficient funds: {available_balance:.4f}")

    transaction = Transaction(
        sender_address=sender_address,
        recipient=request.recipient,
        amount=request.amount,
        fee_rate=fee_rate,
        signature=request.signature,
        public_key=request.public_key,
        blockchain=blockchain,
        transaction_pool=transaction_pool
    )
    Transaction.is_valid(transaction, blockchain, transaction_pool)
    if transaction_pool.existing_transaction(sender_address):
        raise HTTPException(status_code=400, detail="Transaction already in pool")
    transaction_pool.set_transaction(transaction)
    total_cost = request.amount + transaction.fee
    if total_cost > confirmed_balance - pending_tx_spends:
        transaction_pool.transaction_map.pop(transaction.id, None)
        raise HTTPException(status_code=400, detail=f"Insufficient funds after fee: {confirmed_balance - pending_tx_spends:.4f}")
    pubsub.broadcast_transaction_sync(transaction)
    return {
        "message": "Transaction created successfully",
        "transaction": transaction.to_json(),
        "fee": transaction.fee,
        "size": transaction.size,
        "timestamp": transaction.input["timestamp"],
        "balance_info": {
            "confirmed_balance": confirmed_balance,
            "pending_spend": pending_tx_spends + total_cost,
            "available_balance": confirmed_balance - pending_tx_spends - total_cost
        }
    }