import asyncio
import websockets
import json
import logging
import os
import sys
import gzip
from websockets.exceptions import ConnectionClosed
from urllib.parse import urlparse

# Configure minimal logging to stdout only
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

# Global set for registered nodes
REGISTERED_NODES = set()

# Get port from environment variable
PORT = int(os.getenv('PORT', 9000))  # Fallback to 9000 for local testing

# Validate WebSocket URI
def is_valid_uri(uri):
    try:
        parsed = urlparse(uri)
        return parsed.scheme in ('ws', 'wss') and parsed.hostname and parsed.port
    except Exception:
        return False

async def boot_handler(websocket):
    client_address = f"{websocket.remote_address[0]}:{websocket.remote_address[1]}"
    try:
        async for message in websocket:
            try:
                # Handle compressed or uncompressed messages
                if isinstance(message, bytes):
                    try:
                        decompressed = gzip.decompress(message).decode('utf-8')
                        msg = json.loads(decompressed)
                    except gzip.BadGzipFile:
                        logger.error(f"Invalid gzip data from {client_address}")
                        continue
                else:
                    msg = json.loads(message)
                msg_type = msg.get('type')
                msg_data = msg.get('data')

                if not msg_type or not isinstance(msg_data, str):
                    # Silently ignore invalid messages
                    continue

                if msg_type == 'REGISTER_PEER':
                    uri = msg_data.strip()
                    if not is_valid_uri(uri):
                        continue

                    REGISTERED_NODES.add(uri)
                    logger.info(f"Registered peer: {uri} from {client_address}")
                    peer_list = list(REGISTERED_NODES - {uri})
                    # Send compressed response
                    response = json.dumps({
                        'type': 'PEER_LIST',
                        'data': peer_list
                    })
                    compressed_response = gzip.compress(response.encode('utf-8'))
                    await websocket.send(compressed_response)

            except json.JSONDecodeError:
                # Silently ignore invalid JSON
                continue
            except Exception as e:
                logger.error(f"Error processing message from {client_address}: {e}")

    except ConnectionClosed:
        pass  # Silently handle connection closure
    except Exception as e:
        logger.error(f"Unexpected error in connection from {client_address}: {e}")

async def main():
    try:
        server = await websockets.serve(
            boot_handler,
            "0.0.0.0",
            PORT,
            max_size=1024 * 1024,
            ping_interval=30,
            ping_timeout=60
        )
        logger.info(f"Boot node running on port {PORT}")
        await server.wait_closed()
    except Exception as e:
        logger.error(f"Fatal error starting server: {e}")
        sys.exit(1)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Boot node stopped by user")
    except Exception as e:
        logger.error(f"Fatal error in boot node: {e}")
        sys.exit(1)