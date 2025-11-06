# ADR-0003 — Royalty Ledger: Append-Only DB vs Blockchain Anchoring

## Status
Accepted — 2024-XX-XX

## Context
Omnisonic Insight needs a verifiable royalty ledger. Options include: (a) keep events and ledger entries in Postgres with an append-only contract enforced by application code, and expose Merkle roots per settlement cycle; (b) anchor checkpoints on a public blockchain (e.g., Ethereum) to guarantee immutability/auditability.

## Decision
Use append-only tables in Postgres backed by application enforcement and Merkle proof generation. Each cycle checkpoint stores the Merkle root of ledger entries, enabling audit recomputation. We defer public blockchain anchoring until we hit external audit requirements or partner demands.

## Consequences
- **Pros:** Minimal extra infra; instant consistency with existing DB; deterministic Merkle verification; faster iteration while ledger schema evolves.
- **Cons:** Trust boundary remains within Omnisonic-controlled systems; external auditors must trust DB operations; anchoring later requires retroactive publishing.
- **Mitigations:** Log immutable snapshots to cold storage; explore optional anchoring once ledger semantics stabilize; provide signed Merkle proofs to auditors.
