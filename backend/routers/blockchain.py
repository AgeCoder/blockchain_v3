from fastapi import APIRouter, Depends, HTTPException, Query
from dependencies import get_blockchain, get_transaction_pool, get_pubsub, get_fee_rate_estimator
from models.transaction import Transaction
from models.blockchain import Blockchain
from models.transaction_pool import TransactionPool
from services.pubsub import PubSub
from services.fee_rate_estimator import FeeRateEstimator
from schemas.blockchain import (
    BlockchainSchema, BlockchainRangeResponse, BlockchainHeightResponse,
    HalvingResponse, MineBlockRequest, MineBlockResponse, BlockSchema,
    PaginatedBlocksResponse
)
from typing import Optional, List, Dict
from math import ceil
from core.config import BLOCK_SIZE_LIMIT, HALVING_INTERVAL, BLOCK_SUBSIDY, PRIORITY_MULTIPLIERS, BASE_TX_SIZE
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 100

BlockchainDep = Depends(get_blockchain)
TransactionPoolDep = Depends(get_transaction_pool)
PubSubDep = Depends(get_pubsub)
FeeRateEstimatorDep = Depends(get_fee_rate_estimator)

class FeeRateResponse(BaseModel):
    fee_rate: float
    priority_multipliers: Dict[str, float]
    mempool_size: int
    block_fullness: float

@router.post("/mine", response_model=MineBlockResponse, status_code=200)
async def route_mine(
    request: MineBlockRequest,
    blockchain: Blockchain = BlockchainDep,
    transaction_pool: TransactionPool = TransactionPoolDep,
    pubsub: PubSub = PubSubDep,
):
    if not blockchain or not transaction_pool or not pubsub:
        raise HTTPException(status_code=500, detail="Server not fully initialized")

    if not request.miner_address:
        raise HTTPException(status_code=400, detail="Miner address is required")
    valid_transactions = []
    total_fees = 0
    for tx in transaction_pool.get_priority_transactions():
        try:
            Transaction.is_valid(tx, blockchain, transaction_pool)
            valid_transactions.append(tx)
            total_fees += tx.fee
        except Exception as e:
            logger.warning(f"Transaction {tx.id} is invalid: {str(e)}")
            continue

    # Create coinbase transaction
    try:
        coinbase_tx = Transaction.create_coinbase(
            request.miner_address, 
            blockchain.current_height + 1, 
            total_fees
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Coinbase creation failed: {str(e)}")

    # Mine block
    try:
        new_block = blockchain.add_block([coinbase_tx] + valid_transactions,transaction_pool)
        pubsub.save_block_to_db(new_block)
        transaction_pool.clear_blockchain_transactions(blockchain)
        pubsub.broadcast_block_sync(new_block)
        
        return {
            "message": "Block mined successfully",
            "block": new_block.to_json(),
            "reward": list(coinbase_tx.output.values())[0],
            "confirmed_balance": blockchain.calculate_balance(request.miner_address)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Mining failed: {str(e)}")

@router.get("/blockchain", response_model=BlockchainSchema, status_code=200)
async def route_blockchain(blockchain: Blockchain = BlockchainDep):
    return blockchain.to_json()

@router.get("/blockchain/paginated", response_model=PaginatedBlocksResponse, status_code=200)
async def get_paginated_blocks(
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    blockchain: Blockchain = BlockchainDep
):
    if not blockchain.chain:
        raise HTTPException(status_code=404, detail="No blocks found")

    total_blocks = len(blockchain.chain)
    total_pages = (total_blocks + page_size - 1) // page_size

    if page > total_pages and total_pages > 0:
        raise HTTPException(status_code=400, detail="Page number exceeds total pages")
    if page > total_pages and total_pages == 0:
        return {
            "blocks": [],
            "page": page,
            "page_size": page_size,
            "total_blocks": total_blocks,
            "total_pages": total_pages,
            "has_next": False,
            "has_previous": False
        }

    start = total_blocks - page * page_size
    end = total_blocks - (page - 1) * page_size

    start = max(0, start)
    end = max(0, end)

    blocks = blockchain.chain[start:end][::-1]

    return {
        "blocks": [block.to_json() for block in blocks],
        "page": page,
        "page_size": page_size,
        "total_blocks": total_blocks,
        "total_pages": total_pages,
        "has_next": page < total_pages,
        "has_previous": page > 1
    }

@router.get("/blockchain/latest", response_model=List[BlockSchema], status_code=200)
async def get_latest_blocks(
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    blockchain: Blockchain = BlockchainDep
):
    if not blockchain.chain:
        raise HTTPException(status_code=404, detail="No blocks found")

    blocks = blockchain.chain[-limit:][::-1]
    return [block.to_json() for block in blocks]

@router.get("/blockchain/range", response_model=BlockchainRangeResponse, status_code=200)
async def route_blockchain_range(
    start: int = Query(0, ge=0),
    end: int = Query(DEFAULT_PAGE_SIZE, ge=0),
    reverse: bool = Query(False, description="Return blocks in reverse order (latest first)"),
    blockchain: Blockchain = BlockchainDep
):
    total_blocks = len(blockchain.chain)

    if start >= total_blocks and total_blocks > 0:
        return {"chain": []}

    if start < 0:
        start = max(0, total_blocks + start)
    if end < 0:
        end = max(0, total_blocks + end)

    if start >= end:
        raise HTTPException(status_code=400, detail="Invalid range parameters")

    blocks = blockchain.chain[start:end]

    if reverse:
        blocks = blocks[::-1]

    return {"chain": [block.to_json() for block in blocks]}

@router.get("/blockchain/height", response_model=BlockchainHeightResponse, status_code=200)
async def route_blockchain_height(blockchain: Blockchain = BlockchainDep):
    return {"height": blockchain.current_height}

@router.get("/blockchain/halving", response_model=HalvingResponse, status_code=200)
async def route_blockchain_halving(blockchain: Blockchain = Depends(get_blockchain)):
    current_height = blockchain.current_height
    halvings = current_height // HALVING_INTERVAL
    subsidy = BLOCK_SUBSIDY // (2 ** halvings)
    return {"halvings": halvings, "subsidy": subsidy}

@router.get("/blockchain/height/{height}", response_model=BlockSchema, status_code=200)
async def route_blockchain_height_by_height(height: int, blockchain: Blockchain = BlockchainDep):
    if height < 0 or height > blockchain.current_height:
        raise HTTPException(status_code=400, detail="Invalid block height")
    try:
        block = blockchain.chain[height]
        return block.to_json()
    except IndexError:
         raise HTTPException(status_code=404, detail="Block not found")

@router.get("/blockchain/hash/{block_hash}", response_model=BlockSchema, status_code=200)
async def route_blockchain_hash(block_hash: str, blockchain: Blockchain = BlockchainDep):
    for block in blockchain.chain:
        if block.hash == block_hash:
            return block.to_json()
    raise HTTPException(status_code=404, detail="Block not found")

@router.get("/blockchain/tx/{tx_id}", status_code=200)
async def route_blockchain_tx(tx_id: str, blockchain: Blockchain = BlockchainDep):
    for block in blockchain.chain:
        for tx in block.data:
            if tx.get("id") == tx_id:
                return {"block": block.to_json(), "transaction": tx}
    raise HTTPException(status_code=404, detail="Transaction not found in any block")

@router.get("/fee-rate", response_model=FeeRateResponse, status_code=200)
async def route_fee_rate(
    fee_rate_estimator: FeeRateEstimator = FeeRateEstimatorDep,
    blockchain: Blockchain = BlockchainDep
):
    fee_rate = fee_rate_estimator.get_fee_rate()
    mempool_size = len(fee_rate_estimator.transaction_pool.transaction_map)
    recent_blocks_count = 10
    recent_blocks = blockchain.chain[-recent_blocks_count:] if len(blockchain.chain) >= recent_blocks_count else blockchain.chain

    total_recent_block_size = 0
    for block in recent_blocks:
        total_recent_block_size += sum(tx.get('size', BASE_TX_SIZE) for tx in block.data)

    block_fullness = (total_recent_block_size / (len(recent_blocks) * BLOCK_SIZE_LIMIT)) if recent_blocks and BLOCK_SIZE_LIMIT > 0 else 0.0


    return {
        "fee_rate": fee_rate,
        "priority_multipliers": PRIORITY_MULTIPLIERS,
        "mempool_size": mempool_size,
        "block_fullness": block_fullness
    }
