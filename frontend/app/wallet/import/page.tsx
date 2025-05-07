"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, Wallet, AlertCircle, Upload, Eye, EyeOff } from "lucide-react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useWallet } from "@/lib/wallet-provider"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { isValidPrivateKey } from "@/lib/crypto-utils"

export default function ImportWalletPage() {
  const [privateKey, setPrivateKey] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const { importWallet, isLoading } = useWallet()
  const [error, setError] = useState("")
  const [importing, setImporting] = useState(false)
  const [showPrivateKey, setShowPrivateKey] = useState(false)
  const [passwordError, setPasswordError] = useState("")

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setPasswordError("")

    if (!privateKey.trim()) {
      setError("Please enter your private key")
      return
    }

    if (!isValidPrivateKey(privateKey)) {
      setError("Invalid private key format. Must be 64-character hex string.")
      return
    }

    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match")
      return
    }

    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters long")
      return
    }

    try {
      setImporting(true)
      await importWallet(privateKey.trim(), password)
    } catch (err) {
      console.error("Import error:", err)
      setError(err instanceof Error ? err.message : "Failed to import wallet. Key may be invalid.")
    } finally {
      setImporting(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="max-w-md mx-auto wallet-section mt-10"
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
            <Wallet className="h-5 w-5" /> Import Wallet
          </CardTitle>
          <CardDescription>Import an existing wallet using your private key</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleImport} className="space-y-4">
            <div className="space-y-2">
              <div className="relative">
                <Input
                  type={showPrivateKey ? "text" : "password"}
                  placeholder="Enter your 64-character private key"
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  className="font-mono pr-10"
                  aria-label="Private key"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  type="button"
                  onClick={() => setShowPrivateKey(!showPrivateKey)}
                >
                  {showPrivateKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>

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

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4 mr-2" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {passwordError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4 mr-2" />
                  <AlertDescription>{passwordError}</AlertDescription>
                </Alert>
              )}

              <p className="text-xs text-muted-foreground">
                Private keys are 64-character hexadecimal strings. The password will be used to encrypt your key.
              </p>
            </div>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button
            onClick={handleImport}
            className="w-full"
            disabled={isLoading || importing || !privateKey.trim() || !password || !confirmPassword}
          >
            {importing ? (
              <>
                <LoadingSpinner className="mr-2" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Import Wallet
              </>
            )}
          </Button>

          <Button variant="link" className="text-xs" asChild>
            <Link href="/wallet/create">
              Don't have a wallet? Create one instead
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </motion.div>
  )
}