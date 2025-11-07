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
- Storage (uploads/exports):
  - `STORAGE_TYPE=local` (default) or `minio`/`s3`
  - `S3_BUCKET_NAME` / `MINIO_BUCKET_NAME`
  - `S3_REGION`, `MINIO_ENDPOINT`
  - `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (or MinIO access/secret)
  - Optional `STORAGE_CDN_URL`, `STORAGE_LOCAL_DIR`
- Exports:
  - `EXPORT_QUEUE_NAME` (default `mixdown-exports`)
  - `EXPORT_WORKER_CONCURRENCY` (default `2`)
  - `EXPORT_MAX_ACTIVE` (max in-flight exports per session, default `2`)
  - `EXPORT_HISTORY_LIMIT` (default `20`)
  - `EXPORT_DEFAULT_DURATION` (seconds of mock audio per render, default `45`)
  - `EXPORT_MAX_DURATION_SECONDS` (upper bound for worker clamp, default `600`)
  - `EXPORT_PROGRESS_CHANNEL` (Redis pub/sub channel, default `export:progress`)
- Graph API realtime:
  - `PUBSUB_URL` (default `redis://localhost:6379`)
  - `GRAPH_API_WS_PORT` (default `4001`, companion to HTTP port 4000)
  - Clients can override `NEXT_PUBLIC_GRAPH_WS_URL` when connecting from the web apps
- License automation:
  - `LICENSE_EXPIRATION_INTERVAL_MS` (default 24h)
- Ingest tagging:
  - `INGEST_TAGGING_FUZZY_THRESHOLD` (default `70`)
  - `INGEST_TAGGING_EMBEDDING_THRESHOLD` (default `0.7`)
  - `INGEST_TAGGING_USE_EMBEDDINGS` (default `false`)
  - `INGEST_TAGGING_EMBEDDINGS_MODEL` (default `sentence-transformers/all-MiniLM-L6-v2`)
  - `INGEST_TAGGING_EMBEDDING_CACHE_TTL` (seconds, default 604800)
  - `INGEST_REDIS_URL` (optional, used for embedding cache)
  - Optional: install `sentence-transformers` (+ `torch`) in `services/ingest` to enable embeddings
- Alerts:
  - `ALERTS_PORT` (default `8200`)
  - `ALERT_THRESHOLD` / `ALERT_INTERVAL_MS` for worker cadence
  - `ALERTS_SMTP_HOST`, `ALERTS_SMTP_PORT`, `ALERTS_SMTP_USER`, `ALERTS_SMTP_PASSWORD`, `ALERTS_SMTP_SECURE` for email
  - `ALERTS_EMAIL_FROM` sender address
  - `ALERTS_WEBHOOK_TIMEOUT_MS` (default `10000`)
- OpenTelemetry emits spans to stdout; no vendor keys required.

## Local services
- `pnpm dev --filter @omnisonic/studio-web` — Phase-1 Next.js app
- `pnpm dev --filter @omnisonic/realtime-gateway` — WebSocket gateway for room presence/messages
- `cd services/studio-api && uvicorn main:app --reload --port 8000` — FastAPI parity stub
- `pnpm test:e2e` — Playwright flow test (requires local Postgres + Redis and migrated schema)
- `pnpm dev --filter @omnisonic/graph-api` — GraphQL Yoga service for works/recordings
- `pnpm dev --filter @omnisonic/license-expirer` — Cron-style worker that expires licenses and emits events
- `cd services/ingest && uvicorn ingest.main:app --reload --port 8100` — ISRC ingest FastAPI service
- `pnpm dev --filter @omnisonic/insight-web` — ClickHouse-powered trends dashboard
- `pnpm dev --filter @omnisonic/upload-cleaner` — Periodic cleanup of orphaned uploads
- `pnpm dev --filter @omnisonic/export-worker` — BullMQ + FFmpeg worker that renders mixdowns
- `pnpm dev --filter @omnisonic/alerts` — ClickHouse alerts worker + Fastify API for multi-channel delivery (email/webhook/Slack)
- `docker compose -f infra/docker/docker-compose.dev.yml up minio` — Local MinIO (API :9000, console :9001)

See `/docs/specs/phase-1-studio.md` to print Phase-1 spec.
