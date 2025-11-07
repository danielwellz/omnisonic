"use client";

import { useTransition } from "react";
import {
  exportGenreTrendsCsv,
  exportSourcePerformanceCsv,
  exportTimeseriesCsv,
  exportTimeseriesPng
} from "@/app/analytics/data";
import type { GenreParams, SourceParams, TimeseriesParams } from "@/lib/analytics-params";

function triggerDownload(payload: { base64: string; filename: string; mimeType: string }) {
  const bytes = Uint8Array.from(atob(payload.base64), (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: payload.mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = payload.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function TimeseriesExportButtons({ params }: { params: TimeseriesParams }) {
  const [pendingCsv, startCsv] = useTransition();
  const [pendingPng, startPng] = useTransition();

  return (
    <div className="flex gap-2 text-xs">
      <button
        type="button"
        className="rounded-md border border-gray-700 bg-gray-900 px-3 py-1 text-gray-200 disabled:opacity-50"
        onClick={() =>
          startCsv(async () => {
            const payload = await exportTimeseriesCsv(params);
            triggerDownload(payload);
          })
        }
        disabled={pendingCsv || pendingPng}
      >
        {pendingCsv ? "Preparing CSV..." : "Export CSV"}
      </button>
      <button
        type="button"
        className="rounded-md border border-gray-700 bg-gray-900 px-3 py-1 text-gray-200 disabled:opacity-50"
        onClick={() =>
          startPng(async () => {
            const payload = await exportTimeseriesPng(params);
            triggerDownload(payload);
          })
        }
        disabled={pendingCsv || pendingPng}
      >
        {pendingPng ? "Rendering PNG..." : "Export PNG"}
      </button>
    </div>
  );
}

export function GenreExportButton({ params }: { params: GenreParams }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="rounded-md border border-gray-700 bg-gray-900 px-3 py-1 text-xs text-gray-200 disabled:opacity-50"
      onClick={() =>
        startTransition(async () => {
          const payload = await exportGenreTrendsCsv(params);
          triggerDownload(payload);
        })
      }
      disabled={pending}
    >
      {pending ? "Preparing CSV..." : "Export CSV"}
    </button>
  );
}

export function SourceExportButton({ params }: { params: SourceParams }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="rounded-md border border-gray-700 bg-gray-900 px-3 py-1 text-xs text-gray-200 disabled:opacity-50"
      onClick={() =>
        startTransition(async () => {
          const payload = await exportSourcePerformanceCsv(params);
          triggerDownload(payload);
        })
      }
      disabled={pending}
    >
      {pending ? "Preparing CSV..." : "Export CSV"}
    </button>
  );
}
