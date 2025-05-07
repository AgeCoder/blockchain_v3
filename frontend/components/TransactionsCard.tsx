"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ArrowDownLeft, Clock, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Key, ReactElement, JSXElementConstructor, ReactNode, ReactPortal } from "react";

export default function TransactionsCard({ transactions, isLoadingTx }: any) {
    const router = useRouter();

    return (
        <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="md:col-span-3"
        >
            <Card className="wallet-card">
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Clock className="h-5 w-5" />
                            Recent Transactions
                        </CardTitle>
                        <CardDescription>Your latest blockchain activity</CardDescription>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push("/transactions")}
                        aria-label="View all transactions"
                    >
                        View All <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="all">
                        <TabsList className="grid w-full grid-cols-3 mb-4">
                            <TabsTrigger value="all">All</TabsTrigger>
                            <TabsTrigger value="sent">Sent</TabsTrigger>
                            <TabsTrigger value="received">Received</TabsTrigger>
                        </TabsList>
                        {isLoadingTx ? (
                            <div className="space-y-4">
                                {[...Array(4)].map((_, i) => (
                                    <Skeleton key={i} className="h-20 w-full" />
                                ))}
                            </div>
                        ) : (
                            <>
                                <TabsContent value="all" className="space-y-4">
                                    {transactions.length > 0 ? (
                                        transactions.map((tx: { id: Key | null | undefined; type: string | number | bigint | boolean | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | Promise<string | number | bigint | boolean | ReactPortal | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | null | undefined> | null | undefined; address: string | number | bigint | boolean | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | Promise<string | number | bigint | boolean | ReactPortal | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | null | undefined> | null | undefined; blockHeight: string | number | bigint | boolean | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | ReactPortal | Promise<string | number | bigint | boolean | ReactPortal | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | null | undefined> | null | undefined; fee: number; amount: number; timestamp: string | number | Date; status: string | number | bigint | boolean | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | Promise<string | number | bigint | boolean | ReactPortal | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | null | undefined> | null | undefined; }, index: number) => (
                                            <motion.div
                                                key={tx.id}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ duration: 0.3, delay: index * 0.1 }}
                                                className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                                                role="article"
                                                tabIndex={0}
                                                onClick={() => router.push(`/transactions/${tx.id}`)}
                                                onKeyDown={(e) => e.key === "Enter" && router.push(`/transactions/${tx.id}`)}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div
                                                        className={`p-2 rounded-full ${tx.type === "send"
                                                            ? "bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400"
                                                            : "bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400"
                                                            }`}
                                                    >
                                                        {tx.type === "send" ? (
                                                            <ArrowUpRight className="h-5 w-5" />
                                                        ) : (
                                                            <ArrowDownLeft className="h-5 w-5" />
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="font-medium capitalize">{tx.type}</p>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                                                    {tx.address}
                                                                </p>
                                                            </TooltipTrigger>
                                                            <TooltipContent>{tx.address}</TooltipContent>
                                                        </Tooltip>
                                                        <p className="text-xs text-muted-foreground">
                                                            Block #{tx.blockHeight} • Fee: {tx?.fee?.toFixed(6)}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p
                                                        className={`font-medium ${tx.type === "send"
                                                            ? "text-red-600 dark:text-red-400"
                                                            : "text-green-600 dark:text-green-400"
                                                            }`}
                                                    >
                                                        {tx.type === "send" ? "-" : "+"}
                                                        {tx.amount.toFixed(6)} COIN
                                                    </p>
                                                    <div className="flex items-center justify-end text-xs text-muted-foreground">
                                                        <Clock className="h-3 w-3 mr-1" />
                                                        {formatDistanceToNow(new Date(tx.timestamp), { addSuffix: true })}
                                                        <Badge
                                                            variant="outline"
                                                            className={`ml-2 capitalize ${tx.status === "confirmed"
                                                                ? "border-green-500 text-green-600 dark:text-green-400"
                                                                : tx.status === "pending"
                                                                    ? "border-yellow-500 text-yellow-600 dark:text-yellow-400"
                                                                    : "border-red-500 text-red-600 dark:text-red-400"
                                                                }`}
                                                        >
                                                            {tx.status}
                                                        </Badge>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        ))
                                    ) : (
                                        <div className="text-center py-10">
                                            <p className="text-muted-foreground text-lg">No Transactions Yet</p>
                                            <p className="text-sm mt-2">
                                                Send or receive ANTIGs to start your transaction history
                                            </p>
                                        </div>
                                    )}
                                </TabsContent>
                                <TabsContent value="sent" className="space-y-4">
                                    {transactions.filter((tx: { type: string; }) => tx.type === "send").length > 0 ? (
                                        transactions
                                            .filter((tx: { type: string; }) => tx.type === "send")
                                            .map((tx: { id: Key | null | undefined; address: string | number | bigint | boolean | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | Promise<string | number | bigint | boolean | ReactPortal | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | null | undefined> | null | undefined; blockHeight: string | number | bigint | boolean | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | ReactPortal | Promise<string | number | bigint | boolean | ReactPortal | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | null | undefined> | null | undefined; fee: number; amount: number; timestamp: string | number | Date; status: string | number | bigint | boolean | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | Promise<string | number | bigint | boolean | ReactPortal | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | null | undefined> | null | undefined; }, index: number) => (
                                                <motion.div
                                                    key={tx.id}
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ duration: 0.3, delay: index * 0.1 }}
                                                    className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                                                    role="article"
                                                    tabIndex={0}
                                                    onClick={() => router.push(`/transactions/${tx.id}`)}
                                                    onKeyDown={(e) => e.key === "Enter" && router.push(`/transactions/${tx.id}`)}
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className="p-2 rounded-full bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400">
                                                            <ArrowUpRight className="h-5 w-5" />
                                                        </div>
                                                        <div>
                                                            <p className="font-medium">Send</p>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                                                        {tx.address}
                                                                    </p>
                                                                </TooltipTrigger>
                                                                <TooltipContent>{tx.address}</TooltipContent>
                                                            </Tooltip>
                                                            <p className="text-xs text-muted-foreground">
                                                                Block #{tx.blockHeight} • Fee: {tx?.fee?.toFixed(6)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="font-medium text-red-600 dark:text-red-400">-{tx.amount.toFixed(6)} ANTIG</p>
                                                        <div className="flex items-center justify-end text-xs text-muted-foreground">
                                                            <Clock className="h-3 w-3 mr-1" />
                                                            {formatDistanceToNow(new Date(tx.timestamp), { addSuffix: true })}
                                                            <Badge
                                                                variant="outline"
                                                                className={`ml-2 capitalize ${tx.status === "confirmed"
                                                                    ? "border-green-500 text-green-600 dark:text-green-400"
                                                                    : tx.status === "pending"
                                                                        ? "border-yellow-500 text-yellow-600 dark:text-yellow-400"
                                                                        : "border-red-500 text-red-600 dark:text-red-400"
                                                                    }`}
                                                            >
                                                                {tx.status}
                                                            </Badge>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            ))
                                    ) : (
                                        <div className="text-center py-10">
                                            <p className="text-muted-foreground text-lg">No Sent Transactions Yet</p>
                                            <p className="text-sm mt-2">Send ANTIGs to start your transaction history</p>
                                        </div>
                                    )}
                                </TabsContent>
                                <TabsContent value="received" className="space-y-4">
                                    {transactions.filter((tx: { type: string; }) => tx.type === "receive").length > 0 ? (
                                        transactions
                                            .filter((tx: { type: string; }) => tx.type === "receive")
                                            .map((tx: { id: Key | null | undefined; address: string | number | bigint | boolean | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | Promise<string | number | bigint | boolean | ReactPortal | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | null | undefined> | null | undefined; blockHeight: string | number | bigint | boolean | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | ReactPortal | Promise<string | number | bigint | boolean | ReactPortal | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | null | undefined> | null | undefined; fee: number; amount: number; timestamp: string | number | Date; status: string | number | bigint | boolean | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | Promise<string | number | bigint | boolean | ReactPortal | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | null | undefined> | null | undefined; }, index: number) => (
                                                <motion.div
                                                    key={tx.id}
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ duration: 0.3, delay: index * 0.1 }}
                                                    className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                                                    role="article"
                                                    tabIndex={0}
                                                    onClick={() => router.push(`/transactions/${tx.id}`)}
                                                    onKeyDown={(e) => e.key === "Enter" && router.push(`/transactions/${tx.id}`)}
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className="p-2 rounded-full bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400">
                                                            <ArrowDownLeft className="h-5 w-5" />
                                                        </div>
                                                        <div>
                                                            <p className="font-medium">Receive</p>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                                                        {tx.address}
                                                                    </p>
                                                                </TooltipTrigger>
                                                                <TooltipContent>{tx.address}</TooltipContent>
                                                            </Tooltip>
                                                            <p className="text-xs text-muted-foreground">
                                                                Block #{tx.blockHeight} • Fee: {tx?.fee?.toFixed(6)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="font-medium text-green-600 dark:text-green-400">+{tx.amount.toFixed(6)} ANTIG</p>
                                                        <div className="flex items-center justify-end text-xs text-muted-foreground">
                                                            <Clock className="h-3 w-3 mr-1" />
                                                            {formatDistanceToNow(new Date(tx.timestamp), { addSuffix: true })}
                                                            <Badge
                                                                variant="outline"
                                                                className={`ml-2 capitalize ${tx.status === "confirmed"
                                                                    ? "border-green-500 text-green-600 dark:text-green-400"
                                                                    : tx.status === "pending"
                                                                        ? "border-yellow-500 text-yellow-600 dark:text-yellow-400"
                                                                        : "border-red-500 text-red-600 dark:text-red-400"
                                                                    }`}
                                                            >
                                                                {tx.status}
                                                            </Badge>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            ))
                                    ) : (
                                        <div className="text-center py-10">
                                            <p className="text-muted-foreground text-lg">No Received Transactions Yet</p>
                                            <p className="text-sm mt-2">Receive ANTIGs to start your transaction history</p>
                                        </div>
                                    )}
                                </TabsContent>
                            </>
                        )}
                    </Tabs>
                </CardContent>
                <CardFooter className="border-t pt-4">
                    <Button variant="outline" asChild className="w-full">
                        <a href="/transactions">
                            View All Transactions
                            <ChevronRight className="ml-2 h-4 w-4" />
                        </a>
                    </Button>
                </CardFooter>
            </Card>
        </motion.div>
    );
}