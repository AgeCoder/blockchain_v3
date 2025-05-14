import asyncio
import websockets
import json
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

PEERS = set()  # Store peer URIs
PORT = 10000   # Port Render will proxy

async def boot_handler(websocket, path):
    try:
        async for message in websocket:
            data = json.loads(message)
            if data["type"] == "register":
                peer_uri = data["uri"]
                PEERS.add(peer_uri)
                logger.info(f"Registered peer: {peer_uri}")
                await websocket.send(json.dumps({"type": "peer_list", "peers": list(PEERS)}))
    except Exception as e:
        logger.error(f"Error: {e}")
    finally:
        if peer_uri in PEERS:
            PEERS.remove(peer_uri)

async def main():
    server = await websockets.serve(boot_handler, "0.0.0.0", PORT)
    logger.info(f"Boot node running on ws://0.0.0.0:{PORT}")
    await server.wait_closed()

if __name__ == "__main__":
    asyncio.run(main())