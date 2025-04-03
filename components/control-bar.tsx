"use client"

import { useRef, useState } from "react"
import { Mic, MicOff, Video, VideoOff, Phone, PhoneOff, Image, Share } from "lucide-react"

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
  isScreenSharing?: boolean
  startScreenShare?: () => void
  stopScreenShare?: () => void
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
  isScreenSharing = false,
  startScreenShare = () => {},
  stopScreenShare = () => {},
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

  return (
    <div className="flex items-center justify-center space-x-3 bg-transparent">
      {/* Audio Button */}
      <button
        onClick={toggleAudio}
        disabled={isLoading}
        className={`p-3 rounded-full ${
          isAudioMuted ? "bg-gray-200 text-gray-700" : "bg-gray-100 text-gray-700"
        } hover:bg-gray-200 transition-colors`}
        aria-label={isAudioMuted ? "Unmute" : "Mute"}
      >
        {isAudioMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
      </button>

      {/* Video Button */}
      <button
        onClick={toggleVideo}
        disabled={isLoading}
        className={`p-3 rounded-full ${
          !isVideoEnabled ? "bg-gray-200 text-gray-700" : "bg-gray-100 text-gray-700"
        } hover:bg-gray-200 transition-colors`}
        aria-label={isVideoEnabled ? "Turn off camera" : "Turn on camera"}
      >
        {!isVideoEnabled ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
      </button>

      {/* Camera Switch Button - Only show if device has multiple cameras */}
      {hasMultipleCameras && isVideoEnabled && (
        <button
          onClick={switchCamera}
          disabled={isLoading || !isVideoEnabled}
          className="p-3 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
          aria-label="Switch camera"
          title={`Switch to next camera (Current: ${currentCameraName})`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="M3 7v2a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V7"></path>
            <path d="M9 17v-2a3 3 0 0 1 6 0v2"></path>
            <path d="M3 17h18"></path>
          </svg>
        </button>
      )}

      {/* Call Button */}
      {!remoteStream ? (
        <button
          onClick={startCall}
          disabled={isLoading || !isVideoEnabled || callStatus !== "idle"}
          className={`p-3 rounded-full ${
            isLoading || !isVideoEnabled || callStatus !== "idle"
              ? "bg-gray-200 text-gray-500 cursor-not-allowed"
              : "bg-green-500 text-white hover:bg-green-600"
          } transition-colors`}
          aria-label="Start call"
        >
          <Phone className="h-5 w-5" />
        </button>
      ) : (
        <button
          onClick={endCall}
          disabled={isLoading || callStatus === "ending"}
          className={`p-3 rounded-full ${
            isLoading || callStatus === "ending"
              ? "bg-gray-200 text-gray-500 cursor-not-allowed"
              : "bg-red-500 text-white hover:bg-red-600"
          } transition-colors`}
          aria-label="End call"
        >
          <PhoneOff className="h-5 w-5" />
        </button>
      )}

      {/* Background Button */}
      <div className="relative" ref={backgroundRef}>
        <button
          onClick={() => setShowBackgroundOptions(!showBackgroundOptions)}
          disabled={isLoading}
          className="p-3 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
          aria-label="Background options"
        >
          <Image className="h-5 w-5" />
        </button>

        {/* Background Options Dropdown */}
        {showBackgroundOptions && (
          <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-white rounded-lg shadow-lg p-3 w-64 z-10">
            <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-200">
              <h3 className="text-sm font-medium text-gray-700">Background Settings</h3>
              <button onClick={() => setShowBackgroundOptions(false)} className="text-gray-400 hover:text-gray-600">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Background removal toggle */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-700">Background Removal</span>
              <button
                onClick={() => {
                  // Only toggle if not already in a loading state
                  if (!isLoading) {
                    setBackgroundRemovalEnabled((prev) => !prev)
                  }
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  backgroundRemovalEnabled ? "bg-blue-600" : "bg-gray-200"
                }`}
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
                    >
                      <div className="w-full h-12 bg-gray-200 rounded mb-1 overflow-hidden">
                        <img
                          src={bg.id || "/placeholder.svg"}
                          alt={bg.label}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = "/placeholder.svg?height=48&width=64"
                          }}
                        />
                      </div>
                      <span className="text-xs">{bg.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Share Screen Button */}
      {callStatus === "connected" && (
        <button
          onClick={isScreenSharing ? stopScreenShare : startScreenShare}
          disabled={isLoading}
          className={`p-3 rounded-full ${
            isLoading
              ? "bg-gray-200 text-gray-500 cursor-not-allowed"
              : isScreenSharing
                ? "bg-blue-500 text-white hover:bg-blue-600"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          } transition-colors`}
          aria-label={isScreenSharing ? "Stop sharing" : "Share screen"}
          title={isScreenSharing ? "Stop sharing screen" : "Share your screen"}
        >
          <Share className="h-5 w-5" />
        </button>
      )}
    </div>
  )
}

