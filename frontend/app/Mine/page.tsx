"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@/lib/wallet-provider";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Loader2, HardHat, Clock, Coins, Hash, CircleDollarSign, Activity } from "lucide-react";

export default function MiningPage() {
    const { wallet, isLoading } = useWallet();
    const { toast } = useToast();
    const [isMining, setIsMining] = useState(false);
    const [miningStatus, setMiningStatus] = useState("");
    const [lastMinedBlock, setLastMinedBlock] = useState<any>(null);
    const [isServerBusy, setIsServerBusy] = useState(false);
    const [transactionPool, setTransactionPool] = useState<any[]>([]);
    const [halvingInfo, setHalvingInfo] = useState({ halvings: 0, subsidy: 50 });
    const [stats, setStats] = useState({
        totalFees: 0,
        avgFee: 0,
        pendingAmount: 0
    });

    const fetchTransactionPool = async () => {
        try {
            const response = await fetch("http://localhost:3219/transactions");
            if (!response.ok) throw new Error("Failed to fetch transactions");
            const data = await response.json();
            setTransactionPool(data);

            // Calculate stats
            const totalFees = data.reduce((sum: number, tx: any) => sum + tx.fee, 0);
            const avgFee = data.length > 0 ? totalFees / data.length : 0;
            const pendingAmount = data.reduce((sum: number, tx: any) => {
                return sum + Object.values(tx.output).reduce((a: number, b: number) => a + b, 0);
            }, 0);

            setStats({
                totalFees,
                avgFee,
                pendingAmount
            });
        } catch (error) {
            console.error("Error fetching transaction pool:", error);
        }
    };

    const fetchHalvingInfo = async () => {
        try {
            const response = await fetch("http://localhost:3219/blockchain/halving");
            if (!response.ok) throw new Error("Failed to fetch halving info");
            const data = await response.json();
            setHalvingInfo(data);
        } catch (error) {
            console.error("Error fetching halving info:", error);
        }
    };

    const handleMineBlock = async () => {
        if (!wallet?.address) {
            toast({
                title: "Error",
                description: "Wallet not connected",
                variant: "destructive",
            });
            return;
        }

        setIsMining(true);
        setMiningStatus("Initializing mining process...");
        setIsServerBusy(false);

        try {
            const response = await fetch("http://localhost:3219/mine", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    miner_address: wallet.address,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                if (response.status === 429 || errorData.detail?.includes("busy")) {
                    setIsServerBusy(true);
                    toast({
                        title: "Server Busy",
                        description: "The mining server is currently processing another request. Please try again shortly.",
                        variant: "destructive",
                    });
                    return;
                }
                throw new Error(errorData.detail || "Mining failed");
            }

            const data = await response.json();
            setLastMinedBlock(data);
            setMiningStatus("Block mined successfully!");
            toast({
                title: "Success",
                description: `Mined block #${data.block.height} with reward of ${data.reward} coins`,
            });

            // Refresh transaction pool after mining
            await fetchTransactionPool();
        } catch (error: any) {
            console.error("Mining error:", error);
            toast({
                title: "Error",
                description: error.message || "Failed to mine block",
                variant: "destructive",
            });
            setMiningStatus("Mining failed");
        } finally {
            setIsMining(false);
        }
    };

    // Check server status and fetch initial data
    useEffect(() => {
        const checkServerStatus = async () => {
            try {
                const response = await fetch("http://localhost:3219/health");
                if (!response.ok) {
                    setIsServerBusy(true);
                }
            } catch (error) {
                setIsServerBusy(true);
            }
        };

        checkServerStatus();
        fetchTransactionPool();
        fetchHalvingInfo();

        // Set up polling for transaction pool
        const interval = setInterval(fetchTransactionPool, 15000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column - Mining Stats */}
                <div className="lg:col-span-2 space-y-6">
                    <Card className="border-0 shadow-lg bg-gradient-to-br from-gray-900 to-blue-900/80 text-white">
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <HardHat className="h-8 w-8 text-yellow-400" />
                                <div>
                                    <CardTitle>Block Mining</CardTitle>
                                    <CardDescription className="text-gray-300">
                                        Mine new blocks and earn mining rewards
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent>
                            <div className="space-y-6">
                                <div className="bg-gray-800/50 backdrop-blur-sm p-4 rounded-lg border border-gray-700">
                                    <h3 className="font-medium mb-2 text-gray-300">Miner Wallet</h3>
                                    {wallet?.address ? (
                                        <div className="font-mono text-sm bg-gray-700/50 p-3 rounded-lg break-all border border-gray-600">
                                            {wallet.address}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-gray-400">
                                            {isLoading ? "Loading wallet..." : "Wallet not connected"}
                                        </p>
                                    )}
                                </div>

                                {isServerBusy && (
                                    <div className="bg-yellow-900/20 border border-yellow-800 p-4 rounded-lg">
                                        <div className="flex items-center gap-2 text-yellow-300">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            <span>Server is currently busy processing another mining request</span>
                                        </div>
                                    </div>
                                )}

                                <div className="flex justify-center">
                                    <Button
                                        onClick={handleMineBlock}
                                        disabled={isMining || !wallet?.address || isServerBusy}
                                        size="lg"
                                        className="min-w-[200px] bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-white shadow-lg"
                                    >
                                        {isMining ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Mining...
                                            </>
                                        ) : (
                                            "Start Mining"
                                        )}
                                    </Button>
                                </div>

                                {isMining && (
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2 text-sm text-gray-300">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            <span>{miningStatus}</span>
                                        </div>
                                        <div className="w-full bg-gray-700 rounded-full h-2.5">
                                            <div
                                                className="bg-yellow-500 h-2.5 rounded-full animate-pulse"
                                                style={{ width: "100%" }}
                                            ></div>
                                        </div>
                                        <p className="text-xs text-gray-400">
                                            This may take several minutes depending on network difficulty...
                                        </p>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {lastMinedBlock && (
                        <Card className="border-0 shadow-lg bg-gradient-to-br from-gray-900 to-blue-900/80 text-white">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <HardHat className="h-5 w-5 text-yellow-400" />
                                    <span>Last Mined Block</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                                    <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                                        <p className="text-gray-400 flex items-center gap-1">
                                            <Hash className="h-4 w-4" /> Block Height
                                        </p>
                                        <p className="font-mono text-lg mt-1">#{lastMinedBlock.block.height}</p>
                                    </div>
                                    <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                                        <p className="text-gray-400 flex items-center gap-1">
                                            <CircleDollarSign className="h-4 w-4" /> Reward
                                        </p>
                                        <p className="font-mono text-lg mt-1">{lastMinedBlock.reward.toFixed(2)} coins</p>
                                    </div>
                                    <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                                        <p className="text-gray-400 flex items-center gap-1">
                                            <Clock className="h-4 w-4" /> Timestamp
                                        </p>
                                        <p className="font-mono text-sm mt-1">
                                            {new Date(lastMinedBlock.block.timestamp / 1000000).toLocaleString()}
                                        </p>
                                    </div>
                                    <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                                        <p className="text-gray-400 flex items-center gap-1">
                                            <Activity className="h-4 w-4" /> Difficulty
                                        </p>
                                        <p className="font-mono text-lg mt-1">{lastMinedBlock.block.difficulty}</p>
                                    </div>
                                    <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                                        <p className="text-gray-400 flex items-center gap-1">
                                            <Coins className="h-4 w-4" /> Transactions
                                        </p>
                                        <p className="font-mono text-lg mt-1">{lastMinedBlock.block.tx_count}</p>
                                    </div>
                                    <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                                        <p className="text-gray-400">Version</p>
                                        <p className="font-mono text-lg mt-1">v{lastMinedBlock.block.version}</p>
                                    </div>
                                </div>

                                <div className="mt-4 space-y-3">
                                    <div>
                                        <p className="text-gray-400">Block Hash</p>
                                        <p className="font-mono text-xs break-all bg-gray-800/50 p-2 rounded mt-1">
                                            {lastMinedBlock.block.hash}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-gray-400">Previous Hash</p>
                                        <p className="font-mono text-xs break-all bg-gray-800/50 p-2 rounded mt-1">
                                            {lastMinedBlock.block.last_hash}
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="flex justify-between items-center border-t border-gray-700">
                                <div className="text-sm">
                                    <span className="text-gray-400">Your balance: </span>
                                    <span className="font-mono text-green-400">
                                        {lastMinedBlock.confirmed_balance.toFixed(2)} coins
                                    </span>
                                </div>
                            </CardFooter>
                        </Card>
                    )}
                </div>

                {/* Right Column - Transaction Pool and Stats */}
                <div className="space-y-6">
                    <Card className="border-0 shadow-lg bg-gradient-to-br from-gray-900 to-purple-900/80 text-white">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Activity className="h-5 w-5 text-purple-300" />
                                <span>Transaction Pool</span>
                            </CardTitle>
                            <CardDescription className="text-gray-300">
                                {transactionPool.length} pending transactions
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                                    <p className="text-gray-400 text-sm">Total Fees</p>
                                    <p className="font-mono text-lg">
                                        {stats.totalFees.toFixed(4)} coins
                                    </p>
                                </div>
                                <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                                    <p className="text-gray-400 text-sm">Avg Fee</p>
                                    <p className="font-mono text-lg">
                                        {stats.avgFee.toFixed(4)} coins
                                    </p>
                                </div>
                                <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-700 col-span-2">
                                    <p className="text-gray-400 text-sm">Pending Amount</p>
                                    <p className="font-mono text-lg">
                                        {stats.pendingAmount.toFixed(2)} coins
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                                {transactionPool.length > 0 ? (
                                    transactionPool.map((tx) => (
                                        <div key={tx.id} className="bg-gray-800/30 p-3 rounded-lg border border-gray-700">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <p className="font-mono text-xs break-all">{tx.id}</p>
                                                    <p className="text-gray-400 text-xs mt-1">
                                                        Fee: <span className="text-yellow-400">{tx.fee.toFixed(4)}</span>
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xs text-gray-400">
                                                        {new Date(tx.input.timestamp / 1000000).toLocaleTimeString()}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-4 text-gray-400">
                                        No transactions in the pool
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-0 shadow-lg bg-gradient-to-br from-gray-900 to-green-900/80 text-white">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Coins className="h-5 w-5 text-green-300" />
                                <span>Halving Information</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                                    <p className="text-gray-400 text-sm">Halvings</p>
                                    <p className="font-mono text-lg">{halvingInfo.halvings}</p>
                                </div>
                                <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                                    <p className="text-gray-400 text-sm">Current Subsidy</p>
                                    <p className="font-mono text-lg">{halvingInfo.subsidy.toFixed(2)} coins</p>
                                </div>
                                <div className="col-span-2 bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                                    <p className="text-gray-400 text-sm">Next Halving</p>
                                    <p className="font-mono">
                                        Block #{210000 * (halvingInfo.halvings + 1)}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}