"use client"

import type React from "react"
import { useState, useEffect } from "react"

interface FileAnnotationProps {
  file: File
  annotation: string
  onSave: (fileName: string, annotation: string) => void
}

export const FileAnnotation: React.FC<FileAnnotationProps> = ({ file, annotation, onSave }) => {
  const [currentAnnotation, setCurrentAnnotation] = useState(annotation)

  useEffect(() => {
    setCurrentAnnotation(annotation)
  }, [annotation])

  const handleSave = () => {
    onSave(file.name, currentAnnotation)
  }

  return (
    <div className="mt-8 w-full max-w-md">
      <h2 className="text-2xl mb-4">File Annotation</h2>
      <p className="mb-2">
        <strong>{file.name}</strong> ({file.size} bytes)
      </p>
      <textarea
        value={currentAnnotation}
        onChange={(e) => setCurrentAnnotation(e.target.value)}
        className="w-full p-2 border rounded mb-2"
        rows={4}
        placeholder="Add your annotation here..."
      />
      <button onClick={handleSave} className="p-2 bg-green-500 text-white rounded">
        Save Annotation
      </button>
    </div>
  )
}

