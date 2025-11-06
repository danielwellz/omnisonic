import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <main className="flex flex-col items-center text-center py-24">
      <span className="rounded-full border border-primary/20 px-4 py-1 text-sm font-medium text-primary">
        Phase 1: Omnisonic Studio
      </span>
      <h1 className="mt-6 max-w-3xl text-5xl font-bold tracking-tight md:text-6xl">
        Create across genres, together.
      </h1>
      <p className="mt-4 max-w-xl text-lg text-muted-foreground">
        Spin up a live session, invite collaborators, and capture the moment from spark to mixdown.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <a href="/sessions">Start Creating</a>
        </Button>
        <Button asChild variant="outline">
          <a href="/about">Learn More</a>
        </Button>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="secondary">Watch 90-second preview</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>See Studio in action</DialogTitle>
              <DialogDescription>
                Realtime co-creation, visual stems, and presence indicators captured in a quick walkthrough.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-md border bg-muted/30 p-4 text-left text-sm">
              <p className="font-semibold text-foreground">Roadmap Highlights</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Instant session spins with shared canvases</li>
                <li>Presence powered by Redis for live awareness</li>
                <li>Upcoming LiveKit integration for HD audio rooms</li>
              </ul>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Close</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}
