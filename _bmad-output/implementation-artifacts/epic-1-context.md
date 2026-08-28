# Epic 1 Context: Auditable Brand Memory and Evidence Ledger Core

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Deliver a local, provider-neutral, deterministic, read-only core that resolves multilingual brand context and authorizes claims through versioned policy and traceable evidence. The core must be reusable outside MCP, must not let AI or transient signals decide what the brand may claim, and must not change the two existing tools.

## Stories

- Story 1.1: Publish portable contracts and schemas
- Story 1.2: Build the secure local snapshot substrate
- Story 1.3: Implement Brand Memory and overlays
- Story 1.4: Implement the Evidence Ledger
- Story 1.5: Implement the deterministic Policy Engine
- Story 1.6: Expose additive MCP tools
- Story 1.7: Prove portability and hardening
- Story 1.8: Validate the iterative E2E scenario

## Requirements & Constraints

- Brand Memory represents identity, voice, audiences, offerings, terminology, restrictions, approved claims, risk floors, and overlays. The Evidence Ledger maintains provenance, default-deny permission, support role, scope, validity, sensitivity, source digest, and supersession.
- Resolution separates locale, market, page intent, content type, channel, audience, and editorial risk. Overlays may change only allowed fields; they never create or mutate claims, facts, or guardrails, and effective risk may only increase.
- Each claim receives `allow`, `allow_with_constraints`, `review_required`, or `block`, with closed reason codes and auditable references. Factual support requires evidence that is direct, permitted, current, and exactly applicable to the context.
- Versioned files are canonical and evidence records are append-only; corrections create successors. Every read requires an explicit real root, escape/symlink boundaries, a stable snapshot, and fail-closed behavior. Analysis performs no writes and accesses no network, database, Redis, OAuth, or provider.
- Responses use allowlists and never expose locators, excerpts, actors, absolute paths, stacks, secrets, PII, or free-form metadata. Restricted evidence may influence a decision without being returned.
- Preserve `verbosia.inspect_project` and `verbosia.plan_localization`; add only `verbosia.inspect_brand_context` and `verbosia.validate_claims`, retaining `stdio`, idempotency, and equivalence between `text` and `structuredContent`.
- The release must preserve the 105-test baseline, validate tarballs and canaries on Node 22/24, produce equivalent Node/PHP vectors, and cover `pt-BR`, `en-US`, and `es-419`. Outcomes do not promise ranking, traffic, or generative-search presence.

## Technical Decisions

- Domain logic belongs in `@verbosia/core`; `@verbosia/mcp` only validates I/O, invokes Core, and presents responses. AI may extract claims or suggest matches, but only the deterministic `PolicyDecisionTable` authorizes them.
- Contracts are schema-first JSON Schema Draft 2020-12 with absolute versioned `$id`, closed objects, and an offline `$ref` registry. JSON Schema is authoritative; TypeScript types are generated and compared mechanically.
- The contract runtime is Ajv 8.20.x in strict 2020-12 mode, with `ajv-formats` 3.0.x, BCP 47 through `bcp-47` 2.1.x, and `json-schema-to-typescript` 15.0.x. Schemas and golden fixtures precede dependent loaders and rules.
- Brand Memory lives at `.verbosia/brand/brand-memory.json`; each evidence record lives at `.verbosia/evidence/<evidence-id>.json`. IDs are portable ASCII and references use stable IDs.
- Snapshots validate UTF-8/I-JSON, read through handles, verify identity/`fstat`, and sort deterministically. `stateDigest` and `decisionDigest` use JCS/RFC 8785 and SHA-256; after one complete retry, concurrent change fails with `STATE_CHANGED_DURING_READ`.
- Context precedence is `base -> locale -> market -> pageIntent -> contentType -> channel -> audience`, using exact selectors with no implicit inheritance; conflicts at the same precedence fail.
- Supersession is a linear successor-to-predecessor chain; successors inherit neither permission nor scope. Rules and overrides are versioned, auditable, and `most-restrictive-wins`; integrity, privacy, schema, and boundary rules are not overridable.

## Cross-Story Dependencies

Contracts and fixtures gate every dependent implementation. The secure snapshot supports Brand Memory and the Evidence Ledger; both precede the Policy Engine, which precedes the two new tools. Portability and hardening validate the complete stack before E2E. Until a sample and agreement threshold are approved, configurable editorial rules remain warnings. E2E begins only with the user-provided scenario, outcomes, and stopping criteria; every defect must produce both a fix and a permanent regression test.
