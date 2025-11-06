import "@/app/api/_otel";
import { NextResponse } from "next/server";
import { SpanStatusCode } from "@opentelemetry/api";
import { prisma } from "@db/client";
import { ensureTracer, withSpan } from "@omnisonic/telemetry";
import { auth } from "@/lib/auth";

ensureTracer("studio-web-api");

type OwnerInfo = { id: string; email: string | null; name: string | null };

type SessionRecord = {
  id: string;
  name: string;
  createdAt: Date;
  owner: OwnerInfo | null;
  userId: string;
};

function serializeSession(session: SessionRecord) {
  return {
    id: session.id,
    name: session.name,
    participants: 0,
    created_at: session.createdAt.toISOString(),
    owner: session.owner
      ? {
          id: session.owner.id,
          email: session.owner.email,
          name: session.owner.name
        }
      : null
  };
}

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }
  return session.user.id;
}

export async function GET(req: Request) {
  return withSpan("studio-web-api", "sessions.get", async (span) => {
    const userId = await requireUser();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (id) {
      span.setAttribute("session.id", id);
      const session = await prisma.studioSession.findUnique({
        where: { id },
        include: {
          owner: {
            select: { id: true, email: true, name: true }
          }
        }
      });
      if (!session || session.userId !== userId) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: "Forbidden" });
        return NextResponse.json({ error: "Not Found" }, { status: 404 });
      }
      return NextResponse.json({ session: serializeSession(session), currentUserId: userId });
    }

    const sessions = await prisma.studioSession.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        owner: {
          select: { id: true, email: true, name: true }
        }
      }
    });
    span.setAttribute("sessions.count", sessions.length);
    return NextResponse.json({ sessions: sessions.map(serializeSession), currentUserId: userId });
  });
}

export async function POST(req: Request) {
  return withSpan("studio-web-api", "sessions.post", async (span) => {
    const userId = await requireUser();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      const body = await req.json().catch(() => ({}));
      const name = typeof body?.name === "string" && body.name.trim().length > 0 ? body.name.trim() : "Untitled";

      const session = await prisma.studioSession.create({
        data: {
          name: name.slice(0, 120),
          userId
        },
        include: {
          owner: {
            select: { id: true, email: true, name: true }
          }
        }
      });

      span.setAttribute("session.id", session.id);
      return NextResponse.json({ session: serializeSession(session), currentUserId: userId }, { status: 201 });
    } catch (error) {
      console.error("Failed to create session", error);
      throw error;
    }
  });
}
