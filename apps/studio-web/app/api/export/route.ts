import "@/app/api/_otel";
import { NextResponse } from "next/server";
import { SpanStatusCode } from "@opentelemetry/api";
import { ensureTracer, withSpan } from "@omnisonic/telemetry";
import { enqueueExportJob } from "@/lib/export-queue";
import { serializeExport } from "@/lib/exports";
import { resolveDownloadUrl } from "@/lib/export-download";
import { prisma } from "@db/client";
import { ensureSessionOwnership, fetchExportForUser, normalizeFormat, requireUserId } from "./utils";

ensureTracer("studio-web-api");

const MAX_ACTIVE_EXPORTS = Number.parseInt(process.env.EXPORT_MAX_ACTIVE ?? "2", 10);
const HISTORY_LIMIT = Number.parseInt(process.env.EXPORT_HISTORY_LIMIT ?? "20", 10);

export async function POST(req: Request) {
  return withSpan("studio-web-api", "export.post", async (span) => {
    const userId = await requireUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await req.json().catch(() => null);
    const sessionId = typeof payload?.sessionId === "string" ? payload.sessionId : null;
    const format = normalizeFormat(payload?.format);

    if (!sessionId) {
      const message = "sessionId is required";
      span.setStatus({ code: SpanStatusCode.ERROR, message });
      return NextResponse.json({ error: message }, { status: 400 });
    }

    span.setAttributes({ "session.id": sessionId, "export.format": format });

    const session = await ensureSessionOwnership(sessionId, userId);
    if (!session) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: "forbidden" });
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }

    const activeExports = await prisma.export.count({
      where: {
        sessionId,
        status: { in: ["pending", "processing"] }
      }
    });

    if (activeExports >= MAX_ACTIVE_EXPORTS) {
      const message = "Active export limit reached";
      span.setStatus({ code: SpanStatusCode.ERROR, message: "limit-reached" });
      return NextResponse.json({ error: message }, { status: 429 });
    }

    const exportRecord = await prisma.export.create({
      data: {
        sessionId,
        userId,
        format
      }
    });

    await enqueueExportJob({
      exportId: exportRecord.id,
      sessionId,
      userId,
      format
    });

    span.setAttribute("export.id", exportRecord.id);

    return NextResponse.json({ export: serializeExport(exportRecord) }, { status: 202 });
  });
}

export async function GET(req: Request) {
  return withSpan("studio-web-api", "export.get", async (span) => {
    const userId = await requireUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams, origin } = new URL(req.url);
    const exportId = searchParams.get("id");
    const sessionId = searchParams.get("sessionId");

    if (!exportId && !sessionId) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: "missing-params" });
      return NextResponse.json({ error: "id or sessionId query parameter is required" }, { status: 400 });
    }

    if (exportId) {
      span.setAttribute("export.id", exportId);
      const record = await fetchExportForUser(exportId, userId, origin);
      if (!record) {
        return NextResponse.json({ error: "Not Found" }, { status: 404 });
      }
      return NextResponse.json({ export: record });
    }

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId query parameter is required" }, { status: 400 });
    }

    span.setAttribute("session.id", sessionId);
    const session = await ensureSessionOwnership(sessionId, userId);
    if (!session) {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }

    const records = await prisma.export.findMany({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT
    });

    const serialized = await Promise.all(
      records.map(async (record) => {
        const downloadUrl = record.status === "completed" ? await resolveDownloadUrl(record, origin) : null;
        return serializeExport(record, downloadUrl);
      })
    );

    return NextResponse.json({ exports: serialized });
  });
}
