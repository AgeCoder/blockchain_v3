"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"
import { Home, Wallet, Database, History, Settings, LogOut, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { useWallet } from "@/lib/wallet-provider"
import { useAuth } from "@/lib/auth-provider"

export function AppSidebar() {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const { wallet, logout } = useWallet()
  const { isAuthenticated } = useAuth()

  const isActive = (path: string) => pathname === path

  return (
    <Sidebar>
      <SidebarHeader className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2">
          <Database className="h-6 w-6" />
          <span className="font-bold text-lg">BlockChain</span>
        </div>
        <SidebarTrigger />
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/")}>
              <Link href="/">
                <Home className="h-4 w-4" />
                <span>Home</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {isAuthenticated && (
            <>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/dashboard")}>
                  <Link href="/dashboard">
                    <Wallet className="h-4 w-4" />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/explorer")}>
                  <Link href="/explorer">
                    <Database className="h-4 w-4" />
                    <span>Explorer</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/transactions")}>
                  <Link href="/transactions">
                    <History className="h-4 w-4" />
                    <span>Transactions</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/settings")}>
                  <Link href="/settings">
                    <Settings className="h-4 w-4" />
                    <span>Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </>
          )}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <div className="p-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="mb-2 w-full"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            <span className="ml-2">{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
          </Button>

          {isAuthenticated && wallet?.address && (
            <Button variant="outline" className="w-full" onClick={logout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
