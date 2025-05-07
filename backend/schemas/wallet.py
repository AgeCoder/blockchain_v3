from pydantic import BaseModel, Field, NonNegativeFloat
from typing import Optional, Any
from typing import Dict
class WalletInfoResponse(BaseModel):
    address: str
    balance: float
    pending_spends: float

class TransactRequest(BaseModel):
    recipient: str = Field(..., min_length=35, max_length=35)
    amount: float = Field(..., gt=0)
    signature: str = Field(..., min_length=128, max_length=128)
    public_key: str = Field(..., min_length=66, max_length=66)
    priority: str = Field(..., pattern="^(low|medium|high)$")

class TransactResponse(BaseModel):
    message: str
    transaction: Dict
    fee: float
    size: int
    timestamp: int
    balance_info: Dict

class FeeRateResponse(BaseModel):
    fee_rate: float
    priority_multipliers: Dict[str, float]
    mempool_size: int
    block_fullness: float