import "@/app/api/_otel";
import { NextResponse } from "next/server";
import { SpanStatusCode } from "@opentelemetry/api";
import { prisma } from "@db/client";
import { ensureTracer, withSpan } from "@omnisonic/telemetry";
import { auth } from "@/lib/auth";
import { generateStorageKey, getDownloadUrl, putObject } from "@storage/index";
import mime from "mime";

ensureTracer("studio-web-api");

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const ALLOWED_MIME_PREFIXES = ["audio/", "image/", "video/"];

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session.user.id;
}

function resolveMimeType(file: File) {
  if (file.type) return file.type;
  const guess = mime.getType(file.name);
  return guess ?? "application/octet-stream";
}

function isAllowedMime(mimeType: string) {
  return ALLOWED_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix));
}

export async function POST(req: Request) {
  return withSpan("studio-web-api", "upload.post", async (span) => {
    const userId = await requireUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const form = await req.formData().catch((error) => {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: "formdata-parse" });
      throw error;
    });

    const file = form.get("file");
    const sessionId = form.get("sessionId")?.toString() ?? null;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Expected a file field named `file`" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File exceeds 100MB limit" }, { status: 400 });
    }

    const mimeType = resolveMimeType(file);
    if (!isAllowedMime(mimeType)) {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
    }

    if (sessionId) {
      const session = await prisma.studioSession.findUnique({ where: { id: sessionId } });
      if (!session || session.userId !== userId) {
        return NextResponse.json({ error: "Invalid session" }, { status: 403 });
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const key = generateStorageKey(userId, file.name);
    const storageUrl = await putObject({ key, contentType: mimeType, body: buffer });

    const upload = await prisma.upload.create({
      data: {
        userId,
        sessionId,
        fileName: file.name,
        fileSize: file.size,
        mimeType,
        storageKey: key,
        storageUrl
      }
    });

    span.setAttributes({
      "upload.id": upload.id,
      "upload.mime": mimeType,
      "upload.size": file.size
    });

    const downloadUrl = (await getDownloadUrl(key).catch(() => null)) ??
      `${new URL(req.url).origin}/api/upload/${upload.id}/file`;

    return NextResponse.json({ upload, downloadUrl });
  });
}
