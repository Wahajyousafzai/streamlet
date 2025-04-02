"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "motion/react"
import { Home, MenuIcon, Video, Share, X } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

interface MenuItem {
  icon: React.ReactNode
  label: string
  href: string
  gradient: string
  iconColor: string
  activeGradient: string
}

const menuItems: MenuItem[] = [
  {
    icon: <Home className="h-5 w-5" />,
    label: "Home",
    href: "/",
    gradient: "radial-gradient(circle, rgba(59,130,246,0.15) 0%, rgba(37,99,235,0.06) 50%, rgba(29,78,216,0) 100%)",
    activeGradient: "radial-gradient(circle, rgba(59,130,246,0.3) 0%, rgba(37,99,235,0.15) 50%, rgba(29,78,216,0.05) 100%)",
    iconColor: "text-blue-500",
  },
  {
    icon: <Video className="h-5 w-5" />,
    label: "Video Call",
    href: "/videocall",
    gradient: "radial-gradient(circle, rgba(249,115,22,0.15) 0%, rgba(234,88,12,0.06) 50%, rgba(194,65,12,0) 100%)",
    activeGradient: "radial-gradient(circle, rgba(249,115,22,0.3) 0%, rgba(234,88,12,0.15) 50%, rgba(194,65,12,0.05) 100%)",
    iconColor: "text-orange-500",
  },
  {
    icon: <Share className="h-5 w-5" />,
    label: "Share Files",
    href: "/sharefiles",
    gradient: "radial-gradient(circle, rgba(34,197,94,0.15) 0%, rgba(22,163,74,0.06) 50%, rgba(21,128,61,0) 100%)",
    activeGradient: "radial-gradient(circle, rgba(34,197,94,0.3) 0%, rgba(22,163,74,0.15) 50%, rgba(21,128,61,0.05) 100%)",
    iconColor: "text-green-500",
  },
]

function Menu() {
  const [isOpen, setIsOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const pathname = usePathname()

  // Detect screen size and update isMobile with debounce
  useEffect(() => {
    let timeoutId: NodeJS.Timeout
    
    const handleResize = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        setIsMobile(window.innerWidth < 1024)
      }, 100)
    }

    handleResize() // Run once on mount
    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
      clearTimeout(timeoutId)
    }
  }, [])

  // Handle clicks outside the menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isOpen &&
        menuRef.current &&
        buttonRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isOpen])

  // Close menu when pressing Escape key
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (isOpen && event.key === "Escape") {
        setIsOpen(false)
      }
    }

    document.addEventListener("keydown", handleEscKey)
    return () => {
      document.removeEventListener("keydown", handleEscKey)
    }
  }, [isOpen])

  // Lock body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Close menu when path changes
  useEffect(() => {
    setIsOpen(false)
  }, [pathname])

  // Only render on mobile
  if (!isMobile) return null

  return (
    <div>
      {/* Mobile menu button */}
      <motion.button
        ref={buttonRef}
        className="fixed top-4 right-4 z-50 p-2 rounded-full bg-background/90 backdrop-blur-lg border border-border/40 shadow-md"
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        aria-expanded={isOpen}
        aria-label={isOpen ? "Close menu" : "Open menu"}
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <MenuIcon className="h-6 w-6" />
        )}
      </motion.button>

      {/* Mobile menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-40 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label="Mobile menu"
          >
            {/* Backdrop - clicking here will close the menu */}
            <motion.div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
            />

            {/* Menu content */}
            <motion.nav
              ref={menuRef}
              className="p-6 rounded-2xl bg-background/85 backdrop-blur-lg border border-white/10 shadow-xl relative flex flex-col items-center justify-center w-[90%] max-w-sm mx-auto"
              initial={{ opacity: 0, scale: 0.9, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -20 }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
            >
              <motion.ul
                className="flex flex-col items-center gap-4 w-full"
                variants={{
                  hidden: { opacity: 0 },
                  show: {
                    opacity: 1,
                    transition: {
                      staggerChildren: 0.08,
                    },
                  },
                }}
                initial="hidden"
                animate="show"
              >
                {menuItems.map((item) => {
                  const isActive = pathname === item.href
                  
                  return (
                    <motion.li
                      key={item.label}
                      className="relative w-full"
                      variants={{
                        hidden: { opacity: 0, y: 20 },
                        show: { opacity: 1, y: 0 },
                      }}
                    >
                      <Link href={item.href} onClick={() => setIsOpen(false)} className="block w-full">
                        <motion.div
                          className={`flex items-center gap-3 px-5 py-4 rounded-xl text-base font-medium transition ${
                            isActive 
                              ? 'bg-white/20 text-black shadow-lg' 
                              : 'bg-white/10 text-black/50 hover:text-black'
                          }`}
                          style={{
                            background: isActive 
                              ? `linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.1) 100%)`
                              : `linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)`,
                            boxShadow: isActive 
                              ? "0 8px 32px rgba(0, 0, 0, 0.2)"
                              : "0 8px 32px rgba(0, 0, 0, 0.1)",
                          }}
                          whileHover={{
                            scale: 1.02,
                            boxShadow: "0 10px 40px rgba(0, 0, 0, 0.2)",
                            background: `linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.08) 100%)`,
                          }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <motion.div
                            className={`${item.iconColor} p-2 rounded-full`}
                            style={{ background: isActive ? item.activeGradient : item.gradient }}
                          >
                            {item.icon}
                          </motion.div>
                          <span>{item.label}</span>
                          {isActive && (
                            <motion.div 
                              className="ml-auto flex items-center justify-center"
                              layoutId="activeIndicator"
                            >
                              <span className="w-3 h-3 rounded-full bg-white shadow-glow" 
                                style={{
                                  boxShadow: "0 0 8px 2px rgba(255, 255, 255, 0.6)"
                                }}
                              />
                            </motion.div>
                          )}
                        </motion.div>
                      </Link>
                    </motion.li>
                  )
                })}
              </motion.ul>
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default Menu

export function MenuBar() {
  return (
    <div className="flex justify-evenly items-center absolute w-full z-50">
      <span className="flex justify-evenly items-center">
        <Menu />
      </span>
    </div>
  )
}