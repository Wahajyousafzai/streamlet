"use client";

import { useState, useEffect, useCallback } from "react";
import { Progress } from "@/components/ui/progress";
import { useDropzone } from "react-dropzone";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Upload,
  File,
  Trash2,
  Play,
  Pause,
  X,
  FileText,
  Image,
  Video,
  Music,
  Archive,
  FileX,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { usePeer } from "@/contexts/PeerContext";
import { Button } from "@/components/ui/button";
import FileWorkerManager, {
  type FileMetadata,
} from "@/components/file-worker-manager";

interface TransferRecord {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  timestamp: number;
  direction: "sent" | "received";
  preview?: string;
  blobUrl?: string; // Add this field to store blob URLs for non-previewable files
}

interface ActiveTransfer {
  id: string;
  metadata: FileMetadata;
  progress: number;
  status:
    | "preparing"
    | "transferring"
    | "paused"
    | "completed"
    | "cancelled"
    | "error";
  direction: "sending" | "receiving";
  file?: File;
  chunks?: Map<number, Uint8Array>;
  receivedSize: number;
  startTime: number;
  pausedAt?: number;
  error?: string;
}

export default function FilesPage() {
  const { connection, isConnected, connectedPeerId, sendData } = usePeer();
  const [activeTransfers, setActiveTransfers] = useState<ActiveTransfer[]>([]);
  const [transferHistory, setTransferHistory] = useState<TransferRecord[]>([]);
  const [previewFile, setPreviewFile] = useState<{
    record: TransferRecord;
    content?: string | null;
  }>();

  // Save transfer record to history
  const saveTransferRecord = useCallback(
    (record: TransferRecord) => {
      // Ensure all files have some form of reference for downloading
      if (!record.preview && record.direction === "sent" && record.fileType) {
        // For non-previewable files that were sent, store a marker
        record.preview = "blob-reference";

        // Store the blob URL in a data attribute for later retrieval
        if (record.blobUrl) {
          setTimeout(() => {
            const container = document.createElement("div");
            container.style.display = "none";
            container.setAttribute("data-file-id", record.id);
            if (record.blobUrl) {
              container.setAttribute("data-blob", record.blobUrl);
            }
            document.body.appendChild(container);
          }, 0);
        }
      }

      setTransferHistory((prev) => {
        const newHistory = [...prev, record];
        localStorage.setItem("transferHistory", JSON.stringify(newHistory));
        return newHistory;
      });
    },
    [setTransferHistory]
  );

  // Handle file assembly when all chunks are received
  // Modify the handleFileAssembled function to only create records for received files
  const handleFileAssembled = useCallback(
    (fileId: string, blob: Blob, metadata: FileMetadata) => {
      console.log(
        `File assembled: ${fileId}, size: ${blob.size} bytes, type: ${metadata.type}`
      );

      // Create blob URL for all file types for download purposes
      const blobUrl = URL.createObjectURL(blob);

      // Generate preview for supported file types
      let preview: string | undefined = undefined;

      // Only set preview for previewable types
      if (
        metadata.type.startsWith("image/") ||
        metadata.type.startsWith("video/") ||
        metadata.type.startsWith("audio/")
      ) {
        preview = blobUrl;
      } else if (
        metadata.type.startsWith("text/") ||
        metadata.type.includes("json") ||
        metadata.type.includes("javascript") ||
        metadata.type.includes("css")
      ) {
        // For text files, we'll store 'text' as a marker and handle the actual content when previewing
        preview = "text";
      } else {
        // For non-previewable files, store a reference
        preview = "blob-reference";
      }

      // Store the blob URL in a data attribute for later retrieval
      setTimeout(() => {
        const container = document.createElement("div");
        container.style.display = "none";
        container.setAttribute("data-file-id", fileId);
        container.setAttribute("data-blob", blobUrl);
        document.body.appendChild(container);
      }, 0);

      // Save to transfer history - only for received files
      const record: TransferRecord = {
        id: fileId,
        fileName: metadata.name,
        fileType: metadata.type,
        fileSize: metadata.size,
        timestamp: Date.now(),
        direction: "received",
        preview,
        blobUrl,
      };

      saveTransferRecord(record);

      // Let the user know the file is ready
      toast({
        title: "File Received",
        description: `File ready: ${metadata.name}`,
      });

      // Remove from active transfers immediately
      setActiveTransfers((prev) => prev.filter((t) => t.id !== fileId));
    },
    [saveTransferRecord]
  );

  // Initialize our file worker manager
  const { processReceivedFile, chunkFile } = FileWorkerManager({
    onFileAssembled: handleFileAssembled,
  });

  // Process received file when all chunks are received
  const handleCompleteFileReceived = useCallback(
    (transfer: ActiveTransfer) => {
      if (
        transfer.chunks &&
        transfer.chunks.size === transfer.metadata.totalChunks
      ) {
        console.log(
          `All chunks received for file ${transfer.id}. Processing...`
        );
        processReceivedFile(transfer.id, transfer.chunks, transfer.metadata);

        // Update status to completed
        setActiveTransfers((prev) =>
          prev.map((t) =>
            t.id === transfer.id
              ? { ...t, status: "completed", progress: 100 }
              : t
          )
        );
      }
    },
    [processReceivedFile]
  );

  // Handle data received from peer
  useEffect(() => {
    if (!connection) return;

    const handleData = (data: any) => {
      if (!data || typeof data !== "object") return;

      try {
        // Handle file metadata
        if ("metadata" in data) {
          const metadata = data.metadata as FileMetadata;
          console.log(
            `Received file metadata: ${metadata.name} (${metadata.size} bytes)`
          );

          // Create a new transfer record
          const newTransfer: ActiveTransfer = {
            id: metadata.id,
            metadata,
            progress: 0,
            status: "transferring",
            direction: "receiving",
            chunks: new Map(),
            receivedSize: 0,
            startTime: Date.now(),
          };

          setActiveTransfers((prev) => [...prev, newTransfer]);

          toast({
            title: "Receiving File",
            description: `Starting to receive: ${metadata.name}`,
          });
        }
        // Handle file chunk
        else if ("fileId" in data && "index" in data && "data" in data) {
          const chunk = data as {
            fileId: string;
            index: number;
            data: ArrayBuffer;
          };

          setActiveTransfers((prev) => {
            return prev.map((transfer) => {
              if (
                transfer.id === chunk.fileId &&
                transfer.status === "transferring"
              ) {
                // Get existing chunks
                const chunks = transfer.chunks || new Map();

                // Add new chunk as Uint8Array
                chunks.set(chunk.index, new Uint8Array(chunk.data));

                // Calculate received size
                const receivedSize =
                  transfer.receivedSize + chunk.data.byteLength;

                // Calculate progress
                const progress =
                  (chunks.size / transfer.metadata.totalChunks) * 100;

                // Check if all chunks received
                const isComplete =
                  chunks.size === transfer.metadata.totalChunks;

                if (isComplete) {
                  console.log(
                    `All chunks received for file ${transfer.id}. Will process soon...`
                  );
                  // Process file in the next tick to avoid state update conflicts
                  setTimeout(() => {
                    handleCompleteFileReceived({
                      ...transfer,
                      chunks,
                      receivedSize,
                      progress: 100,
                    });
                  }, 100);
                }

                return {
                  ...transfer,
                  chunks,
                  receivedSize,
                  progress,
                  status: isComplete ? "completed" : "transferring",
                };
              }
              return transfer;
            });
          });
        }
        // Handle control messages
        else if (
          "control" in data &&
          data.control &&
          "fileId" in data.control
        ) {
          const { fileId, action } = data.control;

          if (action === "pause") {
            setActiveTransfers((prev) =>
              prev.map((t) =>
                t.id === fileId ? { ...t, status: "paused" } : t
              )
            );
          } else if (action === "resume") {
            setActiveTransfers((prev) =>
              prev.map((t) =>
                t.id === fileId ? { ...t, status: "transferring" } : t
              )
            );
          } else if (action === "cancel") {
            setActiveTransfers((prev) =>
              prev.map((t) =>
                t.id === fileId ? { ...t, status: "cancelled" } : t
              )
            );

            // Remove from active transfers after a delay
            setTimeout(() => {
              setActiveTransfers((prev) => prev.filter((t) => t.id !== fileId));
            }, 3000);
          }
        }
      } catch (error) {
        console.error("Error processing received data:", error);
      }
    };

    connection.on("data", handleData);

    return () => {
      connection.off("data", handleData);
    };
  }, [connection, handleCompleteFileReceived]);

  // Load history on mount
  useEffect(() => {
    const savedHistory = localStorage.getItem("transferHistory");
    if (savedHistory) {
      try {
        setTransferHistory(JSON.parse(savedHistory));
      } catch (error) {
        console.error("Error parsing transfer history:", error);
      }
    }
  }, []);

  // Send file using our file worker manager
  const sendFile = useCallback(
    (file: File) => {
      if (!connection || !isConnected) {
        toast({
          title: "Error",
          description: "Not connected to a peer",
          variant: "destructive",
        });
        return;
      }

      console.log(`Preparing to send file: ${file.name} (${file.size} bytes)`);

      // Create a new transfer record
      const newTransfer: ActiveTransfer = {
        id: "", // Will be set after chunking starts
        metadata: {
          id: "",
          name: file.name,
          type: file.type,
          size: file.size,
          totalChunks: 0,
        },
        progress: 0,
        status: "preparing",
        direction: "sending",
        file,
        receivedSize: 0,
        startTime: Date.now(),
      };

      // Add to active transfers
      setActiveTransfers((prev) => [...prev, newTransfer]);

      // Start chunking the file
      const { fileId, metadata } = chunkFile({
        file,
        onChunkReady: (chunk) => {
          // Send chunk to peer
          if (connection && connection.open) {
            sendData(chunk);
          }
        },
        onProgress: (progress) => {
          // Update progress
          setActiveTransfers((prev) =>
            prev.map((t) =>
              t.metadata.name === file.name &&
              t.startTime === newTransfer.startTime
                ? { ...t, progress }
                : t
            )
          );
        },
        // In your sendFile function, within the chunkFile's onComplete callback, modify this part:

        onComplete: () => {
          console.log(`File ${file.name} sent successfully`);

          // Update status to completed
          setActiveTransfers((prev) =>
            prev.map((t) =>
              t.id === fileId ? { ...t, status: "completed", progress: 100 } : t
            )
          );

          // Only add to history for the sender (not for the receiver)
          // This prevents duplicate entries
          if (newTransfer.direction === "sending") {
            // Create preview for sent file
            let preview: string | undefined = undefined;
            let blobUrl: string | undefined = undefined;

            // Create blob URL for all file types for download purposes
            const blob = new Blob([file], { type: file.type });
            blobUrl = URL.createObjectURL(blob);

            // Only set preview for previewable types
            if (
              file.type.startsWith("image/") ||
              file.type.startsWith("video/") ||
              file.type.startsWith("audio/")
            ) {
              preview = blobUrl;
            } else if (
              file.type.startsWith("text/") ||
              file.type.includes("json") ||
              file.type.includes("javascript") ||
              file.type.includes("css")
            ) {
              preview = "text";

              // Store the file content for preview
              const reader = new FileReader();
              reader.onload = (e) => {
                if (e.target?.result) {
                  const container = document.createElement("div");
                  container.style.display = "none";
                  container.setAttribute("data-file-id", fileId);
                  container.setAttribute("data-blob", blobUrl);
                  document.body.appendChild(container);
                }
              };
              reader.readAsArrayBuffer(file);
            } else {
              // For non-previewable files, store a reference
              preview = "blob-reference";

              // Store the blob URL for download
              const container = document.createElement("div");
              container.style.display = "none";
              container.setAttribute("data-file-id", fileId);
              container.setAttribute("data-blob", blobUrl);
              document.body.appendChild(container);
            }

            // Add to history
            saveTransferRecord({
              id: fileId,
              fileName: file.name,
              fileType: file.type,
              fileSize: file.size,
              timestamp: Date.now(),
              direction: "sent",
              preview,
              blobUrl,
            });
          }

          // Show toast
          toast({
            title: "File Sent",
            description: `File sent successfully: ${file.name}`,
          });

          // Remove from active transfers after a short delay
          setTimeout(() => {
            setActiveTransfers((prev) => prev.filter((t) => t.id !== fileId));
          }, 1000);
        },
        onError: (error) => {
          console.error(`Error sending file ${file.name}:`, error);

          // Update status to error
          setActiveTransfers((prev) =>
            prev.map((t) =>
              t.metadata.name === file.name &&
              t.startTime === newTransfer.startTime
                ? { ...t, status: "error", error }
                : t
            )
          );

          // Show toast
          toast({
            title: "File Send Error",
            description: error,
            variant: "destructive",
          });
        },
      });

      // Send metadata first
      sendData({ metadata });

      // Update the transfer with the file ID and metadata
      setActiveTransfers((prev) =>
        prev.map((t) =>
          t.metadata.name === file.name && t.startTime === newTransfer.startTime
            ? { ...t, id: fileId, metadata, status: "transferring" }
            : t
        )
      );
    },
    [connection, isConnected, sendData, chunkFile, saveTransferRecord]
  );

  // File drop handling
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => {
      if (isConnected) {
        acceptedFiles.forEach((file) => {
          sendFile(file);
        });
      } else {
        toast({
          title: "Error",
          description: "Please connect to a peer before sending files",
          variant: "destructive",
        });
      }
    },
  });

  // Control handlers for transfers
  const pauseTransfer = useCallback(
    (transfer: ActiveTransfer) => {
      if (transfer.direction === "sending" && connection) {
        sendData({
          control: {
            fileId: transfer.id,
            action: "pause",
          },
        });

        setActiveTransfers((prev) =>
          prev.map((t) =>
            t.id === transfer.id
              ? { ...t, status: "paused", pausedAt: Date.now() }
              : t
          )
        );
      }
    },
    [connection, sendData]
  );

  const resumeTransfer = useCallback(
    (transfer: ActiveTransfer) => {
      if (transfer.direction === "sending" && connection) {
        sendData({
          control: {
            fileId: transfer.id,
            action: "resume",
          },
        });

        setActiveTransfers((prev) =>
          prev.map((t) =>
            t.id === transfer.id
              ? { ...t, status: "transferring", pausedAt: undefined }
              : t
          )
        );
      }
    },
    [connection, sendData]
  );

  const cancelTransfer = useCallback(
    (transfer: ActiveTransfer) => {
      if (connection) {
        const transferId = transfer.id; // Store the ID to avoid closure issues

        sendData({
          control: {
            fileId: transferId,
            action: "cancel",
          },
        });

        setActiveTransfers((prev) =>
          prev.map((t) =>
            t.id === transferId ? { ...t, status: "cancelled" } : t
          )
        );

        // Remove from active transfers after a delay
        setTimeout(() => {
          setActiveTransfers((prev) => prev.filter((t) => t.id !== transferId));
        }, 3000);
      }
    },
    [connection, sendData]
  );

  // Preview file content
  const previewFileContent = useCallback(
    async (record: TransferRecord) => {
      if (!record.preview) {
        toast({
          title: "Preview Unavailable",
          description: "This file cannot be previewed",
          variant: "destructive",
        });
        return;
      }

      // For images, videos, and audio, we already have the preview URL
      if (
        record.fileType.startsWith("image/") ||
        record.fileType.startsWith("video/") ||
        record.fileType.startsWith("audio/")
      ) {
        setPreviewFile({ record });
        return;
      }

      // For text files and other text-based formats
      if (
        (record.fileType.startsWith("text/") ||
          record.fileType.includes("json") ||
          record.fileType.includes("javascript") ||
          record.fileType.includes("css")) &&
        record.preview === "text"
      ) {
        try {
          // Find the file in the DOM (it should have been saved as a blob)
          const fileBlob = document
            .querySelector(`[data-file-id="${record.id}"]`)
            ?.getAttribute("data-blob");

          if (fileBlob) {
            const blob = await fetch(fileBlob).then((r) => r.blob());
            const text = await blob.text();
            setPreviewFile({ record, content: text });
          } else {
            // If we can't find the blob in the DOM, check if this is a sent file
            // that might still be accessible in the browser's memory
            if (record.direction === "sent") {
              // Try to find the file in active transfers (though it should have been moved to history)
              const transfer = activeTransfers.find((t) => t.id === record.id);
              if (transfer && transfer.file) {
                const text = await transfer.file.text();
                setPreviewFile({ record, content: text });
                return;
              }
            }

            toast({
              title: "Preview Unavailable",
              description: "Text content could not be loaded",
              variant: "destructive",
            });
          }
        } catch (error) {
          console.error("Error loading text preview:", error);
          toast({
            title: "Preview Error",
            description: "Failed to load text content",
            variant: "destructive",
          });
        }
      } else {
        // For other file types
        toast({
          title: "Preview Unavailable",
          description: `Preview not supported for ${record.fileType} files`,
        });
      }
    },
    [toast, activeTransfers]
  );

  // Download file from history
  const downloadFile = useCallback(
    (record: TransferRecord) => {
      // For files with direct blob URLs (images, videos, audio)
      if (
        record.preview &&
        record.preview !== "text" &&
        record.preview !== "blob-reference"
      ) {
        const a = document.createElement("a");
        a.href = record.preview;
        a.download = record.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }

      // For text files and other files that need to be retrieved from the DOM
      const fileBlob = document
        .querySelector(`[data-file-id="${record.id}"]`)
        ?.getAttribute("data-blob");
      if (fileBlob) {
        const a = document.createElement("a");
        a.href = fileBlob;
        a.download = record.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }

      // If we can't find the blob in the DOM, check if this is a sent file
      // that might still be accessible in the browser's memory
      if (record.direction === "sent") {
        // Try to find the file in active transfers
        const transfer = activeTransfers.find((t) => t.id === record.id);
        if (transfer && transfer.file) {
          const url = URL.createObjectURL(transfer.file);
          const a = document.createElement("a");
          a.href = url;
          a.download = record.fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          return;
        }
      }

      toast({
        title: "Download Failed",
        description: "Could not find the file data",
        variant: "destructive",
      });
    },
    [toast, activeTransfers]
  );

  // Remove single history item
  const removeHistoryItem = useCallback((id: string) => {
    setTransferHistory((prev) => {
      const newHistory = prev.filter((item) => item.id !== id);
      localStorage.setItem("transferHistory", JSON.stringify(newHistory));
      return newHistory;
    });

    toast({
      title: "Item Removed",
      description: "Transfer history item has been removed.",
    });
  }, []);

  // Clear all history
  const clearHistory = () => {
    setTransferHistory([]);
    localStorage.removeItem("transferHistory");
    toast({
      title: "History Cleared",
      description: "Transfer history has been cleared.",
    });
  };

  // Close preview
  const closePreview = () => setPreviewFile(undefined);

  // Get file type icon based on mime type
  const getFileIcon = (type: string) => {
    if (type.startsWith("image/"))
      return <Image className="h-6 w-6 text-white" />;
    if (type.startsWith("video/"))
      return <Video className="h-6 w-6 text-white" />;
    if (type.startsWith("audio/"))
      return <Music className="h-6 w-6 text-white" />;
    if (type.startsWith("text/"))
      return <FileText className="h-6 w-6 text-white" />;
    if (
      type.includes("zip") ||
      type.includes("rar") ||
      type.includes("tar") ||
      type.includes("7z")
    )
      return <Archive className="h-6 w-6 text-white" />;
    return <File className="h-6 w-6 text-white" />;
  };

  // Calculate transfer speed and ETA
  const getTransferStats = (transfer: ActiveTransfer) => {
    const elapsedTime = (transfer.pausedAt || Date.now()) - transfer.startTime;
    const elapsedSeconds = elapsedTime / 1000;

    if (elapsedSeconds === 0) return { speed: "0 KB/s", eta: "calculating..." };

    const transferredBytes =
      transfer.direction === "sending"
        ? transfer.metadata.size * (transfer.progress / 100)
        : transfer.receivedSize;

    const bytesPerSecond = transferredBytes / elapsedSeconds;

    // Format speed
    let speed = "0 KB/s";
    if (bytesPerSecond > 1024 * 1024) {
      speed = `${(bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`;
    } else {
      speed = `${(bytesPerSecond / 1024).toFixed(2)} KB/s`;
    }

    // Calculate ETA
    const remainingBytes = transfer.metadata.size - transferredBytes;
    const remainingSeconds =
      bytesPerSecond > 0 ? remainingBytes / bytesPerSecond : 0;

    let eta = "calculating...";
    if (remainingSeconds > 60) {
      eta = `${Math.ceil(remainingSeconds / 60)} min`;
    } else {
      eta = `${Math.ceil(remainingSeconds)} sec`;
    }

    return { speed, eta };
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_bottom_right,_#edf7fa,_#5f6caf,_#ffb677)] flex items-center justify-center p-4">
      <div className="container max-w-4xl">
        {/* Main content area */}
        <div className="space-y-6">
          {/* File transfer area */}
          {isConnected ? (
            <Card className="bg-white/10 backdrop-blur-xl border-0 shadow-lg rounded-3xl overflow-hidden">
              <CardHeader className="border-b border-white/10 pb-4">
                <CardTitle className="text-white text-center text-2xl font-light">
                  File Transfer with {connectedPeerId}
                </CardTitle>
              </CardHeader>
              <CardContent className=" space-y-6 p-6 ">
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${
                    isDragActive
                      ? "border-purple-400 bg-purple-400/10"
                      : "border-white/30 hover:border-white/50"
                  }`}
                >
                  <input {...getInputProps()} />
                  <div className="bg-white/20 rounded-full p-4 w-20 h-20 mx-auto flex items-center justify-center">
                    <Upload className="h-10 w-10 text-white" />
                  </div>
                  <p className="mt-4 text-white/80">
                    Drag files here or click to select
                  </p>
                  <p className="text-white/50 text-sm mt-1">
                    Share files securely with your connected peer
                  </p>
                </div>

                {isConnected && (
                  <div className="mt-4 text-center">
                    <Button
                      variant="outline"
                      onClick={() => {
                        console.log("Testing connection...");
                        sendData({ test: "Hello from file sharing!" });
                        toast({
                          title: "Test Message Sent",
                          description:
                            "Check the console for connection details",
                        });
                      }}
                      className="bg-white/10 hover:bg-white/20 text-white border-white/20"
                    >
                      Test Connection
                    </Button>
                  </div>
                )}

                {/* Active transfers list */}
                {activeTransfers.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-white text-lg">Active Transfers</h3>
                    <div className="space-y-3">
                      {activeTransfers.map((transfer, index) => {
                        const { speed, eta } = getTransferStats(transfer);
                        // Ensure we have a valid ID, or generate a fallback
                        const transferKey = transfer.id
                          ? `active-${transfer.id}-${index}`
                          : `transfer-${transfer.metadata.name}-${transfer.startTime}-${index}`;
                        return (
                          <div
                            key={transferKey}
                            className="bg-white/5 p-4 rounded-xl border border-white/10"
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex items-center">
                                <div className="bg-white/10 p-2 rounded-lg mr-3">
                                  {getFileIcon(transfer.metadata.type)}
                                </div>
                                <div>
                                  <p className="text-white text-sm font-medium">
                                    {transfer.metadata.name}
                                  </p>
                                  <p className="text-white/50 text-xs">
                                    {(
                                      transfer.metadata.size /
                                      (1024 * 1024)
                                    ).toFixed(2)}{" "}
                                    MB
                                  </p>
                                </div>
                              </div>

                              <div className="flex space-x-2">
                                {transfer.status === "transferring" && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0 rounded-full bg-white/10 hover:bg-white/20"
                                    onClick={() => pauseTransfer(transfer)}
                                  >
                                    <Pause className="h-4 w-4 text-white" />
                                  </Button>
                                )}
                                {transfer.status === "paused" && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0 rounded-full bg-white/10 hover:bg-white/20"
                                    onClick={() => resumeTransfer(transfer)}
                                  >
                                    <Play className="h-4 w-4 text-white" />
                                  </Button>
                                )}
                                {(transfer.status === "transferring" ||
                                  transfer.status === "paused") && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0 rounded-full bg-white/10 hover:bg-white/20"
                                    onClick={() => cancelTransfer(transfer)}
                                  >
                                    <X className="h-4 w-4 text-white" />
                                  </Button>
                                )}
                                ,
                              </div>
                            </div>

                            <div className="mt-3 space-y-2">
                              <div className="flex justify-between text-white/70 text-xs">
                                <span>
                                  {transfer.status === "transferring" &&
                                    `${speed} • ${eta} remaining`}
                                  {transfer.status === "paused" && "Paused"}
                                  {transfer.status === "completed" &&
                                    "Completed"}
                                  {transfer.status === "cancelled" &&
                                    "Cancelled"}
                                  {transfer.status === "error" &&
                                    "Error: " +
                                      (transfer.error || "Unknown error")}
                                </span>
                                <span>{transfer.progress.toFixed(0)}%</span>
                              </div>
                              <Progress
                                value={transfer.progress}
                                className="w-full h-1.5 bg-white/10"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-white/10 backdrop-blur-xl border-0 shadow-lg rounded-3xl overflow-hidden">
              <CardContent className="p-6">
                <p className="text-center text-white/70">
                  Please connect to a peer before sharing files.
                </p>
              </CardContent>
            </Card>
          )}

          {/* History section */}
          <Card className="bg-white/10 backdrop-blur-xl border-0 shadow-lg rounded-3xl overflow-hidden">
            <CardHeader className="border-b border-white/10 pb-4 flex flex-row justify-between items-center">
              <CardTitle className="text-white text-2xl font-light">
                Transfer History
              </CardTitle>
              <Button
                variant="ghost"
                onClick={clearHistory}
                className="rounded-xl bg-white/10 hover:bg-white/20 text-white"
                disabled={transferHistory.length === 0}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Clear All
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[300px]">
                {transferHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full py-12">
                    <FileX className="h-12 w-12 text-white/30 mb-2" />
                    <p className="text-white/50">No transfer history</p>
                  </div>
                ) : (
                  <div className="p-2 md:p-4 space-y-2 md:space-y-3">
                    {transferHistory.map((record, index) => (
                      <div
                        key={`history-${record.id}-${index}`}
                        className="p-3 md:p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                          <div className="flex">
                            <div className="bg-white/10 p-2 rounded-lg mr-3 flex-shrink-0">
                              {getFileIcon(record.fileType)}
                            </div>
                            <div className="flex-grow min-w-0">
                              <p className="text-white text-sm md:text-base truncate">
                                {record.fileName}
                              </p>
                              <div className="flex flex-wrap text-white/50 text-xs md:text-sm mt-1 gap-2">
                                <span>
                                  {(record.fileSize / 1024).toFixed(2)} KB
                                </span>
                                <span className="hidden xs:inline mx-1">•</span>
                                <span className="capitalize">
                                  {record.direction}
                                </span>
                                <span className="hidden xs:inline mx-1">•</span>
                                <span className="truncate">
                                  {new Date(record.timestamp).toLocaleString()}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2 mt-2 sm:mt-0">
                            {(record.preview === "text" ||
                              (record.preview &&
                                record.preview !== "blob-reference" &&
                                (record.fileType.startsWith("image/") ||
                                  record.fileType.startsWith("video/") ||
                                  record.fileType.startsWith("audio/") ||
                                  record.fileType.startsWith("text/") ||
                                  record.fileType.includes("json") ||
                                  record.fileType.includes("javascript") ||
                                  record.fileType.includes("css")))) && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs"
                                onClick={() => previewFileContent(record)}
                              >
                                Preview
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs"
                              onClick={() => downloadFile(record)}
                            >
                              Download
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 rounded-full bg-white/10 hover:bg-white/20 text-white"
                              onClick={() => removeHistoryItem(record.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>

                        {/* Preview for images */}
                        {record.preview &&
                          record.preview !== "text" &&
                          record.fileType.startsWith("image/") && (
                            <div className="mt-3 p-2 bg-black/20 rounded-lg">
                              <img
                                src={record.preview || "/placeholder.svg"}
                                alt={record.fileName}
                                className="max-h-32 rounded mx-auto object-contain"
                              />
                            </div>
                          )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
      {previewFile && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-white/10 flex justify-between items-center">
              <h3 className="text-white text-lg font-medium">
                {previewFile.record.fileName}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full h-8 w-8 p-0 bg-white/10 hover:bg-white/20"
                onClick={closePreview}
              >
                <X className="h-4 w-4 text-white" />
              </Button>
            </div>
            <div className="flex-grow overflow-auto p-4">
              {/* Image preview */}
              {previewFile.record.fileType.startsWith("image/") &&
                previewFile.record.preview && (
                  <div className="flex items-center justify-center h-full">
                    <img
                      src={previewFile.record.preview || "/placeholder.svg"}
                      alt={previewFile.record.fileName}
                      className="max-w-full max-h-[70vh] object-contain rounded-lg"
                    />
                  </div>
                )}

              {/* Video preview */}
              {previewFile.record.fileType.startsWith("video/") &&
                previewFile.record.preview && (
                  <div className="flex items-center justify-center h-full">
                    <video
                      src={previewFile.record.preview}
                      controls
                      className="max-w-full max-h-[70vh] rounded-lg"
                    />
                  </div>
                )}

              {/* Audio preview */}
              {previewFile.record.fileType.startsWith("audio/") &&
                previewFile.record.preview && (
                  <div className="flex flex-col items-center justify-center h-full">
                    <div className="bg-white/10 p-6 rounded-xl">
                      <Music className="h-16 w-16 text-white/70 mx-auto mb-4" />
                      <p className="text-white text-center mb-4">
                        {previewFile.record.fileName}
                      </p>
                      <audio
                        src={previewFile.record.preview}
                        controls
                        className="w-full"
                      />
                    </div>
                  </div>
                )}

              {/* Text preview */}
              {previewFile.record.fileType.startsWith("text/") &&
                previewFile.content && (
                  <pre className="text-white/90 whitespace-pre-wrap bg-black/30 p-4 rounded-lg overflow-auto max-h-[70vh]">
                    {previewFile.content}
                  </pre>
                )}

              {/* JSON preview with syntax highlighting */}
              {previewFile.record.fileType.includes("json") &&
                previewFile.content && (
                  <pre className="text-white/90 whitespace-pre-wrap bg-black/30 p-4 rounded-lg overflow-auto max-h-[70vh]">
                    {(() => {
                      try {
                        const formatted = JSON.stringify(
                          JSON.parse(previewFile.content),
                          null,
                          2
                        );
                        return formatted;
                      } catch (e) {
                        return previewFile.content;
                      }
                    })()}
                  </pre>
                )}

              {/* Fallback for unsupported preview types */}
              {!previewFile.record.preview && (
                <div className="flex flex-col items-center justify-center h-full text-white/70">
                  <FileX className="h-16 w-16 mb-4 text-white/40" />
                  <p>Preview not available for this file type</p>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-white/10 flex justify-end">
              <Button
                variant="outline"
                className="bg-white/10 hover:bg-white/20 text-white border-white/20 mr-2"
                onClick={closePreview}
              >
                Close
              </Button>
              <Button
                variant="default"
                className="bg-purple-600 hover:bg-purple-700 text-white"
                onClick={() => downloadFile(previewFile.record)}
              >
                Download
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
