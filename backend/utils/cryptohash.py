import hashlib
import json

def crypto_hash(*args):
    stringified_args = sorted(map(lambda arg: json.dumps(arg, sort_keys=True, separators=(',', ':'), default=str), args))
    joined_data = ''.join(stringified_args)
    return hashlib.sha256(joined_data.encode('utf-8')).hexdigest()
