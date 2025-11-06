import { NextResponse } from "next/server";
import { SpanStatusCode } from "@opentelemetry/api";
import { prisma } from "@db/client";
import { ensureTracer, withSpan } from "@omnisonic/telemetry";
import { auth } from "@/lib/auth";
import { deleteObject, getDownloadUrl } from "@storage/index";

ensureTracer("studio-web-api");

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session.user.id;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  return withSpan("studio-web-api", "upload.get", async (span) => {
    const userId = await requireUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const upload = await prisma.upload.findUnique({ where: { id: params.id } });
    if (!upload || upload.userId !== userId) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: "Not Found" });
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }

    const downloadUrl =
      (await getDownloadUrl(upload.storageKey).catch(() => null)) ??
      `${new URL(req.url).origin}/api/upload/${upload.id}/file`;

    return NextResponse.json({ upload, downloadUrl });
  });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  return withSpan("studio-web-api", "upload.delete", async (span) => {
    const userId = await requireUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const upload = await prisma.upload.findUnique({ where: { id: params.id } });
    if (!upload || upload.userId !== userId) {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }

    await deleteObject(upload.storageKey).catch((error) => {
      console.warn("Failed to delete storage object", error);
    });

    await prisma.upload.delete({ where: { id: params.id } });

    span.setAttribute("upload.id", params.id);
    return NextResponse.json({ ok: true });
  });
}
