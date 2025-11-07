import type { ExportFormat, ExportStatus } from "@prisma/client";

export interface ExportJobData {
  exportId: string;
  sessionId: string;
  userId: string;
  format: ExportFormat;
}

export interface ExportProgressPayload {
  exportId: string;
  sessionId: string;
  status: ExportStatus;
  progress: number;
  format: ExportFormat;
  fileUrl?: string | null;
  downloadUrl?: string | null;
  errorMessage?: string | null;
  completedAt?: string | null;
}
