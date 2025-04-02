"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "motion/react"
import { usePeer } from "@/contexts/PeerContext"
import { QRCodeSVG } from "qrcode.react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Copy, Link, UserMinus, QrCode } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export default function Home() {
  const { peerId, isConnected, connectedPeerId, connectToPeer, disconnectPeer } = usePeer()
  const [recipientId, setRecipientId] = useState("")
  const [showQR, setShowQR] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    console.log("Home page - Connection state:", { isConnected, connectedPeerId })
  }, [isConnected, connectedPeerId])

  const copyPeerId = () => {
    navigator.clipboard.writeText(peerId)
    toast({ title: "Peer ID Copied", description: "Your Peer ID has been copied to the clipboard." })
  }

  const handleConnect = () => {
    if (recipientId.trim()) {
      connectToPeer(recipientId.trim())
    } else {
      toast({
        title: "Invalid Peer ID",
        description: "Please enter a valid Peer ID to connect.",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="relative min-h-screen w-full bg-[radial-gradient(ellipse_at_bottom_right,_#edf7fa,_#5f6caf,_#ffb677)]">
      {/* Orbital floating elements for visionOS feel */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full bg-purple-500/10 blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/3 w-80 h-80 rounded-full bg-blue-500/10 blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
        <div className="absolute top-1/3 right-1/4 w-72 h-72 rounded-full bg-indigo-500/10 blur-3xl animate-pulse" style={{ animationDelay: "2s" }} />
      </div>
      
      <div className="relative z-10 flex items-center justify-center min-h-screen p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-lg"
        >
          <div className="backdrop-blur-2xl rounded-3xl border border-white/20 shadow-2xl overflow-hidden p-8 bg-black/10">
            {/* Glassmorphism effect for visionOS */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-white/5 rounded-3xl pointer-events-none" />
            
            <h2 className="text-3xl font-medium text-center text-white mb-8">P2P File Sharing & Video Call</h2>

            {/* Peer ID Section */}
            <div className="space-y-4 mb-8">
              <p className="text-white/70 text-center">Your Peer ID:</p>
              <div className="flex items-center gap-4">
                <div className="flex-1 px-4 py-3 bg-black/20 rounded-2xl border border-white/10 backdrop-blur-md font-mono text-white text-sm">
                  {peerId}
                </div>
                <Button onClick={copyPeerId} variant="ghost" size="icon" className="text-white bg-black/20 hover:bg-black/30 rounded-xl backdrop-blur-md">
                  <Copy size={20} />
                </Button>
                <Button
                  onClick={() => setShowQR(true)}
                  variant="ghost"
                  size="icon"
                  className="text-white bg-black/20 hover:bg-black/30 rounded-xl backdrop-blur-md"
                >
                  <QrCode size={20} />
                </Button>
              </div>
            </div>

            {/* Connect Section */}
            <div className="space-y-4 mb-8">
              <Input
                value={recipientId}
                onChange={(e) => setRecipientId(e.target.value)}
                placeholder="Enter recipient's Peer ID"
                className="bg-black/20 border-white/10 text-white placeholder:text-white/50 rounded-xl backdrop-blur-md focus:border-white/30 focus:ring-white/20"
                style={{
                  WebkitAppearance: "none",
                  color: "white"
                }}
              />
              <Button
                onClick={handleConnect}
                className="w-full bg-black/20 hover:bg-black/30 text-white border border-white/10 rounded-xl backdrop-blur-md transition-all duration-300"
              >
                <Link size={20} className="mr-2" />
                Connect
              </Button>
            </div>

            {/* Disconnect Button */}
            {isConnected && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
              >
                <Button
                  onClick={disconnectPeer}
                  variant="destructive"
                  className="w-full bg-red-500/30 hover:bg-red-500/40 text-red-200 border border-red-500/20 rounded-xl backdrop-blur-md"
                >
                  <UserMinus size={20} className="mr-2" />
                  Disconnect
                </Button>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>

      {/* QR Code Modal */}
      <AnimatePresence>
        {showQR && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowQR(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="p-8 rounded-3xl border border-white/20 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center">
                <h3 className="text-xl font-medium text-white mb-4">Your Peer ID QR Code</h3>
                <div className="bg-white p-4 rounded-2xl shadow-inner">
                  <QRCodeSVG value={peerId} size={200} />
                </div>
                <Button 
                  onClick={() => setShowQR(false)} 
                  variant="ghost" 
                  className="mt-6 text-white bg-black/20 hover:bg-black/30 rounded-xl backdrop-blur-md border border-white/10"
                >
                  Close
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}