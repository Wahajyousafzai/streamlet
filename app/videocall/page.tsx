"use client"
import { useEffect, useState, useRef, useCallback } from "react"
import { usePeer } from "@/contexts/PeerContext"
import type { MediaConnection } from "peerjs"
import ControlBar from "@/components/control-bar"
import BackgroundProcessor from "@/components/background-processor"
import { motion } from "motion/react"
import { useCameraSwitch } from "@/hooks/use-camera-switch"
import { useToast } from "@/hooks/use-toast"
import { VideoIcon } from "lucide-react"

// Define custom interfaces for extended browser APIs
interface ExtendedRTCPeerConnection extends RTCPeerConnection {
  getDataChannels?: () => RTCDataChannel[]
  dataChannel?: RTCDataChannel
  dataChannels?: RTCDataChannel[]
}

interface ExtendedNavigator extends Navigator {
  scheduling?: {
    isInputPending?: () => boolean
  }
}

export default function Home() {
  const { peer, connectedPeerId, setConnectedPeerId } = usePeer()
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [selectedBackground, setSelectedBackground] = useState("/background/office.avif")
  const [backgroundRemovalEnabled, setBackgroundRemovalEnabled] = useState(false)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [activeCall, setActiveCall] = useState<MediaConnection | null>(null)
  const [isAudioMuted, setIsAudioMuted] = useState(false)
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [callStatus, setCallStatus] = useState<"idle" | "connecting" | "connected" | "ending">("idle")
  const [callDuration, setCallDuration] = useState(0)
  const [callStartTime, setCallStartTime] = useState<number | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const { toast } = useToast()

  // Flag to track if background removal is in progress
  const [isBackgroundProcessing, setIsBackgroundProcessing] = useState(false)
  // Ref to store the processed stream
  const processedStreamRef = useRef<MediaStream | null>(null)
  // Ref to track if we need to update the remote stream
  const needsRemoteUpdateRef = useRef<boolean>(false)

  // Add these new state variables after the other state declarations (around line 30)
  const [isScreenSharing, setIsScreenSharing] = useState(false) // Fixed: Initialize with false instead of itself
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null)
  const [previousStream, setPreviousStream] = useState<MediaStream | null>(null)
  const [isPageVisible, setIsPageVisible] = useState(true)
  const keepAliveIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Use the camera switch hook
  const {
    stream: cameraStream,
    switchCamera,
    hasMultipleCameras,
    currentCameraName,
    isInitialized,
    error: cameraError,
    startStream,
    devices,
    currentDeviceIndex,
  } = useCameraSwitch()

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const backgroundImageRef = useRef<HTMLImageElement | null>(null)

  // Preload background images
  const preloadImages = useCallback((imagePaths: string[]) => {
    return Promise.all(
      imagePaths.map((path) => {
        return new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image()
          img.crossOrigin = "anonymous"
          img.src = path
          img.onload = () => {
            console.log(`✅ Preloaded: ${path}`)
            resolve(img)
          }
          img.onerror = () => {
            console.error(`❌ Failed to preload: ${path}`)
            reject(new Error(`Failed to load image: ${path}`))
          }
        })
      }),
    )
  }, [])

  // Memoize the shouldMirrorStream function
  const shouldMirrorStream = useCallback((): boolean => {
    // If it's explicitly a front camera, mirror it
    if (currentCameraName === "Front Camera") {
      return true
    }

    // For devices with only one camera (like laptops), assume it's front-facing
    if (!hasMultipleCameras) {
      return true
    }

    // For other cases, check if the camera label contains keywords suggesting it's front-facing
    if (devices && devices.length > 0) {
      const currentDevice = devices[currentDeviceIndex]
      if (currentDevice && currentDevice.label) {
        const label = currentDevice.label.toLowerCase()
        return label.includes("front") || label.includes("user") || label.includes("face")
      }
    }

    return false
  }, [currentCameraName, hasMultipleCameras, devices, currentDeviceIndex])

  // Memoize the mirrorVideoStream function
  const mirrorVideoStream = useCallback(
    (inputStream: MediaStream): Promise<MediaStream> => {
      // If we shouldn't mirror this stream, return it as is
      if (!shouldMirrorStream()) {
        return Promise.resolve(inputStream)
      }

      console.log("Creating mirrored stream (optimized)")

      // For local display, we'll use CSS transform instead of canvas processing
      // This function is only for outgoing streams that need mirroring

      try {
        // Create a video element to display the input stream
        const videoElement = document.createElement("video")
        videoElement.srcObject = inputStream
        videoElement.autoplay = true
        videoElement.muted = true
        videoElement.playsInline = true

        // Get video dimensions from the track settings
        const videoTrack = inputStream.getVideoTracks()[0]
        const settings = videoTrack.getSettings()
        const width = settings.width || 640
        const height = settings.height || 480

        // Create a canvas with the same dimensions
        const canvas = document.createElement("canvas")
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext("2d", { alpha: false }) // Disable alpha for performance

        if (!ctx) {
          console.error("Could not get canvas context")
          return Promise.resolve(inputStream) // Return original stream if we can't get context
        }

        // Wait for video to be ready
        return new Promise<MediaStream>((resolve) => {
          videoElement.onloadedmetadata = () => {
            videoElement.play().catch((err) => console.error("Error playing video:", err))

            // Create a stream with lower framerate for better performance
            const mirroredStream = canvas.captureStream(20) // 20fps instead of 30fps

            // Add audio tracks from the original stream
            inputStream.getAudioTracks().forEach((track) => {
              try {
                mirroredStream.addTrack(track)
              } catch (err) {
                console.error("Error adding audio track:", err)
              }
            })

            // Use requestAnimationFrame for better performance
            const draw = () => {
              if (videoElement.readyState >= 2) {
                // Flip horizontally - only draw when video has data
                ctx.clearRect(0, 0, canvas.width, canvas.height)
                ctx.save()
                ctx.scale(-1, 1)
                ctx.drawImage(videoElement, -canvas.width, 0, canvas.width, canvas.height)
                ctx.restore()
              }

              // Only continue animation if the stream is active
              if (mirroredStream.active) {
                requestAnimationFrame(draw)
              }
            }

            // Start drawing
            draw()

            resolve(mirroredStream)
          }

          // Fallback if metadata doesn't load within 1 second
          setTimeout(() => {
            if (!videoElement.readyState) {
              console.warn("Video metadata loading timeout, using original stream")
              resolve(inputStream)
            }
          }, 1000)
        })
      } catch (err) {
        console.error("Error in mirrorVideoStream:", err)
        return Promise.resolve(inputStream) // Return original stream on error
      }
    },
    [shouldMirrorStream],
  )

  // Memoize the updateRemoteStream function
  const updateRemoteStream = useCallback(
    async (newStream: MediaStream) => {
      if (!activeCall || !activeCall.peerConnection) {
        console.log("No active call to update")
        return
      }

      try {
        // Mirror the stream if it should be mirrored
        let streamToSend = newStream
        if (shouldMirrorStream()) {
          console.log("Mirroring stream for remote peer")
          streamToSend = await mirrorVideoStream(newStream)
        }

        const videoTrack = streamToSend.getVideoTracks()[0]
        const audioTrack = streamToSend.getAudioTracks()[0]

        if (!videoTrack) {
          console.error("No video track in new stream")
          return
        }

        console.log("Replacing tracks in active connection")

        // Get all senders in the peer connection
        const senders = activeCall.peerConnection.getSenders()

        // Find the video sender and update it
        const videoSender = senders.find((sender) => sender.track && sender.track.kind === "video")

        if (videoSender) {
          // Replace the track
          await videoSender.replaceTrack(videoTrack)
          console.log("✅ Remote video track replaced successfully")
        } else {
          console.error("No video sender found in peer connection")
        }

        // Find and update audio sender if it exists and we have an audio track
        if (audioTrack) {
          const audioSender = senders.find((sender) => sender.track && sender.track.kind === "audio")

          if (audioSender) {
            await audioSender.replaceTrack(audioTrack)
            // Apply current mute state
            audioTrack.enabled = !isAudioMuted
            console.log("✅ Remote audio track replaced successfully")
          }
        }
      } catch (error) {
        console.error("Error updating remote stream:", error)
      }
    },
    [activeCall, shouldMirrorStream, mirrorVideoStream, isAudioMuted],
  )

  // Update local stream when camera stream changes
  useEffect(() => {
    if (cameraStream) {
      // Apply current audio mute state
      const audioTracks = cameraStream.getAudioTracks()
      if (audioTracks.length > 0) {
        audioTracks.forEach((track) => {
          track.enabled = !isAudioMuted
        })
      }

      // Apply current video enabled state
      const videoTracks = cameraStream.getVideoTracks()
      if (videoTracks.length > 0) {
        videoTracks.forEach((track) => {
          track.enabled = isVideoEnabled
        })
      }

      // Set the local stream
      setLocalStream(cameraStream)

      // Update the video source if background removal is not enabled
      if (!backgroundRemovalEnabled && localVideoRef.current) {
        localVideoRef.current.srcObject = cameraStream
      }

      // If we're in a call and background removal is not enabled, update the remote stream
      if (activeCall && !backgroundRemovalEnabled) {
        updateRemoteStream(cameraStream)
      }
    }
  }, [cameraStream, isAudioMuted, isVideoEnabled, activeCall, backgroundRemovalEnabled, updateRemoteStream])

  // Show toast if camera error occurs
  useEffect(() => {
    if (cameraError) {
      toast({
        title: "Camera Error",
        description: cameraError,
        variant: "destructive",
      })
    }
  }, [cameraError, toast])

  // Preload background images when the app starts
  useEffect(() => {
    preloadImages([
      "/background/office.avif",
      "/background/beach.jpg",
      "/background/city.jpg",
      "/background/mountains.avif",
    ]).then(() => console.log("✅ All backgrounds preloaded!"))
  }, [preloadImages])

  // Set remote video source when remote stream changes
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream
    }
  }, [remoteStream])

  // Handle call timer
  useEffect(() => {
    if (callStatus === "connected" && !callStartTime) {
      const startTime = Date.now() // Fresh timestamp
      setCallStartTime(startTime)

      timerRef.current = setInterval(() => {
        setCallDuration(Math.floor((Date.now() - startTime) / 1000)) // Use fresh timestamp
      }, 1000)
    } else if (callStatus !== "connected") {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      setCallStartTime(null)
      setCallDuration(0)
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [callStatus]) // Remove callStartTime from dependencies

  // Format call duration as MM:SS
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  // Memoize the handleBackgroundRemovalToggle function to avoid dependency issues
  const handleBackgroundRemovalToggle = useCallback(
    (enabled: boolean | ((prev: boolean) => boolean)) => {
      // Convert function-style state updates to boolean
      const newEnabled = typeof enabled === "function" ? enabled(backgroundRemovalEnabled) : enabled

      // If already in the desired state or processing, do nothing
      if (backgroundRemovalEnabled === newEnabled || isBackgroundProcessing || isLoading) {
        return
      }

      console.log(`Background removal toggle: ${newEnabled ? "ON" : "OFF"}`)

      // Set loading state
      setIsLoading(true)
      setIsBackgroundProcessing(true)

      // Update the state immediately for UI feedback
      setBackgroundRemovalEnabled(newEnabled)

      // Use an async IIFE to handle the async operations
      ;(async () => {
        try {
          if (!newEnabled) {
            // Turning OFF background removal
            console.log("Turning OFF background removal")

            // Make sure we have a valid local stream before stopping background removal
            if (!localStream) {
              throw new Error("No camera stream available")
            }

            // Create a clone of the local stream to ensure we have a fresh stream
            const freshStream = await navigator.mediaDevices.getUserMedia({
              video: {
                deviceId: localStream.getVideoTracks()[0]?.getSettings()?.deviceId
                  ? {
                      exact: localStream.getVideoTracks()[0].getSettings().deviceId,
                    }
                  : undefined,
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
              audio: localStream.getAudioTracks().length > 0,
            })

            // Apply current audio mute state to the fresh stream
            if (freshStream.getAudioTracks().length > 0) {
              freshStream.getAudioTracks().forEach((track) => {
                track.enabled = !isAudioMuted
              })
            }

            // Apply current video enabled state to the fresh stream
            if (freshStream.getVideoTracks().length > 0) {
              freshStream.getVideoTracks().forEach((track) => {
                track.enabled = isVideoEnabled
              })
            }

            // Stop the rendering loop and clean up WebGL resources
            BackgroundProcessor.stopRendering()
            BackgroundProcessor.cleanup()

            // Clear the processed stream reference
            processedStreamRef.current = null

            // Set the local stream to the fresh stream
            setLocalStream(freshStream)

            // Set the video source to the fresh stream immediately to avoid black screen
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = freshStream
              console.log("Set video source to fresh stream")
            }

            // If in a call, update the remote stream with the fresh stream immediately
            if (activeCall) {
              await updateRemoteStream(freshStream)
              needsRemoteUpdateRef.current = false
            }
          } else {
            // Turning ON background removal
            console.log("Turning ON background removal")

            if (!localStream) {
              throw new Error("No camera stream available")
            }

            // Process the stream with background removal
            const processedStream = await BackgroundProcessor.processStreamWithBackgroundRemoval({
              stream: localStream,
              selectedBackground,
              isAudioMuted,
              canvasRef,
              backgroundImageRef,
              setLocalStream: (stream) => {
                // Store the processed stream in the ref
                processedStreamRef.current = stream

                // Set the video source to the processed stream immediately
                if (localVideoRef.current) {
                  localVideoRef.current.srcObject = stream
                  console.log("Set video source to processed stream")
                }
              },
            })

            // Store the processed stream in the ref
            processedStreamRef.current = processedStream

            // If in a call, update the remote stream with the processed stream immediately
            if (activeCall) {
              await updateRemoteStream(processedStream)
              needsRemoteUpdateRef.current = false
            }
          }
        } catch (error) {
          console.error("Error toggling background removal:", error)

          // If there was an error, revert to the previous state
          setBackgroundRemovalEnabled(!newEnabled)

          // Show error toast
          toast({
            title: "Background Removal Error",
            description: "Failed to toggle background removal. Please try again.",
            variant: "destructive",
          })

          // Clean up if needed
          if (newEnabled) {
            BackgroundProcessor.stopRendering()
            BackgroundProcessor.cleanup()
            processedStreamRef.current = null

            // Make sure we restore the raw stream to the video element
            if (localVideoRef.current && localStream) {
              localVideoRef.current.srcObject = localStream
            }
          }
        } finally {
          // Clear loading states
          setIsLoading(false)
          setIsBackgroundProcessing(false)
        }
      })()
    },
    [
      backgroundRemovalEnabled,
      isBackgroundProcessing,
      isLoading,
      localStream,
      isAudioMuted,
      isVideoEnabled,
      selectedBackground,
      activeCall,
      toast,
      updateRemoteStream,
    ],
  )

  // Memoize the handleIncomingCall function
  const handleIncomingCall = useCallback(
    async (incomingCall: MediaConnection) => {
      console.log("📞 Incoming call from:", incomingCall.peer)
      setCallStatus("connecting")
      setIsLoading(true)

      try {
        // Make sure we have a valid local stream before answering
        let streamToUse = localStream

        // If we don't have a local stream yet, try to get one using the hook's startStream
        if (!streamToUse && startStream) {
          console.log("No local stream available, attempting to create one...")
          const currentDevice = devices && devices.length > 0 ? devices[currentDeviceIndex]?.deviceId : undefined
          streamToUse = await startStream(currentDevice || "", true)

          if (streamToUse) {
            console.log("Successfully created stream for incoming call")
            setLocalStream(streamToUse)
          } else {
            throw new Error("Failed to create camera stream for outgoing call")
          }
        }

        if (!streamToUse) {
          throw new Error("No camera stream available")
        }

        // Use the processed stream if background removal is enabled
        let finalStream =
          backgroundRemovalEnabled && processedStreamRef.current ? processedStreamRef.current : streamToUse

        // Set local video display - always use original stream with CSS mirroring
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = streamToUse
        }

        // Mirror the stream if needed for the outgoing call
        if (shouldMirrorStream()) {
          console.log("Mirroring incoming call stream for remote peer")
          finalStream = await mirrorVideoStream(finalStream)
        }

        // Check if we have audio tracks
        const audioTracks = finalStream.getAudioTracks()
        console.log(`Audio tracks in stream: ${audioTracks.length}`)

        if (audioTracks.length > 0) {
          // Ensure audio track is enabled unless explicitly muted
          audioTracks[0].enabled = !isAudioMuted
          console.log(`Audio track enabled: ${!isAudioMuted}`)
        }

        // Set the connected peer ID
        setConnectedPeerId(incomingCall.peer)

        // Answer the call with our stream
        incomingCall.answer(finalStream)
        setActiveCall(incomingCall) // Store the call reference
        console.log("✅ Auto-Answered the call")

        incomingCall.on("stream", (incomingStream) => {
          console.log("🎬 Receiving Remote Video Stream:", incomingStream)

          // Log audio tracks in incoming stream
          const incomingAudioTracks = incomingStream.getAudioTracks()
          console.log(`Incoming stream audio tracks: ${incomingAudioTracks.length}`)

          // Log video tracks in incoming stream
          const incomingVideoTracks = incomingStream.getVideoTracks()
          console.log(`Incoming stream video tracks: ${incomingVideoTracks.length}`)

          if (incomingVideoTracks.length === 0) {
            console.warn("No video tracks in incoming stream!")
          }

          setRemoteStream(incomingStream)
          setCallStatus("connected")
          setIsLoading(false)
        })

        incomingCall.on("close", () => {
          console.log("❌ Call Ended")
          setRemoteStream(null)
          setCallStatus("idle")
        })
      } catch (error) {
        console.error("Error handling incoming call:", error)
        setCallStatus("idle")
        setIsLoading(false)
        toast({
          title: "Call Error",
          description: "Could not answer the call. Please check your camera and microphone.",
          variant: "destructive",
        })
      }
    },
    [
      localStream,
      startStream,
      devices,
      currentDeviceIndex,
      backgroundRemovalEnabled,
      shouldMirrorStream,
      mirrorVideoStream,
      isAudioMuted,
      setConnectedPeerId,
      toast,
    ],
  )

  // Update the useEffect that handles incoming calls to use our memoized handleIncomingCall function
  useEffect(() => {
    if (!peer) return

    peer.on("call", handleIncomingCall)

    return () => {
      peer.off("call", handleIncomingCall)
    }
  }, [peer, handleIncomingCall]) // Simplified dependency array since handleIncomingCall is now memoized

  // Load background image when selected
  useEffect(() => {
    // Preload the selected background
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.src = selectedBackground
    img.onload = () => {
      backgroundImageRef.current = img
      console.log(`✅ Background loaded: ${selectedBackground}`)

      // If background removal is already enabled, we need to reprocess with the new background
      if (backgroundRemovalEnabled && localStream) {
        // Flag that we need to update
        needsRemoteUpdateRef.current = true

        // Process with new background
        ;(async () => {
          try {
            setIsLoading(true)
            const processedStream = await BackgroundProcessor.processStreamWithBackgroundRemoval({
              stream: localStream,
              selectedBackground,
              isAudioMuted,
              canvasRef,
              backgroundImageRef,
              setLocalStream: (stream) => {
                processedStreamRef.current = stream

                // Update the video source immediately
                if (localVideoRef.current) {
                  localVideoRef.current.srcObject = stream
                }
              },
            })

            // If in a call, update the remote stream
            if (activeCall) {
              await updateRemoteStream(processedStream)
              needsRemoteUpdateRef.current = false
            }
          } catch (error) {
            console.error("Error updating background:", error)
            toast({
              title: "Background Update Error",
              description: "Failed to update background. Please try again.",
              variant: "destructive",
            })
          } finally {
            setIsLoading(false)
          }
        })()
      }
    }
  }, [selectedBackground, backgroundRemovalEnabled, localStream, isAudioMuted, activeCall, toast, updateRemoteStream])

  // Handle orientation changes for mobile devices
  useEffect(() => {
    const handleOrientationChange = () => {
      // If background removal is active, we need to reprocess with the new orientation
      if (backgroundRemovalEnabled && localStream) {
        // Turn off and then back on to reset the canvas dimensions
        ;(async () => {
          try {
            setIsLoading(true)
            await handleBackgroundRemovalToggle(false)

            // Short delay to ensure clean transition
            setTimeout(() => {
              handleBackgroundRemovalToggle(true)
              setIsLoading(false)
            }, 500)
          } catch (error) {
            console.error("Error handling orientation change:", error)
            setIsLoading(false)
          }
        })()
      }
    }

    // Listen for orientation changes
    window.addEventListener("orientationchange", handleOrientationChange)

    return () => {
      window.removeEventListener("orientationchange", handleOrientationChange)
    }
  }, [backgroundRemovalEnabled, localStream, handleBackgroundRemovalToggle])

  // Add this new function before the startCall function
  // Start screen sharing
  const startScreenShare = async () => {
    if (!activeCall || !activeCall.peerConnection) {
      toast({
        title: "No Active Call",
        description: "You must be in a call to share your screen",
        variant: "destructive",
      })
      return
    }

    try {
      setIsLoading(true)
      console.log("Starting screen sharing...")

      // Get screen sharing stream with optimized options
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          // Use type assertion to avoid TypeScript error with cursor property
          ...({
            cursor: "always",
            displaySurface: "monitor",
            // Add these properties for better performance
            frameRate: { ideal: 15, max: 30 }, // Lower framerate to reduce CPU usage
            width: { max: 1920 },
            height: { max: 1080 },
            resizeMode: "crop-and-scale", // Allow browser to optimize resolution
          } as unknown as MediaTrackConstraints),
        },
        audio: true, // Try to capture audio from the screen share if available
      })

      // Add a track ended listener to handle when user stops sharing via browser UI
      const videoTrack = stream.getVideoTracks()[0]
      if (videoTrack) {
        // Set higher priority for this track
        if (videoTrack.contentHint !== undefined) {
          videoTrack.contentHint = "detail" // Hint that this track needs high quality
        }

        // Set up track ended listener
        videoTrack.onended = () => {
          stopScreenShare()
        }

        // Log track constraints for debugging
        console.log("Screen sharing track settings:", videoTrack.getSettings())
      }

      // Save the current stream to restore later
      setPreviousStream(localStream)

      // Set the screen stream
      setScreenStream(stream)
      setLocalStream(stream)
      setIsScreenSharing(true)

      // Update the local video display
      if (localVideoRef.current) {
        // When screen sharing, we don't need to display the local video in the PiP
        // The video element still needs the stream for the call to work
        localVideoRef.current.srcObject = stream

        // Hide the local video element when screen sharing
        // (This is a backup in case the conditional rendering doesn't work)
        localVideoRef.current.style.display = "none"
      }

      // Update the remote stream
      await updateRemoteStream(stream)

      // Set document title to indicate screen sharing is active
      const originalTitle = document.title
      document.title = "📺 Screen Sharing Active - " + originalTitle

      // Store original title to restore later
      document.body.dataset.originalTitle = originalTitle

      setIsLoading(false)
      toast({
        title: "Screen Sharing Started",
        description: "Your screen is now being shared",
      })
    } catch (error) {
      console.error("Error starting screen share:", error)
      setIsLoading(false)
      toast({
        title: "Screen Sharing Failed",
        description: "Failed to start screen sharing. Please try again.",
        variant: "destructive",
      })
    }
  }

  // Add this new function after startScreenShare
  // Stop screen sharing
  const stopScreenShare = async () => {
    if (!screenStream) return

    try {
      setIsLoading(true)
      console.log("Stopping screen sharing...")

      // Stop all tracks in the screen stream
      screenStream.getTracks().forEach((track) => {
        track.stop()
      })

      // Restore the previous stream if available
      if (previousStream) {
        setLocalStream(previousStream)

        // Update the local video display
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = previousStream || cameraStream

          // Restore the display of the local video element
          localVideoRef.current.style.display = "block"
        }

        // Update the remote stream
        await updateRemoteStream(previousStream)
      } else if (cameraStream) {
        // Fallback to camera stream if previous stream is not available
        setLocalStream(cameraStream)

        // Update the local video display
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = cameraStream
        }

        // Update the remote stream
        await updateRemoteStream(cameraStream)
      }

      // Reset state
      setScreenStream(null)
      setPreviousStream(null)
      setIsScreenSharing(false)

      // Clear keep-alive interval if it exists
      if (keepAliveIntervalRef.current) {
        clearInterval(keepAliveIntervalRef.current)
        keepAliveIntervalRef.current = null
      }

      // Remove screen sharing class
      document.body.classList.remove("screen-sharing-active")

      // Restore original document title
      if (document.body.dataset.originalTitle) {
        document.title = document.body.dataset.originalTitle
        delete document.body.dataset.originalTitle
      }

      setIsLoading(false)

      toast({
        title: "Screen Sharing Stopped",
        description: "Returned to camera view",
      })
    } catch (error) {
      console.error("Error stopping screen share:", error)
      setIsLoading(false)
      toast({
        title: "Error",
        description: "Failed to stop screen sharing",
        variant: "destructive",
      })
    }
  }

  // Start a call
  const startCall = async () => {
    if (!peer) {
      toast({
        title: "Connection Error",
        description: "Peer connection not initialized. Please refresh the page and try again.",
        variant: "destructive",
      })
      return
    }

    if (!connectedPeerId) {
      toast({
        title: "Connection Error",
        description: "No peer connected. Please connect to a peer first.",
        variant: "destructive",
      })
      return
    }

    setCallStatus("connecting")
    setIsLoading(true)

    try {
      // Make sure we have a valid local stream
      let streamToUse = localStream

      // If we don't have a local stream yet, try to get one using the hook's startStream
      if (!streamToUse && startStream) {
        console.log("No local stream available, attempting to create one...")
        const currentDevice = devices && devices.length > 0 ? devices[currentDeviceIndex]?.deviceId : undefined
        streamToUse = await startStream(currentDevice || "", true)

        if (streamToUse) {
          console.log("Successfully created stream for outgoing call")
          setLocalStream(streamToUse)
        } else {
          throw new Error("Failed to create camera stream for outgoing call")
        }
      }

      if (!streamToUse) {
        throw new Error("No camera stream available")
      }

      // Use the processed stream if background removal is enabled
      let finalStream =
        backgroundRemovalEnabled && processedStreamRef.current ? processedStreamRef.current : streamToUse

      // Set local video display - always use original stream with CSS mirroring
      console.log("🎥 Setting local video stream...")
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = streamToUse
      }

      // Mirror the stream if needed for the outgoing call
      if (shouldMirrorStream()) {
        console.log("Mirroring outgoing stream for remote peer")
        finalStream = await mirrorVideoStream(finalStream)
      }

      // Log audio tracks
      const audioTracks = finalStream.getAudioTracks()
      console.log(`Audio tracks in outgoing stream: ${audioTracks.length}`)

      if (audioTracks.length > 0) {
        // Make sure audio state is correctly applied
        audioTracks[0].enabled = !isAudioMuted
        console.log(`Audio track enabled for call: ${!isAudioMuted}`)
      } else {
        console.warn("No audio tracks in outgoing stream!")
      }

      console.log("📞 Calling peer:", connectedPeerId)

      // Check if peer is still valid before making the call
      if (!peer || peer.destroyed) {
        throw new Error("Peer connection is no longer valid")
      }

      // Make the call with the mirrored stream if needed
      const call = peer.call(connectedPeerId, finalStream)

      if (!call) {
        throw new Error("Failed to create call object")
      }

      setActiveCall(call) // Store the call reference

      // Set up event listeners
      call.on("stream", (incomingStream) => {
        console.log("🎬 Received Remote Stream:", incomingStream)

        // Log audio tracks in incoming stream
        const incomingAudioTracks = incomingStream.getAudioTracks()
        console.log(`Incoming stream audio tracks: ${incomingAudioTracks.length}`)

        // Log video tracks in incoming stream
        const incomingVideoTracks = incomingStream.getVideoTracks()
        console.log(`Incoming stream video tracks: ${incomingVideoTracks.length}`)

        if (incomingVideoTracks.length === 0) {
          console.warn("No video tracks in incoming stream!")
        }

        setRemoteStream(incomingStream)
        setCallStatus("connected")
        setIsLoading(false)
      })

      call.on("error", (err) => {
        console.error("Call error:", err)
        setCallStatus("idle")
        setIsLoading(false)
        toast({
          title: "Call Error",
          description: err.message || "An error occurred during the call",
          variant: "destructive",
        })
      })

      call.on("close", () => {
        console.log("Call closed")
        setRemoteStream(null)
        setCallStatus("idle")
      })

      // Set a timeout in case the call doesn't connect
      const timeout = setTimeout(() => {
        if (callStatus === "connecting") {
          console.log("Call timed out")
          call.close()
          setCallStatus("idle")
          setIsLoading(false)
          toast({
            title: "Call Timeout",
            description: "The call took too long to connect. Please try again.",
            variant: "destructive",
          })
        }
      }, 30000) // 30 second timeout

      // Clear the timeout if the component unmounts or the call connects
      return () => clearTimeout(timeout)
    } catch (error: any) {
      console.error("Error starting call:", error)
      setCallStatus("idle")
      setIsLoading(false)
      toast({
        title: "Call Error",
        description: error.message || "Failed to start call. Please check your camera and microphone.",
        variant: "destructive",
      })
    }
  }

  // End a call
  const endCall = () => {
    console.log("📞 Ending call...")
    setCallStatus("ending")
    setIsLoading(true)

    // First, stop the background processor rendering loop
    if (backgroundRemovalEnabled) {
      BackgroundProcessor.stopRendering()
    }

    // Close the active call
    if (activeCall) {
      try {
        activeCall.close()
      } catch (e) {
        console.error("Error closing active call:", e)
      }
    }
    setActiveCall(null)

    // Add this to the endCall function, right after the "Close the active call" section
    // Stop screen sharing if active when call ends
    if (isScreenSharing && screenStream) {
      screenStream.getTracks().forEach((track) => {
        track.stop()
      })
      setScreenStream(null)
      setIsScreenSharing(false)
    }

    // Get references to all connections
    const currentPeer = peer
    const currentLocalVideo = localVideoRef.current
    const currentRemoteVideo = remoteVideoRef.current
    const currentCanvas = canvasRef.current

    // Close all media connections specifically
    if (currentPeer) {
      try {
        // Properly close each media connection
        Object.values(currentPeer.connections).forEach((connections) => {
          connections.forEach((conn: any) => {
            console.log("Closing connection:", conn)
            if (conn.type === "media" && conn.close) {
              conn.close()
            }
            if (conn.peerConnection) {
              conn.peerConnection.close()
            }
          })
        })
      } catch (e) {
        console.error("Error closing peer connections:", e)
      }
    }

    // Stop all media tracks from all possible sources
    const stopAllTracksFromStream = (stream: MediaStream | null) => {
      if (!stream) return
      console.log("Stopping tracks for stream:", stream.id)
      stream.getTracks().forEach((track) => {
        console.log("Stopping track:", track.id, track.kind)
        track.stop()
      })
    }

    // Stop local video stream
    if (currentLocalVideo?.srcObject) {
      stopAllTracksFromStream(currentLocalVideo.srcObject as MediaStream)
      currentLocalVideo.srcObject = null
      console.log("✅ Local video stream cleared")
    }

    // Stop remote video stream
    if (currentRemoteVideo?.srcObject) {
      stopAllTracksFromStream(currentRemoteVideo.srcObject as MediaStream)
      currentRemoteVideo.srcObject = null
      console.log("✅ Remote video stream cleared")
    }

    // Stop canvas stream
    if (backgroundRemovalEnabled && currentCanvas) {
      try {
        const canvasStream = currentCanvas.captureStream()
        stopAllTracksFromStream(canvasStream)
        console.log("✅ Canvas stream stopped")
      } catch (e) {
        console.error("Error stopping canvas stream:", e)
      }
    }

    // Reset global state
    setRemoteStream(null)

    // Clean up WebGL resources if background removal was enabled
    if (backgroundRemovalEnabled) {
      BackgroundProcessor.cleanup()
      processedStreamRef.current = null
    }

    setIsAudioMuted(false)
    setIsVideoEnabled(true)
    setCallStatus("idle")
    setIsLoading(false)

    console.log("✅ Call ended successfully")
  }

  // Toggle audio mute state
  const toggleAudio = () => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks()
      audioTracks.forEach((track) => {
        track.enabled = isAudioMuted
      })

      // Also update audio in the active call if it exists
      if (activeCall && activeCall.peerConnection) {
        const senders = activeCall.peerConnection.getSenders()
        const audioSender = senders.find((sender) => sender.track && sender.track.kind === "audio")

        if (audioSender && audioSender.track) {
          audioSender.track.enabled = isAudioMuted
        }
      }

      // Also update audio in the processed stream if it exists
      if (processedStreamRef.current) {
        const processedAudioTracks = processedStreamRef.current.getAudioTracks()
        processedAudioTracks.forEach((track) => {
          track.enabled = isAudioMuted
        })
      }

      setIsAudioMuted(!isAudioMuted)
      console.log(`🎤 Audio ${isAudioMuted ? "unmuted" : "muted"}`)
    }
  }

  // Toggle video enabled state
  const toggleVideo = () => {
    if (localStream) {
      const videoTracks = localStream.getVideoTracks()
      videoTracks.forEach((track) => {
        track.enabled = !isVideoEnabled
      })

      // Also update video in the processed stream if it exists
      if (processedStreamRef.current) {
        const processedVideoTracks = processedStreamRef.current.getVideoTracks()
        processedVideoTracks.forEach((track) => {
          track.enabled = !isVideoEnabled
        })
      }

      setIsVideoEnabled(!isVideoEnabled)
      console.log(`📹 Video ${isVideoEnabled ? "disabled" : "enabled"}`)
    }
  }

  // Handle camera switching - using the hook's switchCamera function
  const handleSwitchCamera = async () => {
    if (!hasMultipleCameras) return

    setIsLoading(true)
    try {
      // Use the hook's switchCamera function which handles all the device switching logic
      const newStream = await switchCamera(true)

      if (newStream) {
        // The hook will update its internal stream state, which will trigger our useEffect
        // that updates localStream, so we don't need to set it here
        toast({
          title: "Camera Switched",
          description: `Switched to ${currentCameraName}`,
        })

        // If background removal is enabled, we need to reprocess the stream
        if (backgroundRemovalEnabled) {
          // Turn off background removal first
          await handleBackgroundRemovalToggle(false)

          // Then turn it back on with the new stream
          setTimeout(() => {
            handleBackgroundRemovalToggle(true)
          }, 500)
        }
      } else {
        throw new Error("Failed to switch camera")
      }
    } catch (err) {
      console.error("Error switching camera:", err)
      toast({
        title: "Camera Switch Failed",
        description: "Failed to switch camera. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Add this new useEffect after the other useEffects to handle page visibility
  useEffect(() => {
    // Function to handle visibility change
    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === "visible"
      setIsPageVisible(isVisible)

      // If we're screen sharing and the page becomes hidden
      if (!isVisible && isScreenSharing) {
        console.log("Page hidden while screen sharing - activating keep-alive")

        // Add class to body to indicate hidden screen sharing
        document.body.classList.add("hidden-screen-sharing")

        // Set up a keep-alive interval to prevent the stream from freezing
        if (keepAliveIntervalRef.current) {
          clearInterval(keepAliveIntervalRef.current)
        }

        keepAliveIntervalRef.current = setInterval(() => {
          // Send a small data message to keep the connection active
          if (activeCall && activeCall.peerConnection) {
            try {
              // Try to access data channels in a more compatible way
              let dataChannel = null
              if (activeCall.peerConnection) {
                // Cast to our extended interface
                const peerConn = activeCall.peerConnection as ExtendedRTCPeerConnection

                // Try different methods to access data channels
                if (typeof peerConn.getDataChannels === "function") {
                  const channels = peerConn.getDataChannels()
                  if (channels && channels.length > 0) {
                    dataChannel = channels[0]
                  }
                } else if (peerConn.dataChannel) {
                  dataChannel = peerConn.dataChannel
                } else if (peerConn.dataChannels) {
                  const channels = peerConn.dataChannels
                  if (channels && channels.length > 0) {
                    dataChannel = channels[0]
                  }
                }

                // Send keepalive if we have a data channel
                if (dataChannel && dataChannel.readyState === "open") {
                  dataChannel.send(JSON.stringify({ type: "keepalive", timestamp: Date.now() }))
                }
              }

              // Log connection status periodically
              console.log("Keep-alive: Screen sharing active while page hidden")
            } catch (e) {
              console.error("Error in keep-alive:", e)
            }
          }
        }, 1000) // Send a keep-alive signal every second

        // Request the browser to prioritize this page even when hidden
        const extendedNav = navigator as ExtendedNavigator
        if (extendedNav.scheduling && typeof extendedNav.scheduling.isInputPending === "function") {
          document.body.classList.add("screen-sharing-active")
        }

        // Optimize performance during screen sharing
        if (isScreenSharing) {
          // Request high performance mode from the browser
          if (typeof window.requestIdleCallback === "function") {
            // Lower the priority of non-essential tasks
            const lowPriorityTasks = () => {
              // Any non-essential animations or calculations can go here
              console.log("Running low priority tasks during screen sharing")
            }

            // Schedule low priority tasks for idle time
            window.requestIdleCallback(lowPriorityTasks, { timeout: 1000 })
          }

          // Add a class to the body to optimize rendering
          document.body.classList.add("screen-sharing-active")
        }
      } else if (isVisible) {
        // Remove the hidden screen sharing class
        document.body.classList.remove("hidden-screen-sharing")

        // Clear the keep-alive interval when the page becomes visible again
        console.log("Page visible again - deactivating keep-alive")
        if (keepAliveIntervalRef.current) {
          clearInterval(keepAliveIntervalRef.current)
          keepAliveIntervalRef.current = null
        }
        document.body.classList.remove("screen-sharing-active")
      }
    }

    // Set up event listeners for page visibility changes
    document.addEventListener("visibilitychange", handleVisibilityChange)

    // Clean up
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      if (keepAliveIntervalRef.current) {
        clearInterval(keepAliveIntervalRef.current)
        keepAliveIntervalRef.current = null
      }
      document.body.classList.remove("screen-sharing-active")
      document.body.classList.remove("hidden-screen-sharing")

      // Add the missing cleanup code here
      if (document.body.dataset.originalTitle) {
        document.title = document.body.dataset.originalTitle
        delete document.body.dataset.originalTitle
      }
    }
  }, [isScreenSharing, activeCall])

  // Show loading state while camera is initializing
  if (!isInitialized) {
    return (
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_#edf7fa,_#5f6caf,_#ffb677)] flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-6 shadow-lg text-center relative">
          <div className="mx-auto w-12 h-12 mb-4 relative">
            <div className="absolute inset-0 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <div className="absolute inset-0 border-2 border-blue-200 rounded-full"></div>
            <div className="absolute w-3 h-3 bg-blue-500 rounded-full top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"></div>
          </div>
          <p className="text-gray-700 font-medium">Initializing Camera...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-[radial-gradient(ellipse_at_bottom_right,_#edf7fa,_#5f6caf,_#ffb677)]">
      {/* Main Content */}
      <main className="flex-1 h-[99vh] py-1">
        <div className="container h-full md:w-[80vw] mx-auto px-4">
          {/* Video Container */}
          <div className="relative h-full flex border justify-center rounded-2xl backdrop-blur-xs  border-white/20 shadow-xl overflow-hidden">
            {/* Remote Video */}
            <div className="w-full h-full relative">
              {remoteStream ? (
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className="flex flex-col items-center justify-center w-full h-full border border-white/30 rounded-2xl
                bg-white/10 backdrop-blur-md transition-all hover:backdrop-blur-lg"
                >
                  <div className="flex items-center justify-center w-20 h-20 mb-4 rounded-full bg-black">
                    <VideoIcon className="w-8 h-8 text-white" />
                  </div>
                  <p className="text-black font-medium">Waiting for participant to join...</p>
                </div>
              )}

              {/* Local Video (PiP) - Hide when screen sharing */}
              {!isScreenSharing && (
                <motion.div
                  drag
                  dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                  dragElastic={0.2}
                  className="absolute top-4 left-4 w-36 lg:w-1/6 xl:w-44 aspect-4/3 rounded-lg overflow-hidden shadow-md"
                >
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${shouldMirrorStream() ? "scale-x-[-1]" : ""}`}
                  />
                  <div className="absolute inset-0 pointer-events-none">
                    <span className="absolute bg-black/20 text-white bg-opacity-10 px-2 rounded text-xs md:text-sm bottom-1 left-1">
                      You
                    </span>
                    {hasMultipleCameras && (
                      <span className="absolute top-1 right-1 bg-black text-white bg-opacity-10 text-xs px-1 rounded">
                        {currentCameraName}
                      </span>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Also add a screen sharing indicator when screen sharing is active */}
              {isScreenSharing && (
                <div className="absolute top-4 left-4 bg-red-500/80 text-white px-3 py-1.5 rounded-lg text-sm font-medium flex items-center space-x-2 animate-pulse">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mr-1.5"
                  >
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                    <line x1="8" y1="21" x2="16" y2="21"></line>
                    <line x1="12" y1="17" x2="12" y2="21"></line>
                  </svg>
                  <span>Screen Sharing</span>
                </div>
              )}

              {/* Call Info */}
              {remoteStream && (
                <div className="absolute top-4 right-4 bg-black bg-opacity-50 text-white text-xs py-1 px-3 rounded-full flex items-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  <span>{formatDuration(callDuration)}</span>
                </div>
              )}
            </div>

            {/* Call Controls */}
            <div className="absolute bottom-5 flex items-center justify-center space-x-4">
              <ControlBar
                remoteStream={remoteStream}
                startCall={startCall}
                endCall={endCall}
                isAudioMuted={isAudioMuted}
                toggleAudio={toggleAudio}
                isVideoEnabled={isVideoEnabled}
                toggleVideo={toggleVideo}
                backgroundRemovalEnabled={backgroundRemovalEnabled}
                setBackgroundRemovalEnabled={setBackgroundRemovalEnabled}
                selectedBackground={selectedBackground}
                setSelectedBackground={setSelectedBackground}
                isLoading={isLoading}
                callStatus={callStatus}
                hasMultipleCameras={hasMultipleCameras}
                switchCamera={handleSwitchCamera}
                currentCameraName={currentCameraName}
                isScreenSharing={isScreenSharing}
                startScreenShare={startScreenShare}
                stopScreenShare={stopScreenShare}
              />
            </div>
          </div>
        </div>
      </main>

      {isLoading && (
        <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_#edf7fa,_#5f6caf,_#ffb677)] flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-lg text-center relative">
            <div className="mx-auto w-12 h-12 mb-4 relative">
              <div className="absolute inset-0 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <div className="absolute inset-0 border-2 border-blue-200 rounded-full"></div>
              <div className="absolute w-3 h-3 bg-blue-500 rounded-full top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"></div>
            </div>
            <p className="text-gray-700 font-medium">
              {callStatus === "connecting"
                ? "Establishing connection..."
                : callStatus === "ending"
                  ? "Ending call..."
                  : "Processing..."}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

