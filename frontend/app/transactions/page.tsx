"use client"
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpRight, ArrowDownLeft, RefreshCw, Clock, ExternalLink, ChevronRight, Loader2, Send, CircleDashed, CheckCircle2, XCircle, ArrowRightLeft, Database, RadioReceiver } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/lib/wallet-provider";
import { api } from "@/lib/api-client";
import { formatDistanceToNow } from "date-fns";

interface Transaction {
  id: string;
  type: "send" | "receive";
  amount: number;
  timestamp: string;
  status: "pending" | "confirmed" | "failed";
  address: string;
  blockHeight?: number;
  fee?: number;
}

export default function TransactionsPage() {
  const { wallet, isLoading: walletLoading } = useWallet();
  const router = useRouter();
  const { toast } = useToast();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [pendingTransactions, setPendingTransactions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [stats, setStats] = useState({
    total: 0,
    sent: 0,
    received: 0,
    pending: 0
  });

  useEffect(() => {
    if (!walletLoading && !wallet) {
      router.push("/wallet/import");
    } else if (wallet) {
      fetchTransactions();
    }
  }, [wallet, walletLoading]);

  const fetchTransactions = async () => {
    if (!wallet?.address) return;

    setIsLoading(true);
    try {
      const txResponse = await api.transactions.getByAddress(wallet.address);
      const formattedTx: Transaction[] = txResponse.map((tx: any) => {
        const isSend = tx.input.address === wallet.address;
        const otherAddr = isSend
          ? Object.keys(tx.output).find((addr) => addr !== wallet.address) || ""
          : tx.input.address;
        const amount = isSend ? tx.input.amount - (tx.output[wallet.address] || 0) : tx.output[wallet.address] || 0;

        return {
          id: tx.id,
          type: isSend ? "send" : "receive",
          amount,
          timestamp: new Date(tx.timestamp / 1000000).toISOString(),
          status: tx.status || "pending",
          address: otherAddr,
          blockHeight: tx.blockHeight,
          fee: tx.fee || 0
        };
      });

      setTransactions(formattedTx);
      updateStats(formattedTx);

      const pendingResponse = await api.transactions.getPending();
      setPendingTransactions(pendingResponse.data);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      toast({
        title: "Error",
        description: "Failed to load transactions",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const updateStats = (txs: Transaction[]) => {
    setStats({
      total: txs.length,
      sent: txs.filter(tx => tx.type === "send").length,
      received: txs.filter(tx => tx.type === "receive").length,
      pending: txs.filter(tx => tx.status === "pending").length
    });
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchTransactions();
      toast({
        title: "Refreshed",
        description: "Transactions have been updated",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const filteredTransactions = () => {
    switch (activeTab) {
      case "sent": return transactions.filter((tx) => tx.type === "send");
      case "received": return transactions.filter((tx) => tx.type === "receive");
      case "pending": return transactions.filter((tx) => tx.status === "pending");
      default: return transactions;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "confirmed": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "pending": return <CircleDashed className="h-4 w-4 text-yellow-500" />;
      case "failed": return <XCircle className="h-4 w-4 text-red-500" />;
      default: return <CircleDashed className="h-4 w-4" />;
    }
  };

  if (walletLoading || isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="container mx-auto px-4 py-8 max-w-6xl"
      >
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <Skeleton className="h-10 w-64 mb-2" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-12 w-32" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="bg-background/50">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-6 w-6 rounded-full" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32 mt-2" />
                <Skeleton className="h-3 w-full mt-4" />
              </CardContent>
            </Card>
          ))}
        </div>

        <Skeleton className="h-14 w-full mb-6" />

        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      </motion.div>
    );
  }

  return (
    <TooltipProvider>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="container mx-auto px-4 py-8 max-w-6xl"
      >
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-600">
              Transaction History
            </h1>
            <p className="text-muted-foreground mt-1">
              Review all your incoming and outgoing transactions
            </p>
          </div>
          <Button
            variant="outline"
            size="lg"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="gap-2 bg-background/50 backdrop-blur-sm hover:bg-background/70"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-background/50 backdrop-blur-sm border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total</CardTitle>
              <Database className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <Progress value={100} className="h-2 mt-2" />
            </CardContent>
          </Card>

          <Card className="bg-background/50 backdrop-blur-sm border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Sent</CardTitle>
              <Send className="h-5 w-5 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.sent}</div>
              <Progress value={(stats.sent / stats.total) * 100} className="h-2 mt-2" />
            </CardContent>
          </Card>

          <Card className="bg-background/50 backdrop-blur-sm border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Received</CardTitle>
              <RadioReceiver className="h-5 w-5 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.received}</div>
              <Progress value={(stats.received / stats.total) * 100} className="h-2 mt-2" />
            </CardContent>
          </Card>

          <Card className="bg-background/50 backdrop-blur-sm border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <CircleDashed className="h-5 w-5 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pending}</div>
              <Progress value={(stats.pending / stats.total) * 100} className="h-2 mt-2" />
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList className="grid w-full grid-cols-4 bg-background/50 backdrop-blur-sm">
            {[
              { value: "all", label: "All" },
              { value: "sent", label: "Sent" },
              { value: "received", label: "Received" },
              { value: "pending", label: "Pending" }
            ].map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="gap-2"
              >
                {tab.value === "sent" && <Send className="h-4 w-4" />}
                {tab.value === "received" && <RadioReceiver className="h-4 w-4" />}
                {tab.value === "pending" && <CircleDashed className="h-4 w-4" />}
                {tab.label}
                <Badge variant="secondary" className="ml-1">
                  {tab.value === "all" && stats.total}
                  {tab.value === "sent" && stats.sent}
                  {tab.value === "received" && stats.received}
                  {tab.value === "pending" && stats.pending}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="space-y-4">
          <AnimatePresence mode="wait">
            {filteredTransactions().length > 0 ? (
              filteredTransactions().map((tx) => (
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
                          <div className={`p-3 rounded-lg ${tx.type === "send"
                            ? "bg-orange-500/10 text-orange-500"
                            : "bg-green-500/10 text-green-500"
                            }`}>
                            {tx.type === "send" ? (
                              <ArrowUpRight className="h-5 w-5" />
                            ) : (
                              <ArrowDownLeft className="h-5 w-5" />
                            )}
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium capitalize">{tx.type}</h3>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge
                                    variant="outline"
                                    className="gap-1 px-2 py-0.5 text-xs"
                                  >
                                    {getStatusIcon(tx.status)}
                                    {tx.status}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {tx.status === "confirmed" ? "Transaction confirmed" :
                                    tx.status === "pending" ? "Waiting for confirmation" : "Transaction failed"}
                                </TooltipContent>
                              </Tooltip>
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
                          <p className={`font-medium ${tx.type === "send" ? "text-orange-500" : "text-green-500"
                            }`}>
                            {tx.type === "send" ? "-" : "+"}
                            {tx.amount.toFixed(6)} ANTIG
                          </p>
                          {tx.fee && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Fee: {tx.fee.toFixed(6)} ANTIG
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center py-16"
              >
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
                  <ArrowRightLeft className="h-5 w-5 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-muted-foreground">No transactions found</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {activeTab === "all"
                    ? "You don't have any transactions yet"
                    : `You don't have any ${activeTab} transactions`}
                </p>
                {activeTab !== "all" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-4"
                    onClick={() => setActiveTab("all")}
                  >
                    View all transactions
                  </Button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {activeTab === "pending" && pendingTransactions?.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="mt-12"
          >
            <h2 className="text-2xl font-bold mb-6">Network Pending Transactions</h2>
            <Card className="bg-background/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>Mempool Transactions</CardTitle>
                <CardDescription>
                  Transactions waiting to be included in the next block
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <AnimatePresence>
                  {pendingTransactions.map((tx) => (
                    <motion.div
                      key={tx.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Card
                        className="hover:border-primary/50 transition-all cursor-pointer"
                        onClick={() => router.push(`/transactions/${tx.id}`)}
                      >
                        <CardContent className="p-4 flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="bg-yellow-500/10 p-2 rounded-lg text-yellow-500">
                              <CircleDashed className="h-5 w-5" />
                            </div>
                            <div>
                              <Tooltip>
                                <TooltipTrigger>
                                  <p className="font-mono text-sm truncate max-w-[200px]">
                                    {tx.id}
                                  </p>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[300px]">
                                  <p>{tx.id}</p>
                                </TooltipContent>
                              </Tooltip>
                              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                <span>From:</span>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <span className="font-mono truncate max-w-[120px]">
                                      {tx.input.address}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-[300px]">
                                    <p>{tx.input.address}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" className="text-primary">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </motion.div>
    </TooltipProvider>
  );
}