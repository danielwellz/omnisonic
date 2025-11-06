"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePresence } from "@/hooks/usePresence";

type Owner = { id: string; name: string | null; email: string | null } | null;
type Session = { id: string; name: string; participants: number; created_at: string; owner: Owner };

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [newName, setNewName] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [memberId] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `viewer-${crypto.randomUUID()}`
      : `viewer-${Math.random().toString(36).slice(2, 10)}`
  );
  const [displayName] = useState(() => {
    const suffix = Math.floor(Math.random() * 900 + 100);
    return `Guest ${suffix}`;
  });

  const presence = usePresence({
    roomId: activeSessionId ?? "inactive",
    memberId,
    displayName,
    enabled: Boolean(activeSessionId)
  });

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [sessions, activeSessionId]
  );

  async function refresh() {
    const res = await fetch("/api/sessions");
    if (res.status === 401) {
      window.location.href = `/signin?callbackUrl=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    const data = await res.json();
    setSessions(data.sessions);
    setCurrentUserId(data.currentUserId ?? null);
    if (!activeSessionId && data.sessions.length > 0) {
      setActiveSessionId(data.sessions[0].id);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function createSession() {
    if (!newName.trim()) return;
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName })
    });

    if (res.ok) {
      const body = await res.json();
      setActiveSessionId(body.session.id);
    }

    setNewName("");
    await refresh();
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 py-12">
      <div>
        <h1 className="text-3xl font-bold">Sessions</h1>
        <p className="text-muted-foreground">
          Spin up new rooms and monitor live collaborators connecting through the realtime gateway.
        </p>
      </div>

      <div className="flex flex-col gap-6 md:flex-row">
        <section className="flex-1 rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Create a session</h2>
          <p className="text-sm text-muted-foreground">Give it a name and share the link with collaborators.</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New session name"
              className="flex-1 rounded-md border border-input px-3 py-2 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button onClick={createSession}>Create</Button>
          </div>
        </section>

        <section className="flex-1 rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Live status</h2>
          {activeSession ? (
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-sm text-muted-foreground">Monitoring</p>
                <p className="text-xl font-semibold">{activeSession.name}</p>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-1 font-medium",
                    presence.connected ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                  )}
                >
                  {presence.connected ? "Connected to gateway" : "Connecting..."}
                </span>
                <span className="text-muted-foreground">
                  {presence.memberCount} member{presence.memberCount === 1 ? "" : "s"} online
                </span>
              </div>
              {presence.error ? (
                <p className="text-sm text-destructive">{presence.error}</p>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">Create or select a session to monitor presence.</p>
          )}
        </section>
      </div>

      <ul className="space-y-3">
        {sessions.map((session) => {
          const isActive = session.id === activeSessionId;
          return (
            <li
              key={session.id}
              className={cn(
                "flex flex-col justify-between gap-3 rounded-lg border px-4 py-3 shadow-sm transition",
                isActive ? "border-primary bg-primary/5" : "hover:border-primary/60"
              )}
            >
              <div className="flex flex-col gap-1">
                <span className="text-base font-medium">{session.name}</span>
                <span className="text-xs text-muted-foreground">
                  Started {new Date(session.created_at).toLocaleString()}
                </span>
                {session.owner ? (
                  <span className="text-xs text-muted-foreground">
                    Owned by {session.owner.id === currentUserId ? "you" : session.owner.email ?? session.owner.name ?? "Unknown"}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant={isActive ? "default" : "secondary"} onClick={() => setActiveSessionId(session.id)}>
                  {isActive ? "Monitoring" : "Monitor presence"}
                </Button>
                <Button variant="outline" asChild>
                  <Link href={`/sessions/${session.id}`}>Open session</Link>
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
