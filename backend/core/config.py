from pydantic_settings import BaseSettings, SettingsConfigDict
import os

class Settings(BaseSettings):
    host: str = "127.0.0.1"
    peer: bool = os.environ.get("PEER", "false").lower() == "true"
    boot_node: str = "ws://localhost:9000"
    root_port: int = 5000
    websocket_port: int = 5001

    BLOCK_SUBSIDY: float = 50.0
    HALVING_INTERVAL: int = 210000
    MINING_REWARD: float = 50.0
    MINING_REWARD_INPUT: dict = {
        "address": "coinbase",
        "coinbase_data": "mining_reward"
    }
    BASE_TX_SIZE: int = 250
    MIN_FEE: float = 0.001
    DEFAULT_FEE_RATE: float = 0.00001
    MEMPOOL_THRESHOLD: int = 1000
    BLOCK_FULLNESS_THRESHOLD: float = 0.8
    FEE_RATE_UPDATE_INTERVAL: int = 60
    PRIORITY_MULTIPLIERS: dict = {
        "low": 0.8,
        "medium": 1.0,
        "high": 1.5
    }

    MINRATE: float = 30.0
    BLOCK_SIZE_LIMIT: int = 1000000
    TARGET_BLOCK_TIME: float = 60.0

    CHUNK_SIZE: int = 100
    CHUNK_TIMEOUT: int = 30

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

settings = Settings()

BLOCK_SUBSIDY = settings.BLOCK_SUBSIDY
HALVING_INTERVAL = settings.HALVING_INTERVAL
MINING_REWARD = settings.MINING_REWARD
MINING_REWARD_INPUT = settings.MINING_REWARD_INPUT
BASE_TX_SIZE = settings.BASE_TX_SIZE
MIN_FEE = settings.MIN_FEE
DEFAULT_FEE_RATE = settings.DEFAULT_FEE_RATE
MEMPOOL_THRESHOLD = settings.MEMPOOL_THRESHOLD
BLOCK_FULLNESS_THRESHOLD = settings.BLOCK_FULLNESS_THRESHOLD
FEE_RATE_UPDATE_INTERVAL = settings.FEE_RATE_UPDATE_INTERVAL
PRIORITY_MULTIPLIERS = settings.PRIORITY_MULTIPLIERS
MINRATE = settings.MINRATE
BLOCK_SIZE_LIMIT = settings.BLOCK_SIZE_LIMIT
TARGET_BLOCK_TIME = settings.TARGET_BLOCK_TIME
BOOT_NODE = settings.boot_node
CHUNK_SIZE = settings.CHUNK_SIZE
CHUNK_TIMEOUT = settings.CHUNK_TIMEOUT
