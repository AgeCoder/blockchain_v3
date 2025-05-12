import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/lib/wallet-provider";
import { Navbar } from "@/components/navbar";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/lib/auth-provider";
import Footer from "@/components/Footer";
import BackendCheckWrapper from "@/components/BackendCheckWrapper";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Blockchain Explorer",
  description: "A secure ANTIG and explorer",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <WalletProvider>
            <AuthProvider>
              <BackendCheckWrapper>
                <div className="flex min-h-screen">
                  <main className="flex-1 overflow-x-hidden">{children}</main>
                </div>
              </BackendCheckWrapper>
              <Toaster />
            </AuthProvider>
          </WalletProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}