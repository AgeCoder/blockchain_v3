import asyncio
import time
from models.blockchain import Blockchain
from models.transaction_pool import TransactionPool
from core.config import (
    DEFAULT_FEE_RATE, MEMPOOL_THRESHOLD, BLOCK_FULLNESS_THRESHOLD,
    FEE_RATE_UPDATE_INTERVAL, BLOCK_SIZE_LIMIT
)
import logging

class FeeRateEstimator:
    def __init__(self, blockchain: Blockchain, transaction_pool: TransactionPool):
        self.blockchain = blockchain
        self.transaction_pool = transaction_pool
        self.current_fee_rate = DEFAULT_FEE_RATE
        self.last_update = 0
        self.lock = asyncio.Lock()
        self.logger = logging.getLogger(__name__)

    async def update_fee_rate(self):
        async with self.lock:
            mempool_size = len(self.transaction_pool.transaction_map)
            recent_blocks = self.blockchain.chain[-10:] if len(self.blockchain.chain) >= 10 else self.blockchain.chain
            block_fullness = (
                sum(sum(len(str(tx)) for tx in block.data) for block in recent_blocks) /
                (len(recent_blocks) * BLOCK_SIZE_LIMIT)
            ) if recent_blocks else 0.0
            fee_rate = DEFAULT_FEE_RATE
            if mempool_size > MEMPOOL_THRESHOLD:
                fee_rate *= (1 + (mempool_size / MEMPOOL_THRESHOLD) * 0.5)
            if block_fullness > BLOCK_FULLNESS_THRESHOLD:
                fee_rate *= (1 + (block_fullness / BLOCK_FULLNESS_THRESHOLD) * 0.3)
            self.current_fee_rate = max(fee_rate, DEFAULT_FEE_RATE)
            self.last_update = time.time()

    async def ensure_updated(self):
        if time.time() - self.last_update > FEE_RATE_UPDATE_INTERVAL:
            await self.update_fee_rate()

    def get_fee_rate(self):
        asyncio.ensure_future(self.ensure_updated())
        return self.current_fee_rate