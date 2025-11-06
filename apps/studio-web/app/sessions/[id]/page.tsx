import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ExportMixdown } from "@/components/session/export-mixdown";

async function fetchSession(id: string, baseUrl: string) {
  const url = new URL(`/api/sessions?id=${id}`, baseUrl);
  const res = await fetch(url.toString(), {
    cache: "no-store"
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.session ?? null;
}

type Session = {
  id: string;
  name: string;
  participants: number;
  created_at: string;
};

export default async function SessionDetail({ params }: { params: { id: string } }) {
  const headersList = headers();
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
  const protocol =
    headersList.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "development" ? "http" : "https");
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    (host ? `${protocol}://${host}` : "http://localhost:3000");

  const session = (await fetchSession(params.id, baseUrl)) as Session | null;
  if (!session) notFound();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 py-12">
      <div>
        <p className="text-sm text-muted-foreground">Session</p>
        <h1 className="mt-1 text-4xl font-semibold tracking-tight">{session.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Created {new Date(session.created_at).toLocaleString()} • {session.participants} currently inside.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button size="lg">Join Room</Button>
        <Button size="lg" variant="secondary">
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
          Trigger a mock render to preview the future mixdown pipeline.
        </p>
        <div className="mt-4">
          <ExportMixdown sessionId={session.id} />
        </div>
      </section>
    </main>
  );
}
