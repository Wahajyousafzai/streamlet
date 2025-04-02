import type { RefObject } from "react"
import { VideoIcon, VideoOffIcon } from "lucide-react"


interface VideoDisplayProps {
    remoteStream: MediaStream | null
    remoteVideoRef: RefObject<HTMLVideoElement | null>
    localVideoRef: RefObject<HTMLVideoElement | null>
    connectedPeerId: string | null
    isVideoEnabled: boolean
    isLoading: boolean
    callStatus: "idle" | "connecting" | "connected" | "ending"
}

export default function VideoDisplay({
    remoteStream,
    remoteVideoRef,
    localVideoRef,
    connectedPeerId,
    isVideoEnabled,
    isLoading,
    callStatus,
}: VideoDisplayProps) {
    return (
        <div className="relative bg-white rounded-lg shadow-md overflow-hidden">
            {/* Remote Video */}
            <div className="aspect-video w-full relative">
                {remoteStream ? (
                    <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center">
                        <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center mb-4">
                            <VideoIcon className="w-10 h-10 text-gray-400" />
                        </div>
                        <p className="text-gray-500 font-medium">Waiting for participant to join...</p>
                    </div>
                )}

                {/* Local Video (PiP) */}
                <div className="absolute top-4 left-4 w-[180px] aspect-4/3 bg-gray-200 rounded-lg overflow-hidden shadow-md border-2 border-white">
                    <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                    {!isVideoEnabled && (
                        <div className="absolute inset-0 bg-gray-800 bg-opacity-70 flex flex-col items-center justify-center">
                            <VideoOffIcon className="h-8 w-8 text-white opacity-80 mb-1" />
                            <p className="text-xs text-white">Camera off</p>
                        </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 py-1 px-2">
                        <p className="text-white text-xs text-center">You</p>
                    </div>
                </div>

                {/* Remote User Info */}
                {remoteStream && (
                    <div className="absolute top-4 right-4 bg-black bg-opacity-50 text-white text-xs py-1 px-3 rounded-full flex items-center">
                        <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                        <span>{connectedPeerId ? `${connectedPeerId.substring(0, 6)}...` : "Connected"}</span>
                    </div>
                )}
            </div>
        </div>
    )
}

