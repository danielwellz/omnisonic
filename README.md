# Omnisonic — Lifetime Music Ecosystem (Monorepo)

**Phases**
1. **Studio** — real-time creation & collaboration (Phase 1)
2. **Core** — Open Music Graph + Royalty Integrity Network (Phase 2)
3. **Insight** — cross-genre news & analytics (Phase 3)

**Canonical stack:** Node 20 + PNPM 9, Next.js (App Router), React 18, Tailwind, shadcn/ui, TypeScript 5.6+, tRPC (Studio), GraphQL Yoga (Core), FastAPI (Python), Postgres 16, Redis 7, ClickHouse (analytics), OpenTelemetry.

**Monorepo layout**
/apps /services /packages /infra /docs /prompts

**Environment**
- Set `DATABASE_URL="postgres://postgres:postgres@localhost:5432/postgres"` (matches `docker-compose.dev.yml`).
- Set `REDIS_URL="redis://localhost:6379"` for presence APIs.
- OpenTelemetry emits spans to stdout; no vendor keys required.

## Local services
- `pnpm dev --filter @omnisonic/studio-web` — Phase-1 Next.js app
- `pnpm dev --filter @omnisonic/realtime-gateway` — WebSocket gateway for room presence/messages
- `cd services/studio-api && uvicorn main:app --reload --port 8000` — FastAPI parity stub
- `pnpm test:e2e` — Playwright flow test (requires local Postgres + Redis and migrated schema)
- `pnpm dev --filter @omnisonic/graph-api` — GraphQL Yoga service for works/recordings
- `cd services/ingest && uvicorn ingest.main:app --reload --port 8100` — ISRC ingest FastAPI service
- `pnpm dev --filter @omnisonic/insight-web` — ClickHouse-powered trends dashboard
- `pnpm dev --filter @omnisonic/alerts` — ClickHouse-backed alert polling service

See `/docs/specs/phase-1-studio.md` to print Phase-1 spec.
