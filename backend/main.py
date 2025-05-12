import asyncio
import threading
import signal
import sys
import os
import logging
import socket
from fastapi import FastAPI
from uvicorn import Config, Server
from fastapi.middleware.cors import CORSMiddleware
from dependencies import app, get_blockchain, get_transaction_pool, get_pubsub,get_public_ip
from core.config import settings

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

from routers import blockchain, transaction, wallet, general

app.include_router(blockchain.router)
app.include_router(transaction.router)
app.include_router(wallet.router)
app.include_router(general.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# def get_public_ip():
#     try:
#         s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
#         s.connect(("8.8.8.8", 80))
#         ip = s.getsockname()[0]
#         s.close()
#         return ip
#     except Exception:
#         return "127.0.0.1"

async def run_fastapi_server(app: FastAPI, port: int):
    try:
        config = Config(app=app, host="0.0.0.0", port=port, log_level="info")
        server = Server(config)
        await server.serve()
    except Exception as e:
        logger.error(f"Error starting FastAPI server: {e}")

def handle_shutdown(sig, frame):
    logger.info(f"Shutdown signal ({sig}) received. Initiating graceful shutdown...")
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.call_soon_threadsafe(loop.stop)
    except Exception as e:
        logger.error(f"Error during shutdown handling: {e}")

if __name__ == "__main__":
    
    os.environ['HOST'] = os.environ.get('HOST', get_public_ip())
    is_peer = settings.peer
    port = settings.root_port if not is_peer else 4000

    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)

    blockchain = get_blockchain()
    transaction_pool = get_transaction_pool()
    pubsub = get_pubsub()

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    pubsub.loop = loop

    fastapi_thread = threading.Thread(
        target=lambda: asyncio.run(run_fastapi_server(app, port)),
        daemon=True
    )
    fastapi_thread.start()

    try:
        websocket_server_task = loop.create_task(pubsub.start_server())
        peer_discovery_task = loop.create_task(pubsub.run_peer_discovery())

        loop.run_forever()

    except KeyboardInterrupt:
        pass
    except Exception as e:
        logger.error(f"An unexpected error occurred during asyncio loop execution: {e}")

    finally:
        pending_tasks = asyncio.all_tasks(loop=loop)
        pending_tasks = [task for task in pending_tasks if not task.cancelled() and not task.done()]

        if pending_tasks:
            for task in pending_tasks:
                task.cancel()

            try:
                loop.run_until_complete(asyncio.gather(*pending_tasks, return_exceptions=True))
            except asyncio.CancelledError:
                pass
            except Exception as e:
                logger.error(f"Error during task cancellation waiting: {e}")

        if not loop.is_closed():
            loop.close()

    sys.exit(0)
