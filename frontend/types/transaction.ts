export interface Transaction {
  id: string
  type: "send" | "receive"
  amount: number
  timestamp: string
  status: "pending" | "confirmed" | "failed"
  address: string
  blockHeight?: number
  fee?: number
  signature?: string
  publicKey?: string
}

export interface Block {
  hash: string
  height: number
  transactions: Transaction[]
  proof: number
  previousHash: string
  timestamp: number
  nonce: number
  data: any[]
}

export interface BlockchainStats {
  height: number
  difficulty: number
  hashRate: string
  activeNodes: number
}
