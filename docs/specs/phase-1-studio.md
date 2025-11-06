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
| POST | `/api/upload` | `FormData{ file }` | `{ url }` | Returns mock CDN link. |
| GET | `/api/upload?id=` | `id` (query) | `{ url, metadata }` | Fetch metadata for mock upload. |
| POST | `/api/export` | `{ sessionId }` | `{ url, exportId }` | Generates mock WAV URL. |
| GET | `/api/export?id=` | `id` (query) | `{ url, sessionId, createdAt }` | Lookup export metadata. |

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
