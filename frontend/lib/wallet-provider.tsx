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
  encryptedKey: string;
  iv: string;
  salt: string;
  balance: number;
  pending_spends: number;
}

interface WalletContextType {
  wallet: Omit<Wallet, "privateKey"> | null;
  isLoading: boolean;
  error: string | null;
  generateWallet: (password: string) => Promise<Omit<Wallet, "privateKey">>;
  importWallet: (privateKey: string, password: string) => Promise<Omit<Wallet, "privateKey">>;
  unlockWallet: (password: string) => Promise<Omit<Wallet, "privateKey">>;
  signMessage: (message: string) => Promise<string>;
  verifySignature: (message: string, signature: string, address: string) => Promise<boolean>;
  logout: () => void;
  refreshWallet: (data: Partial<Omit<Wallet, "privateKey">>) => void;
  isUnlocked: boolean;
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

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
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

async function encryptPrivateKey(
  privateKey: string,
  password: string
): Promise<{ encryptedKey: string; iv: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(privateKey)
  );
  return {
    encryptedKey: bytesToHex(new Uint8Array(encrypted)),
    iv: bytesToHex(iv),
    salt: bytesToHex(salt),
  };
}

async function decryptPrivateKey(
  encryptedKey: string,
  iv: string,
  salt: string,
  password: string
): Promise<string> {
  const key = await deriveKey(password, hexToBytes(salt));
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: hexToBytes(iv) },
    key,
    hexToBytes(encryptedKey)
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

  // Check if wallet is unlocked on page refresh
  const checkWalletUnlock = async () => {
    if (typeof window !== "undefined") {
      const unlocked = localStorage.getItem("walletUnlocked") === "true";
      if (unlocked && wallet) {
        try {
          const db = await initDB();
          const storedWallet = await db.get(STORE_NAME, "wallet");
          if (storedWallet) {
            const password = localStorage.getItem("walletPassword");
            if (password) {
              await unlockWallet(password);
            }
          }
        } catch (err) {
          console.error("Failed to auto-unlock wallet:", err);
          localStorage.removeItem("walletUnlocked");
          localStorage.removeItem("walletPassword");
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
          localStorage.setItem("wallet", JSON.stringify(walletData));
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

  const generateWallet = async (password: string): Promise<Omit<Wallet, "privateKey">> => {
    setIsLoading(true);
    try {
      const ethersWallet = ethers.Wallet.createRandom();
      const privateKey = ethersWallet.privateKey;
      const publicKey = ethersWallet.publicKey;
      const address = ethersWallet.address;

      const { encryptedKey, iv, salt } = await encryptPrivateKey(privateKey, password);

      const newWallet = {
        id: "wallet",
        address,
        publicKey,
        encryptedKey,
        iv,
        salt,
        balance: 0,
        pending_spends: 0,
      };

      const db = await initDB();
      await db.put(STORE_NAME, newWallet);

      const walletData = {
        address,
        publicKey,
        balance: 0,
        pending_spends: 0,
      };
      setWallet(walletData);
      localStorage.setItem("wallet", JSON.stringify(walletData));

      privateKeyRef.current = privateKey;
      setIsUnlocked(true);
      localStorage.setItem("walletUnlocked", "true");
      localStorage.setItem("walletPassword", password);

      return walletData;
    } catch (err) {
      console.error("Wallet generation failed:", err);
      toast({
        title: "Error",
        description: "Failed to generate wallet",
        variant: "destructive",
      });
      throw new Error("Failed to generate wallet");
    } finally {
      setIsLoading(false);
    }
  };

  const importWallet = async (privateKey: string, password: string): Promise<Omit<Wallet, "privateKey">> => {
    setIsLoading(true);
    try {
      if (!privateKey.startsWith("0x") || !/^[0-9a-fA-F]{64}$/.test(privateKey.replace("0x", ""))) {
        throw new Error("Invalid private key format");
      }

      const ethersWallet = new ethers.Wallet(privateKey);
      const publicKey = ethersWallet.publicKey;
      const address = ethersWallet.address;

      const { encryptedKey, iv, salt } = await encryptPrivateKey(privateKey, password);

      const importedWallet = {
        id: "wallet",
        address,
        publicKey,
        encryptedKey,
        iv,
        salt,
        balance: 0,
        pending_spends: 0,
      };

      const db = await initDB();
      await db.put(STORE_NAME, importedWallet);

      const walletData = {
        address,
        publicKey,
        balance: 0,
        pending_spends: 0,
      };
      setWallet(walletData);
      localStorage.setItem("wallet", JSON.stringify(walletData));

      privateKeyRef.current = privateKey;
      setIsUnlocked(true);
      localStorage.setItem("walletUnlocked", "true");
      localStorage.setItem("walletPassword", password);

      return walletData;
    } catch (err) {
      console.error("Wallet import failed:", err);
      toast({
        title: "Error",
        description: "Failed to import wallet",
        variant: "destructive",
      });
      throw new Error("Failed to import wallet");
    } finally {
      setIsLoading(false);
    }
  };

  const unlockWallet = async (password: string): Promise<Omit<Wallet, "privateKey">> => {
    setIsLoading(true);
    try {
      const db = await initDB();
      const storedWallet = await db.get(STORE_NAME, "wallet");

      if (!storedWallet) {
        throw new Error("No wallet found");
      }

      const privateKey = await decryptPrivateKey(
        storedWallet.encryptedKey,
        storedWallet.iv,
        storedWallet.salt,
        password
      );

      privateKeyRef.current = privateKey;
      setIsUnlocked(true);
      localStorage.setItem("walletUnlocked", "true");
      localStorage.setItem("walletPassword", password);

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
        description: "Invalid password or corrupted wallet data",
        variant: "destructive",
      });
      throw new Error("Invalid password or corrupted wallet data");
    } finally {
      setIsLoading(false);
    }
  };

  const signMessage = async (message: string): Promise<string> => {
    if (!wallet) throw new Error("Wallet not initialized");
    if (!privateKeyRef.current) {
      const password = localStorage.getItem("walletPassword");
      if (password) {
        await unlockWallet(password);
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

  const verifySignature = async (message: string, signature: string, address: string): Promise<boolean> => {
    try {
      const payload = { message, signature, address };
      const response = await fetch("http://127.0.0.1:5000/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Signature verification failed");
      }

      const result = await response.json();
      return result.valid;
    } catch (err) {
      console.error("Signature verification failed:", err);
      toast({
        title: "Error",
        description: "Failed to verify signature",
        variant: "destructive",
      });
      return false;
    }
  };

  const logout = async () => {
    try {
      privateKeyRef.current = null;
      setIsUnlocked(false);
      setWallet(null);

      localStorage.removeItem("wallet");
      localStorage.removeItem("walletUnlocked");
      localStorage.removeItem("walletPassword");

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
      localStorage.setItem("wallet", JSON.stringify(updatedWallet));
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
        verifySignature,
        logout,
        refreshWallet,
        isUnlocked,
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