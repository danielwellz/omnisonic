# ADR-0001 — Monorepo Structure

## Decision
Use a single monorepo with /apps, /services, /packages, /infra, /docs, /prompts.

## Context
Supports unified types, CI, and thin-slice delivery across Studio -> Core -> Insight.

## Consequences
Shared versions/config; simplified developer onboarding; atomic changes across layers.
