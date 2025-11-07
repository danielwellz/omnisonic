import { prisma } from "@db/client";
import { auth } from "@/lib/auth";
import { serializeExport } from "@/lib/exports";
import { normalizeExportFormat } from "@/lib/export-formats";
import { resolveDownloadUrl } from "@/lib/export-download";

export const normalizeFormat = normalizeExportFormat;

export async function requireUserId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function ensureSessionOwnership(sessionId: string, userId: string) {
  const session = await prisma.studioSession.findUnique({ where: { id: sessionId } });
  if (!session || session.userId !== userId) {
    return null;
  }
  return session;
}

export async function fetchExportForUser(exportId: string, userId: string, origin: string) {
  const record = await prisma.export.findUnique({ where: { id: exportId } });
  if (!record || record.userId !== userId) {
    return null;
  }
  const downloadUrl = record.status === "completed" ? await resolveDownloadUrl(record, origin) : null;
  return serializeExport(record, downloadUrl);
}
