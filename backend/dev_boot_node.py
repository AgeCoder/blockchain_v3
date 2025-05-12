import asyncio
import websockets
import json
import logging
import os
import sys
import gzip
from websockets.exceptions import ConnectionClosed
from urllib.parse import urlparse
import ssl

# Configure minimal logging to stdout only
# This setup ensures that logs are directed to standard output, suitable for containerized environments or simple deployments.
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

# Global set for registered nodes
# This set stores the URIs of all connected and registered nodes.
REGISTERED_NODES = set()

# Get port from environment variable
# Reads the PORT environment variable, defaulting to 9000 if not set.
PORT = int(os.getenv('PORT', 9000))

# Validate WebSocket URI
# Checks if a given string is a valid WebSocket or WebSocket Secure URI.
def is_valid_uri(uri):
    try:
        parsed = urlparse(uri)
        # Validates scheme (ws/wss), hostname presence, and port presence.
        return parsed.scheme in ('ws', 'wss') and parsed.hostname and parsed.port
    except Exception:
        # Returns False for any parsing errors.
        return False

# Handler for new WebSocket connections
# This function is called for each new client connection.
async def boot_handler(websocket):
    # Get the client's address for logging.
    client_address = f"{websocket.remote_address[0]}:{websocket.remote_address[1]}"
    try:
        # Process incoming messages from the client.
        async for message in websocket:
            try:
                # Handle compressed or uncompressed messages
                # Checks if the message is bytes (potentially gzipped) or string (JSON).
                if isinstance(message, bytes):
                    try:
                        # Attempt to decompress and decode gzip data.
                        decompressed = gzip.decompress(message).decode('utf-8')
                        msg = json.loads(decompressed)
                    except gzip.BadGzipFile:
                        # Log error for invalid gzip data and continue to next message.
                        logger.error(f"Invalid gzip data from {client_address}")
                        continue
                else:
                    # Load JSON from uncompressed string message.
                    msg = json.loads(message)

                # Extract message type and data.
                msg_type = msg.get('type')
                msg_data = msg.get('data')

                # Silently ignore messages with missing or invalid type/data.
                if not msg_type or not isinstance(msg_data, str):
                    continue

                # Handle 'REGISTER_PEER' message type.
                if msg_type == 'REGISTER_PEER':
                    uri = msg_data.strip()
                    # Validate the provided URI.
                    if not is_valid_uri(uri):
                        # Silently ignore invalid URIs.
                        continue

                    # Add the valid URI to the set of registered nodes.
                    REGISTERED_NODES.add(uri)
                    logger.info(f"Registered peer: {uri} from {client_address}")
                    # Create a list of peers, excluding the newly registered one.
                    peer_list = list(REGISTERED_NODES - {uri})
                    # Prepare the response message containing the peer list.
                    response = json.dumps({
                        'type': 'PEER_LIST',
                        'data': peer_list
                    })
                    # Compress the response using gzip.
                    compressed_response = gzip.compress(response.encode('utf-8'))
                    # Send the compressed response back to the client.
                    await websocket.send(compressed_response)

            except json.JSONDecodeError:
                # Silently ignore messages that are not valid JSON.
                continue
            except Exception as e:
                # Log any other errors during message processing.
                logger.error(f"Error processing message from {client_address}: {e}")

    except ConnectionClosed:
        # Silently handle normal connection closures.
        pass
    except Exception as e:
        # Log any unexpected errors that occur during the connection lifecycle.
        logger.error(f"Unexpected error in connection from {client_address}: {e}")

# Main function to start the WebSocket server
async def main():
    ssl_context = None
    print("ENV:", os.getenv('ENV'))
    # Check the environment variable to enable SSL in development mode.
    if os.getenv('ENV') == None:
        # Create an SSL context for TLS.
        ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        # Load the certificate and key chain. Note: These paths are specific to the development setup.
        ssl_context.load_cert_chain('./localhost+2.pem', './localhost+2-key.pem')
    try:
        # Start the WebSocket server.
        server = await websockets.serve(
            boot_handler, # The handler function for new connections.
            "0.0.0.0",    # Listen on all available interfaces.
            PORT,         # Use the configured port.
            max_size=1024 * 1024, # Maximum message size (1MB).
            ping_interval=30,     # Send ping every 30 seconds.
            ping_timeout=60,      # Close connection if no pong received within 60 seconds.
            ssl=ssl_context,      # Use SSL context if provided.
            close_timeout=10,     # Time to wait for the closing handshake to complete.
        )
        # Log server start information.
        logger.info(f"Boot node running on {'wss' if ssl_context else 'ws'}://0.0.0.0:{PORT}")
        # Keep the server running until it's closed.
        await server.wait_closed()
    except Exception as e:
        # Log fatal errors during server startup and exit.
        logger.error(f"Fatal error starting server: {e}")
        sys.exit(1)

# Entry point of the script
if __name__ == "__main__":
    try:
        # Run the main asynchronous function.
        asyncio.run(main())
    except KeyboardInterrupt:
        # Handle graceful shutdown on KeyboardInterrupt (e.g., Ctrl+C).
        logger.info("Boot node stopped by user")
    except Exception as e:
        # Log any fatal errors that occur after the server has started.
        logger.error(f"Fatal error in boot node: {e}")
        sys.exit(1)
