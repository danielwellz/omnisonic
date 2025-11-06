# Phase 3 - Insight (News + Analytics) - Ordered Prompts

1) **Ingest sources**
   - *Prompt:* "Extend `/services/ingest` with `/ingest/rss` endpoint; parse RSS URLs, normalize to {source,title,url,published_at} and write to DuckDB."
2) **Entity linking (stub)**
   - *Prompt:* "Add a Python module that tags ingested items with artist/work/recording references using simple heuristics and a stoplist."
3) **Analytics store**
   - *Prompt:* "Provision ClickHouse in docker-compose; create tables `news_items` and `entity_links` and a view for last-7-days counts."
4) **Insight web app**
   - *Prompt:* "Add `/apps/insight-web` Next.js app with a Trends page that queries ClickHouse (server action) for top entities."
5) **Alerts (stub)**
   - *Prompt:* "Create `/services/alerts` TS service that reads from ClickHouse every minute and logs threshold crossings."
6) **Docs**
   - *Prompt:* "Create `/docs/specs/phase-3-insight.md` with data flow diagrams and print instructions."
