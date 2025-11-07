# Phase 3 — Omnisonic Insight

## Overview
Phase 3 brings cross-genre news & analytics to the Omnisonic ecosystem. The goal is to ingest heterogeneous news feeds, normalize them, tag relevant entities (artist, work, recording), and surface actionable trends via dashboards and alerts.

## Data Flow
```mermaid
flowchart TB
    RSS[External RSS Feeds] -->|/ingest/rss| IngestService(FastAPI Ingest Service)
    IngestService -->|Upsert| ClickHouse[(ClickHouse)]
    IngestService -->|Entity Tags| DuckDB[(DuckDB)]
    ClickHouse -->|Server Actions| InsightWeb(Insight Web App)
    ClickHouse -->|Polling| AlertsService(Alerts Service)
    AlertsService -->|Logs & Notifications| ObservabilityStack[(Pino/Alerts)]
```

### Components
- **Ingest Service (`services/ingest`)**  
  - `/ingest/isrc` normalizes track metadata and upserts to Graph API (Postgres).  
  - `/ingest/rss` fetches RSS feeds, writes normalized items to ClickHouse, performs hybrid tagging (token/fuzzy + optional embeddings), and captures backup records in DuckDB.  
  - `/ingest/tagging/improve` replays stored feeds through the improved matcher and syncs results to the Graph API `recordEntityTags` mutation.
- **Tagging Module**  
  - Normalizes content, applies stoplists, and combines token overlap, TheFuzz ratios, and optional SentenceTransformer embeddings (cached in Redis) to generate `EntityTag` confidence + matched text metadata.
- **ClickHouse**  
  - `news_items`: Raw news entries.  
  - `entity_links`: Many-to-one rows linking news to tagged entities.  
  - `news_items_last7` view: Last 7 days per source.
- **Insight Web (`apps/insight-web`)**  
  - `/` overview lists current top entities, while `/analytics` renders timeseries, genre share, source performance, and entity co-mention network visualizations (Recharts) with CSV/PNG exports powered by server actions.
- **Alerts Service (`services/alerts`)**  
  - Polls ClickHouse on a tunable interval, evaluates `AlertRule`s persisted in Postgres, and dispatches notifications via email (SMTP), generic webhooks, or Slack webhooks.  
  - Exposes a Fastify REST API (`/channels`, `/rules`, `/health`) to manage `AlertChannel`s, rules, and inspect status.  
  - Persists `AlertEvent` history, enforces per-channel rate limits, and honors per-rule cooldowns + per-entity dedupe windows.

## Tables & Views
| Name | Columns | Purpose |
| --- | --- | --- |
| `insight.news_items` | `id`, `source`, `title`, `url`, `published_at`, `tags`, `ingested_at` | Denormalized news entries |
| `insight.entity_links` | `id`, `news_id`, `entity_type`, `entity_id`, `confidence`, `linked_at` | Entity associations with confidence |
| `insight.news_items_last7` (view) | `source`, `total_items`, `unique_tags`, `first_published`, `last_published` | Quick look summary per source |
| `insight.entity_mentions_timeseries` (view) | `entity_type`, `entity_id`, `day`, `mentions`, `avg_confidence` | Pre-aggregated entity trendlines |
| `insight.genre_trends` (view) | `genre`, `day`, `mentions`, `unique_sources` | Genre coverage / share of voice |
| `insight.source_performance` (view) | `source`, `total_items`, `unique_tags`, `first_seen`, `last_seen` | High-level publisher metrics |

## Environment
- `CLICKHOUSE_HOST` (default `http://localhost:8123`)
- `CLICKHOUSE_USER` / `CLICKHOUSE_PASSWORD` (default `omnisonic`)
- `CLICKHOUSE_DATABASE` (default `insight`)
- Alerts service: `ALERT_THRESHOLD` (default `10`), `ALERT_INTERVAL_MS` (default `60000`)
- Ingest service: `INGEST_DUCKDB_PATH` for DuckDB persistence

## Local Run Instructions
1. `docker compose -f infra/docker/docker-compose.dev.yml up clickhouse postgres redis`
2. `pnpm install`
3. `pnpm dev --filter @omnisonic/insight-web`
4. `cd services/ingest && uvicorn ingest.main:app --reload --port 8100`
5. `pnpm dev --filter @omnisonic/alerts`

## Print / View
```bash
# Terminal quick view
less docs/specs/phase-3-insight.md

# macOS preview
open docs/specs/phase-3-insight.md

# Copy to clipboard
pbcopy < docs/specs/phase-3-insight.md
```
