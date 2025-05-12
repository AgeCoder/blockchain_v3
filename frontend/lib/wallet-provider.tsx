"use client";

import { createContext, useContext, useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { ethers } from "ethers";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { openDB, IDBPDatabase } from "idb";

interface Wallet {
  address: string;
  publicKey: string;
  privateKey: string;
  balance: number;
  pending_spends: number;
}

interface StoredWallet {
  id: string;
  address: string;
  publicKey: string;
  encryptedJson: string;
  balance: number;
  pending_spends: number;
}

interface WalletContextType {
  wallet: Omit<Wallet, "privateKey"> | null;
  isLoading: boolean;
  error: string | null;
  generateWallet: (passkey: string) => Promise<Omit<Wallet, "privateKey">>;
  importWallet: (privateKey: string, passkey: string) => Promise<Omit<Wallet, "privateKey">>;
  unlockWallet: (passkey: string) => Promise<Omit<Wallet, "privateKey">>;
  signMessage: (message: string) => Promise<string>;
  logout: () => void;
  refreshWallet: (data: Partial<Omit<Wallet, "privateKey">>) => void;
  isUnlocked: boolean;
  setWallet: React.Dispatch<React.SetStateAction<Omit<Wallet, "privateKey"> | null>>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const DB_NAME = "walletDB";
const STORE_NAME = "walletStore";

async function initDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      }
      if (oldVersion < 2) {
        console.log("Upgrading to version 2...");
      }
    },
  });
}

async function derivePasskeyKey(salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("static-passkey-derivation"),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

async function encryptPasskey(passkey: string): Promise<{ sessionkey: string; iv: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derivePasskeyKey(salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(passkey)
  );
  return {
    sessionkey: bytesToHex(new Uint8Array(encrypted)),
    iv: bytesToHex(iv),
    salt: bytesToHex(salt),
  };
}

async function decryptPasskey(sessionkey: string, iv: string, salt: string): Promise<string> {
  const key = await derivePasskeyKey(hexToBytes(salt));
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: hexToBytes(iv) },
    key,
    hexToBytes(sessionkey)
  );
  return new TextDecoder().decode(decrypted);
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallet, setWallet] = useState<Omit<Wallet, "privateKey"> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const privateKeyRef = useRef<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  const checkWalletUnlock = async () => {
    if (typeof window !== "undefined") {
      const unlocked = localStorage.getItem("walletUnlocked") === "true";
      if (unlocked && wallet) {
        try {
          const db = await initDB();
          const storedWallet = await db.get(STORE_NAME, "wallet");
          if (storedWallet) {
            const sessionkey = localStorage.getItem("sessionkey");
            const Iv = localStorage.getItem("Iv");
            const minte = localStorage.getItem("minte");
            if (sessionkey && Iv && minte) {
              const passkey = await decryptPasskey(sessionkey, Iv, minte);
              await unlockWallet(passkey);
            }
          }
        } catch (err) {
          console.error("Failed to auto-unlock wallet:", err);
          localStorage.removeItem("walletUnlocked");
          localStorage.removeItem("sessionkey");
          localStorage.removeItem("Iv");
          localStorage.removeItem("minte");
        }
      }
    }
  };

  useEffect(() => {
    const initializeWallet = async () => {
      setIsLoading(true);
      try {
        const db = await initDB();
        const storedWallet = await db.get(STORE_NAME, "wallet");

        if (storedWallet) {
          const walletData = {
            address: storedWallet.address,
            publicKey: storedWallet.publicKey,
            balance: storedWallet.balance,
            pending_spends: storedWallet.pending_spends,
          };
          setWallet(walletData);
          await checkWalletUnlock();
        }
      } catch (err) {
        console.error("Wallet initialization failed:", err);
        setError("Failed to load wallet");
      } finally {
        setIsLoading(false);
      }
    };

    initializeWallet();
  }, []);

  const generateWallet = async (passkey: string): Promise<Omit<Wallet, "privateKey">> => {
    setIsLoading(true);
    try {
      const db = await initDB();
      const existingWallet = await db.get(STORE_NAME, "wallet");
      if (existingWallet) {
        throw new Error("A wallet already exists. Please log out first.");
      }

      const ethersWallet = ethers.Wallet.createRandom();
      const privateKey = ethersWallet.privateKey;
      const publicKey = ethersWallet.signingKey.publicKey;
      const address = ethersWallet.address;

      const encryptedJson = await ethersWallet.encrypt(passkey);

      const newWallet: StoredWallet = {
        id: "wallet",
        address,
        publicKey,
        encryptedJson,
        balance: 0,
        pending_spends: 0,
      };

      await db.put(STORE_NAME, newWallet);

      const walletData = {
        address,
        publicKey,
        balance: 0,
        pending_spends: 0,
      };
      privateKeyRef.current = privateKey;
      setIsUnlocked(true);
      localStorage.setItem("walletUnlocked", "true");

      const { sessionkey, iv, salt } = await encryptPasskey(passkey);
      localStorage.setItem("sessionkey", sessionkey);
      localStorage.setItem("Iv", iv);
      localStorage.setItem("minte", salt);

      return { ...walletData, privateKey };
    } catch (err) {
      console.error("Wallet generation failed:", err);
      toast({
        title: "Error",
        description: err?.message || "Failed to generate wallet",
        variant: "destructive",
      });
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const importWallet = async (privateKey: string, passkey: string): Promise<Omit<Wallet, "privateKey">> => {
    setIsLoading(true);
    try {
      if (!privateKey.startsWith("0x") || !/^[0-9a-fA-F]{64}$/.test(privateKey.replace("0x", ""))) {
        throw new Error("Invalid private key format");
      }

      const ethersWallet = new ethers.Wallet(privateKey);
      const publicKey = ethersWallet.signingKey.publicKey;
      const address = ethersWallet.address;

      const db = await initDB();
      const storedWallet = await db.get(STORE_NAME, "wallet");

      if (storedWallet) {
        try {
          await ethers.Wallet.fromEncryptedJson(storedWallet.encryptedJson, passkey);
        } catch (err) {
          throw new Error("Invalid passkey for existing wallet");
        }

        if (storedWallet.address.toLowerCase() !== address.toLowerCase()) {
          throw new Error("Imported private key does not match existing wallet address");
        }

        privateKeyRef.current = privateKey;
        setIsUnlocked(true);
        localStorage.setItem("walletUnlocked", "true");

        const { sessionkey, iv, salt } = await encryptPasskey(passkey);
        localStorage.setItem("sessionkey", sessionkey);
        localStorage.setItem("Iv", iv);
        localStorage.setItem("minte", salt);

        const walletData = {
          address: storedWallet.address,
          publicKey: storedWallet.publicKey,
          balance: storedWallet.balance,
          pending_spends: storedWallet.pending_spends,
        };
        setWallet(walletData);

        return walletData;
      } else {
        const encryptedJson = await ethersWallet.encrypt(passkey);

        const importedWallet: StoredWallet = {
          id: "wallet",
          address,
          publicKey,
          encryptedJson,
          balance: 0,
          pending_spends: 0,
        };

        await db.put(STORE_NAME, importedWallet);

        const walletData = {
          address,
          publicKey,
          balance: 0,
          pending_spends: 0,
        };
        setWallet(walletData);

        privateKeyRef.current = privateKey;
        setIsUnlocked(true);
        localStorage.setItem("walletUnlocked", "true");

        const { sessionkey, iv, salt } = await encryptPasskey(passkey);
        localStorage.setItem("sessionkey", sessionkey);
        localStorage.setItem("Iv", iv);
        localStorage.setItem("minte", salt);

        return walletData;
      }
    } catch (err) {
      console.error("Wallet import failed:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to import wallet",
        variant: "destructive",
      });
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const unlockWallet = async (passkey: string): Promise<Omit<Wallet, "privateKey">> => {
    setIsLoading(true);
    try {
      const db = await initDB();
      const storedWallet = await db.get(STORE_NAME, "wallet");

      if (!storedWallet) {
        throw new Error("No wallet found");
      }

      const ethersWallet = await ethers.Wallet.fromEncryptedJson(storedWallet.encryptedJson, passkey);
      const privateKey = ethersWallet.privateKey;

      privateKeyRef.current = privateKey;
      setIsUnlocked(true);
      localStorage.setItem("walletUnlocked", "true");

      const { sessionkey, iv, salt } = await encryptPasskey(passkey);
      localStorage.setItem("sessionkey", sessionkey);
      localStorage.setItem("Iv", iv);
      localStorage.setItem("minte", salt);

      return {
        address: storedWallet.address,
        publicKey: storedWallet.publicKey,
        balance: storedWallet.balance,
        pending_spends: storedWallet.pending_spends,
      };
    } catch (err) {
      console.error("Wallet unlock failed:", err);
      toast({
        title: "Error",
        description: "Invalid passkey or corrupted wallet data",
        variant: "destructive",
      });
      throw new Error("Invalid passkey or corrupted wallet data");
    } finally {
      setIsLoading(false);
    }
  };

  const signMessage = async (message: string): Promise<string> => {
    if (!wallet) throw new Error("Wallet not initialized");
    if (!privateKeyRef.current) {
      const sessionkey = localStorage.getItem("sessionkey");
      const Iv = localStorage.getItem("Iv");
      const minte = localStorage.getItem("minte");
      if (sessionkey && Iv && minte) {
        const passkey = await decryptPasskey(sessionkey, Iv, minte);
        await unlockWallet(passkey);
      } else {
        throw new Error("Wallet is not unlocked. Please unlock your wallet first.");
      }
    }

    try {
      if (!privateKeyRef.current || !/^(0x)?[0-9a-fA-F]{64}$/.test(privateKeyRef.current.replace("0x", ""))) {
        throw new Error("Invalid private key format");
      }

      const ethersWallet = new ethers.Wallet(privateKeyRef.current);
      const signature = await ethersWallet.signMessage(message);

      return signature;
    } catch (err) {
      console.error("Message signing failed:", err);
      toast({
        title: "Error",
        description: "Failed to sign message",
        variant: "destructive",
      });
      throw new Error("Failed to sign message");
    }
  };


  const logout = async () => {
    try {
      privateKeyRef.current = null;
      setIsUnlocked(false);
      setWallet(null);

      localStorage.removeItem("wallet");
      localStorage.removeItem("walletUnlocked");
      localStorage.removeItem("sessionkey");
      localStorage.removeItem("Iv");
      localStorage.removeItem("minte");

      const db = await initDB();
      await db.delete(STORE_NAME, "wallet");

      router.push("/");

      toast({
        title: "Logged out",
        description: "You have been successfully logged out",
      });
    } catch (err) {
      console.error("Logout failed:", err);
      toast({
        title: "Error",
        description: "Failed to log out. Please try again.",
        variant: "destructive",
      });
    }
  };

  const refreshWallet = (data: Partial<Omit<Wallet, "privateKey">>) => {
    if (wallet) {
      const updatedWallet = { ...wallet, ...data };
      setWallet(updatedWallet);
    }
  };

  return (
    <WalletContext.Provider
      value={{
        wallet,
        isLoading,
        error,
        generateWallet,
        importWallet,
        unlockWallet,
        signMessage,
        logout,
        refreshWallet,
        isUnlocked,
        setWallet
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}