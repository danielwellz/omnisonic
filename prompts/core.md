# Phase 2 - Core (Open Music Graph + Royalty Integrity Network) - Ordered Prompts

1) **Graph API scaffold**
   - *Prompt:* "Create `/services/graph-api` (TypeScript, GraphQL Yoga). Define types: Work, Recording, Contributor, Split, License. Add `Query.work(id)` and `Query.recording(id)`."
2) **Database layer**
   - *Prompt:* "Add Prisma schema for Work, Recording, Contributor, Contribution(role, pctShare), with Postgres migrations. Wire resolvers to DB."
3) **Identifiers and validation**
   - *Prompt:* "Add Zod validators for ISRC/ISWC patterns in `@omnisonic/schemas` and call them from resolvers."
4) **Ingest pipeline (Python)**
   - *Prompt:* "Create `/services/ingest` FastAPI with `/ingest/isrc` that takes CSV/JSON of {isrc,title,artist}. Normalize and upsert via REST to Graph API."
5) **Provenance ledger (append-only)**
   - *Prompt:* "Add `royalty_event`, `ledger_entry`, and `cycle_checkpoint` tables in Postgres; expose `/services/royalty-ledger` TS lib with `computeAmount` and `merkleRoot` helpers."
6) **Policy engine (splits)**
   - *Prompt:* "Create a TypeScript module that, given a Recording usage event, allocates amounts to contributors based on Work splits; return a journal of entries."
7) **Audit endpoints**
   - *Prompt:* "Expose Graph API endpoints to fetch ledger checkpoints and recompute Merkle roots for audit verification."
8) **ADR updates**
   - *Prompt:* "Add ADRs covering (a) Postgres graph vs Neo4j, (b) append-only ledger vs blockchain anchoring."
