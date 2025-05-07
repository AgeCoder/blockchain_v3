import json
import logging
from uuid import uuid4 as v4
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature, decode_dss_signature
from cryptography.exceptions import InvalidSignature
import hashlib

class Wallet:
    def __init__(self, blockchain=None, private_key=None):
        logging.basicConfig(level=logging.INFO)
        self.logger = logging.getLogger(__name__)
        self.blockchain = blockchain
        self.private_key = private_key or ec.generate_private_key(
            ec.SECP256K1(),
            default_backend(),
        )
        self.public_key = self.private_key.public_key()
        self.address = self.generate_address()
        self.serialize_public_key()

    def generate_address(self):
        """Generate a deterministic address from the public key's raw bytes."""
        try:
            public_key_bytes = self.public_key.public_bytes(
                encoding=serialization.Encoding.X962,
                format=serialization.PublicFormat.CompressedPoint,
            )
            sha256_hash = hashlib.sha256(public_key_bytes).hexdigest()
            return "AG" + sha256_hash[:33]
        except Exception as e:
            self.logger.error(f"Failed to generate address: {str(e)}")
            raise ValueError(f"Failed to generate address: {str(e)}")

    def sign(self, data):
        """Sign data with the private key."""
        try:
            return decode_dss_signature(self.private_key.sign(
                json.dumps(data).encode('utf-8'),
                ec.ECDSA(hashes.SHA256())
            ))
        except Exception as e:
            self.logger.error(f"Failed to sign data: {str(e)}")
            raise
    @staticmethod
    def verify(public_key, data, signature):
        """Verify signature with the public key."""
        try:
            deserialized_public_key = serialization.load_pem_public_key(
                public_key.encode('utf-8'),
                default_backend()
            )
            (r, s) = signature
            deserialized_public_key.verify(
                encode_dss_signature(r, s),
                json.dumps(data).encode('utf-8'),
                ec.ECDSA(hashes.SHA256())
            )
            return True
        except InvalidSignature as e:
            logging.getLogger(__name__).warning(f"Invalid signature: {str(e)}")
            return False
        except Exception as e:
            logging.getLogger(__name__).error(f"Verify error: {str(e)}")
            return False
        
    @property
    def balance(self):
        """Get current balance."""
        return self.calculate_balance(self.blockchain, self.address)

    def serialize_public_key(self):
        """Serialize public key to PEM format."""
        try:
            self.public_key = self.public_key.public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo
            ).decode('utf-8')
        except Exception as e:
            self.logger.error(f"Failed to serialize public key: {str(e)}")
            raise ValueError(f"Failed to serialize public key: {str(e)}")

    def serialize_private_key(self, password: str = None):
        """Serialize private key to PEM format, optionally encrypted with a password."""
        try:
            if password:
                encryption = serialization.BestAvailableEncryption(password.encode('utf-8'))
            else:
                encryption = serialization.NoEncryption()
            
            return self.private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.TraditionalOpenSSL,
                encryption_algorithm=encryption,
            ).decode('utf-8')
        except Exception as e:
            self.logger.error(f"Failed to serialize private key: {str(e)}")
            raise ValueError(f"Failed to serialize private key: {str(e)}")

    def get_private_key_hex(self):
        """Return the private key as a hexadecimal string."""
        try:
            private_numbers = self.private_key.private_numbers()
            private_key_hex = format(private_numbers.private_value, '064x')
            return private_key_hex
        except Exception as e:
            self.logger.error(f"Failed to get private key in hex: {str(e)}")
            raise ValueError(f"Failed to get private key in hex: {str(e)}")

    @staticmethod
    def deserialize_private_key(pem_key: str, password: str = None):
        """Deserialize a PEM formatted private key, optionally with a password."""
        try:
            return serialization.load_pem_private_key(
                pem_key.encode('utf-8'),
                password=password.encode('utf-8') if password else None,
                backend=default_backend()
            )
        except Exception as e:
            logging.getLogger(__name__).error(f"Failed to deserialize private key: {str(e)}")
            raise ValueError(f"Failed to deserialize private key: {str(e)}")

    @staticmethod
    def from_private_key_hex(hex_key: str):
        """Create a private key from a hexadecimal string."""
        try:
            private_value = int(hex_key, 16)
            private_key = ec.derive_private_key(
                private_value,
                ec.SECP256K1(),
                default_backend()
            )
            return Wallet(private_key=private_key)
        except Exception as e:
            logging.getLogger(__name__).error(f"Failed to load private key from hex: {str(e)}")
            raise ValueError(f"Failed to load private key from hex: {str(e)}")

    
    def calculate_balance(self, blockchain, address):
        """Calculate balance from UTXO set, accounting for pending transactions."""
        balance = 0.0
        if blockchain is None:
            self.logger.warning("Blockchain is None, returning balance 0")
            return balance
        for tx_id, outputs in blockchain.utxo_set.items():
            for output_addr, amount in outputs.items():
                if output_addr == address:
                    balance += amount
        # Subtract pending spends from transaction pool
        return balance
        
    @staticmethod
    def pending_spends(transaction_map, address):
        """Get pending spends."""
        amount = 0.0
        for tx in transaction_map.values():
            if tx.input.get('address') == address:
                for output_addr, output_amount in tx.output.items():
                    if output_addr != address:
                        amount += output_amount   
        return amount
        