import type { SerializedExport } from "@/lib/exports";

export type ExportProgressPayload = {
  exportId: string;
  sessionId: string;
  status: SerializedExport["status"];
  format: SerializedExport["format"];
  progress: number;
  fileUrl?: string | null;
  downloadUrl?: string | null;
  errorMessage?: string | null;
  completedAt?: string | null;
};
