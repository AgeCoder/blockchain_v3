from pydantic import BaseModel, Field, NonNegativeFloat, NonNegativeInt
from typing import Dict, List, Any, Optional

class TransactionInput(BaseModel):
    timestamp: float
    amount: Optional[NonNegativeFloat] = None
    address: str
    public_key: Optional[str] = None
    signature: Optional[Any] = None
    prev_tx_ids: Optional[List[str]] = None
    coinbase_data: Optional[str] = None
    block_height: Optional[NonNegativeInt] = None
    subsidy: Optional[NonNegativeFloat] = None
    fees: Optional[NonNegativeFloat] = None

class TransactionSchema(BaseModel):
    id: str
    input: TransactionInput
    output: Dict[str, NonNegativeFloat]
    fee: NonNegativeFloat
    size: NonNegativeInt
    is_coinbase: bool

    class Config:
        from_attributes = True

class TransactionPoolSchema(BaseModel):
    transactions: List[TransactionSchema]
    count: NonNegativeInt

class TransactionByAddressSchema(BaseModel):
    id: str
    input: TransactionInput
    output: Dict[str, NonNegativeFloat]
    status: str
    timestamp: float
    fee: NonNegativeFloat
    blockHeight: Optional[NonNegativeInt] = None