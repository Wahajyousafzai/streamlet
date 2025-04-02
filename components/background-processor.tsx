import * as bodyPix from "@tensorflow-models/body-pix";
import "@tensorflow/tfjs-backend-webgl";
import type { RefObject } from "react";

// At the top of the file, add this type definition
type BodyPixInternalResolution = "low" | "medium" | "high" | "full";

interface ProcessStreamOptions {
  stream: MediaStream;
  selectedBackground: string;
  isAudioMuted: boolean;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  backgroundImageRef: RefObject<HTMLImageElement | null>;
  setLocalStream: (stream: MediaStream) => void;
}

// Static references for WebGL resources
let net: bodyPix.BodyPix | null = null;
let glRef: WebGLRenderingContext | null = null;
let videoElement: HTMLVideoElement | null = null;
let videoTextureRef: WebGLTexture | null = null;
let maskTextureRef: WebGLTexture | null = null;
let programRef: WebGLProgram | null = null;
// Animation frame ID for cancellation
let animationFrameId: number | null = null;
// Flag to indicate if rendering should continue
let isRendering = false;
// Buffer objects for reuse
let positionBuffer: WebGLBuffer | null = null;
let texCoordBuffer: WebGLBuffer | null = null;

// Fixed type definitions for shader locations
let locationRef = {
  position: -1,
  texCoord: -1,
};

// Separate ref for uniform locations with correct type
let uniformLocationsRef = {
  videoFrame: null as WebGLUniformLocation | null,
  mask: null as WebGLUniformLocation | null,
};

// Add a flag to track if the model is already loading
let isModelLoading = false;

// Track the output canvas for reuse
let outputCanvasRef: HTMLCanvasElement | null = null;
// Track the output stream for reuse
let outputStreamRef: MediaStream | null = null;

const BackgroundProcessor = {
  // Determine optimal processing settings based on device capabilities
  getOptimalProcessingSettings() {
    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
    const isLowEndDevice = navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency <= 4
      : true;

    return {
      // Use lower resolution and quality settings for mobile or low-end devices
      internalResolution: (isMobile || isLowEndDevice
        ? "low"
        : "medium") as BodyPixInternalResolution,
      segmentationThreshold: 0.3, // Lower threshold to make segmentation more sensitive
      maxDetections: 1,
      scoreThreshold: 0.2, // Lower score threshold to detect person more easily
      // Reduce processing frequency on low-end devices
      skipFrames: isLowEndDevice ? 2 : 0,
    };
  },

  // Process stream with background removal
  async processStreamWithBackgroundRemoval({
    stream,
    selectedBackground,
    isAudioMuted,
    canvasRef,
    backgroundImageRef,
    setLocalStream,
  }: ProcessStreamOptions): Promise<MediaStream> {
    console.log("Starting background removal process");

    // Clean up existing WebGL resources
    this.cleanupWebGL();

    // Set rendering flag to true
    isRendering = true;

    const originalAudioTrack = stream.getAudioTracks()[0];

    // Set up video element for background removal processing
    videoElement = document.createElement("video");
    videoElement.srcObject = stream;
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    videoElement.muted = true;

    // Wait for video to be ready
    await new Promise((resolve) => {
      if (videoElement) {
        videoElement.onloadedmetadata = resolve;
      }
    });

    await videoElement.play().catch((err) => {
      console.error("Error playing video:", err);
    });

    // Get the video dimensions from the input stream
    const videoTrack = stream.getVideoTracks()[0];
    const settings = videoTrack.getSettings();
    const videoWidth = settings.width || 640;
    const videoHeight = settings.height || 480;

    // Calculate appropriate canvas dimensions while preserving aspect ratio
    // For mobile, we'll use a more reasonable resolution to improve performance
    const isMobile = window.innerWidth < 768;
    const scaleFactor = isMobile ? 0.5 : 0.75; // Lower scale factor for mobile
    const canvasWidth = Math.round(videoWidth * scaleFactor);
    const canvasHeight = Math.round(videoHeight * scaleFactor);

    // Create and set up canvas for WebGL with the calculated dimensions
    const glCanvas = document.createElement("canvas");
    glCanvas.width = canvasWidth;
    glCanvas.height = canvasHeight;

    // Create a second canvas for final compositing or reuse existing
    if (!outputCanvasRef) {
      outputCanvasRef = document.createElement("canvas");
      outputCanvasRef.width = canvasWidth;
      outputCanvasRef.height = canvasHeight;
    } else {
      // Update dimensions if canvas already exists
      outputCanvasRef.width = canvasWidth;
      outputCanvasRef.height = canvasHeight;
    }

    if (canvasRef.current) {
      canvasRef.current = outputCanvasRef;
    }

    // Initialize WebGL on the first canvas
    const webglInitResult = this.initWebGL(glCanvas);
    if (!webglInitResult) {
      console.error("Failed to initialize WebGL, falling back to raw stream");
      setLocalStream(stream);
      return stream;
    }

    // Load BodyPix model with a lock to prevent multiple simultaneous loads
    if (!net && !isModelLoading) {
      console.log("Loading BodyPix model...");
      isModelLoading = true;

      try {
        // Use a more efficient model configuration
        net = await bodyPix.load({
          architecture: "MobileNetV1",
          outputStride: 16,
          multiplier: 0.75, // Higher multiplier for better quality
          quantBytes: 2,
        });
        console.log("BodyPix model loaded successfully");
        isModelLoading = false;
      } catch (error) {
        console.error("Failed to load BodyPix model:", error);
        isModelLoading = false;
        // If model fails to load, return the original stream
        setLocalStream(stream);
        return stream;
      }
    } else if (isModelLoading) {
      console.log("BodyPix model is already loading, waiting...");
      // Wait for model to finish loading (with timeout)
      let attempts = 0;
      while (isModelLoading && attempts < 20) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        attempts++;
      }

      if (!net) {
        console.error("Timed out waiting for BodyPix model to load");
        setLocalStream(stream);
        return stream;
      }
    }

    // Start rendering frames
    this.renderFrame(glCanvas, outputCanvasRef, backgroundImageRef);

    // Capture stream and add audio
    let outputStream: MediaStream;
    try {
      // Create new stream with higher framerate
      outputStream = outputCanvasRef.captureStream(30);
      outputStreamRef = outputStream;
    } catch (err) {
      console.error("Error capturing canvas stream:", err);
      setLocalStream(stream);
      return stream;
    }

    if (originalAudioTrack) {
      // Add the original audio track
      outputStream.addTrack(originalAudioTrack);

      // Apply current audio mute state
      originalAudioTrack.enabled = !isAudioMuted;
      console.log(`Audio track added to output stream. Muted: ${isAudioMuted}`);
    } else {
      console.warn("No audio track available to add to the processed stream");
    }

    setLocalStream(outputStream);
    console.log("Background removal process initialized successfully");
    return outputStream;
  },

  // Initialize WebGL for background removal
  initWebGL(canvas: HTMLCanvasElement) {
    // Use the dimensions already set on the canvas instead of hardcoding them
    const width = canvas.width;
    const height = canvas.height;

    // Try to get WebGL2 context first, then fall back to WebGL1
    let gl: WebGLRenderingContext | null = null;

    try {
      // Try WebGL2 first
      gl =
        (canvas.getContext("webgl2", {
          powerPreference: "high-performance",
        }) as WebGLRenderingContext) ||
        (canvas.getContext("webgl", {
          powerPreference: "high-performance",
        }) as WebGLRenderingContext) ||
        (canvas.getContext("experimental-webgl", {
          powerPreference: "high-performance",
        }) as WebGLRenderingContext);

      if (!gl) {
        console.error("❌ WebGL not supported in this browser!");
        return null;
      }
    } catch (e) {
      console.error("❌ Error initializing WebGL:", e);
      return null;
    }

    glRef = gl;
    console.log("✅ WebGL initialized successfully.");

    // Create shader program - FIXED SHADER CODE for proper alpha blending
    const vertexShaderSource = `
      attribute vec4 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
          gl_Position = a_position;
          v_texCoord = a_texCoord;
      }
    `;

    // Replace the fragment shader in the initWebGL method with this updated version
    const fragmentShaderSource = `
  precision mediump float;
  varying vec2 v_texCoord;
  uniform sampler2D u_videoFrame;
  uniform sampler2D u_mask;
  void main() {
      vec4 videoColor = texture2D(u_videoFrame, v_texCoord);
      vec4 maskColor = texture2D(u_mask, v_texCoord);
      
      // The mask's red channel should determine if this is a person pixel
      // Important: Use the mask directly without inverting the alpha
      float maskValue = maskColor.r;
      
      // Output the video color with proper alpha based on the mask
      gl_FragColor = vec4(videoColor.rgb, maskValue);
  }
`;

    try {
      const program = this.createWebGLProgram(
        gl,
        vertexShaderSource,
        fragmentShaderSource
      );
      programRef = program;

      // Set up positions (full screen quad)
      positionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      const positions = [-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0];
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array(positions),
        gl.STATIC_DRAW
      );

      // Set up texture coordinates
      texCoordBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
      const texCoords = [0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0];
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array(texCoords),
        gl.STATIC_DRAW
      );

      // Get attribute locations (these are numbers)
      locationRef = {
        position: gl.getAttribLocation(program, "a_position"),
        texCoord: gl.getAttribLocation(program, "a_texCoord"),
      };

      // Get uniform locations (these are WebGLUniformLocation | null)
      uniformLocationsRef = {
        videoFrame: gl.getUniformLocation(program, "u_videoFrame"),
        mask: gl.getUniformLocation(program, "u_mask"),
      };

      // Create textures with error handling
      try {
        videoTextureRef = gl.createTexture();
        if (!videoTextureRef) {
          throw new Error("Failed to create video texture");
        }

        maskTextureRef = gl.createTexture();
        if (!maskTextureRef) {
          throw new Error("Failed to create mask texture");
        }

        // Set up textures
        this.setupTexture(gl, videoTextureRef);
        this.setupTexture(gl, maskTextureRef);
      } catch (e) {
        console.error("❌ Error creating textures:", e);
        this.cleanupWebGL();
        return null;
      }

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0.0, 0.0, 0.0, 0.0); // Transparent background

      return { gl, program };
    } catch (e) {
      console.error("❌ Error setting up WebGL buffers:", e);
      this.cleanupWebGL();
      return null;
    }
  },

  // Add a helper method to set up textures
  setupTexture(gl: WebGLRenderingContext, texture: WebGLTexture | null) {
    if (!texture) return;

    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Use safer texture parameters that work in more contexts
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Initialize with a 1x1 transparent pixel to avoid "uninitialized texture" warnings
    const pixel = new Uint8Array([0, 0, 0, 0]);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixel
    );
  },

  // Create WebGL program
  createWebGLProgram(
    gl: WebGLRenderingContext,
    vertexSource: string,
    fragmentSource: string
  ): WebGLProgram {
    const vertexShader = this.compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this.compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      fragmentSource
    );

    const program = gl.createProgram();
    if (!program) {
      throw new Error("Failed to create WebGL program.");
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("❌ Program link failed:", gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      throw new Error("Shader program linking failed.");
    }

    return program;
  },

  // Compile shader
  compileShader(
    gl: WebGLRenderingContext,
    type: number,
    source: string
  ): WebGLShader {
    const shader = gl.createShader(type);
    if (!shader) {
      throw new Error("Failed to create shader.");
    }

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("Shader compile failed:", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      throw new Error("Shader compilation failed.");
    }

    return shader;
  },

// Find the renderFrame method and replace it entirely with this implementation:
async renderFrame(
  glCanvas: HTMLCanvasElement,
  outputCanvas: HTMLCanvasElement,
  backgroundImageRef: RefObject<HTMLImageElement | null>,
) {
  // If we're no longer rendering, exit early
  if (!isRendering) {
    console.log("Rendering stopped, exiting render loop");
    return;
  }

  const gl = glRef;
  const video = videoElement;
  const outputCtx = outputCanvas.getContext('2d');

  if (!gl || !video || !video.videoWidth || !programRef || !outputCtx) {
    // Only continue the animation if we're still rendering
    if (isRendering) {
      animationFrameId = requestAnimationFrame(() => 
        this.renderFrame(glCanvas, outputCanvas, backgroundImageRef)
      );
    }
    return;
  }

  try {
    // CRITICAL CHANGE: Use 2D Canvas approach for compositing instead of WebGL
    // This is a more reliable approach for ensuring the foreground is visible
    
    // Step 1: Perform segmentation with BodyPix
    if (net) {
      try {
        // Get segmentation mask with more sensitive settings
        const segmentation = await net.segmentPerson(video, {
          internalResolution: 'medium',
          segmentationThreshold: 0.5, // Try 0.3 if 0.5 doesn't work well
          maxDetections: 1,
          scoreThreshold: 0.3,
        });
        
        // Step 2: Draw directly to output canvas with 2D context
        const { width, height, data } = segmentation;
        
        // Count person pixels for debugging
        let personPixels = 0;
        for (let i = 0; i < data.length; i++) {
          if (data[i]) personPixels++;
        }
        
        console.log(`Person pixels: ${personPixels}/${data.length} (${(personPixels/data.length*100).toFixed(1)}%)`);
        
        // Clear the output canvas
        outputCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
        
        // Draw background first
        if (backgroundImageRef.current) {
          const bgImg = backgroundImageRef.current;
          const bgAspect = bgImg.width / bgImg.height;
          const canvasAspect = outputCanvas.width / outputCanvas.height;
          
          let drawWidth = outputCanvas.width;
          let drawHeight = outputCanvas.height;
          let offsetX = 0;
          let offsetY = 0;
          
          // Adjust dimensions to cover canvas while maintaining aspect ratio
          if (bgAspect > canvasAspect) {
            drawHeight = outputCanvas.width / bgAspect;
            offsetY = (outputCanvas.height - drawHeight) / 2;
          } else {
            drawWidth = outputCanvas.height * bgAspect;
            offsetX = (outputCanvas.width - drawWidth) / 2;
          }
          
          outputCtx.drawImage(
            bgImg, 
            0, 0, bgImg.width, bgImg.height,
            offsetX, offsetY, drawWidth, drawHeight
          );
        } else {
          // Use solid black background if no image
          outputCtx.fillStyle = '#000000';
          outputCtx.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
        }
        
        // Create an in-memory canvas for processing the video frame
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');
        
        if (!tempCtx) {
          throw new Error("Failed to get temporary canvas context");
        }
        
        // Draw the video frame to the temporary canvas
        tempCtx.drawImage(video, 0, 0, width, height);
        
        // Get the video frame pixel data
        const frameData = tempCtx.getImageData(0, 0, width, height);
        
        // Create a new ImageData for the foreground (person) only
        const foregroundData = new ImageData(width, height);
        
        // For each pixel, keep only the person pixels and make background transparent
        for (let i = 0; i < data.length; i++) {
          const j = i * 4; // each pixel has 4 values (RGBA)
          
          if (data[i]) { // This is a person pixel
            // Copy RGB from video frame
            foregroundData.data[j] = frameData.data[j];     // R
            foregroundData.data[j+1] = frameData.data[j+1]; // G
            foregroundData.data[j+2] = frameData.data[j+2]; // B
            foregroundData.data[j+3] = 255;                 // A (fully opaque)
          } else { // This is background
            // Make transparent
            foregroundData.data[j] = 0;   // R
            foregroundData.data[j+1] = 0; // G
            foregroundData.data[j+2] = 0; // B
            foregroundData.data[j+3] = 0; // A (fully transparent)
          }
        }
        
        // Put the foreground data back to the temporary canvas
        tempCtx.putImageData(foregroundData, 0, 0);
        
        // IMPORTANT: Draw the person (foreground) on top of the background
        outputCtx.drawImage(
          tempCanvas,
          0, 0, width, height,
          0, 0, outputCanvas.width, outputCanvas.height
        );
        
        // Optional: Add border to show canvas bounds during debugging
        // outputCtx.strokeStyle = 'red';
        // outputCtx.lineWidth = 4;
        // outputCtx.strokeRect(0, 0, outputCanvas.width, outputCanvas.height);
      } catch (error) {
        console.error("Error in segmentation processing:", error);
        
        // Fallback: Just display the original video
        outputCtx.drawImage(
          video,
          0, 0, video.videoWidth, video.videoHeight,
          0, 0, outputCanvas.width, outputCanvas.height
        );
      }
    } else {
      // If BodyPix is not available yet, just show the video
      outputCtx.drawImage(
        video,
        0, 0, video.videoWidth, video.videoHeight,
        0, 0, outputCanvas.width, outputCanvas.height
      );
      
      console.warn("BodyPix model not available yet, showing original video");
    }
  } catch (error) {
    console.error("Critical error in render loop:", error);
    
    // If we encounter a critical error, try to recover
    try {
      // Show original video as fallback
      if (outputCtx && video) {
        outputCtx.drawImage(
          video,
          0, 0, video.videoWidth, video.videoHeight,
          0, 0, outputCanvas.width, outputCanvas.height
        );
      }
    } catch (fallbackError) {
      console.error("Even fallback rendering failed:", fallbackError);
    }
  }
  
  // Continue rendering only if we're still supposed to be rendering
  if (isRendering) {
    animationFrameId = requestAnimationFrame(() => 
      this.renderFrame(glCanvas, outputCanvas, backgroundImageRef)
    );
  }
},

  // Clean up WebGL resources
  cleanupWebGL() {
    if (glRef) {
      const gl = glRef;

      try {
        // Clean up existing textures
        if (videoTextureRef) {
          gl.deleteTexture(videoTextureRef);
          videoTextureRef = null;
        }

        if (maskTextureRef) {
          gl.deleteTexture(maskTextureRef);
          maskTextureRef = null;
        }

        // Clean up buffers
        if (positionBuffer) {
          gl.deleteBuffer(positionBuffer);
          positionBuffer = null;
        }

        if (texCoordBuffer) {
          gl.deleteBuffer(texCoordBuffer);
          texCoordBuffer = null;
        }

        // Delete existing program
        if (programRef) {
          gl.deleteProgram(programRef);
          programRef = null;
        }

        // Reset locations
        locationRef = {
          position: -1,
          texCoord: -1,
        };

        uniformLocationsRef = {
          videoFrame: null,
          mask: null,
        };

        // Lose the context as a last step
        const loseContextExt = gl.getExtension("WEBGL_lose_context");
        if (loseContextExt) {
          loseContextExt.loseContext();
        }
      } catch (e) {
        console.error("Error during WebGL cleanup:", e);
      }

      glRef = null;
    }
  },

  // Stop rendering loop
  stopRendering() {
    isRendering = false;

    // Cancel any pending animation frame
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  },

  // Clean up all resources
  cleanup() {
    // First stop the rendering loop
    this.stopRendering();

    // Then clean up WebGL resources
    this.cleanupWebGL();

    // Reset video element
    if (videoElement) {
      try {
        if (videoElement.srcObject) {
          const stream = videoElement.srcObject as MediaStream;
          stream.getTracks().forEach((track) => {
            try {
              track.stop();
            } catch (e) {
              console.error("Error stopping track:", e);
            }
          });
        }
        videoElement.srcObject = null;
        videoElement.remove();
        videoElement = null;
      } catch (e) {
        console.error("Error cleaning up video element:", e);
      }
    }

    // Don't set net to null immediately, as there might be pending operations
    console.log("✅ Background processor resources cleaned up");
  },
};

export default BackgroundProcessor;
