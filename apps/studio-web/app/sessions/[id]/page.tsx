import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { UploadPanel } from "@/components/session/upload-panel";
import { SessionExports } from "@/components/session/session-exports";
import type { SerializedExport } from "@/lib/exports";

type Owner = { id: string; name: string | null; email: string | null } | null;

async function fetchSession(id: string, baseUrl: string, cookie: string | null) {
  const url = new URL(`/api/sessions?id=${id}`, baseUrl);
  const res = await fetch(url.toString(), {
    cache: "no-store",
    headers: cookie ? { cookie } : undefined
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.session) return null;
  return { session: data.session as Session, currentUserId: data.currentUserId as string };
}

async function fetchExports(sessionId: string, baseUrl: string, cookie: string | null) {
  const url = new URL(`/api/export?sessionId=${sessionId}`, baseUrl);
  const res = await fetch(url.toString(), {
    cache: "no-store",
    headers: cookie ? { cookie } : undefined
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({ exports: [] }));
  return (data.exports ?? []) as SerializedExport[];
}

type Session = {
  id: string;
  name: string;
  participants: number;
  created_at: string;
  owner: Owner;
};

export default async function SessionDetail({ params }: { params: { id: string } }) {
  const headersList = headers();
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
  const protocol =
    headersList.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "development" ? "http" : "https");
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    (host ? `${protocol}://${host}` : "http://localhost:3000");

  const cookie = headersList.get("cookie");
  const payload = await fetchSession(params.id, baseUrl, cookie);
  if (!payload) notFound();

  const { session, currentUserId } = payload;
  const isOwner = session.owner?.id === currentUserId;
  const exports = await fetchExports(session.id, baseUrl, cookie);
  const maxActiveExports = Number.parseInt(process.env.EXPORT_MAX_ACTIVE ?? "2", 10);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 py-12">
      <div>
        <p className="text-sm text-muted-foreground">Session</p>
        <h1 className="mt-1 text-4xl font-semibold tracking-tight">{session.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Created {new Date(session.created_at).toLocaleString()} • {session.participants} currently inside.
        </p>
        {session.owner ? (
          <p className="text-xs text-muted-foreground">
            Owned by {isOwner ? "you" : session.owner.email ?? session.owner.name ?? "Unknown"}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-3">
        <Button size="lg" disabled={!isOwner}>Join Room</Button>
        <Button size="lg" variant="secondary" disabled={!isOwner}>
          Leave Room
        </Button>
        <Button variant="outline" asChild>
          <Link href="/sessions">Back to sessions</Link>
        </Button>
      </div>
      <section className="rounded-lg border bg-card p-6">
        <h2 className="text-xl font-semibold">Live Collaborators</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Presence coming soon. Redis-powered live roster will appear here to show who is in the mix.
        </p>
      </section>
      <section className="rounded-lg border bg-card p-6">
        <h2 className="text-xl font-semibold">Mixdown Export</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {isOwner
            ? "Kick off a render and grab the download once the worker finishes processing."
            : "Only the session owner can trigger exports."}
        </p>
        <div className="mt-4">
          <SessionExports
            sessionId={session.id}
            isOwner={isOwner}
            initialExports={exports}
            maxActive={Number.isFinite(maxActiveExports) ? maxActiveExports : 2}
          />
        </div>
      </section>
      <section className="rounded-lg border bg-card p-6">
        <h2 className="text-xl font-semibold">Session uploads</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Share stems, artwork, or reference files with collaborators.
        </p>
        <div className="mt-4">
          <UploadPanel sessionId={session.id} disabled={!isOwner} />
        </div>
      </section>
    </main>
  );
}
