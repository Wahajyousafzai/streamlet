import type { Metadata } from "next";
import { Inter, Azeret_Mono as Geist_Mono } from "next/font/google";
import { Navigate } from "@/components/Navigation";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";
import { PeerProvider } from "@/contexts/PeerContext";
import { MenuBar } from "@/components/menu-bar";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "File Sharing and Video Call App",
  description: "A peer-to-peer file sharing and Video Calling app Fast and Secure ",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${geistMono.variable} antialiased`}>
        <PeerProvider>
          <MenuBar />
          <main>{children}</main>
          <Toaster />
          <Navigate />
        </PeerProvider>
      </body>
    </html>
  );
}
