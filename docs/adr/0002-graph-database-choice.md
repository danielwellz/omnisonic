# ADR-0002 — Graph Persistence: Postgres + Prisma vs Neo4j

## Status
Accepted — 2024-XX-XX

## Context
Phase 2 (Omnisonic Core) requires a knowledge graph that links works, recordings, contributors, ownership splits, and licenses. Neo4j offers a native property graph and query language (Cypher), but introduces new operational overhead and breaks our monorepo’s single persistence pipeline (Prisma migrations, pg-native tooling). Postgres 16 already backs all Thin Slice services and supports graph-like joins with reasonable performance at current scale.

## Decision
Model the music graph in Postgres using relational tables managed through Prisma. We retain the benefits of transactional integrity (ACID) and leverage Prisma’s typed client while avoiding a second datastore. GraphQL resolvers shape query patterns, and we can add GIN indexes / materialized views as needed.

## Consequences
- **Pros:** Single database to operate; reuse existing ORM, migrations, and CI; strong consistency between ledger + graph data; easier developer onboarding.
- **Cons:** Complex traversals require tuned SQL, not Cypher; no native pattern-matching index structures; eventual scale may demand denormalization or caching.
- **Mitigations:** Add covering indexes for traversal paths; introduce read replicas and caching; revisit specialized graph store if relationship queries exceed Postgres capabilities.
