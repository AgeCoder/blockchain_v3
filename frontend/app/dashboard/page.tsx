'use client'
import React, { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  Copy,
  Clock,
  ChevronRight,
  AlertCircle,
  Wallet,
  Send,
  History,
  Sparkles,
  ArrowRight,
  CheckCircle,
  XCircle,
  CircleDashed
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useToast } from "@/hooks/use-toast"
import { useWallet } from "@/lib/wallet-provider"
import { api } from "@/lib/api-client"
import { formatDistanceToNow } from "date-fns"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import type { Transaction } from "@/types/transaction"
import stringify from 'json-stable-stringify';
const DashboardPage = () => {
  const { wallet, isLoading, refreshWallet, signMessage } = useWallet()
  const router = useRouter()
  const { toast } = useToast()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isLoadingTx, setIsLoadingTx] = useState(true)
  const [sendForm, setSendForm] = useState<{
    recipient: string
    amount: string
    priority: "low" | "medium" | "high"
  }>({
    recipient: "",
    amount: "",
    priority: "medium",
  })
  const [sendingTx, setSendingTx] = useState(false)
  const [formError, setFormError] = useState("")
  const [activeTab, setActiveTab] = useState<"all" | "sent" | "received">("all")
  const [feeRateInfo, setFeeRateInfo] = useState({
    fee_rate: 0.00001,
    priority_multipliers: { low: 0.8, medium: 1.0, high: 1.5 },
    mempool_size: 0,
    block_fullness: 0.0
  })

  const fetchFeeRate = useCallback(async () => {
    try {
      const response = await api.wallet.getFeeRate()
      setFeeRateInfo(response)
    } catch (error) {
      console.error("Error fetching fee rate:", error)
      toast({
        title: "Error",
        description: "Failed to fetch fee rate. Using default.",
        variant: "destructive",
      })
    }
  }, [toast])

  const calculateFee = useCallback((amount: number): number => {
    const size = 250; // BASE_TX_SIZE from backend
    const multiplier = feeRateInfo.priority_multipliers[sendForm.priority] || 1.0;
    const fee = size * feeRateInfo.fee_rate * multiplier;
    return Math.max(fee, 0.001); // MIN_FEE from backend
  }, [feeRateInfo, sendForm.priority]);

  const fetchTransactions = useCallback(async () => {
    if (!wallet?.address) return;

    setIsLoadingTx(true);
    try {
      const txData = await api.transactions.getByAddress(wallet.address);
      const formattedTx: Transaction[] = txData.map((tx: any) => {
        const isSend = tx.input.address === wallet.address;
        const otherAddr = isSend
          ? Object.keys(tx.output).find((addr) => addr !== wallet.address) || ""
          : tx.input.address;
        const amount = isSend ? tx.input.amount - (tx.output[wallet.address] || 0) : tx.output[wallet.address] || 0;

        return {
          id: tx.id,
          type: isSend ? "send" : "receive",
          amount,
          timestamp: new Date(tx.timestamp / 1_000_000).toISOString(),
          status: tx.status || "confirmed",
          address: otherAddr,
          blockHeight: tx.blockHeight,
          fee: tx.fee || 0,
        };
      });

      setTransactions(formattedTx.slice(0, 10));
    } catch (error) {
      console.error("Error fetching transactions:", error);
      toast({
        title: "Error",
        description: "Failed to load transactions",
        variant: "destructive",
      });
    } finally {
      setIsLoadingTx(false);
    }
  }, [wallet?.address, toast]);

  // 2. Then update the useEffect
  // Replace your current useEffect with this:

  useEffect(() => {
    if (!isLoading && !wallet) {
      router.push("/wallet/import");
      return;
    }

    if (!wallet?.address) return;

    let isMounted = true;

    const fetchData = async () => {
      try {
        const [info] = await Promise.all([
          api.wallet.getInfo(wallet.address),
          fetchFeeRate(),
          fetchTransactions()
        ]);

        if (isMounted) {
          refreshWallet({
            balance: info.balance,
            pending_spends: info.pending_spends
          });
        }
      } catch (error) {
        if (isMounted) {
          console.error("Error fetching data:", error);
          toast({
            title: "Error",
            description: "Failed to fetch wallet data",
            variant: "destructive",
          });
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [wallet?.address, isLoading]);


  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      if (wallet?.address) {
        const info = await api.wallet.getInfo(wallet.address)
        refreshWallet({ balance: info.balance, pending_spends: info.pending_spends })
      }
      await fetchFeeRate()
      await fetchTransactions()
      toast({
        title: "Wallet Refreshed",
        description: "Your wallet data has been updated",
      })
    } catch (error) {
      console.error("Error refreshing:", error)
      toast({
        title: "Error",
        description: "Failed to refresh data",
        variant: "destructive",
      })
    } finally {
      setIsRefreshing(false)
    }
  }

  const copyAddress = () => {
    if (wallet?.address) {
      navigator.clipboard.writeText(wallet.address)
      toast({
        title: "Address Copied",
        description: "Wallet address copied to clipboard",
      })
    }
  }

  const handleSendTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    // Validate recipient address
    if (!sendForm.recipient.trim()) {
      setFormError("Recipient address is required");
      return;
    }

    const amount = Number.parseFloat(sendForm.amount);
    if (isNaN(amount) || amount <= 0) {
      setFormError("Amount must be a positive number");
      return;
    }

    const fee = calculateFee(amount);
    if (wallet && amount + fee > wallet.balance) {
      setFormError(`Insufficient balance (including ${fee.toFixed(6)} fee)`);
      return;
    }

    setSendingTx(true);
    try {
      // Construct message to match backend's expected format
      const message = `${sendForm.recipient}:${amount + 0.00001}:${sendForm.priority}:${wallet.publicKey}`;

      console.log("Message for signing:", message);
      if (!message) {
        throw new Error("Message is undefined. Cannot sign the transaction.");
      }
      const signature = await signMessage(message);
      const signedTransaction = {
        recipient: sendForm.recipient,
        amount,
        signature,
        public_key: wallet.publicKey,
        priority: sendForm.priority,
        address: wallet.address,
        message
      };
      await api.wallet.transact(signedTransaction);
      toast({
        title: "Transaction Sent",
        description: `Sent ${amount.toFixed(6)} ANTIGs to ${sendForm.recipient}`,
      });

      setSendForm({ recipient: "", amount: "", priority: "medium" });
      const info = await api.wallet.getInfo(wallet?.address || "");
      refreshWallet({ balance: info.balance, pending_spends: info.pending_spends });
      await fetchTransactions();
    } catch (error: any) {
      console.error("Transaction error:", error);
      setFormError(error.message || "Transaction failed. Please try again.");
    } finally {
      setSendingTx(false);
    }
  };

  const filteredTransactions = transactions.filter(tx => {
    if (activeTab === "sent") return tx.type === "send"
    if (activeTab === "received") return tx.type === "receive"
    return true
  })

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "confirmed": return <CheckCircle className="h-4 w-4 text-green-500" />
      case "pending": return <CircleDashed className="h-4 w-4 text-yellow-500" />
      case "failed": return <XCircle className="h-4 w-4 text-red-500" />
      default: return <CircleDashed className="h-4 w-4" />
    }
  }

  if (isLoading || !wallet) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl md:col-span-2" />
        </div>

        <Skeleton className="h-12 w-full mb-6" />

        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  const estimatedFee = sendForm.amount ? calculateFee(Number.parseFloat(sendForm.amount)).toFixed(6) : "0.001000"

  return (
    <TooltipProvider>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="container mx-auto px-4 py-8 max-w-7xl"
      >
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-600">
              Wallet Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage your blockchain assets and transactions
            </p>
          </div>
          <Button
            variant="outline"
            size="lg"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="gap-2 bg-background/50 backdrop-blur-sm"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>
        </div>

        {/* Stats and Send Form */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Wallet Summary Card */}
          <Card className="bg-gradient-to-br from-background to-muted/50 border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                Wallet Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label className="text-xs text-muted-foreground mb-1">Address</Label>
                <div className="flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger>
                      <p className="font-mono text-sm truncate bg-muted px-3 py-2 rounded-lg flex-1">
                        {wallet.address}
                      </p>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[300px]">
                      <p>{wallet.address}</p>
                    </TooltipContent>
                  </Tooltip>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={copyAddress}
                    className="text-muted-foreground hover:text-primary"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground mb-1">Balance</Label>
                <div className="flex items-center justify-between">
                  <div className="text-2xl font-bold">
                    {wallet.balance.toFixed(6)} <span className="text-lg text-muted-foreground">ANTIG</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">
                    Pending Spends: {wallet?.pending_spends || 0} ANTIG
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground mb-1">Network Fee Rate</Label>
                <Tooltip>
                  <TooltipTrigger>
                    <p className="text-sm font-mono">
                      {feeRateInfo.fee_rate.toFixed(8)} ANTIG/byte
                    </p>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Mempool Size: {feeRateInfo.mempool_size} txs</p>
                    <p>Block Fullness: {(feeRateInfo.block_fullness * 100).toFixed(1)}%</p>
                    <p>Priority Multipliers: Low (0.8x), Medium (1.0x), High (1.5x)</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </CardContent>
          </Card>

          {/* Send Form Card */}
          <Card className="md:col-span-2 bg-gradient-to-br from-background to-muted/50 border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5 text-primary" />
                Send Transaction
              </CardTitle>
              <CardDescription>Transfer ANTIGs to another address</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSendTransaction} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="recipient">Recipient Address</Label>
                  <Input
                    id="recipient"
                    placeholder="Enter recipient wallet address"
                    value={sendForm.recipient}
                    onChange={(e) => setSendForm({ ...sendForm, recipient: e.target.value })}
                    className="bg-background/50 backdrop-blur-sm"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount (ANTIG)</Label>
                    <Input
                      id="amount"
                      type="number"
                      step="0.000001"
                      min="0.000001"
                      placeholder="0.000000"
                      value={sendForm.amount}
                      onChange={(e) => setSendForm({ ...sendForm, amount: e.target.value })}
                      className="bg-background/50 backdrop-blur-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="priority">Priority</Label>
                    <Select
                      value={sendForm.priority}
                      onValueChange={(value) => setSendForm({ ...sendForm, priority: value as "low" | "medium" | "high" })}
                    >
                      <SelectTrigger className="bg-background/50 backdrop-blur-sm">
                        <SelectValue placeholder="Select priority" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low (Slower, ~0.8x fee)</SelectItem>
                        <SelectItem value="medium">Medium (Standard, ~1.0x fee)</SelectItem>
                        <SelectItem value="high">High (Faster, ~1.5x fee)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <Tooltip>
                    <TooltipTrigger className="text-muted-foreground hover:underline cursor-help">
                      Estimated Fee: {estimatedFee} ANTIG
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Fee = max(0.001, 250 bytes × {feeRateInfo.fee_rate.toFixed(8)} × {feeRateInfo.priority_multipliers[sendForm.priority]} ANTIG)</p>
                      <p>{sendForm.priority.charAt(0).toUpperCase() + sendForm.priority.slice(1)} priority: {feeRateInfo.priority_multipliers[sendForm.priority]}x multiplier</p>
                    </TooltipContent>
                  </Tooltip>
                  <span className="text-muted-foreground">
                    Available: {wallet.balance.toFixed(6)} ANTIG
                  </span>
                </div>

                <AnimatePresence>
                  {formError && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="bg-destructive/10 p-3 rounded-md flex items-start gap-2 text-destructive text-sm"
                    >
                      <AlertCircle className="h-4 w-4 mt-0.5" />
                      <p>{formError}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex gap-3 pt-2">
                  <Button
                    type="submit"
                    disabled={sendingTx || !sendForm.recipient || !sendForm.amount}
                    className="flex-1 gap-2"
                  >
                    {sendingTx ? (
                      <>
                        <CircleDashed className="h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <ArrowRight className="h-4 w-4" />
                        Send Transaction
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setSendForm({ recipient: "", amount: "", priority: "medium" })}
                    disabled={sendingTx}
                  >
                    Reset
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Transactions Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Recent Transactions</h2>
            <div className="flex items-center gap-2">
              <Button
                variant={activeTab === "all" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("all")}
              >
                All
              </Button>
              <Button
                variant={activeTab === "received" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("received")}
              >
                Received
              </Button>
              <Button
                variant={activeTab === "sent" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("sent")}
              >
                Sent
              </Button>
            </div>
          </div>

          {isLoadingTx ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : filteredTransactions.length === 0 ? (
            <Card className="text-center py-16 bg-background/50 backdrop-blur-sm">
              <CardContent className="flex flex-col items-center justify-center gap-4">
                <Sparkles className="h-10 w-10 text-muted-foreground" />
                <p className="text-lg text-muted-foreground">No transactions found</p>
                {activeTab !== "all" && (
                  <Button
                    variant="ghost"
                    onClick={() => setActiveTab("all")}
                    className="text-primary"
                  >
                    View all transactions
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {filteredTransactions.map((tx) => (
                  <motion.div
                    key={tx.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.2 }}
                    layout
                  >
                    <Card
                      className="bg-background/50 backdrop-blur-sm hover:border-primary/50 transition-all cursor-pointer group"
                      onClick={() => router.push(`/transactions/${tx.id}`)}
                    >
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-4">
                            <div className={cn(
                              "p-3 rounded-lg",
                              tx.type === "send" ? "bg-orange-500/10 text-orange-500" : "bg-green-500/10 text-green-500"
                            )}>
                              {tx.type === "send" ? (
                                <ArrowUpRight className="h-5 w-5" />
                              ) : (
                                <ArrowDownLeft className="h-5 w-5" />
                              )}
                            </div>

                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-medium capitalize">{tx.type}</h3>
                                <Badge variant="outline" className="gap-1 px-2 py-0.5 text-xs">
                                  {getStatusIcon(tx.status)}
                                  {tx.status}
                                </Badge>
                              </div>

                              <Tooltip>
                                <TooltipTrigger>
                                  <p className="text-sm text-muted-foreground font-mono truncate max-w-[180px]">
                                    {tx.address}
                                  </p>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[300px]">
                                  <p>{tx.address}</p>
                                </TooltipContent>
                              </Tooltip>

                              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                <span>{formatDistanceToNow(new Date(tx.timestamp), { addSuffix: true })}</span>
                                {tx.blockHeight && (
                                  <>
                                    <span>•</span>
                                    <span>Block #{tx.blockHeight}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="text-right">
                            <p className={cn(
                              "font-medium",
                              tx.type === "send" ? "text-orange-500" : "text-green-500"
                            )}>
                              {tx.type === "send" ? "-" : "+"}
                              {tx.amount.toFixed(6)} ANTIG
                            </p>
                            {tx?.fee || 0 > 0 && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Fee: {(tx?.fee || 0).toFixed(6)} ANTIG
                              </p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </motion.div>
    </TooltipProvider>
  )
}

export default DashboardPage