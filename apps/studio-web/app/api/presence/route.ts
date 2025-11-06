import "@/app/api/_otel";
import { NextResponse } from "next/server";
import { z } from "zod";
import { SpanStatusCode } from "@opentelemetry/api";
import { redis } from "@/lib/redis";
import { ensureTracer, withSpan } from "@omnisonic/telemetry";

ensureTracer("studio-web-api-presence");

const upsertSchema = z.object({
  roomId: z.string().min(1, "roomId is required"),
  memberId: z.string().min(1, "memberId is required"),
  displayName: z.string().min(1, "displayName is required"),
  status: z.enum(["active", "away"]).default("active"),
  ttlSeconds: z.number().int().positive().max(60 * 15).optional()
});

const removeSchema = z.object({
  roomId: z.string().min(1, "roomId is required"),
  memberId: z.string().min(1, "memberId is required")
});

const DEFAULT_TTL = 60;

const roomMembersKey = (roomId: string) => `presence:room:${roomId}`;
const memberKey = (roomId: string, memberId: string) => `presence:member:${roomId}:${memberId}`;

function deserializeMember(raw: string | null) {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as {
      memberId: string;
      displayName: string;
      status: string;
      lastSeen: string;
    };
  } catch (error) {
    console.warn("Failed to parse presence member", error);
    return null;
  }
}

export async function GET(req: Request) {
  return withSpan("studio-web-api-presence", "presence.get", async (span) => {
    const { searchParams } = new URL(req.url);
    const roomId = searchParams.get("roomId");

    if (!roomId) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: "Missing roomId" });
      return NextResponse.json({ error: "roomId query parameter is required" }, { status: 400 });
    }

    span.setAttribute("presence.room_id", roomId);

    const memberIds = await redis.smembers(roomMembersKey(roomId));
    span.setAttribute("presence.member_count", memberIds.length);
    if (memberIds.length === 0) {
      return NextResponse.json({ members: [] });
    }

    const memberKeys = memberIds.map((memberId) => memberKey(roomId, memberId));
    const rawMembers = await redis.mget(memberKeys);
    const members = rawMembers
      .map(deserializeMember)
      .filter((member): member is NonNullable<typeof member> => Boolean(member));

    return NextResponse.json({ members });
  });
}

export async function POST(req: Request) {
  return withSpan("studio-web-api-presence", "presence.post", async (span) => {
    const json = await req.json().catch(() => null);
    const parsed = upsertSchema.safeParse(json);

    if (!parsed.success) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: "Validation error" });
      span.recordException(parsed.error);
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { roomId, memberId, displayName, status, ttlSeconds } = parsed.data;
    const ttl = ttlSeconds ?? DEFAULT_TTL;
    const memberPayload = JSON.stringify({
      memberId,
      displayName,
      status,
      lastSeen: new Date().toISOString()
    });

    span.setAttributes({
      "presence.room_id": roomId,
      "presence.member_id": memberId,
      "presence.ttl": ttl
    });

    const pipeline = redis.multi();
    pipeline.sadd(roomMembersKey(roomId), memberId);
    pipeline.set(memberKey(roomId, memberId), memberPayload, "EX", ttl);
    pipeline.expire(roomMembersKey(roomId), ttl);

    await pipeline.exec();

    return NextResponse.json({ ok: true });
  });
}

export async function DELETE(req: Request) {
  return withSpan("studio-web-api-presence", "presence.delete", async (span) => {
    const json = await req.json().catch(() => null);
    const parsed = removeSchema.safeParse(json);

    if (!parsed.success) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: "Validation error" });
      span.recordException(parsed.error);
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { roomId, memberId } = parsed.data;
    span.setAttributes({
      "presence.room_id": roomId,
      "presence.member_id": memberId
    });

    const pipeline = redis.multi();
    pipeline.srem(roomMembersKey(roomId), memberId);
    pipeline.del(memberKey(roomId, memberId));
    await pipeline.exec();

    return NextResponse.json({ ok: true });
  });
}
