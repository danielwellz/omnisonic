# Omnisonic Delivery Roadmap

This roadmap sequences all prompts across Studio (Phase 1), Core (Phase 2), and Insight (Phase 3). Complete items in order unless your team explicitly re-prioritizes. Each checklist entry references the prompt text to paste into your code model.

## Phase 1 - Studio (Real-time Creation & Collaboration)

1. **Harden repo plumbing**  
   Prompt: "Add GitHub Actions CI for lint, typecheck, and Next.js build across all workspaces. Cache PNPM. Fail on TS errors."
2. **Design system baseline**  
   Prompt: "Add shadcn/ui with Tailwind to `apps/studio-web`. Scaffold a Button and Dialog component and integrate on the landing page."
3. **Sessions detail route**  
   Prompt: "Create `/apps/studio-web/app/sessions/[id]/page.tsx` that reads the session from `/api/sessions?id=:id` and shows Join/Leave mock buttons."
4. **Persist sessions (Postgres)**  
   Prompt: "Add Prisma to monorepo, create `Session` model (id, name, createdAt), migrate, and replace in-memory handler with Postgres-backed CRUD."
5. **Presence (Redis)**  
   Prompt: "Add `/apps/studio-web/app/api/presence/route.ts` with Redis SET/SADD to track room members. Expose `GET ?roomId=` to list members."
6. **Realtime gateway (WS)**  
   Prompt: "Create `/services/realtime-gateway` Node service using `ws` that broadcasts room messages and tracks members in Redis."
7. **Link web<->gateway**  
   Prompt: "From the sessions page, open a WebSocket to `ws://localhost:8080`, join the room, and show live member count."
8. **Telemetry hooks**  
   Prompt: "Wire OpenTelemetry basic traces in Next.js API routes and the gateway. Export to console; no vendor keys."
9. **Upload assets (stub)**  
   Prompt: "Create `/apps/studio-web/app/api/upload/route.ts` that accepts a file (FormData) and returns `{url}` (use in-memory mock)."
10. **Export mixdown (stub)**  
    Prompt: "Add `/apps/studio-web/app/api/export/route.ts` returning a fake WAV blob URL; link from session detail."
11. **E2E test**  
    Prompt: "Add Playwright with a test that creates a session, navigates into it, and sees the Join button."
12. **Docs**  
    Prompt: "Update `/docs/specs/phase-1-studio.md` with API tables and a 'How to print' note."

## Phase 2 - Core (Open Music Graph + Royalty Integrity Network)

1. **Graph API scaffold**  
   Prompt: "Create `/services/graph-api` (TypeScript, GraphQL Yoga). Define types: Work, Recording, Contributor, Split, License. Add `Query.work(id)` and `Query.recording(id)`."
2. **Database layer**  
   Prompt: "Add Prisma schema for Work, Recording, Contributor, Contribution(role, pctShare), with Postgres migrations. Wire resolvers to DB."
3. **Identifiers and validation**  
   Prompt: "Add Zod validators for ISRC/ISWC patterns in `@omnisonic/schemas` and call them from resolvers."
4. **Ingest pipeline (Python)**  
   Prompt: "Create `/services/ingest` FastAPI with `/ingest/isrc` that takes CSV/JSON of {isrc,title,artist}. Normalize and upsert via REST to Graph API."
5. **Provenance ledger (append-only)**  
   Prompt: "Add `royalty_event`, `ledger_entry`, and `cycle_checkpoint` tables in Postgres; expose `/services/royalty-ledger` TS lib with `computeAmount` and `merkleRoot` helpers."
6. **Policy engine (splits)**  
   Prompt: "Create a TypeScript module that, given a Recording usage event, allocates amounts to contributors based on Work splits; return a journal of entries."
7. **Audit endpoints**  
   Prompt: "Expose Graph API endpoints to fetch ledger checkpoints and recompute Merkle roots for audit verification."
8. **ADR updates**  
   Prompt: "Add ADRs covering (a) Postgres graph vs Neo4j, (b) append-only ledger vs blockchain anchoring."
9. **Realtime subscriptions & license management**  
   Prompt: "Add a Redis-backed `@omnisonic/pubsub` package, expose Graph API subscriptions (workUpdated, recordingUpdated, ledgerEntryCreated, cycleCheckpointClosed), implement the Prisma License model with GraphQL queries/mutations plus validation/conflict detection, wire a daily expiration worker, and update the frontend to consume the new subscriptions."

## Phase 3 - Insight (Cross-Genre News & Analytics)

1. **Ingest sources**  
   Prompt: "Extend `/services/ingest` with `/ingest/rss` endpoint; parse RSS URLs, normalize to {source,title,url,published_at} and write to DuckDB."
2. **Entity linking (stub)**  
   Prompt: "Add a Python module that tags ingested items with artist/work/recording references using simple heuristics and a stoplist."
3. **Analytics store**  
   Prompt: "Provision ClickHouse in docker-compose; create tables `news_items` and `entity_links` and a view for last-7-days counts."
4. **Insight web app**  
   Prompt: "Add `/apps/insight-web` Next.js app with a Trends page that queries ClickHouse (server action) for top entities."
5. **Alerts (stub)**  
   Prompt: "Create `/services/alerts` TS service that reads from ClickHouse every minute and logs threshold crossings."
6. **Docs**  
   Prompt: "Create `/docs/specs/phase-3-insight.md` with data flow diagrams and print instructions."

## Tracking & Cadence

- Review progress weekly; mark each prompt complete once merged to `main`.
- Re-forecast scope before starting the next phase to account for integration learnings.
- Keep infrastructure (Postgres, Redis, ClickHouse) running via `docker-compose.dev.yml` for end-to-end verification at the completion of each phase.
