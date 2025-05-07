// app/address/[address]/page.tsx
'use client'

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { api } from "@/lib/api-client";
import { Skeleton } from '@/components/ui/skeleton';

interface Transaction {
    id: string;
    input: {
        address: string;
        amount: number;
        prev_tx_ids: string[];
        signature: number[];
        timestamp: number;
    };
    output: Record<string, number>;
    fee: number;
    is_coinbase: boolean;
    size: number;
    status: 'pending' | 'confirmed';
    timestamp?: number;
    blockHeight?: number;
}

export default function TransactionPage(params: Promise<{ id: string }>) {
    const router = useRouter();
    const [transaction, setTransaction] = useState<Transaction | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchTransaction = async () => {
            try {
                setLoading(true);

                //@ts-ignore
                const { id } = await params.params
                console.log(id);
                if (id) {
                    const data = await api.transactions.getbyId(id);
                    setTransaction(data);
                }
            } catch (err) {
                console.error('Error fetching transaction:', err);
                setError('Failed to load transaction');
                // router.replace('/not-found');
            } finally {
                setLoading(false);
            }
        };

        fetchTransaction();
    }, [router]);

    const formatTimestamp = (timestamp: number) => {
        return new Date(timestamp / 1000000).toLocaleString();
    };

    if (loading) {
        return (
            <div className="container mx-auto py-8">
                <div className="mb-4">
                    <Button asChild variant="ghost">
                        <Link href="/explorer" className="flex items-center gap-2">
                            <ArrowLeft className="h-4 w-4" />
                            Back to Explorer
                        </Link>
                    </Button>
                </div>
                <div className="space-y-4">
                    <Skeleton className="h-32 w-full" />
                    <Skeleton className="h-64 w-full" />
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="container mx-auto py-8">
                <Card className="text-destructive">
                    <CardHeader>
                        <CardTitle>Error</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p>{error}</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!transaction) return null;

    return (
        <div className="container mx-auto py-8">
            <div className="mb-4">
                <Button asChild variant="ghost">
                    <Link href="/explorer" className="flex items-center gap-2">
                        <ArrowLeft className="h-4 w-4" />
                        Back to Explorer
                    </Link>
                </Button>
            </div>

            <Card className="mb-8">
                <CardHeader>
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <CardTitle>Transaction Details</CardTitle>
                            <div className="flex gap-2">
                                <Badge variant={transaction.is_coinbase ? "default" : "outline"}>
                                    {transaction.is_coinbase ? "Coinbase" : "Standard"}
                                </Badge>
                                <Badge variant={transaction.status === 'confirmed' ? "default" : "secondary"}>
                                    {transaction.status}
                                </Badge>
                            </div>
                        </div>
                        <p className="text-sm break-all font-mono">{transaction.id}</p>
                    </div>
                </CardHeader>

                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <div>
                            <h3 className="text-sm font-medium text-muted-foreground">Timestamp</h3>
                            <p>{formatTimestamp(transaction.input.timestamp)}</p>
                        </div>
                        {transaction.blockHeight && (
                            <div>
                                <h3 className="text-sm font-medium text-muted-foreground">Block Height</h3>
                                <Link href={`/block/${transaction.blockHeight}`} className="flex items-center gap-1 hover:underline">
                                    {transaction.blockHeight}
                                    <ExternalLink className="h-3 w-3" />
                                </Link>
                            </div>
                        )}
                        <div>
                            <h3 className="text-sm font-medium text-muted-foreground">Fee</h3>
                            <p>{transaction.fee}</p>
                        </div>
                        <div>
                            <h3 className="text-sm font-medium text-muted-foreground">Size</h3>
                            <p>{transaction.size} bytes</p>
                        </div>
                    </div>

                    <Separator className="my-4" />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <h3 className="text-lg font-semibold mb-4">Input</h3>
                            <div className="space-y-4">
                                <div>
                                    <h4 className="text-sm font-medium text-muted-foreground">From Address</h4>
                                    <p className="break-all font-mono text-sm">{transaction.input.address}</p>
                                </div>

                                <div>
                                    <h4 className="text-sm font-medium text-muted-foreground">Amount</h4>
                                    <p>{transaction.input.amount}</p>
                                </div>

                                {transaction.input.prev_tx_ids &&
                                    (<div>
                                        <h4 className="text-sm font-medium text-muted-foreground">Previous TX IDs</h4>
                                        <div className="space-y-1">
                                            {transaction.input.prev_tx_ids.map((txId) => (
                                                <p key={txId} className="break-all font-mono text-sm">
                                                    {txId}
                                                </p>
                                            ))}
                                        </div>
                                    </div>)}


                            </div>
                        </div>

                        <div>
                            <h3 className="text-lg font-semibold mb-4">Output</h3>
                            <div className="space-y-4">
                                {Object.entries(transaction.output).map(([address, amount]) => (
                                    <div key={address}>
                                        <h4 className="text-sm font-medium text-muted-foreground">To Address</h4>
                                        <div className="flex justify-between items-center">
                                            <p className="break-all font-mono text-sm">{address}</p>
                                            <Badge variant="outline">{amount}</Badge>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}