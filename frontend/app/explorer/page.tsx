'use client'
import React, { useEffect, useState, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Search, Database, Clock, Copy, ChevronRight, Loader2, HardDrive, Layers, Hash, ArrowRightLeft, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { useToast } from "@/hooks/use-toast"
import { debounce } from "lodash"
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll"
import { formatDistanceToNow } from "date-fns"
import { api } from "@/lib/api-client"

interface Transaction {
  id: string
  is_coinbase: boolean
  input: { address: string; fees?: number; subsidy?: number }
  output: Record<string, number>
  fee: number
  size: number
}

interface Block {
  hash: string
  height: number
  timestamp: number
  data: Transaction[]
  nonce: number
  last_hash: string
  difficulty: number
  version: number
  merkle_root: string
  tx_count: number
}

const BLOCKS_PER_PAGE = 10
const SEARCH_RESULTS_LIMIT = 5
const DEBOUNCE_DELAY = 300

const ExplorerPage = () => {
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [blockchainLength, setBlockchainLength] = useState(0)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Block[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasMoreBlocks, setHasMoreBlocks] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchBlockchainData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [lengthResponse, paginatedResponse] = await Promise.all([
        api.blockchain.getHeight(),
        api.blockchain.getPaginated(1, BLOCKS_PER_PAGE)
      ])

      setBlockchainLength(lengthResponse.height)
      setBlocks(paginatedResponse.blocks)
      setTotalPages(paginatedResponse.total_pages)
      setHasMoreBlocks(paginatedResponse.has_next)
    } catch (error) {
      console.error("Error fetching blockchain data:", error)
      toast({
        title: "Error",
        description: "Failed to load blockchain data",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  const fetchMoreBlocks = useCallback(async () => {
    if (!hasMoreBlocks || isSearching) return

    try {
      const nextPage = currentPage + 1
      const response = await api.blockchain.getPaginated(nextPage, BLOCKS_PER_PAGE)

      setBlocks(prev => [...prev, ...response.blocks])
      setCurrentPage(nextPage)
      setHasMoreBlocks(response.has_next)
    } catch (error) {
      console.error("Error fetching more blocks:", error)
      toast({
        title: "Error",
        description: "Failed to load more blocks",
        variant: "destructive",
      })
    }
  }, [currentPage, hasMoreBlocks, isSearching, toast])

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    try {
      if (!isNaN(Number(query))) {
        try {
          const block = await api.blockchain.getBlockByHeight(Number(query))
          setSearchResults([block])
          return
        } catch (error) {
          // Continue with general search if not found by height
        }
      }

      if (query.length >= 16) {
        try {
          const block = await api.blockchain.getBlockByHash(query)
          setSearchResults([block])
          return
        } catch (error) {
          // Continue with general search if not found by hash
        }
      }

      const latestBlocks = await api.blockchain.getLatest(SEARCH_RESULTS_LIMIT * 5)
      const filteredBlocks = latestBlocks.filter(
        (block: Block) =>
          block.hash.includes(query) ||
          block.height.toString() === query ||
          block.last_hash.includes(query) ||
          block.data.some((tx: Transaction) =>
            tx.id.includes(query) ||
            Object.keys(tx.output).some(address => address.includes(query))
          )
      ).slice(0, SEARCH_RESULTS_LIMIT)

      setSearchResults(filteredBlocks)
    } catch (error) {
      console.error("Error searching blocks:", error)
      toast({
        title: "Error",
        description: "Failed to search blocks",
        variant: "destructive",
      })
    } finally {
      setIsSearching(false)
    }
  }, [toast])

  const debouncedSearch = useMemo(() =>
    debounce(handleSearch, DEBOUNCE_DELAY),
    [handleSearch]
  )

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text)
    toast({
      title: "Copied to clipboard",
      description: "The content has been copied to your clipboard.",
      duration: 2000
    })
  }, [toast])

  const viewBlockDetails = useCallback((block: Block) => {
    router.push(`/explorer/block/${block.height}`)
  }, [router])

  const viewTransactionDetails = useCallback((txId: string) => {
    router.push(`/explorer/transaction/${txId}`)
  }, [router])

  useEffect(() => {
    fetchBlockchainData()
    return () => debouncedSearch.cancel()
  }, [fetchBlockchainData, debouncedSearch])

  useEffect(() => {
    debouncedSearch(searchQuery)
  }, [searchQuery, debouncedSearch])

  const { observerRef } = useInfiniteScroll(fetchMoreBlocks, {
    isLoading: isLoading || isSearching,
  })

  const totalTransactions = useMemo(() =>
    blocks.reduce((acc, block) => acc + block.data.length, 0),
    [blocks]
  )

  // handleRefesh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchBlockchainData();
      toast({
        title: "Refreshed",
      });
    } finally {
      setIsRefreshing(false);
    }
  };


  const latestDifficulty = blocks[0]?.difficulty || 0
  const displayedBlocks = searchResults.length > 0 ? searchResults : blocks
  const blockchainProgress = blockchainLength > 0 ?
    Math.min((blocks.length / blockchainLength) * 100, 100) : 0

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-2">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-10 w-full md:w-96" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Array(3).fill(0).map((_, i) => (
            <Card key={i}>
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

        <div className="space-y-4">
          <Skeleton className="h-8 w-48 mb-2" />
          {Array(5).fill(0).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="container mx-auto px-4 py-8 space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
              Blockchain Explorer
            </h1>
            <p className="text-muted-foreground mt-1">
              {searchResults.length > 0
                ? `Showing ${searchResults.length} search results`
                : `Exploring ${blockchainLength} blocks with ${totalTransactions} transactions`}
            </p>
          </div>
          <div className="flex gap-2">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search by height, hash, tx, address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-full bg-background/50 backdrop-blur-sm"
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin" />
              )}
            </div>
            <Button
              variant="outline"
              // size="lg"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="gap-2 bg-background/50 backdrop-blur-sm hover:bg-background/70"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-gradient-to-br from-background to-muted/50 border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Blocks
              </CardTitle>
              <Layers className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{blockchainLength}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {blocks[0] ? `Last block ${formatDistanceToNow(new Date(blocks[0].timestamp / 1_000_000), { addSuffix: true })}` : 'N/A'}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-background to-muted/50 border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Transactions
              </CardTitle>
              <ArrowRightLeft className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalTransactions}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {`~${(totalTransactions / blockchainLength).toFixed(1)} tx/block`}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-background to-muted/50 border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Network Difficulty
              </CardTitle>
              <Hash className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{latestDifficulty}</div>
              <Progress value={Math.min(latestDifficulty * 10, 100)} className="h-2 mt-2" />
            </CardContent>
          </Card>
        </div>

        <section className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">
              {searchResults.length > 0 ? 'Search Results' : 'Latest Blocks'}
            </h2>
            {!searchQuery && blocks.length > 0 && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="px-3 py-1 text-sm">
                  Showing {blocks.length - 1} of {blockchainLength} blocks
                </Badge>
                <Progress value={blockchainProgress} className="h-2 w-24" />
              </div>
            )}
          </div>

          {isSearching ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Searching blockchain...</p>
            </div>
          ) : displayedBlocks.length === 0 ? (
            <Card className="bg-background/50 backdrop-blur-sm">
              <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
                <Database className="h-10 w-10 text-muted-foreground" />
                <p className="text-muted-foreground">
                  {searchQuery ? "No matching blocks found" : "No blocks found"}
                </p>
                {searchQuery && (
                  <Button variant="outline" onClick={() => setSearchQuery('')}>
                    Clear search
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {displayedBlocks.map((block) => (
                <Card
                  key={block.hash}
                  className="transition-all hover:border-primary/50 hover:shadow-lg cursor-pointer bg-background/50 backdrop-blur-sm"
                  onClick={() => viewBlockDetails(block)}
                >
                  <CardContent className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                      <div className="md:col-span-2 flex items-center gap-3">
                        <div className="bg-primary/10 p-2 rounded-full">
                          <HardDrive className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">Block {block.height}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatDistanceToNow(new Date(block.timestamp / 1_000_000), { addSuffix: true })}
                          </p>
                        </div>
                      </div>

                      <div className="md:col-span-6">
                        <div className="flex flex-col gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className="flex items-center gap-2 font-mono text-sm hover:text-primary transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  copyToClipboard(block.hash)
                                }}
                              >
                                <span className="truncate">{block.hash}</span>
                                <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Block hash</p>
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className="flex items-center gap-2 font-mono text-sm text-muted-foreground hover:text-primary transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  copyToClipboard(block.last_hash)
                                }}
                              >
                                <span>Prev: </span>
                                <span className="truncate">{block.last_hash}</span>
                                <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Previous block hash</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>

                      <div className="md:col-span-2">
                        <Badge variant="secondary" className="px-3 py-1">
                          {block.data.length} {block.data.length === 1 ? 'tx' : 'txs'}
                        </Badge>
                      </div>

                      <div className="md:col-span-2 flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            viewBlockDetails(block)
                          }}
                        >
                          Details
                          <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {hasMoreBlocks && !searchResults.length && (
            <div ref={observerRef} className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
        </section>
      </div>
    </TooltipProvider>
  )
}

export default ExplorerPage