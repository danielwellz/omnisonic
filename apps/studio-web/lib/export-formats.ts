import { ExportFormat } from "@prisma/client";

export function normalizeExportFormat(value: unknown): ExportFormat {
  if (typeof value !== "string") return "wav";
  const normalized = value.toLowerCase();
  if (normalized === "mp3" || normalized === "flac" || normalized === "wav") {
    return normalized;
  }
  return "wav";
}
