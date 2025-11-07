# Production Hardening & Feature Completion - Master Prompt

> This master prompt implements production-ready features across all phases. Execute sections in order, testing after each major section.

## Phase 1: Studio Production Hardening

### 1.1 Authentication (NextAuth.js)

Add NextAuth.js v5 (Auth.js) to `apps/studio-web` with:
- Database adapter using Prisma (add `User`, `Account`, `Session`, `VerificationToken` models to schema)
- OAuth providers: GitHub (required), Google (optional), Discord (optional)
- Email/password credentials provider (optional, for development)
- Protected API routes middleware that checks session
- Update `/api/sessions` routes to require authentication and associate sessions with `userId`
- Add `userId` field to `Session` model in Prisma schema
- Create `/api/auth/[...nextauth]` route handler
- Add sign-in/sign-out UI components using shadcn/ui patterns
- Update session detail page to show owner and restrict editing to owner
- Add middleware to protect `/sessions` routes (redirect to sign-in if unauthenticated)
- Update E2E tests to handle authentication flow

**Environment variables needed:**
- `NEXTAUTH_URL` (base URL)
- `NEXTAUTH_SECRET` (generate with `openssl rand -base64 32`)
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` (for GitHub OAuth)
- Optional: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET`

**Prisma migration:**
- Add `User`, `Account`, `Session` (NextAuth), `VerificationToken` tables
- Add `userId` to `Session` model (nullable for backward compatibility, then make required)
- Add foreign key constraint and index on `Session.userId`

### 1.2 File Upload (S3/Cloud Storage)

Replace mock upload handler with real S3-compatible storage:
- Use `@aws-sdk/client-s3` for AWS S3 or `@aws-sdk/client-s3` with MinIO for local dev
- Support environment-based storage: S3 (production), MinIO (staging), local filesystem (dev fallback)
- Add Prisma model `Upload` with fields: `id`, `userId`, `fileName`, `fileSize`, `mimeType`, `storageKey`, `storageUrl`, `createdAt`
- Implement multipart upload for files > 5MB
- Add file validation: max size (100MB), allowed MIME types (audio/*, image/*, video/*)
- Generate presigned URLs for downloads (expire after 1 hour)
- Add cleanup job to delete orphaned uploads (files without associated sessions after 30 days)
- Update `/api/upload` to:
  - Require authentication
  - Store metadata in Postgres
  - Upload to S3/MinIO
  - Return public URL or presigned URL
- Add `/api/upload/[id]` route for metadata retrieval
- Add `/api/upload/[id]/delete` route for authenticated deletion

**Environment variables:**
- `STORAGE_TYPE` (s3|minio|local)
- `S3_BUCKET_NAME` (or `MINIO_BUCKET_NAME`)
- `S3_REGION` / `MINIO_ENDPOINT`
- `AWS_ACCESS_KEY_ID` / `MINIO_ACCESS_KEY`
- `AWS_SECRET_ACCESS_KEY` / `MINIO_SECRET_KEY`
- `STORAGE_CDN_URL` (optional, for CDN fronting)

**Docker Compose addition:**
- Add MinIO service for local development (ports 9000, 9001)

### 1.3 Export Mixdown Functionality

Implement real audio mixdown export:
- Add Prisma model `Export` with fields: `id`, `sessionId`, `userId`, `status` (pending|processing|completed|failed), `fileUrl`, `fileSize`, `format` (wav|mp3|flac), `progress` (0-100), `errorMessage`, `createdAt`, `completedAt`
- Create `/services/export-worker` TypeScript service that:
  - Listens to export jobs via Redis queue (BullMQ or similar)
  - Processes audio mixdown using FFmpeg (via `fluent-ffmpeg` or `@ffmpeg/ffmpeg`)
  - Supports multiple formats: WAV (default), MP3, FLAC
  - Uploads result to S3/MinIO storage
  - Updates export status in Postgres
  - Emits progress updates via WebSocket to realtime gateway
- Update `/api/export` POST to:
  - Require authentication
  - Validate session ownership
  - Create export record with status "pending"
  - Enqueue job to Redis queue
  - Return export ID and status
- Add `/api/export/[id]` GET route for status/progress
- Add `/api/export/[id]/download` route for authenticated download
- Update session detail page to:
  - Show export button (only for session owner)
  - Display export history
  - Show progress indicator for in-progress exports
  - Provide download links for completed exports
- Add WebSocket message type `export.progress` for real-time updates

**Dependencies:**
- `bullmq` or `bull` for job queue
- `fluent-ffmpeg` or `@ffmpeg/ffmpeg` for audio processing
- FFmpeg binary (install via system package manager or Docker)

**Environment variables:**
- `REDIS_URL` (for job queue, reuse existing)
- `EXPORT_WORKER_CONCURRENCY` (default: 2)
- `EXPORT_MAX_DURATION_SECONDS` (default: 600)

## Phase 2: Core Enhancements

### 2.1 GraphQL Subscriptions

Add real-time subscriptions to Graph API:
- Use GraphQL Yoga's built-in subscription support with `graphql-ws` protocol
- Add `Subscription` type to schema with:
  - `workUpdated(workId: ID!)`: emits when Work changes
  - `recordingUpdated(recordingId: ID!)`: emits when Recording changes
  - `ledgerEntryCreated(cycleId: ID)`: emits when new ledger entries are added
  - `cycleCheckpointClosed(cycleId: ID)`: emits when cycle checkpoint is finalized
- Implement PubSub using Redis (create `@omnisonic/pubsub` package)
- Update mutations to publish events after successful writes
- Add WebSocket server to Graph API service (port 4001 for subscriptions)
- Update GraphQL client in frontend to support subscriptions (using `graphql-ws` client)
- Add subscription hooks in React components for live updates

**Implementation:**
- Create `/packages/pubsub` package with Redis PubSub wrapper
- Add `Subscription` resolvers in Graph API
- Use Redis channels: `work:${id}`, `recording:${id}`, `ledger:cycle:${id}`, `checkpoint:${id}`
- Emit events from mutations: `upsertRecording`, future `createWork`, `updateContribution`, etc.

### 2.2 License Management

Implement full license management (currently stubbed):
- Add Prisma model `License` with fields: `id`, `workId`, `licensee` (string), `territory` (string, nullable for worldwide), `rightsType` (enum: mechanical|performance|synchronization|master), `effectiveFrom` (DateTime), `expiresOn` (DateTime, nullable), `terms` (JSON for flexible metadata), `status` (enum: draft|active|expired|revoked), `createdAt`, `updatedAt`
- Add GraphQL mutations:
  - `createLicense(input: LicenseInput!)`: create new license
  - `updateLicense(id: ID!, input: LicenseInput!)`: update license
  - `revokeLicense(id: ID!)`: revoke active license
- Add GraphQL queries:
  - `licenses(workId: ID)`: list licenses for a work (or all)
  - `license(id: ID!)`: get single license
  - `activeLicenses(workId: ID, territory: String, rightsType: RightsType)`: filter active licenses
- Update `Work.licenses` resolver to return actual License records
- Add validation:
  - Ensure `expiresOn` > `effectiveFrom`
  - Prevent overlapping active licenses for same work/territory/rightsType (or allow with conflict resolution)
- Add license expiration job (runs daily, updates status to "expired")
- Add license conflict detection helper

**GraphQL Schema additions:**
```graphql
enum RightsType {
  MECHANICAL
  PERFORMANCE
  SYNCHRONIZATION
  MASTER
}

enum LicenseStatus {
  DRAFT
  ACTIVE
  EXPIRED
  REVOKED
}

input LicenseInput {
  workId: ID!
  licensee: String!
  territory: String
  rightsType: RightsType!
  effectiveFrom: String!
  expiresOn: String
  terms: JSON
}
```

### 2.3 Bulk Import Endpoints

Add high-performance bulk import to ingest service:
- Create `/ingest/isrc/bulk` endpoint that:
  - Accepts large CSV/JSON files (up to 100MB)
  - Processes in batches (100 records per batch)
  - Uses async/await with concurrency limit (10 parallel batches)
  - Returns job ID for async processing
  - Supports progress tracking via Redis
- Create `/ingest/isrc/bulk/[jobId]` endpoint for job status
- Add Prisma model `BulkImportJob` with fields: `id`, `userId` (nullable), `status` (pending|processing|completed|failed), `totalRecords`, `processedRecords`, `acceptedRecords`, `rejectedRecords`, `errors` (JSON array), `fileUrl`, `createdAt`, `completedAt`
- Implement job queue using BullMQ (reuse Redis)
- Add worker service `/services/ingest-worker` (Python) that:
  - Processes bulk import jobs
  - Validates ISRCs in parallel
  - Upserts to Graph API with retry logic
  - Updates job progress
- Add rate limiting: max 5 bulk imports per hour per user (if authenticated)
- Add CSV validation: required columns (isrc, title, artist), optional columns (duration, released_at, genre)
- Support JSON Lines format for streaming large files

**Environment variables:**
- `BULK_IMPORT_MAX_FILE_SIZE_MB` (default: 100)
- `BULK_IMPORT_BATCH_SIZE` (default: 100)
- `BULK_IMPORT_CONCURRENCY` (default: 10)
- `BULK_IMPORT_RATE_LIMIT_PER_HOUR` (default: 5)

## Phase 3: Insight Strengthening

### 3.1 Enhanced Entity Tagging

Improve entity tagging with fuzzy matching and embeddings:
- Replace simple heuristic matching with:
  - Fuzzy string matching using `thefuzz` (Python) or `fuse.js` (TypeScript) for artist/work/recording names
  - Optional: Add embedding-based matching using sentence-transformers (Python) or OpenAI embeddings
  - Confidence scoring: combine fuzzy match score (0-100) with embedding similarity (0-1) if available
- Add Prisma model `EntityTag` (or extend existing tagging) with fields: `id`, `newsItemId`, `entityType`, `entityId`, `confidence`, `method` (heuristic|fuzzy|embedding|hybrid), `matchedText` (the text that matched), `createdAt`
- Update tagging config to support:
  - Fuzzy match threshold (default: 70)
  - Embedding similarity threshold (default: 0.7)
  - Stoplist expansion (common words, false positives)
- Add entity normalization: handle variations (e.g., "The Beatles" vs "Beatles", "feat." vs "ft.")
- Cache embeddings for known entities in Redis (TTL: 7 days)
- Add `/ingest/tagging/improve` endpoint to re-tag existing news items with improved algorithm

**Dependencies:**
- Python: `thefuzz`, `python-Levenshtein`, optional: `sentence-transformers`, `torch`
- TypeScript: `fuse.js` (if doing client-side)

**Environment variables:**
- `TAGGING_FUZZY_THRESHOLD` (default: 70)
- `TAGGING_EMBEDDING_THRESHOLD` (default: 0.7)
- `TAGGING_USE_EMBEDDINGS` (default: false, enable when ready)

### 3.2 Alerting Channels

Add multi-channel alerting to alerts service:
- Extend `/services/alerts` to support:
  - Email alerts (using `nodemailer` with SMTP)
  - Webhook alerts (HTTP POST to configured URLs)
  - Slack alerts (using Slack Webhook API)
- Add Prisma model `AlertChannel` with fields: `id`, `name`, `type` (email|webhook|slack), `config` (JSON: email addresses, webhook URLs, Slack webhook URL), `enabled`, `filters` (JSON: entity types, confidence thresholds), `createdAt`, `updatedAt`
- Add alert rules: threshold crossings, new entity mentions, trend spikes
- Add `/api/alerts/channels` CRUD endpoints (in new Next.js API or Graph API)
- Update alerts service to:
  - Poll ClickHouse every minute (existing)
  - Check thresholds against configured channels
  - Send alerts via appropriate channel
  - Log alert delivery status
  - Rate limit: max 1 alert per entity per channel per hour
- Add alert history: store sent alerts in Postgres for audit
- Add alert templates: customizable message templates per channel type

**Dependencies:**
- `nodemailer` for email
- `@slack/webhook` for Slack
- `axios` or `node-fetch` for webhooks

**Environment variables:**
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`
- `ALERT_RATE_LIMIT_PER_HOUR` (default: 1)

### 3.3 Advanced Analytics Views

Add comprehensive analytics views to Insight web app:
- Create new page `/apps/insight-web/app/analytics/page.tsx` with:
  - Time-series chart (last 30 days) showing entity mentions over time
  - Genre breakdown pie chart (aggregate genres from linked works)
  - Top sources table (RSS feeds with most items)
  - Entity network graph (visualize relationships between artists/works/recordings)
- Add ClickHouse views/queries:
  - `entity_mentions_timeseries`: daily counts per entity type
  - `genre_trends`: aggregate genres from works linked to news items
  - `source_performance`: items per source, engagement metrics
- Add server actions:
  - `fetchEntityMentionsTimeseries(entityType, days)`
  - `fetchGenreBreakdown(days)`
  - `fetchTopSources(days, limit)`
  - `fetchEntityNetwork(entityId, depth)`
- Use charting library: `recharts` or `@visx/visx` for visualizations
- Add filters: date range, entity type, genre, source
- Add export functionality: download charts as PNG/PDF, export data as CSV

**Dependencies:**
- `recharts` or `@visx/visx` for charts
- `date-fns` for date handling

## Infrastructure & DevOps

### 4.1 CI/CD Pipeline

Add GitHub Actions workflow:
- Create `.github/workflows/ci.yml` with:
  - Lint: run ESLint across all TypeScript workspaces
  - Typecheck: run `tsc --noEmit` across all workspaces
  - Build: run `pnpm build` for all apps/services
  - Test: run Playwright E2E tests (requires Postgres/Redis)
  - Cache: PNPM store, node_modules
  - Matrix strategy: test on Node 20, 22
- Create `.github/workflows/deploy-staging.yml`:
  - Trigger on push to `staging` branch
  - Build Docker images for services
  - Deploy to staging environment (Vercel for Next.js apps, Railway/Render for services)
  - Run database migrations
  - Health check after deployment
- Create `.github/workflows/deploy-production.yml`:
  - Trigger on push to `main` branch (manual approval required)
  - Same as staging but deploy to production
  - Add rollback capability
- Add environment secrets management:
  - Staging: `DATABASE_URL_STAGING`, `REDIS_URL_STAGING`, etc.
  - Production: `DATABASE_URL_PROD`, `REDIS_URL_PROD`, etc.

**Files to create:**
- `.github/workflows/ci.yml`
- `.github/workflows/deploy-staging.yml`
- `.github/workflows/deploy-production.yml`
- `.github/workflows/docker-build.yml` (if using containers)

### 4.2 Staging Environment

Set up staging environment configuration:
- Create `docker-compose.staging.yml` with:
  - Postgres (separate database)
  - Redis (separate instance)
  - ClickHouse (separate database)
  - MinIO (for file storage)
  - All services with staging configs
- Add environment-specific configs:
  - `apps/studio-web/.env.staging`
  - `services/*/.env.staging`
- Add staging database seeding script: `scripts/seed-staging.ts`
- Add staging health check endpoints to all services
- Document staging deployment process in `/docs/deployment/staging.md`

### 4.3 Database Backup Strategy

Implement automated backups:
- Create `/scripts/backup-db.sh` that:
  - Uses `pg_dump` to backup Postgres
  - Compresses backup (gzip)
  - Uploads to S3/MinIO with date-based naming
  - Retains last 7 daily backups, 4 weekly backups, 12 monthly backups
- Add Prisma model `Backup` for tracking: `id`, `type` (full|incremental), `database`, `fileUrl`, `fileSize`, `status` (pending|completed|failed), `createdAt`
- Create `/services/backup-scheduler` Node service that:
  - Runs daily at 2 AM UTC
  - Triggers backup script
  - Records backup metadata in Postgres
  - Sends notification on failure
- Add backup restoration script: `scripts/restore-db.sh`
- Add ClickHouse backup (using `clickhouse-backup` tool or native backup)
- Document backup/restore procedures in `/docs/operations/backups.md`

**Environment variables:**
- `BACKUP_S3_BUCKET` (or `BACKUP_MINIO_BUCKET`)
- `BACKUP_RETENTION_DAYS` (default: 7)
- `BACKUP_RETENTION_WEEKS` (default: 4)
- `BACKUP_RETENTION_MONTHS` (default: 12)

### 4.4 Read Replicas for Postgres

Add read replica support for scaling:
- Update Prisma client to support read/write splitting:
  - Create `@omnisonic/db` package extension with:
    - `prisma.$transaction()` uses primary (write)
    - `prisma.$queryRaw()` can use replica (read)
    - Add `getReadClient()` and `getWriteClient()` helpers
- Add environment variables:
  - `DATABASE_URL` (primary, write)
  - `DATABASE_READ_URL` (replica, read, optional)
- Update Graph API queries to use read replica when available
- Update Insight web queries to use read replica
- Add connection pooling configuration (PgBouncer or Prisma connection pool)
- Document read replica setup in `/docs/operations/read-replicas.md`

**Implementation:**
- Use Prisma's `datasource` with multiple URLs
- Or create wrapper that routes queries based on operation type
- Add health checks for both primary and replica

## Testing & Quality

### 5.1 Additional E2E Tests

Expand Playwright test coverage:
- Add tests for:
  - Authentication flow (sign in, sign out, protected routes)
  - File upload (with mock S3)
  - Export mixdown (with mock worker)
  - GraphQL subscriptions (WebSocket connection)
  - Bulk import (job creation and status)
  - Alert channel creation and triggering
- Add visual regression tests for key pages
- Add performance tests (Lighthouse CI)
- Add accessibility tests (axe-core)

### 5.2 Error Monitoring

Add error tracking and monitoring:
- Integrate Sentry (or similar) for:
  - Frontend error tracking (Next.js)
  - Backend error tracking (Node services, Python services)
  - Performance monitoring
- Add error boundaries in React components
- Add structured logging with correlation IDs
- Add error alerting (integrate with alert channels)
- Document error response format in API specs

**Environment variables:**
- `SENTRY_DSN` (frontend)
- `SENTRY_DSN_BACKEND` (backend)
- `SENTRY_ENVIRONMENT` (development|staging|production)

## Documentation Updates

### 6.1 Update Specs

Update existing specs with new features:
- `/docs/specs/phase-1-studio.md`: add auth, upload, export sections
- `/docs/specs/phase-2-core.md`: add subscriptions, licenses, bulk import
- `/docs/specs/phase-3-insight.md`: add enhanced tagging, alerting, analytics

### 6.2 Operations Docs

Create operations documentation:
- `/docs/operations/deployment.md`: deployment procedures
- `/docs/operations/backups.md`: backup/restore procedures
- `/docs/operations/monitoring.md`: monitoring and alerting setup
- `/docs/operations/troubleshooting.md`: common issues and solutions

### 6.3 API Documentation

Generate API documentation:
- Add OpenAPI/Swagger to FastAPI services (auto-generated)
- Add GraphQL schema documentation (using GraphQL Code Generator)
- Add API versioning strategy document

## Execution Order

1. **Phase 1.1** (Authentication) - Foundation for other features
2. **Infrastructure 4.1** (CI/CD) - Enable safe iteration
3. **Phase 1.2** (File Upload) - Required for exports
4. **Phase 1.3** (Export Mixdown) - Completes Phase 1
5. **Phase 2.1** (GraphQL Subscriptions) - Real-time updates
6. **Phase 2.2** (License Management) - Core feature
7. **Phase 2.3** (Bulk Import) - Performance improvement
8. **Phase 3.1** (Enhanced Tagging) - Quality improvement
9. **Phase 3.2** (Alerting) - Operational feature
10. **Phase 3.3** (Analytics Views) - User-facing feature
11. **Infrastructure 4.2-4.4** (Staging, Backups, Read Replicas) - Production readiness
12. **Testing & Documentation** - Quality and maintainability

## Notes

- Test each section thoroughly before moving to the next
- Update environment variable documentation as you add new vars
- Keep backward compatibility where possible (e.g., nullable `userId` initially)
- Add database migrations for all schema changes
- Update E2E tests as you add features
- Document breaking changes in CHANGELOG.md




  ## Chunk 1 — Studio Auth & Hardening Foundation

  Goals: Secure Studio app, lay groundwork for storage/exports.

  1. Add NextAuth.js v5 to apps/studio-web:
      - Extend Prisma schema (User, Account, Session, VerificationToken, Session.userId FK).
      - Configure adapters, GitHub OAuth (plus optional Google/Discord/credentials).
      - Create /api/auth/[...nextauth], session middleware, and auth-protected layout.
      - Build sign-in/sign-out UI (shadcn/ui).
      - Enforce auth on /sessions pages + API; store session ownership.
      - Update session detail to show owner & restrict editing.
      - Adjust Playwright tests for auth flow.
  2. Infrastructure basics:
      - Add required env vars (NEXTAUTH_*, provider IDs).
      - Generate Prisma migration & run locally.

  Exit Check: Auth works E2E (Sign in → create session → access protected routes via tests).

  ———

  ## Chunk 2 — CI/CD & Tooling Backbone

  Goals: Ensure safe iteration before shipping storage/export changes.

  1. GitHub Actions:
      - ci.yml: lint, typecheck, build, Playwright.
      - deploy-staging.yml & deploy-production.yml with approvals, migrations.
      - Add caching and Node 20/22 matrix where relevant.
  2. Docker images/build workflow (optional docker-build.yml).
  3. Document secrets & env management.

  Exit Check: Actions pass on PR; staging pipeline green (even if target envs stubbed).

  ———

  ## Chunk 3 — File Uploads & Storage Infrastructure

  Goals: Real storage, metadata, local MinIO.

  1. Prisma: Upload model; MinIO service in docker-compose.dev.yml.
  2. Upload API overhaul:
      - Auth-required POST, metadata saved, S3/MinIO/local storage choice.
      - File validation, multipart support, presigned download URLs.
      - GET /api/upload/[id], DELETE /api/upload/[id]/delete.
      - Scheduled cleanup for orphaned uploads.
  3. UI updates: integrate real upload flow in Studio.
  4. Env vars: STORAGE_*, credentials.

  Exit Check: Upload tests (unit/E2E) pass with MinIO locally; metadata persisted.

  ———

  ## Chunk 4 — Export Mixdown Pipeline

  Goals: Real export jobs via worker + FFmpeg.

  1. Prisma: Export model.
  2. Export worker service (services/export-worker):
      - BullMQ queue (Redis).
      - FFmpeg processing (formats), upload results, status updates.
      - Progress events via realtime gateway (export.progress).
  3. API routes:
      - POST enqueue (owner only), GET status, download route with auth.
  4. Session detail UI: export history, progress, downloads (real-time updates).
  5. Env vars: queue concurrency, limits.
  6. Testing: unit (worker), integration (API), E2E (mock processing).

  Exit Check: Export job runs in dev (mock audio) and surfaces progress/download.

  ———

  ## Chunk 5 — Graph API Real-Time & License Management

  Goals: Phase 2 real-time + licensing core.

  1. Subscriptions:
      - New @omnisonic/pubsub (Redis) package.
      - Graph API Subscription resolvers (workUpdated, etc.), WebSocket server (port 4001).
      - Mutations publish events.
      - Frontend client updates to consume subscriptions.
  2. License Management:
      - Prisma License model.
      - GraphQL types, queries, mutations (create/update/revoke/active).
      - Validation (dates, overlaps).
      - Daily expiration job (Node service or cron).
      - Conflict detection helper.
  3. Update docs/specs.

  Exit Check: Graph API tests (unit/integration) passing; subscription events visible from client.

  ———

  ## Chunk 6 — Bulk Import Pipeline

  Goals: High-volume ingest with queues.

  1. Prisma BulkImportJob.
  2. Ingest service:
      - /ingest/isrc/bulk (async job creation, file validation, rate limiting).
      - /ingest/isrc/bulk/[jobId] status endpoint.
  3. Worker (services/ingest-worker, Python):
      - Processes jobs (batching, concurrency, retries).
      - Updates progress, handles JSON Lines.
      - Uses BullMQ queue shared with Node (or dedicated).
  4. Redis progress tracking; rate limit enforcement.
  5. Tests (unit/integration/E2E stub).

  Exit Check: Upload >50k records processed in batches; status endpoints accurate.

  ———

  ## Chunk 7 — Insight Enhanced Tagging & Alerts

  Goals: Smarter tagging, multi-channel alerting.

  1. Tagging improvements:
      - `EntityTag` model (Prisma) + Graph API `recordEntityTags` mutation.
      - Hybrid matcher (token overlap + TheFuzz + optional SentenceTransformer embeddings w/ Redis caching & snippet capture).
      - Env-configurable thresholds (`INGEST_TAGGING_*`), normalized stoplists, deterministic news-item IDs.
      - `/ingest/tagging/improve` endpoint to re-run stored feeds and push results via Graph API.
  2. Alerts service upgrades:
      - `AlertChannel`, `AlertRule`, `AlertEvent` models + Fastify CRUD API.
      - Email (nodemailer/SMTP), webhook, and Slack channels with string-template customization.
      - Rule cooldowns, per-channel rate limiting, ClickHouse-backed polling worker, event history UI hooks.

  3. ClickHouse queries adjustments for new data.

  Exit Check: Alerts fire to configured channels during threshold crossing; tagging stores enriched metadata.

  ———

  ## Chunk 8 — Insight Analytics Dashboard

  Goals: Advanced charts, data exports.

  1. ClickHouse views:
      - entity_mentions_timeseries, genre_trends, source_performance.
  2. Insight Web:
      - /analytics page with charts (recharts/visx) + filters.
      - Server actions for time series, genres, sources, network graph.
      - Export options (PNG/CSV) using server actions.
  3. UI polish, accessibility checks.

  Exit Check: Analytics page interactive, filters work, exports succeed.

  ———

  ## Chunk 9 — Ops Hardening (Staging, Backups, Replicas)

  Goals: Production-grade infrastructure.

  1. Staging environment:
      - docker-compose.staging.yml, .env.staging, seeding script, health endpoints.
      - /docs/deployment/staging.md.
  2. Backup strategy:
      - scripts/backup-db.sh, restore-db.sh.
      - Prisma Backup model + services/backup-scheduler.
      - ClickHouse backups doc.
      - /docs/operations/backups.md.
  3. Read replicas:
      - Extend @omnisonic/db with read/write helpers.
      - Use DATABASE_URL + DATABASE_READ_URL.
      - Update services to prefer read replica where safe.
      - /docs/operations/read-replicas.md.

  Exit Check: Backups run in dev/staging, replica config documented/tested.

  ———

  ## Chunk 10 — Testing, Monitoring, Documentation polish

  Goals: QA coverage, error monitoring, docs finalization.

  1. E2E expansions (auth, uploads, export, subscriptions, bulk import, alerts).
  2. Add Lighthouse, axe-core, visual regression.
  3. Integrate Sentry (frontend & backend); error boundaries.
  4. Structured logging (correlation IDs), error response docs.
  5. Docs updates:
      - Specs (Phases 1–3).
      - Operations docs (deployment, monitoring, troubleshooting).
      - API docs (OpenAPI for FastAPI, GraphQL schema export).

  Exit Check: Test suite comprehensive, monitoring in place, docs final.

  ———

  ### Tips for Execution

  - Treat each chunk as a branch/PR series.
  - Run Prisma migrations incrementally (nullable → required transitions).
  - Update CHANGELOG for breaking changes.
  - Keep env docs in sync; share .env.example updates.
  - Validate each chunk via local CI before merging.

  Let me know where you want to start; I can help create detailed task lists or implementation steps for any chunk.
