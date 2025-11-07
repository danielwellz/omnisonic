"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient, Client, ClientOptions } from "graphql-ws";

type WorkEvent = {
  id: string;
  title: string;
  updatedAt: string;
};

const DEFAULT_WS_URL = "ws://localhost:4001/graphql";

export function SubscriptionFeed() {
  const [workId, setWorkId] = useState("");
  const [events, setEvents] = useState<WorkEvent[]>([]);
  const [status, setStatus] = useState<"idle" | "connecting" | "open" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<Client | null>(null);
  const wsUrl = useMemo(
    () => process.env.NEXT_PUBLIC_GRAPH_WS_URL ?? DEFAULT_WS_URL,
    []
  );

  useEffect(() => {
    if (!workId) {
      setStatus("idle");
      setEvents([]);
      return;
    }

    setStatus("connecting");
    setError(null);
    const options: ClientOptions = { url: wsUrl };
    const client = createClient(options);
    clientRef.current = client;

    const dispose = client.subscribe<
      { workUpdated: WorkEvent }
    >(
      {
        query: `
          subscription WorkUpdated($workId: ID!) {
            workUpdated(workId: $workId) {
              id
              title
              updatedAt
            }
          }
        `,
        variables: { workId }
      },
      {
        next: (payload) => {
          const event = payload.data?.workUpdated;
          if (!event) return;
          setStatus("open");
          setEvents((prev) => [event, ...prev].slice(0, 10));
        },
        error: (err) => {
          console.error("Subscription error", err);
          setError("Subscription error");
          setStatus("error");
        },
        complete: () => {
          setStatus("idle");
        }
      }
    );

    return () => {
      dispose();
      client.dispose();
      clientRef.current = null;
    };
  }, [workId, wsUrl]);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h2 className="text-lg font-semibold text-gray-100">Work Updated Subscription</h2>
        <p className="text-sm text-gray-400">
          Enter a Work ID to listen for <code>workUpdated</code> events over GraphQL WebSocket.
        </p>
        <input
          className="mt-3 w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
          placeholder="work_123"
          value={workId}
          onChange={(event) => setWorkId(event.target.value)}
        />
        <p className="mt-2 text-xs text-gray-500">
          Status: <span className="font-semibold">{status}</span>
        </p>
        {error ? <p className="text-xs text-red-400">{error}</p> : null}
      </div>
      <div className="rounded-lg border border-gray-800 bg-gray-950 p-4">
        <h3 className="text-sm font-semibold text-gray-200">Recent events</h3>
        {events.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No events yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {events.map((event) => (
              <li
                key={`${event.id}-${event.updatedAt}`}
                className="rounded-md border border-gray-800 bg-gray-900 p-3 text-sm text-gray-200"
              >
                <p className="font-medium">{event.title}</p>
                <p className="text-xs text-gray-400">{event.updatedAt}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
