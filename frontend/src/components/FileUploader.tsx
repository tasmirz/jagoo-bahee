"use client";

import { useState, useRef, ChangeEvent } from 'react';
import { backendFetch } from '@/lib/backend';
import { sha256 } from '@/lib/crypto';

interface FileUploaderProps {
  onUploadComplete: (fileId: string, hash: string, url: string) => void;
  acceptedTypes?: string;
  maxSizeMB?: number;
  label?: string;
}

export default function FileUploader({
  onUploadComplete,
  acceptedTypes = "image/*,video/*",
  maxSizeMB = 100,
  label = "Upload File"
}: FileUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size
    const maxBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      setError(`File size must be less than ${maxSizeMB}MB`);
      return;
    }

    setError(null);
    setUploading(true);
    setProgress(0);

    try {
      // Generate preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setPreview(e.target?.result as string);
        };
        reader.readAsDataURL(file);
      }

      // Calculate file hash
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const hashBytes = await sha256(uint8Array);
      const hash = Array.from(hashBytes).map(b => b.toString(16).padStart(2, '0')).join('');

      // Request pre-signed URL from backend
      const presignedRes = await backendFetch('/attachments/presigned-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          size: file.size,
          hash,
        }),
      });

      if (!presignedRes.ok) {
        throw new Error('Failed to get upload URL');
      }

      const { uploadUrl, minioKey, attachment } = await presignedRes.json();
      const fileId = attachment._id;

      // Upload to MinIO using pre-signed URL
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          setProgress(percentComplete);
        }
      });

      xhr.addEventListener('load', async () => {
        if (xhr.status === 200) {
          // Confirm upload with backend
          const confirmRes = await backendFetch('/attachments/confirm-upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: minioKey, hash }),
          });

          if (confirmRes.ok) {
            const confirmed = await confirmRes.json();
            const downloadUrl = `/attachments/download/${minioKey}`;
            onUploadComplete(fileId, hash, downloadUrl);
            setUploading(false);
            setProgress(100);
          } else {
            throw new Error('Failed to confirm upload');
          }
        } else {
          throw new Error('Upload failed');
        }
      });

      xhr.addEventListener('error', () => {
        throw new Error('Upload failed');
      });

      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.send(file);

    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'Upload failed');
      setUploading(false);
      setProgress(0);
      setPreview(null);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleReset = () => {
    setPreview(null);
    setProgress(0);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="w-full">
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedTypes}
        onChange={handleFileSelect}
        className="hidden"
        disabled={uploading}
      />

      {!preview && !uploading && (
        <button
          type="button"
          onClick={handleClick}
          className="w-full px-4 py-8 border-2 border-dashed border-[var(--border)] rounded-lg hover:border-[var(--primary)] hover:bg-[var(--muted)] transition-colors text-center"
        >
          <div className="text-4xl mb-2">📎</div>
          <div className="font-medium">{label}</div>
          <div className="text-sm text-[var(--text-secondary)] mt-1">
            Max {maxSizeMB}MB
          </div>
        </button>
      )}

      {preview && !uploading && (
        <div className="relative border border-[var(--border)] rounded-lg overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Preview" className="w-full h-auto max-h-96 object-contain" />
          <button
            type="button"
            onClick={handleReset}
            className="absolute top-2 right-2 px-3 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
          >
            Remove
          </button>
        </div>
      )}

      {uploading && (
        <div className="border border-[var(--border)] rounded-lg p-6">
          {preview && (
            <div className="mb-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Preview" className="w-full h-auto max-h-48 object-contain opacity-50" />
            </div>
          )}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Uploading...</span>
              <span className="font-medium">{progress}%</span>
            </div>
            <div className="w-full bg-[var(--muted)] rounded-full h-2 overflow-hidden">
              <div
                className="bg-[var(--primary)] h-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-2 px-4 py-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          {error}
        </div>
      )}

      {progress === 100 && !uploading && (
        <div className="mt-2 px-4 py-3 bg-green-50 border border-green-200 rounded-md text-green-700 text-sm">
          ✓ Upload complete!
        </div>
      )}
    </div>
  );
}
