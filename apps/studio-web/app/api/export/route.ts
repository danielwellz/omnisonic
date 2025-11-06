import "@/app/api/_otel";
import { NextResponse } from "next/server";
import { SpanStatusCode } from "@opentelemetry/api";
import { ensureTracer, withSpan } from "@omnisonic/telemetry";

ensureTracer("studio-web-api");

const exports = new Map<string, { url: string; sessionId: string; createdAt: string }>();
const MOCK_EXPORT_HOST = process.env.MOCK_EXPORT_HOST ?? "https://mock.omnisonic.local";

export async function POST(req: Request) {
  return withSpan("studio-web-api", "export.post", async (span) => {
    const payload = await req.json().catch(() => null);
    const sessionId = typeof payload?.sessionId === "string" ? payload.sessionId : null;

    if (!sessionId) {
      const message = "sessionId is required";
      span.setStatus({ code: SpanStatusCode.ERROR, message });
      return NextResponse.json({ error: message }, { status: 400 });
    }

    span.setAttribute("session.id", sessionId);

    const exportId = crypto.randomUUID();
    const url = `${MOCK_EXPORT_HOST}/mixdowns/${sessionId}/${exportId}.wav`;

    exports.set(exportId, {
      url,
      sessionId,
      createdAt: new Date().toISOString()
    });

    span.setAttribute("export.id", exportId);

    return NextResponse.json({ url, exportId });
  });
}

export async function GET(req: Request) {
  return withSpan("studio-web-api", "export.get", async (span) => {
    const { searchParams } = new URL(req.url);
    const exportId = searchParams.get("id");

    if (!exportId) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: "missing-id" });
      return NextResponse.json({ error: "id query parameter is required" }, { status: 400 });
    }

    span.setAttribute("export.id", exportId);
    const record = exports.get(exportId);
    if (!record) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: "not-found" });
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(record);
  });
}
