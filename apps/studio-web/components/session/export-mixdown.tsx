"use client";
import { useState } from "react";

import { Button } from "@/components/ui/button";

interface ExportMixdownProps {
  sessionId: string;
  disabled?: boolean;
}

export function ExportMixdown({ sessionId, disabled = false }: ExportMixdownProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "done">("idle");
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setStatus("loading");
    setError(null);
    setUrl(null);

    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Export failed");
      }

      const data = (await res.json()) as { url: string };
      setUrl(data.url);
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }

  return (
    <div className="space-y-3">
      <Button onClick={handleExport} disabled={disabled || status === "loading"}>
        {status === "loading" ? "Rendering mixdown…" : "Export mixdown"}
      </Button>
      {status === "done" && url ? (
        <p className="text-sm text-muted-foreground">
          Mixdown ready: <a className="underline" href={url} target="_blank" rel="noreferrer">Download WAV</a>
        </p>
      ) : null}
      {status === "error" && error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
