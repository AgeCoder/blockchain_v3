"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Wallet, ArrowLeft, Copy, Download, Eye, EyeOff, Shield } from "lucide-react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { useWallet } from "@/lib/wallet-provider"
import { LoadingSpinner } from "@/components/ui/loading-spinner"

export default function CreateWalletPage() {
  const { generateWallet, isLoading } = useWallet()
  const router = useRouter()
  const { toast } = useToast()
  const [privateKey, setPrivateKey] = useState<string>("")
  const [address, setAddress] = useState<string>("")
  const [showPrivateKey, setShowPrivateKey] = useState(false)
  const [step, setStep] = useState<"create" | "backup" | "password">("create")
  const [creatingWallet, setCreatingWallet] = useState(false)
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordError, setPasswordError] = useState("")

  const handleGenerateWallet = async () => {
    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match")
      return
    }
    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters long")
      return
    }

    try {
      setCreatingWallet(true)
      const newWallet = await generateWallet(password)
      setPrivateKey(newWallet.privateKey)
      setAddress(newWallet.address)
      setStep("backup")
    } catch (error) {
      console.error("Failed to generate wallet:", error)
      toast({
        title: "Error",
        description: "Failed to generate wallet. Please try again.",
        variant: "destructive",
      })
    } finally {
      setCreatingWallet(false)
    }
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
    element.download = `antig-wallet-${new Date().toISOString()}.txt`
    document.body.appendChild(element)
    element.click()
    document.body.removeChild(element)
    toast({
      title: "Downloaded",
      description: "Private key has been downloaded",
    })
  }

  const continueToWallet = () => {
    router.push("/dashboard")
  }

  if (step === "create") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="container max-w-md mx-auto px-4 py-4"
      >
        <Button variant="ghost" className="mb-6" asChild>
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Link>
        </Button>

        <Card className="wallet-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" /> Create New Wallet
            </CardTitle>
            <CardDescription>Generate a new ANTIG wallet</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center items-center py-2">
              <Shield className="h-28 w-28 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">
              We'll generate a new wallet for you with a secure private key. You'll need to set a password to encrypt your key.
            </p>
          </CardContent>
          <CardFooter>
            <Button onClick={() => setStep("password")} className="w-full" disabled={isLoading || creatingWallet}>
              Create Wallet
            </Button>
          </CardFooter>
        </Card>
      </motion.div>
    )
  }

  if (step === "password") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="container max-w-md mx-auto px-4 py-4"
      >
        <Button variant="ghost" className="mb-6" asChild>
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Link>
        </Button>

        <Card className="wallet-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" /> Set Password
            </CardTitle>
            <CardDescription>Protect your wallet with a secure password</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-label="Password"
              />
              <Input
                type="password"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                aria-label="Confirm password"
              />
              {passwordError && (
                <Alert variant="destructive">
                  <AlertDescription>{passwordError}</AlertDescription>
                </Alert>
              )}
              <p className="text-xs text-muted-foreground">
                Password must be at least 8 characters long. This will be used to encrypt your private key.
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              onClick={handleGenerateWallet}
              className="w-full"
              disabled={isLoading || creatingWallet || !password || !confirmPassword}
            >
              {creatingWallet ? (
                <>
                  <LoadingSpinner className="mr-2" />
                  Creating...
                </>
              ) : (
                "Generate Wallet"
              )}
            </Button>
          </CardFooter>
        </Card>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="container max-w-md mx-auto px-4 py-12"
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" /> Backup Your Private Key
          </CardTitle>
          <CardDescription>Save this key in a secure location</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertDescription>
              This is the only time we'll show you your private key. If you lose it, you'll lose access to your wallet
              forever.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <div className="text-sm font-medium">Your Wallet Address:</div>
            <div className="p-3 bg-muted rounded-md font-mono text-xs break-all">
              {address}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Your Private Key:</div>
            <div className="relative">
              <div className="p-3 bg-muted rounded-md font-mono text-xs break-all relative">
                {showPrivateKey ? privateKey : "•".repeat(64)}
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
        <CardFooter className="flex flex-col gap-2">
          <Button onClick={continueToWallet} className="w-full">
            I've Backed Up My Key
          </Button>
          <p className="text-xs text-center text-muted-foreground mt-2">
            By continuing, you confirm that you've securely saved your private key.
          </p>
        </CardFooter>
      </Card>
    </motion.div>
  )
}