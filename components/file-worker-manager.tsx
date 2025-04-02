"use client"

import { useEffect, useRef, useCallback } from "react"
import { toast } from "@/hooks/use-toast"

// Define types for file transfer
export interface FileMetadata {
  id: string
  name: string
  type: string
  size: number
  totalChunks: number
}

export interface FileChunk {
  fileId: string
  index: number
  data: Uint8Array
}

export interface FileWorkerManagerProps {
  onFileAssembled: (fileId: string, blob: Blob, metadata: FileMetadata) => void
}

export interface ChunkFileOptions {
  file: File
  onChunkReady: (chunk: { fileId: string; index: number; data: Uint8Array }) => void
  onProgress: (progress: number) => void
  onComplete: () => void
  onError: (error: string) => void
}

const FileWorkerManager = ({ onFileAssembled }: FileWorkerManagerProps) => {
  const workerRef = useRef<Worker | null>(null)

  // Initialize the web worker
  useEffect(() => {
    if (typeof window !== "undefined" && !workerRef.current) {
      try {
        workerRef.current = new Worker(new URL("@/workers/file-worker.ts", import.meta.url))

        // Set up message handler for the worker
        workerRef.current.onmessage = (event) => {
          const { type, payload } = event.data

          if (type === "FILE_ASSEMBLED") {
            const { fileId, blob, metadata } = payload
            onFileAssembled(fileId, blob, metadata)
          } else if (type === "ERROR") {
            console.error("Worker error:", payload.error)
            toast({
              title: "File Transfer Error",
              description: payload.error || "An error occurred during file transfer",
              variant: "destructive",
            })
          }
        }

        console.log("✅ File worker initialized successfully")
      } catch (error) {
        console.error("Failed to initialize file worker:", error)
        toast({
          title: "Worker Initialization Failed",
          description: "Could not initialize file transfer system",
          variant: "destructive",
        })
      }
    }

    // Clean up worker on unmount
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate()
        workerRef.current = null
      }
    }
  }, [onFileAssembled])

  // Process received file chunks
  const processReceivedFile = useCallback((fileId: string, chunks: Map<number, Uint8Array>, metadata: FileMetadata) => {
    if (!workerRef.current) {
      console.error("Worker not initialized")
      return
    }

    try {
      const sortedChunks = Array.from(chunks.entries())
        .sort(([a], [b]) => a - b)
        .map(([, chunk]) => chunk)

      workerRef.current.postMessage({
        type: "ASSEMBLE_FILE",
        payload: {
          fileId,
          chunks: sortedChunks,
          metadata,
        },
      })

      console.log(`Processing file ${fileId} with ${sortedChunks.length} chunks`)
    } catch (error) {
      console.error("Error processing received file:", error)
      toast({
        title: "File Processing Error",
        description: "Failed to process the received file",
        variant: "destructive",
      })
    }
  }, [])

  // Chunk a file for sending
  const chunkFile = useCallback(({ file, onChunkReady, onProgress, onComplete, onError }: ChunkFileOptions) => {
    const chunkSize = 16 * 1024 // 16KB chunks as requested
    // Use a more robust ID generation with additional entropy
    const fileId = `file-${Date.now()}-${Math.random().toString(36).substring(2, 9)}-${Math.random().toString(36).substring(2, 5)}`
    const totalChunks = Math.ceil(file.size / chunkSize)

    console.log(
      `Starting to chunk file ${file.name} (${file.size} bytes) into ${totalChunks} chunks of ${chunkSize} bytes each with ID: ${fileId}`,
    )

    // Create metadata
    const metadata: FileMetadata = {
      id: fileId,
      name: file.name,
      type: file.type,
      size: file.size,
      totalChunks,
    }

    let currentChunk = 0

    const processNextChunk = () => {
      if (currentChunk >= totalChunks) {
        onComplete()
        return
      }

      const start = currentChunk * chunkSize
      const end = Math.min(start + chunkSize, file.size)
      const chunk = file.slice(start, end)

      const reader = new FileReader()

      reader.onload = (e) => {
        if (e.target?.result instanceof ArrayBuffer) {
          try {
            onChunkReady({
              fileId,
              index: currentChunk,
              data: new Uint8Array(e.target.result),
            })

            currentChunk++
            const progress = (currentChunk / totalChunks) * 100
            onProgress(progress)

            // Process next chunk with a small delay to prevent UI blocking
            setTimeout(processNextChunk, 10)
          } catch (error) {
            console.error("Error processing chunk:", error)
            onError("Failed to process file chunk")
          }
        }
      }

      reader.onerror = () => {
        console.error("Error reading file chunk")
        onError("Failed to read file chunk")
      }

      reader.readAsArrayBuffer(chunk)
    }

    // Start processing chunks
    processNextChunk()

    return { fileId, metadata }
  }, [])

  return { processReceivedFile, chunkFile }
}

export default FileWorkerManager

