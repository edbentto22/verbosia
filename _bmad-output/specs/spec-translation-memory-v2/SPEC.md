---
id: SPEC-translation-memory-v2
companions:
  - 'key-contract-and-migration.md'
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate.

# Translation Memory V2 Hardening

## Why

Before the v0.1 release, Verbosia must stop treating different translation requests as the same cached result. The current key can collide through delimiter framing, merges glossary and do-not-translate partitions, omits translation-affecting context, and accepts an empty model. These faults can silently return a plausible but incorrect translation, especially when Redis shares memory across projects.

## Capabilities

- **CAP-1 — Versioned collision-resistant identity**
  - **intent:** The translation engine can address every translation by a collision-resistant, explicitly versioned identity.
  - **success:** Distinct semantic inputs, including adversarial NUL and delimiter values, never share a key in the required vectors, while identical inputs remain deterministic across runs and platforms.

- **CAP-2 — Complete translation context**
  - **intent:** A cache lookup reflects the complete translation request that can affect provider output.
  - **success:** Source language, target language, target variant, actual provider, model, tone, ordered glossary, ordered do-not-translate list, prompt version, and exact source text each participate in identity, and each single-field mutation produces a miss.

- **CAP-3 — Safe legacy isolation**
  - **intent:** Operators can adopt TM v2 without unsafe reuse or silent deletion of legacy entries.
  - **success:** V1 entries are never read, promoted, backfilled, or synchronized as v2; local legacy data can coexist until explicit dry-run-aware cleanup, and Redis v2 keys occupy a disjoint namespace.

- **CAP-4 — Consistent lifecycle behavior**
  - **intent:** Translation, human review, pruning, synchronization, and every cache tier use one TM v2 contract.
  - **success:** Every producer and consumer derives the same key, review edits survive reruns, pruning preserves live translations across provider/model histories, and synchronization excludes legacy keys.

- **CAP-5 — Auditable portable contract**
  - **intent:** Developers and operators can audit and reproduce the TM identity contract.
  - **success:** Exported Core types/functions, documentation, golden vectors, package runtime exports, and focused integration tests agree on the same v2 format and migration behavior.

## Constraints

- The [key and migration contract](key-contract-and-migration.md) is binding for the identity preimage, key format, validation, compatibility, maintenance behavior, and acceptance vectors.
- Required identity fields fail closed; configuration rejects an empty or whitespace-only model before discovery, cache access, or provider execution.
- Ordered glossary and do-not-translate values remain separate and exact because the current provider pipelines observe their partition and order; no hidden sorting, merging, trimming, deduplication, delimiter joining, or Unicode normalization may invent equivalence.
- V1 data is untrusted for semantic reuse. No dual-read, inferred migration, key promotion, or fallback may convert a v1 hit into v2, and ordinary translation must not delete legacy entries.
- Local legacy cleanup is explicit and dry-run-aware. Shared Redis v1 entries are ignored rather than globally deleted because ownership cannot be proven.
- Keys and diagnostics must not expose source text, glossary terms, tone, credentials, or other request content.
- The public Core package exposes the same v2 contract used internally and proves its runtime exports from the packed artifact; unsafe v1 behavior is not retained solely for pre-v0.1 source compatibility.

## Non-goals

- Change translation quality, prompts, masking, provider retry behavior, content discovery, status hashing, Brand Memory, Evidence Ledger, MCP tools, or SEO/GEO analysis.
- Automatically delete Redis v1 data, reconstruct missing v1 semantics, or promise zero provider calls on the first v2 run.

## Success signal

An end-to-end translation, review, synchronization, and pruning demonstration proves that adversarial keys remain distinct, every semantic change misses, identical v2 requests hit across tiers, v1 data is ignored without silent deletion, and the complete regression, build, type, documentation, and package-export gates pass.

## Assumptions

- Because Verbosia has not yet passed the v0.1 release gate, safety takes priority over reusing pre-v2 cache entries; one controlled retranslation is acceptable when no valid v2 entry exists.
