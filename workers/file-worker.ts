const ctx: Worker = self as any;

ctx.addEventListener('message', (event) => {
  const { type, payload } = event.data;
  
  switch (type) {
    case 'ASSEMBLE_FILE':
      assembleFile(payload);
      break;
      
    case 'CHUNK_FILE':
      chunkFile(payload);
      break;
      
    default:
      console.error('Unknown message type:', type);
  }
});

// Improve chunking mechanism with better progress reporting
self.onmessage = async (event) => {
  const { file, chunkSize } = event.data;
  const totalChunks = Math.ceil(file.size / chunkSize);
  let currentChunk = 0;
  
  // Read file in chunks and send progress updates
  const reader = new FileReader();
  let offset = 0;
  
  const readNextChunk = () => {
    const slice = file.slice(offset, offset + chunkSize);
    reader.readAsArrayBuffer(slice);
  };
  
  reader.onload = (e) => {
    if (e.target?.result) {
      currentChunk++;
      const progress = Math.round((currentChunk / totalChunks) * 100);
      
      // Send both the chunk and the progress
      self.postMessage({
        chunk: e.target.result,
        progress,
        fileName: file.name,
        fileType: file.type,
        currentChunk,
        totalChunks,
        done: currentChunk === totalChunks
      });
      
      offset += chunkSize;
      if (offset < file.size) {
        // Continue with next chunk
        readNextChunk();
      }
    }
  };
  
  reader.onerror = (error) => {
    self.postMessage({ error: 'Error reading file' });
  };
  
  readNextChunk();
};

function assembleFile(payload: { fileId: string, chunks: Uint8Array[], metadata: any }) {
  const { fileId, chunks, metadata } = payload;
  
  try {
    // Create a combined buffer
    const fileData = new Uint8Array(metadata.size);
    let offset = 0;
    
    for (const chunk of chunks) {
      fileData.set(chunk, offset);
      offset += chunk.length;
    }
    
    // Create blob
    const blob = new Blob([fileData], { type: metadata.type });
    
    // Send back to main thread
    ctx.postMessage({
      type: 'FILE_ASSEMBLED',
      payload: {
        fileId,
        blob,
        metadata
      }
    });
  } catch (error) {
    ctx.postMessage({
      type: 'ERROR',
      payload: {
        fileId, 
        error: (error as Error).message
      }
    });
  }
}

function chunkFile(payload: { fileId: string, fileData: ArrayBuffer, chunkSize: number, metadata: any }) {
  const { fileId, fileData, chunkSize, metadata } = payload;
  
  try {
    const data = new Uint8Array(fileData);
    const chunks: { index: number, data: Uint8Array }[] = [];
    
    let offset = 0;
    let index = 0;
    
    while (offset < data.length) {
      const end = Math.min(offset + chunkSize, data.length);
      const chunk = data.slice(offset, end);
      
      chunks.push({
        index,
        data: chunk
      });
      
      offset = end;
      index++;
    }
    
    ctx.postMessage({
      type: 'FILE_CHUNKED',
      payload: {
        fileId,
        chunks,
        metadata
      }
    });
  } catch (error) {
    ctx.postMessage({
      type: 'ERROR',
      payload: {
        fileId, 
        error: (error as Error).message
      }
    });
  }
}