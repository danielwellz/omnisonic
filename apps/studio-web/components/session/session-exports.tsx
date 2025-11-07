"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SerializedExport } from "@/lib/exports";
import { Button } from "@/components/ui/button";
import { useExportEvents } from "@/hooks/useExportEvents";
import type { ExportProgressPayload } from "@/types/exports";

type SessionExportsProps = {
  sessionId: string;
  isOwner: boolean;
  initialExports: SerializedExport[];
  maxActive: number;
};

type ExportFormatOption = SerializedExport["format"];

const formatLabels: Record<ExportFormatOption, string> = {
  wav: "WAV (lossless)",
  mp3: "MP3",
  flac: "FLAC"
};

function mergeExport(prev: SerializedExport, update: Partial<SerializedExport>): SerializedExport {
  return {
    ...prev,
    ...update,
    updatedAt: update.updatedAt ?? new Date().toISOString()
  };
}

export function SessionExports({ sessionId, isOwner, initialExports, maxActive }: SessionExportsProps) {
  const [exports, setExports] = useState<SerializedExport[]>(initialExports);
  const [format, setFormat] = useState<ExportFormatOption>("wav");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const activeExports = exports.filter((item) => item.status === "pending" || item.status === "processing");
  const canEnqueue = isOwner && activeExports.length < maxActive;

  const upsertExport = useCallback((payload: ExportProgressPayload) => {
    setExports((current) => {
      const existing = current.find((item) => item.id === payload.exportId);
      if (!existing) {
        return [
          {
            id: payload.exportId,
            sessionId: payload.sessionId,
            userId: "",
            status: payload.status,
            format: payload.format,
            progress: payload.progress,
            fileUrl: payload.fileUrl ?? null,
            storageKey: null,
            fileSize: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            completedAt: payload.completedAt ?? null,
            errorMessage: payload.errorMessage ?? null,
            downloadUrl: payload.downloadUrl ?? null
          },
          ...current
        ];
      }
      return current.map((item) =>
        item.id === payload.exportId
          ? mergeExport(item, {
              status: payload.status,
              progress: payload.progress,
              fileUrl: payload.fileUrl ?? item.fileUrl,
              completedAt: payload.completedAt ?? item.completedAt,
              errorMessage: payload.errorMessage ?? item.errorMessage,
              downloadUrl: payload.downloadUrl ?? item.downloadUrl
            })
          : item
      );
    });
  }, []);

  const events = useExportEvents({
    sessionId,
    enabled: true,
    onEvent: upsertExport
  });

  useEffect(() => {
    setExports(initialExports);
  }, [initialExports]);

  const handleEnqueue = async () => {
    setError(null);
    setStatusMessage(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, format })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error ?? "Failed to enqueue export");
      }
      if (body?.export) {
        setExports((current) => [body.export as SerializedExport, ...current]);
      }
      setStatusMessage("Export queued");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enqueue export");
    } finally {
      setIsSubmitting(false);
    }
  };

  const sortedExports = useMemo(
    () =>
      [...exports].sort((a, b) => {
        return new Date(b.createdAt).valueOf() - new Date(a.createdAt).valueOf();
      }),
    [exports]
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1">
            <label className="text-sm font-medium text-muted-foreground" htmlFor="export-format">
              Output format
            </label>
            <select
              id="export-format"
              value={format}
              onChange={(event) => setFormat(event.target.value as ExportFormatOption)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={!isOwner}
            >
              {Object.entries(formatLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={handleEnqueue} disabled={!isOwner || isSubmitting || !canEnqueue}>
            {isSubmitting ? "Queueing…" : "Render mixdown"}
          </Button>
        </div>
        <div className="mt-2 text-xs text-muted-foreground flex flex-col gap-1">
          <span>{events.connected ? "Realtime connected" : "Waiting for realtime connection…"}</span>
          <span>Active exports: {activeExports.length}/{maxActive}</span>
        </div>
        {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
        {statusMessage ? <p className="mt-2 text-sm text-emerald-600">{statusMessage}</p> : null}
      </div>
      <div className="space-y-2">
        {sortedExports.length === 0 ? (
          <p className="text-sm text-muted-foreground">No exports yet.</p>
        ) : (
          <ul className="space-y-3">
            {sortedExports.map((item) => {
              const isComplete = item.status === "completed";
              const isFailed = item.status === "failed";
              const downloadHref = item.downloadUrl ?? `/api/export/${item.id}/download`;
              return (
                <li key={item.id} className="rounded-lg border p-4 shadow-sm">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-medium">
                        {formatLabels[item.format]} • {new Date(item.createdAt).toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">Status: {item.status}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-40 rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-primary transition-all"
                          style={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">{item.progress}%</span>
                      {isComplete ? (
                        <a
                          href={downloadHref}
                          className="text-xs font-semibold text-primary underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Download
                        </a>
                      ) : null}
                    </div>
                  </div>
                  {isFailed && item.errorMessage ? (
                    <p className="mt-2 text-xs text-destructive">Error: {item.errorMessage}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
