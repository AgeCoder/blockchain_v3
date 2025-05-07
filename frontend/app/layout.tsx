import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { WalletProvider } from "@/lib/wallet-provider"
import { Navbar } from "@/components/navbar"
import { Toaster } from "@/components/ui/toaster"
import { ThemeProvider } from "@/components/theme-provider"

import { AuthProvider } from "@/lib/auth-provider"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Blockchain Explorer",
  description: "A secure ANTIG and explorer",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <WalletProvider>
            <AuthProvider>
              <Navbar />
              <div className="flex min-h-screen">
                <main className="flex-1 overflow-x-hidden">{children}</main>
              </div>
              <footer className="border-t py-6 md:py-0">
                <div className="container flex flex-col md:h-16 items-center justify-between gap-4 md:flex-row">
                  <p className="text-sm text-muted-foreground">
                    &copy; {new Date().getFullYear()} ANTIG. All rights reserved.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Network Status: <span className="text-green-500">Connected</span>
                  </p>
                </div>
              </footer>
              <Toaster />
            </AuthProvider>
          </WalletProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}





