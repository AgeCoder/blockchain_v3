"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Download, Copy, Eye, EyeOff, RefreshCw, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useToast } from "@/hooks/use-toast"
import { useWallet } from "@/lib/wallet-provider"
import { decryptprivateKey } from "@/lib/utils"

export default function SettingsPage() {
  const { wallet, isLoading, refreshWallet, logout } = useWallet()
  const router = useRouter()
  const { toast } = useToast()
  const [showPrivateKey, setShowPrivateKey] = useState(false)
  const [privateKey, setPrivateKey] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)

  useEffect(() => {
    getkeys()
  }, [])

  const getkeys = async () => {
    if (typeof window !== "undefined") {
      const encryptedprivateKey = localStorage.getItem("privateKey")

      if (encryptedprivateKey) {
        const privateKey = await decryptprivateKey(encryptedprivateKey, "aligthage.online.v2");
        console.log(privateKey);
        setPrivateKey(privateKey)
      } else {
        setPrivateKey('')
      }
    }
  }


  if (isLoading) {
    return (
      <div className="container max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Settings</h1>
        <div className="flex justify-center items-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (!wallet) {
    router.push("/wallet/import")
    return null
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(privateKey)
    toast({
      title: "Copied!",
      description: "Private key copied to clipboard",
    })
  }

  const downloadPrivateKey = () => {
    const element = document.createElement("a")
    const file = new Blob([privateKey], { type: "text/plain" })
    element.href = URL.createObjectURL(file)
    element.download = `blockchain-wallet-${wallet.address.substring(0, 8)}.pem`
    document.body.appendChild(element)
    element.click()
    document.body.removeChild(element)
    toast({
      title: "Downloaded",
      description: "Private key has been downloaded",
    })
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await refreshWallet()
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleLogout = () => {
    logout()
  }

  return (
    <div className="container max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Settings</h1>

      <Tabs defaultValue="wallet" className="mb-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="wallet">Wallet</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="wallet" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Wallet Information</CardTitle>
              <CardDescription>View and manage your wallet details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Address</Label>
                <div className="flex items-center mt-1">
                  <div className="bg-muted p-2 rounded text-xs font-mono truncate flex-1">{wallet.address}</div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      navigator.clipboard.writeText(wallet.address)
                      toast({
                        title: "Copied!",
                        description: "Address copied to clipboard",
                      })
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Balance</Label>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-2xl font-bold">{wallet.balance.toFixed(2)}</p>
                  <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Private Key Backup</CardTitle>
              <CardDescription>Securely backup your private key</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Warning</AlertTitle>
                <AlertDescription>
                  Never share your private key with anyone. Anyone with your private key has full access to your wallet.
                </AlertDescription>
              </Alert>

              <div className="relative">
                <div className="p-3 bg-muted rounded-md font-mono text-xs break-all relative">
                  {showPrivateKey ? privateKey : "•".repeat(Math.min(privateKey.length, 50))}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-2"
                    onClick={() => setShowPrivateKey(!showPrivateKey)}
                  >
                    {showPrivateKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={copyToClipboard}>
                  <Copy className="mr-2 h-4 w-4" /> Copy
                </Button>
                <Button variant="outline" className="flex-1" onClick={downloadPrivateKey}>
                  <Download className="mr-2 h-4 w-4" /> Download
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
              <CardDescription>Manage your wallet security preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-lock">Auto-lock wallet</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically lock your wallet after 15 minutes of inactivity
                  </p>
                </div>
                <Switch id="auto-lock" />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="encrypt-storage">Encrypt local storage</Label>
                  <p className="text-sm text-muted-foreground">
                    Add an extra layer of encryption to your stored private key
                  </p>
                </div>
                <Switch id="encrypt-storage" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Session Management</CardTitle>
              <CardDescription>Manage your current session</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive" onClick={handleLogout} className="w-full">
                Logout
              </Button>
            </CardContent>
            <CardFooter>
              <p className="text-xs text-muted-foreground">
                This will remove your wallet from this device. Make sure you have backed up your private key before
                logging out.
              </p>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
