# Phase 1 - Omnisonic Studio (Thin-Slice)

## Goals
- Real-time creation entry point (landing + sessions)
- CRUD: Session { create, list } via Postgres-backed Next.js API + FastAPI parity
- Future: presence, rooms, LiveKit signaling

## Pages
- `/` Landing
- `/about` Static How-it-Works
- `/sessions` List/Create

## API Contract

### Next.js (Studio web)

| Method | Endpoint | Request | Response | Notes |
| --- | --- | --- | --- | --- |
| GET | `/api/sessions` | - | `{ sessions: Session[] }` | Sessions ordered by `createdAt desc`. |
| GET | `/api/sessions?id=` | `id` (query) | `{ session: Session }` | 404 if session missing. |
| POST | `/api/sessions` | `{ name?: string }` | `{ session: Session }` | Creates Postgres-backed record. |
| GET | `/api/presence?roomId=` | `roomId` (query) | `{ members: PresenceMember[] }` | Reads Redis roster. |
| POST | `/api/presence` | `{ roomId, memberId, displayName, status?, ttlSeconds? }` | `{ ok: true }` | Upserts presence with TTL. |
| DELETE | `/api/presence` | `{ roomId, memberId }` | `{ ok: true }` | Removes member from roster. |
| POST | `/api/upload` | `FormData{ file, sessionId? }` | `{ upload, downloadUrl }` | Auth required; validates MIME/size and stores metadata. |
| GET | `/api/upload/[id]` | - | `{ upload, downloadUrl }` | Metadata + presigned/local download. |
| DELETE | `/api/upload/[id]` | - | `{ ok: true }` | Deletes file + metadata. |
| GET | `/api/upload/list?sessionId=` | optional query | `{ uploads: { upload, downloadUrl }[] }` | Lists current user's uploads (optionally filtered). |
| POST | `/api/export` | `{ sessionId }` | `{ url, exportId }` | Generates mock WAV URL. |
| GET | `/api/export?id=` | `id` (query) | `{ url, sessionId, createdAt }` | Lookup export metadata. |
| GET/POST | `/api/auth/[...nextauth]` | OAuth/Credentials payload | NextAuth handlers | Authentication flows (GitHub required). |

### Realtime gateway

| Method | Endpoint | Request | Response | Notes |
| --- | --- | --- | --- | --- |
| WS | `ws://localhost:8080?roomId=&memberId=&displayName=` | Query params | JSON messages | Emits `presence.join`, `presence.leave`, and relays room payloads. |

### FastAPI parity service

| Method | Endpoint | Request | Response | Notes |
| --- | --- | --- | --- | --- |
| GET | `/healthz` | - | `{ ok: true }` | Health probe. |
| GET | `/v1/sessions` | - | `{ sessions: Session[] }` | Mirrors in-memory stub. |
| POST | `/v1/sessions` | `{ name: string }` | `{ session: Session }` | Mirrors in-memory stub. |

## Observability
- OpenTelemetry traces emit to console for:
  - Next.js API routes (`studio-web-api`, `studio-web-api-presence`)
  - Realtime gateway (`realtime-gateway`)
- No vendor instrumentation keys required; spans appear in terminal where the process is running.

## Testing
- E2E: `pnpm test:e2e` (requires Postgres/Redis running locally and `pnpm db:migrate` completed)

## Authentication
- Providers: GitHub (required), optional Google & Discord, dev credentials.
- Middleware protects `/sessions` pages and session/upload/export APIs.
- Session ownership enforced server-side for Studio sessions.
- Env vars:
  - `NEXTAUTH_URL`
  - `NEXTAUTH_SECRET`
  - `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`
  - Optional: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- Optional: `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET`
- `AUTH_ENABLE_CREDENTIALS` (default `true` for dev/testing)

## Storage
- Upload service supports `local`, `minio`, or `s3` backends.
- Required env vars:
  - `STORAGE_TYPE`
  - `S3_BUCKET_NAME` / `MINIO_BUCKET_NAME`
  - `S3_REGION` or `MINIO_ENDPOINT`
  - Access/secret keys (`AWS_*` or `MINIO_*`)
- Optional: `STORAGE_CDN_URL`, `STORAGE_LOCAL_DIR`
- Cleanup: `@omnisonic/upload-cleaner` service deletes uploads older than 30 days without a linked session.
- Local dev: run `docker compose -f infra/docker/docker-compose.dev.yml up minio` and create bucket `omnisonic-dev` via MinIO console.

---

### How to print this spec (locally)
```bash
open docs/specs/phase-1-studio.md      # macOS (uses default viewer)
# or
less docs/specs/phase-1-studio.md      # quick terminal view
# or
pbcopy < docs/specs/phase-1-studio.md  # copy to clipboard
```

## Local Run
pnpm i
pnpm db:generate
pnpm db:migrate
REDIS_URL=redis://localhost:6379 pnpm dev --filter @omnisonic/studio-web

In another shell:
pnpm dev --filter @omnisonic/realtime-gateway
cd services/studio-api && uvicorn main:app --reload --port 8000
