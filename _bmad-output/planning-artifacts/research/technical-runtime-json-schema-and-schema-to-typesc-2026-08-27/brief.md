# Technical research brief

## Decision

Select the JSON Schema runtime validator and schema-to-TypeScript pipeline for Verbosia Story 1.

## Hard gates

- JSON Schema Draft 2020-12.
- ESM and Node.js 22/24.
- Fully offline, packaged `$ref` resolution.
- Canonical JSON Schema files as the source of truth.
- Mechanical schema/type drift detection in CI.
- Semantic-format validation suitable for RFC 3339, URI and BCP 47.
- No loaders, Policy Engine or MCP tools in this story.

## Weighted preferences

1. Maturity and maintenance health.
2. Standards fidelity and predictable strictness.
3. Build/runtime simplicity in the existing pnpm/TypeScript monorepo.
4. Portable contracts for future PHP/WordPress consumers.
5. Low exit cost and minimal lock-in.

## Candidate families

- Runtime: Ajv 8, Hyperjump JSON Schema, alternatives surfaced by current official evidence.
- Type pipeline: json-schema-to-typescript, json-schema-to-ts, alternatives surfaced by current official evidence.

## Research plan

1. Verify standards, ESM/Node compatibility, offline references and formats from official documentation.
2. Compare schema-first type-generation mechanisms and drift gates.
3. Check current release/maintenance evidence from official package/repository sources.
4. Produce a reversible recommendation, runner-up and implementation constraints.

## Method

- Type: technical.
- Shape: select.
- Topology: straightforward, inline, no subagents.
- Preset: standard; maximum two rounds; only primary/official sources.
- Validation: normal, with every decision-bearing compatibility claim cross-checked where possible.
