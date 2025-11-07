import type { Export } from "@prisma/client";

export type SerializedExport = {
  id: string;
  sessionId: string;
  userId: string;
  status: Export["status"];
  format: Export["format"];
  progress: number;
  fileUrl: string | null;
  fileSize: number | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  downloadUrl: string | null;
};

export function serializeExport(record: Export, downloadUrl: string | null = null): SerializedExport {
  return {
    id: record.id,
    sessionId: record.sessionId,
    userId: record.userId,
    status: record.status,
    format: record.format,
    progress: record.progress,
    fileUrl: record.fileUrl,
    fileSize: record.fileSize,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    completedAt: record.completedAt ? record.completedAt.toISOString() : null,
    errorMessage: record.errorMessage,
    downloadUrl
  };
}
