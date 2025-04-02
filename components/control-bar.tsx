"use client"

import { useRef, useState, useEffect } from "react"
import { Mic, MicOff, Video, VideoOff, Phone, PhoneOff, Image, Share, SwitchCamera, X } from "lucide-react"
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip"

interface ControlBarProps {
  remoteStream: MediaStream | null
  startCall: () => void
  endCall: () => void
  isAudioMuted: boolean
  toggleAudio: () => void
  isVideoEnabled: boolean
  toggleVideo: () => void
  backgroundRemovalEnabled: boolean
  setBackgroundRemovalEnabled: (enabled: boolean | ((prev: boolean) => boolean)) => void
  selectedBackground: string
  setSelectedBackground: (background: string) => void
  isLoading: boolean
  callStatus: "idle" | "connecting" | "connected" | "ending"
  hasMultipleCameras?: boolean
  switchCamera?: () => void
  currentCameraName?: string
}

export default function ControlBar({
  remoteStream,
  startCall,
  endCall,
  isAudioMuted,
  toggleAudio,
  isVideoEnabled,
  toggleVideo,
  backgroundRemovalEnabled,
  setBackgroundRemovalEnabled,
  selectedBackground,
  setSelectedBackground,
  isLoading,
  callStatus,
  hasMultipleCameras = false,
  switchCamera = () => {},
  currentCameraName = "Camera",
}: ControlBarProps) {
  const [showBackgroundOptions, setShowBackgroundOptions] = useState(false)
  const backgroundRef = useRef<HTMLDivElement>(null)

  // Background options with labels
  const backgroundOptions = [
    { id: "/background/office.avif", label: "Office" },
    { id: "/background/beach.jpg", label: "Beach" },
    { id: "/background/city.jpg", label: "City" },
    { id: "/background/mountains.avif", label: "Mountains" },
  ]

  // Close background menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (backgroundRef.current && !backgroundRef.current.contains(event.target as Node)) {
        setShowBackgroundOptions(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Controls UI consistency based on state
  const buttonBaseClass = "p-3 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-50"
  const activeButtonClass = "bg-blue-500 text-white hover:bg-blue-600"
  const inactiveButtonClass = "bg-gray-100 text-gray-700 hover:bg-gray-200"
  const disabledButtonClass = "bg-gray-200 text-gray-500 cursor-not-allowed"

  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 flex items-center justify-center space-x-4 p-3 bg-white bg-opacity-90 backdrop-blur-sm rounded-full shadow-lg">
      {/* Audio Button */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggleAudio}
              disabled={isLoading}
              className={`${buttonBaseClass} ${
                isAudioMuted ? inactiveButtonClass : activeButtonClass
              } ${isLoading ? disabledButtonClass : ""}`}
              aria-label={isAudioMuted ? "Unmute" : "Mute"}
            >
              {isAudioMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {isAudioMuted ? "Unmute" : "Mute"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Video Button */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggleVideo}
              disabled={isLoading}
              className={`${buttonBaseClass} ${
                isVideoEnabled ? activeButtonClass : inactiveButtonClass
              } ${isLoading ? disabledButtonClass : ""}`}
              aria-label={isVideoEnabled ? "Turn off camera" : "Turn on camera"}
            >
              {!isVideoEnabled ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {isVideoEnabled ? "Turn off camera" : "Turn on camera"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Camera Switch Button - Only show if device has multiple cameras */}
      {hasMultipleCameras && isVideoEnabled && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={switchCamera}
                disabled={isLoading || !isVideoEnabled}
                className={`${buttonBaseClass} ${inactiveButtonClass} ${
                  isLoading || !isVideoEnabled ? disabledButtonClass : ""
                }`}
                aria-label="Switch camera"
              >
                <SwitchCamera className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {`Switch to next camera (Current: ${currentCameraName})`}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Call Button */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={!remoteStream ? startCall : endCall}
              disabled={!remoteStream 
                ? (isLoading || !isVideoEnabled || callStatus !== "idle") 
                : (isLoading || callStatus === "ending")}
              className={`${buttonBaseClass} ${
                !remoteStream
                  ? (isLoading || !isVideoEnabled || callStatus !== "idle"
                      ? disabledButtonClass
                      : "bg-green-500 text-white hover:bg-green-600")
                  : (isLoading || callStatus === "ending"
                      ? disabledButtonClass
                      : "bg-red-500 text-white hover:bg-red-600")
              }`}
              aria-label={!remoteStream ? "Start call" : "End call"}
            >
              {!remoteStream ? <Phone className="h-5 w-5" /> : <PhoneOff className="h-5 w-5" />}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {!remoteStream ? "Start call" : "End call"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Background Button */}
      <div className="relative" ref={backgroundRef}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setShowBackgroundOptions(!showBackgroundOptions)}
                disabled={isLoading}
                className={`${buttonBaseClass} ${
                  backgroundRemovalEnabled ? activeButtonClass : inactiveButtonClass
                } ${isLoading ? disabledButtonClass : ""}`}
                aria-label="Background options"
              >
                <Image className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              Background options
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Background Options Dropdown */}
        {showBackgroundOptions && (
          <div className="absolute bottom-full mb-3 left-1/2 transform -translate-x-1/2 bg-white rounded-lg shadow-lg p-3 w-64 z-10">
            <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-200">
              <h3 className="text-sm font-medium text-gray-700">Background Settings</h3>
              <button 
                onClick={() => setShowBackgroundOptions(false)} 
                className="text-gray-400 hover:text-gray-600 rounded-full p-1 hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Background removal toggle */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-700">Background Removal</span>
              <button
                onClick={() => {
                  if (!isLoading) {
                    setBackgroundRemovalEnabled((prev) => !prev)
                  }
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  backgroundRemovalEnabled ? "bg-blue-600" : "bg-gray-200"
                }`}
                aria-label={backgroundRemovalEnabled ? "Disable background removal" : "Enable background removal"}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    backgroundRemovalEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {backgroundRemovalEnabled && (
              <>
                <p className="text-xs text-gray-500 mb-2">Select Background:</p>
                <div className="grid grid-cols-2 gap-2">
                  {backgroundOptions.map((bg) => (
                    <button
                      key={bg.id}
                      onClick={() => setSelectedBackground(bg.id)}
                      className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all ${
                        selectedBackground === bg.id
                          ? "bg-blue-50 border border-blue-200"
                          : "bg-gray-50 border border-gray-200 hover:bg-gray-100"
                      }`}
                      aria-label={`Select ${bg.label} background`}
                      aria-pressed={selectedBackground === bg.id}
                    >
                      <div className="w-full h-12 bg-gray-200 rounded mb-1 overflow-hidden">
                        <img
                          src={bg.id || "/placeholder.svg"}
                          alt={bg.label}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = "/placeholder.svg"
                          }}
                        />
                      </div>
                      <span className="text-xs font-medium">{bg.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Share Screen Button */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              disabled={isLoading || callStatus !== "connected"}
              className={`${buttonBaseClass} ${
                isLoading || callStatus !== "connected"
                  ? disabledButtonClass
                  : inactiveButtonClass
              }`}
              aria-label="Share screen"
            >
              <Share className="h-5 w-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            Share screen
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}