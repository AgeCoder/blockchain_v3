from pydantic import BaseModel
from typing import List, Dict

class BlockSchema(BaseModel):
    timestamp: int
    last_hash: str
    hash: str
    data: List[Dict]
    difficulty: int
    nonce: int
    height: int
    version: int
    merkle_root: str
    tx_count: int

class BlockchainSchema(BaseModel):
    chain: List[BlockSchema]
    utxo_set: Dict
    current_height: int

class BlockchainRangeResponse(BaseModel):
    chain: List[BlockSchema]

class BlockchainHeightResponse(BaseModel):
    height: int

class HalvingResponse(BaseModel):
    halvings: int
    subsidy: int

class MineBlockRequest(BaseModel):
    miner_address: str

class MineBlockResponse(BaseModel):
    message: str
    block: BlockSchema
    reward: float
    confirmed_balance: float

class PaginatedBlocksResponse(BaseModel):
    blocks: List[BlockSchema]
    page: int
    page_size: int
    total_blocks: int
    total_pages: int
    has_next: bool
    has_previous: bool