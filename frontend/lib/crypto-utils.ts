export function isValidPrivateKey(key: string): boolean {
    return /^[0-9a-fA-F]{64}$/.test(key.trim())
}