"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Wallet, BarChart2, History, Settings, Menu, X, Sun, Moon, LogOut, ArrowRight, ArrowBigRightDash } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { useTheme } from "next-themes"
import { useAuth } from "@/lib/auth-provider"
import { useWallet } from "@/lib/wallet-provider"

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Explorer", href: "/explorer", icon: BarChart2 },
  { name: "Transactions", href: "/transactions", icon: History },
  { name: "Settings", href: "/settings", icon: Settings },
]

export function Navbar() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme } = useTheme()
  const { isAuthenticated } = useAuth()
  const { wallet, logout } = useWallet()

  // Mock wallet data - in a real app, this would come from your wallet provider
  useEffect(() => {
    // Simulate fetching wallet balance

    setMounted(true)
  }, [])

  const toggleMenu = () => {
    setIsOpen(!isOpen)
  }


  useEffect(() => {
    setMounted(true);

  }, []);

  if (!mounted) return null;


  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2">
            <div className="relative h-8 w-8 overflow-hidden rounded-full bg-gradient-wallet">
              <div className="absolute inset-0 flex items-center justify-center text-white font-bold">AG</div>
            </div>
            <span className="hidden font-bold sm:inline-block">ANTIG</span>
          </Link>

          {/* Desktop Navigation */}
          {isAuthenticated && (
            <nav className="hidden md:flex md:items-center md:gap-6 md:ml-6">
              {navItems.map((item) => {
                const isActive = pathname === item.href
                const Icon = item.icon

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-1 text-sm font-medium transition-colors hover:text-primary ${isActive ? "text-primary" : "text-muted-foreground"
                      }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.name}</span>
                  </Link>
                )
              })}
            </nav>
          )}

        </div>

        <div className="flex items-center gap-4">
          {/* Wallet Balance */}
          {isAuthenticated && (
            <div className="hidden sm:flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="font-medium">{wallet?.balance} ANTIG</span>
            </div>
          )}
          {/* Connect Wallet Button */}
          {!isAuthenticated && (
            <div className="flex flex-col sm:flex-row gap-4 ">
              <Button asChild size="lg" className="px-2 py-2 text-sm shadow-md hover:scale-105 transition">
                <Link href="/wallet/create">
                  Create Wallet <ArrowRight className="h-2 w-2 " />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="px-2 py-2 text-sm hover:border-muted-foreground hover:scale-105 transition"
              >
                <Link href="/wallet/import">
                  Import Wallet <Wallet className="h-2 w-2 ml-2" />
                </Link>
              </Button>
            </div>
          )}
          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle Theme"
            className="rounded-full"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {mounted && theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>

          {/* User Menu */}
          {isAuthenticated && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="rounded-full p-0 h-8 w-8">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src="/placeholder-user.jpg" alt="User" />
                      <AvatarFallback>U</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>

                    <Link href="/dashboard" className="flex items-center gap-2">
                      <Wallet className="h-4 w-4" />
                      <span>Wallet</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Link href="/transactions" className="flex items-center gap-2">
                      <History className="h-4 w-4" />
                      <span>Transactions</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Link href="/settings" className="flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      <span>Settings</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive">
                    {isAuthenticated && wallet?.address && (
                      <Button variant="outline" className="w-full" onClick={logout}>
                        <LogOut className="h-4 w-4 mr-2" />
                        Logout
                      </Button>
                    )}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle Menu"
            className="md:hidden rounded-full"
            onClick={toggleMenu}
          >
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Navigation */}
      {isOpen && isAuthenticated && (
        <div className="md:hidden border-t border-border/40 animate-fade-in">
          <nav className="container py-4 flex flex-col gap-4">
            {navItems.map((item) => {
              const isActive = pathname === item.href
              const Icon = item.icon

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 p-2 rounded-md ${isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    }`}
                  onClick={() => setIsOpen(false)}
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.name}</span>
                </Link>
              )
            })}

            <div className="flex items-center justify-between p-2 rounded-md bg-muted mt-2">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span className="font-medium">{wallet?.balance} ANTIG</span>
              </div>

            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
