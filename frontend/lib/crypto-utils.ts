
export function isValidPrivateKey(key: string): boolean {
    if (key.startsWith(key, "0x")) {
        key = key.slice(2)
    }
    return /^[0-9a-fA-F]{64}$/.test(key.trim())
}