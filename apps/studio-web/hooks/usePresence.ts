import { useEffect, useMemo, useRef, useState } from "react";

interface PresenceOptions {
  roomId: string;
  memberId: string;
  displayName: string;
  heartbeatMs?: number;
  enabled?: boolean;
}

interface PresenceState {
  members: Array<{ memberId: string; displayName: string }>;
  connected: boolean;
  error: string | null;
}

const HEARTBEAT_FALLBACK = 25_000;

export function usePresence({
  roomId,
  memberId,
  displayName,
  heartbeatMs = HEARTBEAT_FALLBACK,
  enabled = true
}: PresenceOptions) {
  const socketRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [state, setState] = useState<PresenceState>({ members: [], connected: false, error: null });

  useEffect(() => {
    if (enabled) return;
    socketRef.current?.close();
    socketRef.current = null;
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    setState({ members: [], connected: false, error: null });
  }, [enabled]);

  const handshakeParams = useMemo(() => {
    const params = new URLSearchParams({ roomId, memberId, displayName });
    return params.toString();
  }, [roomId, memberId, displayName]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const url = `ws://localhost:8080?${handshakeParams}`;
    const socket = new WebSocket(url);
    socketRef.current = socket;

    const sendHeartbeat = () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "heartbeat" }));
      }
    };

    const heartbeatInterval = heartbeatRef.current ?? setInterval(sendHeartbeat, heartbeatMs);
    heartbeatRef.current = heartbeatInterval;

    socket.onopen = () => {
      setState((prev) => ({ ...prev, connected: true, error: null }));
      sendHeartbeat();
    };

    socket.onerror = () => {
      setState((prev) => ({ ...prev, error: "Connection error", connected: false }));
    };

    socket.onclose = () => {
      setState((prev) => ({ ...prev, connected: false }));
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case "welcome":
          (async () => {
            try {
              const res = await fetch(`/api/presence?roomId=${roomId}`);
              if (!res.ok) return;
              const payload = await res.json();
              const members =
                Array.isArray(payload.members) && payload.members.length > 0
                  ? payload.members.filter((member: { memberId: string }) => member.memberId !== memberId)
                  : [];
              setState((prev) => ({ ...prev, members }));
            } catch (error) {
              console.warn("Failed to load presence state", error);
            }
          })();
          break;
        case "presence.join":
          setState((prev) => {
            const exists = prev.members.some((member) => member.memberId === data.payload.memberId);
            if (exists) return prev;
            return {
              ...prev,
              members: [...prev.members, data.payload]
            };
          });
          break;
        case "presence.leave":
          setState((prev) => ({
            ...prev,
            members: prev.members.filter((member) => member.memberId !== data.payload.memberId)
          }));
          break;
        default:
          break;
      }
    };

    return () => {
      socket.close();
      socketRef.current = null;
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [handshakeParams, heartbeatMs, enabled]);

  return useMemo(
    () => ({
      ...state,
      memberCount: state.members.length + (state.connected ? 1 : 0)
    }),
    [state]
  );
}
