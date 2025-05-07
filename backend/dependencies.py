from fastapi import FastAPI
from models.blockchain import Blockchain
from models.transaction_pool import TransactionPool
from services.pubsub import PubSub
from services.fee_rate_estimator import FeeRateEstimator
import socket

app = FastAPI()

blockchain = Blockchain()
transaction_pool = TransactionPool()
pubsub = PubSub(blockchain, transaction_pool)
fee_rate_estimator = FeeRateEstimator(blockchain,transaction_pool)

app.state.blockchain = blockchain
app.state.transaction_pool = transaction_pool
app.state.pubsub = pubsub
app.state.wallet = None
app.state.fee_rate_estimator = fee_rate_estimator

def get_blockchain():
    return app.state.blockchain

def get_transaction_pool():
    return app.state.transaction_pool

def get_pubsub():
    return app.state.pubsub

def get_wallet():
    return app.state.wallet

def get_public_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"
def get_fee_rate_estimator():
    return app.state.fee_rate_estimator
