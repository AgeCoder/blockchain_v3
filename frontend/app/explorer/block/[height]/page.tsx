// app/block/[height]/page.tsx
import React from 'react';
import { notFound } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { api } from "@/lib/api-client"

interface BlockData {
    timestamp: number;
    last_hash: string;
    hash: string;
    data: Transaction[];
    difficulty: number;
    nonce: number;
    height: number;
    version: number;
    merkle_root: string;
    tx_count: number;
}

interface Transaction {
    id: string;
    message?: string;
    input: {
        address: string;
        block_height: number;
        coinbase_data?: string;
        fees: number;
        public_key: string;
        signature: string;
        subsidy?: number;
        timestamp: number;
    };
    output: Record<string, number>;
    fee: number;
    size: number;
    is_coinbase: boolean;
}

async function getBlockByHeight(height: number): Promise<BlockData> {
    try {
        const response = await api.blockchain.getBlockByHeight(height)
        return response;
    } catch (error) {
        console.error('Error fetching block:', error);
        throw error;
    }
}

async function getCurrentHeight(): Promise<number> {
    try {
        const response = await api.blockchain.getHeight()
        return response.data;
    } catch (error) {
        console.error('Error fetching current height:', error);
        throw error;
    }
}

export default async function BlockPage({
    params,
}: {
    params: Promise<{ height: string }>
}) {
    const { height } = await params
    const currentHeight = await getCurrentHeight();

    const heighti = parseInt(height);

    if (isNaN(heighti) || heighti < 0 || heighti > currentHeight) {
        return notFound();
    }

    const block = await getBlockByHeight(heighti);

    const formatTimestamp = (timestamp: number) => {
        return new Date(timestamp / 1000000).toLocaleString();
    };

    return (
        <div className="container mx-auto py-8">
            <Card className="mb-8">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Block #{block.height}</CardTitle>
                        <div className="flex gap-2">
                            <Badge variant="outline">Version {block.version}</Badge>
                            {block.height === 0 && <Badge variant="secondary">Genesis Block</Badge>}
                        </div>
                    </div>
                </CardHeader>

                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <div>
                            <h3 className="text-sm font-medium text-muted-foreground">Timestamp</h3>
                            <p>{formatTimestamp(block.timestamp)}</p>
                        </div>
                        <div>
                            <h3 className="text-sm font-medium text-muted-foreground">Difficulty</h3>
                            <p>{block.difficulty}</p>
                        </div>
                        <div>
                            <h3 className="text-sm font-medium text-muted-foreground">Nonce</h3>
                            <p>{block.nonce}</p>
                        </div>
                        <div>
                            <h3 className="text-sm font-medium text-muted-foreground">Transactions</h3>
                            <p>{block.tx_count}</p>
                        </div>
                    </div>

                    <Separator className="my-4" />

                    <div className="space-y-4">
                        <div>
                            <h3 className="text-sm font-medium text-muted-foreground">Hash</h3>
                            <p className="break-all font-mono text-sm">{block.hash}</p>
                        </div>
                        <div>
                            <h3 className="text-sm font-medium text-muted-foreground">Previous Hash</h3>
                            <p className="break-all font-mono text-sm">{block.last_hash}</p>
                        </div>
                        <div>
                            <h3 className="text-sm font-medium text-muted-foreground">Merkle Root</h3>
                            <p className="break-all font-mono text-sm">{block.merkle_root}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Transactions ({block.tx_count})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {block.data.map((tx) => (
                        <div key={tx.id} className="border rounded-lg p-4">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="font-medium">TX: {tx.id}</h3>
                                    {tx.message && <p className="text-sm text-muted-foreground">"{tx.message}"</p>}
                                </div>
                                <Badge variant={tx.is_coinbase ? "default" : "outline"}>
                                    {tx.is_coinbase ? "Coinbase" : "Transaction"}
                                </Badge>
                            </div>

                            <Separator className="my-3" />

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <h4 className="text-sm font-medium text-muted-foreground">Input</h4>
                                    <div className="mt-1 space-y-1 text-sm">
                                        <p>From: {tx.input.address}</p>
                                        {tx.input.coinbase_data && (
                                            <p>Note: "{tx.input.coinbase_data}"</p>
                                        )}
                                        {tx.input.subsidy && (
                                            <p>Subsidy: {tx.input.subsidy}</p>
                                        )}
                                        <p>Fees: {tx.fee}</p>
                                    </div>
                                </div>

                                <div>
                                    <h4 className="text-sm font-medium text-muted-foreground">Output</h4>
                                    <div className="mt-1 space-y-1 text-sm">
                                        {Object.entries(tx.output).map(([address, amount]) => (
                                            <p key={address}>
                                                To: {address} → {amount}
                                            </p>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}