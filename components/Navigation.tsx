"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { Home, Video, Share } from "lucide-react"
import { motion } from "motion/react"
import Link from "next/link"
import { Button } from "./ui/button"

const navLinks = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/videocall", icon: Video, label: "Video Call" },
  { href: "/sharefiles", icon: Share, label: "Share Files" },
]

export function Navigate() {
  const [isMounted, setIsMounted] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    setIsMounted(true)
  }, [])

  if (!isMounted) return null

  return (
    <nav className="fixed left-6 top-1/2 -translate-y-1/2 z-50 hidden lg:block">
      <motion.div
        className="flex flex-col gap-6 p-3 rounded-2xl border border-white/30 shadow-xl 
                  bg-white/10 backdrop-blur-xs transition-all hover:backdrop-blur-lg"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        {navLinks.map(({ href, icon: Icon, label }, index) => {
          const isActive = pathname === href

          return (
            <Link key={href} href={href} className="group">
              <Button
                variant="ghost"
                size="lg"
                className={`relative flex items-center justify-center p-3 rounded-xl 
                            transition-colors duration-150 group-hover:bg-black/20
                            ${isActive ? "bg-white text-black" : "text-black bg-white/50"}`}
                asChild
                aria-label={label}
              >
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.3,
                    delay: 0.08 * index,
                    type: "spring",
                    stiffness: 250,
                    damping: 15,
                  }}
                >
                  <Icon size={28} className="text-black" />
                  <span
                    className="absolute left-14 opacity-0 group-hover:opacity-100 transition-opacity 
                             text-white bg-black/70 px-2 py-1 rounded-lg text-sm"
                  >
                    {label}
                  </span>
                </motion.div>
              </Button>
            </Link>
          )
        })}
      </motion.div>
    </nav>
  )
}
