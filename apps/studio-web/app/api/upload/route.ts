import "@/app/api/_otel";
import { NextResponse } from "next/server";
import { SpanStatusCode } from "@opentelemetry/api";
import { ensureTracer, withSpan } from "@omnisonic/telemetry";

ensureTracer("studio-web-api");

const uploads = new Map<
  string,
  {
    fileName: string;
    size: number;
    mimeType: string;
    createdAt: string;
  }
>();

const MOCK_HOST = process.env.MOCK_UPLOAD_HOST ?? "https://mock.omnisonic.local";

export async function POST(req: Request) {
  return withSpan("studio-web-api", "upload.post", async (span) => {
    const form = await req.formData().catch((error) => {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: "formdata-parse" });
      throw error;
    });

    const file = form.get("file");
    if (!(file instanceof File)) {
      const message = "Expected a file field named `file`";
      span.setStatus({ code: SpanStatusCode.ERROR, message });
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const url = `${MOCK_HOST}/uploads/${id}/${encodeURIComponent(file.name)}`;

    uploads.set(id, {
      fileName: file.name,
      size: file.size,
      mimeType: file.type,
      createdAt: new Date().toISOString()
    });

    span.setAttributes({
      "upload.id": id,
      "upload.file_name": file.name,
      "upload.size": file.size,
      "upload.mime": file.type || "application/octet-stream"
    });

    return NextResponse.json({ url });
  });
}

export async function GET(req: Request) {
  return withSpan("studio-web-api", "upload.get", async (span) => {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: "missing-id" });
      return NextResponse.json({ error: "id query parameter is required" }, { status: 400 });
    }

    span.setAttribute("upload.id", id);
    const record = uploads.get(id);
    if (!record) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: "not-found" });
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      url: `${MOCK_HOST}/uploads/${id}/${encodeURIComponent(record.fileName)}`,
      metadata: record
    });
  });
}
