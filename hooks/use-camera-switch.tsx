"use client"

import { useState, useEffect, useCallback } from "react"

export function useCameraSwitch() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [currentDeviceIndex, setCurrentDeviceIndex] = useState(0)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch and initialize camera devices
  const initializeCameras = useCallback(async (audioEnabled = true) => {
    try {
      // First request permission
      const initialStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: audioEnabled,
      })

      // Get device list after permission granted
      const deviceList = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = deviceList.filter((device) => device.kind === "videoinput")

      setDevices(videoDevices)
      setHasMultipleCameras(videoDevices.length > 1)

      // Stop initial stream as we'll create a new one with specific device
      initialStream.getTracks().forEach((track) => track.stop())

      // Initial stream with first camera if available
      if (videoDevices.length > 0) {
        const newStream = await startStream(videoDevices[0].deviceId, audioEnabled)
        setStream(newStream)
      }

      setIsInitialized(true)
      return true
    } catch (error) {
      console.error("Camera initialization error:", error)
      setError("Failed to access camera. Please check permissions.")
      setIsInitialized(true)
      return false
    }
  }, [])

  // Start stream with specific device
  const startStream = useCallback(
    async (deviceId: string, audioEnabled = true) => {
      const constraints = {
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: audioEnabled,
      }

      try {
        // Stop existing stream if exists
        if (stream) {
          stream.getTracks().forEach((track) => track.stop())
        }

        console.log("Starting stream with constraints:", constraints)
        const newStream = await navigator.mediaDevices.getUserMedia(constraints)

        if (!newStream) {
          throw new Error("Failed to get media stream")
        }

        console.log("Stream started successfully:", newStream.id)
        setStream(newStream)
        return newStream
      } catch (error: any) {
        console.error("Stream start error:", error)
        setError(error.message || "Failed to start camera stream")
        return null
      }
    },
    [stream],
  )

  // Switch to next camera
  const switchCamera = useCallback(
    async (preserveAudio = true) => {
      if (devices.length <= 1) return stream

      const nextIndex = (currentDeviceIndex + 1) % devices.length
      const nextDevice = devices[nextIndex]

      try {
        // Preserve audio track if requested
        let audioTrack = null
        if (preserveAudio && stream && stream.getAudioTracks().length > 0) {
          audioTrack = stream.getAudioTracks()[0]
        }

        // Start new stream with next camera
        const newStream = await startStream(nextDevice.deviceId, !audioTrack)

        // If we have an audio track to preserve and a new stream was created
        if (audioTrack && newStream) {
          // Clone the audio track to avoid issues
          newStream.addTrack(audioTrack)
        }

        setCurrentDeviceIndex(nextIndex)
        return newStream
      } catch (error) {
        console.error("Camera switch error:", error)
        return stream
      }
    },
    [devices, currentDeviceIndex, startStream, stream],
  )

  // Get current device info
  const getCurrentDeviceInfo = useCallback(() => {
    if (devices.length === 0) return null
    return devices[currentDeviceIndex]
  }, [devices, currentDeviceIndex])

  // Get a user-friendly name for the current camera
  const getCurrentCameraName = useCallback(() => {
    const device = getCurrentDeviceInfo()
    if (!device) return "Camera"

    // Try to determine if it's front or back camera
    const label = device.label.toLowerCase()
    if (label.includes("front")) return "Front Camera"
    if (label.includes("back") || label.includes("rear")) return "Back Camera"

    // If we can't determine, just return the device label or a generic name
    return device.label || `Camera ${currentDeviceIndex + 1}`
  }, [getCurrentDeviceInfo, currentDeviceIndex])

  // Initialize on component mount
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.mediaDevices) {
      initializeCameras()
    } else {
      setError("Media devices not supported in this environment")
      setIsInitialized(true)
    }

    // Cleanup
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop())
      }
    }
  }, [initializeCameras])

  return {
    stream,
    switchCamera,
    devices,
    hasMultipleCameras,
    currentDevice: getCurrentDeviceInfo(),
    currentCameraName: getCurrentCameraName(),
    isInitialized,
    error,
    startStream,
    currentDeviceIndex,
  }
}

