import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export async function decryptprivateKey(encryptedKey: string, passphrase: string): Promise<string> {
  const decoder = new TextDecoder();
  const key = await deriveKey(passphrase);
  const ivAndEncrypted = Uint8Array.from(atob(encryptedKey), (c) => c.charCodeAt(0));
  const iv = ivAndEncrypted.slice(0, 12);
  const encrypted = ivAndEncrypted.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    encrypted
  );
  return decoder.decode(decrypted);
}
export async function deriveKey(passphrase: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode("wallet-salt"),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}