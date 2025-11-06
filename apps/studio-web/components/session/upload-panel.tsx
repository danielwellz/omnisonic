"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface UploadRecord {
  upload: {
    id: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    createdAt: string;
  };
  downloadUrl: string | null;
}

interface UploadPanelProps {
  sessionId: string;
  disabled?: boolean;
}

export function UploadPanel({ sessionId, disabled = false }: UploadPanelProps) {
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function loadUploads() {
    const res = await fetch(`/api/upload/list?sessionId=${sessionId}`);
    if (!res.ok) return;
    const data = await res.json();
    setUploads(data.uploads ?? []);
  }

  useEffect(() => {
    void loadUploads();
  }, [sessionId]);

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return;
    setIsUploading(true);
    setError(null);
    const file = files[0];

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sessionId", sessionId);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Upload failed");
      }

      await loadUploads();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/upload/${id}/delete`, { method: "POST" });
    await loadUploads();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,image/*,video/*"
          data-testid="upload-input"
          className="hidden"
          onChange={(event) => handleUpload(event.target.files)}
          disabled={disabled}
        />
        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isUploading}
        >
          {isUploading ? "Uploading..." : "Upload asset"}
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
      {uploads.length ? (
        <ul className="space-y-2">
          {uploads.map(({ upload, downloadUrl }) => (
            <li key={upload.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">{upload.fileName}</p>
                <p className="text-xs text-gray-500">
                  {(upload.fileSize / (1024 * 1024)).toFixed(2)} MB • {new Date(upload.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={downloadUrl ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-blue-600 disabled:opacity-50"
                  aria-disabled={!downloadUrl}
                >
                  Download
                </a>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => handleDelete(upload.id)}
                  className="text-xs text-red-600"
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No uploads yet.</p>
      )}
    </div>
  );
}
