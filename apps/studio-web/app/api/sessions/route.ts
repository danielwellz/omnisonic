import "@/app/api/_otel";
import { NextResponse } from "next/server";
import { SpanStatusCode } from "@opentelemetry/api";
import { prisma } from "@db/client";
import { ensureTracer, withSpan } from "@omnisonic/telemetry";

ensureTracer("studio-web-api");

function serializeSession(session: { id: string; name: string; createdAt: Date }) {
  return {
    id: session.id,
    name: session.name,
    participants: 0,
    created_at: session.createdAt.toISOString()
  };
}

export async function GET(req: Request) {
  return withSpan("studio-web-api", "sessions.get", async (span) => {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (id) {
      span.setAttribute("session.id", id);
      const session = await prisma.session.findUnique({ where: { id } });
      if (!session) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: "Not Found" });
        return NextResponse.json({ error: "Not Found" }, { status: 404 });
      }
      return NextResponse.json({ session: serializeSession(session) });
    }

    const sessions = await prisma.session.findMany({ orderBy: { createdAt: "desc" } });
    span.setAttribute("sessions.count", sessions.length);
    return NextResponse.json({ sessions: sessions.map(serializeSession) });
  });
}

export async function POST(req: Request) {
  return withSpan("studio-web-api", "sessions.post", async (span) => {
    try {
      const body = await req.json().catch(() => ({}));
      const name = typeof body?.name === "string" && body.name.trim().length > 0 ? body.name.trim() : "Untitled";

      const session = await prisma.session.create({
        data: {
          name: name.slice(0, 120)
        }
      });

      span.setAttribute("session.id", session.id);
      return NextResponse.json({ session: serializeSession(session) }, { status: 201 });
    } catch (error) {
      console.error("Failed to create session", error);
      throw error;
    }
  });
}
