# Phase 1 - Studio: Ordered Prompts for the Code Model

> Paste each prompt, in order, into your code model to evolve the Studio app.

1) **Harden repo plumbing**
   - *Prompt:* "Add GitHub Actions CI for lint, typecheck, and Next.js build across all workspaces. Cache PNPM. Fail on TS errors."
2) **Design system baseline**
   - *Prompt:* "Add shadcn/ui with Tailwind to `apps/studio-web`. Scaffold a Button and Dialog component and integrate on the landing page."
3) **Sessions detail route**
   - *Prompt:* "Create `/apps/studio-web/app/sessions/[id]/page.tsx` that reads the session from `/api/sessions?id=:id` and shows Join/Leave mock buttons."
4) **Persist sessions (Postgres)**
   - *Prompt:* "Add Prisma to monorepo, create `Session` model (id, name, createdAt), migrate, and replace in-memory handler with Postgres-backed CRUD."
5) **Presence (Redis)**
   - *Prompt:* "Add `/apps/studio-web/app/api/presence/route.ts` with Redis SET/SADD to track room members. Expose `GET ?roomId=` to list members."
6) **Realtime gateway (WS)**
   - *Prompt:* "Create `/services/realtime-gateway` Node service using `ws` that broadcasts room messages and tracks members in Redis."
7) **Link web<->gateway**
   - *Prompt:* "From the sessions page, open a WebSocket to `ws://localhost:8080`, join the room, and show live member count."
8) **Telemetry hooks**
   - *Prompt:* "Wire OpenTelemetry basic traces in Next.js API routes and the gateway. Export to console; no vendor keys."
9) **Upload assets (stub)**
   - *Prompt:* "Create `/apps/studio-web/app/api/upload/route.ts` that accepts a file (FormData) and returns `{url}` (use in-memory mock)."
10) **Export mixdown (stub)**
    - *Prompt:* "Add `/apps/studio-web/app/api/export/route.ts` returning a fake WAV blob URL; link from session detail."
11) **E2E test**
    - *Prompt:* "Add Playwright with a test that creates a session, navigates into it, and sees the Join button."
12) **Docs**
    - *Prompt:* "Update `/docs/specs/phase-1-studio.md` with API tables and a 'How to print' note."
