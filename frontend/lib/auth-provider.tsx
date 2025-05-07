"use client"

import React, { createContext, useContext, useEffect, useState, useCallback } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useWallet } from "@/lib/wallet-provider"
import { useToast } from "@/hooks/use-toast"

interface AuthContextType {
  user: { address: string } | null
  loading: boolean
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAuthenticated: false,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { wallet, isLoading } = useWallet()
  const [user, setUser] = useState<{ address: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const { toast } = useToast()

  const protectedRoutes = ["/dashboard", "/transactions", "/settings", "/explorer"]
  const publicOnlyRoutes = ["/wallet/create", "/wallet/import"]

  const checkAuth = useCallback(() => {
    if (isLoading) return
    try {
      if (wallet) {
        setUser({ address: wallet.address })
        setIsAuthenticated(true)
        // if (publicOnlyRoutes.includes(pathname)) {
        //   router.push("/dashboard")
        // }
      } else {
        setUser(null)
        setIsAuthenticated(false)
        if (protectedRoutes.includes(pathname)) {
          toast({
            title: "Authentication Required",
            description: "Please create or import a wallet to continue",
          })
          router.push("/")
        }
      }
    } catch (error) {
      console.error("Auth check failed:", error)
      setUser(null)
      setIsAuthenticated(false)
    } finally {
      setLoading(false)
    }
  }, [wallet, isLoading, pathname, router, toast])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  return (
    <AuthContext.Provider value={{ user, loading, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}