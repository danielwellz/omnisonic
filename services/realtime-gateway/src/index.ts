import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import Redis from "ioredis";
import { z } from "zod";
import { SpanStatusCode } from "@opentelemetry/api";
import { ensureTracer } from "@omnisonic/telemetry";

const tracer = ensureTracer("realtime-gateway");

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null
});

const handshakeSchema = z.object({
  roomId: z.string().min(1, "roomId is required"),
  memberId: z.string().min(1, "memberId is required"),
  displayName: z.string().min(1, "displayName is required"),
  status: z.enum(["active", "away"]).optional()
});

type HandshakeData = z.infer<typeof handshakeSchema> & { status: "active" | "away" };

type MessageEnvelope = {
  type: string;
  payload?: unknown;
  from?: string;
};

const rooms = new Map<string, Set<WebSocket>>();
const clientMeta = new WeakMap<WebSocket, HandshakeData>();

const DEFAULT_TTL = 60;
const MAX_TTL = 60 * 15;
const rawTtl = Number.parseInt(process.env.PRESENCE_TTL ?? "60", 10);
const TTL_SECONDS = Number.isNaN(rawTtl)
  ? DEFAULT_TTL
  : Math.min(Math.max(rawTtl, 15), MAX_TTL);

const roomMembersKey = (roomId: string) => `presence:room:${roomId}`;
const memberKey = (roomId: string, memberId: string) => `presence:member:${roomId}:${memberId}`;

async function touchPresence(meta: HandshakeData) {
  const payload = JSON.stringify({
    memberId: meta.memberId,
    displayName: meta.displayName,
    status: meta.status,
    lastSeen: new Date().toISOString()
  });

  const pipeline = redis.multi();
  pipeline.sadd(roomMembersKey(meta.roomId), meta.memberId);
  pipeline.set(memberKey(meta.roomId, meta.memberId), payload, "EX", TTL_SECONDS);
  pipeline.expire(roomMembersKey(meta.roomId), TTL_SECONDS);
  await pipeline.exec();
}

async function removePresence(meta: HandshakeData) {
  const pipeline = redis.multi();
  pipeline.srem(roomMembersKey(meta.roomId), meta.memberId);
  pipeline.del(memberKey(meta.roomId, meta.memberId));
  await pipeline.exec();
}

function addClient(socket: WebSocket, meta: HandshakeData) {
  let roomSet = rooms.get(meta.roomId);
  if (!roomSet) {
    roomSet = new Set();
    rooms.set(meta.roomId, roomSet);
  }
  roomSet.add(socket);
  clientMeta.set(socket, meta);
}

function removeClient(socket: WebSocket) {
  const meta = clientMeta.get(socket);
  if (!meta) return null;
  const roomSet = rooms.get(meta.roomId);
  if (roomSet) {
    roomSet.delete(socket);
    if (roomSet.size === 0) {
      rooms.delete(meta.roomId);
    }
  }
  clientMeta.delete(socket);
  return meta;
}

function broadcast(roomId: string, message: MessageEnvelope, exclude?: WebSocket) {
  const roomSet = rooms.get(roomId);
  if (!roomSet) return;
  const data = JSON.stringify(message);
  for (const client of roomSet) {
    if (client.readyState !== WebSocket.OPEN || client === exclude) continue;
    client.send(data);
  }
}

function send(socket: WebSocket, message: MessageEnvelope) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

const server = createServer();
const wss = new WebSocketServer({ server });
const port = Number.parseInt(process.env.PORT ?? "8080", 10);

wss.on("connection", (socket, request) => {
  const connectionSpan = tracer.startSpan("ws.connection", {
    attributes: {
      "client.address": request.socket.remoteAddress ?? "unknown"
    }
  });
  const url = request.url ? new URL(request.url, "http://localhost") : null;
  const query = {
    roomId: url?.searchParams.get("roomId"),
    memberId: url?.searchParams.get("memberId"),
    displayName: url?.searchParams.get("displayName"),
    status: url?.searchParams.get("status") ?? undefined
  };

  const parsed = handshakeSchema.safeParse(query);
  if (!parsed.success) {
    send(socket, { type: "error", payload: parsed.error.flatten() });
    socket.close(1008, "Invalid handshake");
    connectionSpan.recordException(parsed.error);
    connectionSpan.setStatus({ code: SpanStatusCode.ERROR, message: "Invalid handshake" });
    connectionSpan.end();
    return;
  }

  const meta: HandshakeData = {
    ...parsed.data,
    status: parsed.data.status ?? "active"
  };

  addClient(socket, meta);

  void tracer.startActiveSpan("presence.touch", async (span) => {
    span.setAttributes({
      "presence.room_id": meta.roomId,
      "presence.member_id": meta.memberId
    });
    try {
      await touchPresence(meta);
      broadcast(meta.roomId, {
        type: "presence.join",
        from: meta.memberId,
        payload: { memberId: meta.memberId, displayName: meta.displayName }
      });
      send(socket, {
        type: "welcome",
        payload: { roomId: meta.roomId, memberId: meta.memberId, ttl: TTL_SECONDS }
      });
      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: "Failed to touch presence on connect" });
      console.error("Failed to touch presence on connect", error);
    } finally {
      span.end();
    }
  });

  socket.on("message", (raw) => {
    const span = tracer.startSpan("ws.message");
    const content = typeof raw === "string" ? raw : raw.toString();
    let parsedMessage: MessageEnvelope | null = null;
    try {
      parsedMessage = JSON.parse(content);
    } catch (error) {
      console.warn("Ignoring non-JSON message", error);
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: "invalid-json" });
      span.end();
      return;
    }

    const currentMeta = clientMeta.get(socket);
    if (!currentMeta || !parsedMessage) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: "missing-meta" });
      span.end();
      return;
    }

    const envelope: MessageEnvelope = {
      type: parsedMessage.type,
      payload: parsedMessage.payload,
      from: currentMeta.memberId
    };

    if (parsedMessage.type === "heartbeat") {
      span.setAttribute("ws.message.type", "heartbeat");
      void touchPresence(currentMeta);
      send(socket, { type: "heartbeat", payload: { ts: Date.now() } });
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      return;
    }

    span.setAttribute("ws.message.type", parsedMessage.type);
    void touchPresence(currentMeta);
    broadcast(currentMeta.roomId, envelope, socket);
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
  });

  socket.on("close", () => {
    const span = tracer.startSpan("ws.close");
    const meta = removeClient(socket);
    if (!meta) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: "no-meta" });
      span.end();
      connectionSpan.end();
      return;
    }
    span.setAttributes({
      "presence.room_id": meta.roomId,
      "presence.member_id": meta.memberId
    });
    void removePresence(meta)
      .then(() => {
        broadcast(meta.roomId, {
          type: "presence.leave",
          from: meta.memberId,
          payload: { memberId: meta.memberId }
        });
        span.setStatus({ code: SpanStatusCode.OK });
      })
      .catch((error) => {
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: "Failed to remove presence" });
      })
      .finally(() => span.end());
    connectionSpan.end();
  });

  socket.on("error", (error) => {
    console.error("WebSocket error", error);
    connectionSpan.recordException(error);
    connectionSpan.setStatus({ code: SpanStatusCode.ERROR, message: "socket-error" });
    connectionSpan.end();
    socket.close(1011, "WebSocket error");
  });
});

server.listen(port, () => {
  console.log(`Realtime gateway listening on ws://localhost:${port}`);
});

const shutdownSignals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
for (const signal of shutdownSignals) {
  process.on(signal, () => {
    console.info(`Received ${signal}, shutting down gateway...`);
    wss.close(() => {
      server.close();
      redis
        .quit()
        .then(() => {
          console.info("Redis connection closed");
          process.exit(0);
        })
        .catch((error) => {
          console.error("Failed to close Redis connection", error);
          process.exit(1);
        });
    });
  });
}
