"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ExportProgressPayload } from "@/types/exports";

const HEARTBEAT_MS = 25_000;

interface UseExportEventsOptions {
  sessionId: string;
  enabled?: boolean;
  onEvent?: (payload: ExportProgressPayload) => void;
}

interface ExportEventsState {
  connected: boolean;
  error: string | null;
}

export function useExportEvents({ sessionId, enabled = true, onEvent }: UseExportEventsOptions) {
  const [state, setState] = useState<ExportEventsState>({ connected: false, error: null });
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const memberId = useMemo(() => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `export-${crypto.randomUUID()}`;
    }
    return `export-${Math.random().toString(36).slice(2, 10)}`;
  }, [sessionId]);

  const displayName = useMemo(() => `Export Listener ${memberId.slice(-4)}`, [memberId]);

  useEffect(() => {
    if (!enabled) {
      socketRef.current?.close();
      setState({ connected: false, error: null });
      return;
    }

    const params = new URLSearchParams({
      roomId: sessionId,
      memberId,
      displayName
    });

    const socket = new WebSocket(`ws://localhost:8080?${params.toString()}`);
    socketRef.current = socket;

    const sendHeartbeat = () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "heartbeat" }));
      }
    };

    heartbeatRef.current = setInterval(sendHeartbeat, HEARTBEAT_MS);

    socket.onopen = () => {
      setState({ connected: true, error: null });
      sendHeartbeat();
    };

    socket.onerror = () => {
      setState({ connected: false, error: "Realtime connection error" });
    };

    socket.onclose = () => {
      setState((prev) => ({ ...prev, connected: false }));
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "export.progress" && data.payload?.sessionId === sessionId) {
          onEvent?.(data.payload as ExportProgressPayload);
        }
      } catch (error) {
        console.warn("Ignored realtime payload", error);
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
  }, [sessionId, memberId, displayName, enabled, onEvent]);

  return state;
}
