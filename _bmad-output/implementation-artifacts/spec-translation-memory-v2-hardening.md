---
title: 'Harden Translation Memory identity and lifecycle to v2'
type: 'bugfix'
created: '2026-08-27'
status: 'done'
review_loop_iteration: 0
baseline_commit: '3007fc79bf64663959d193d35129972c4b296700'
context:
  - '{project-root}/_bmad-output/specs/spec-translation-memory-v2/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-translation-memory-v2/key-contract-and-migration.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** TM v1 can silently return an incorrect translation because delimiter framing collides, glossary partitions collapse, semantic request fields are absent, and empty models reach shared caches.

**Approach:** Adopt a fail-closed v2 identity using JCS/SHA-256 context and exact source digests, isolate legacy entries, and align translation, review, sync, and prune on that contract.

## Boundaries & Constraints

**Always:** Emit `v2:<64hex>:<64hex>` from exact resolved languages, variant, actual provider, non-empty model, tone, ordered/partitioned term lists, prompt version, and exact source text. Reject invalid fields and unpaired surrogates. Write v2 only; preserve v1 during translation; store only `tmKeyVersion` and `contextDigest` in localized metadata. Keep drivers generic and `sourceHash` unchanged.

**Ask First:** Reusing/promoting v1, deleting Redis legacy data, normalizing request content, changing prompts, or broadening beyond TM identity/lifecycle.

**Never:** Dual-read v1, infer historical context, expose request content, treat malformed `tm.json` as empty, or change Brand Memory, MCP, discovery, status, providers, SEO, or GEO.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Hit | Identical complete request twice | Same key; second run hits | N/A |
| Mutation | One identity field changes | Different key and miss | N/A |
| Adversarial | NUL/delimiters, partition/order changes | Distinct golden keys | N/A |
| Invalid | Empty required field or bad Unicode | No cache/provider work | Sanitized error |
| Legacy | V1 hash exists | Miss, v2 write, v1 preserved | Maintenance reports it |
| Review | V2 localized file edited | Historical/current provable keys updated once | Never fabricate legacy context |
| Maintenance | Mixed v2/v1/malformed | Sync v2 only; prune deterministic/local | Redis ignored and counted |

</frozen-after-approval>

## Code Map

- `packages/core/src/cache-key.ts`, `snapshot/jcs.ts` -- implement `TM_KEY_VERSION`, `deriveCacheIdentity`, `parseCacheKey`; reuse JCS without changing snapshots.
- `packages/core/src/types.ts`, `config.ts`, `index.ts` -- complete/export inputs/results; reject whitespace model.
- `packages/core/src/tm.ts`, `translate.ts`, `review.ts` -- use actual `provider.name`, persist context digest, compose/deduplicate reviewed keys.
- `packages/core/src/maintenance.ts`, `ui-strings.ts`, `cache-drivers/file.ts` -- v2-only sync; source-digest prune including UI leaves; fail closed except `ENOENT`.
- `packages/cli/src/cli.ts` -- display additive classifications.
- `packages/core/test/` and `test/fixtures/translation-memory/` -- golden and lifecycle regressions.
- `packages/core/package.json`, `README.md`, `docs/translation-memory.md`, package READMEs -- packed export proof and accurate v2 guidance.

## Tasks & Acceptance

**Execution:**
- [x] `cache-key.ts`, `types.ts`, `config.ts`, `index.ts` -- build the closed public v2 derivation/parser; keep `cacheKey`/`glossaryVersion` deprecated and runtime-unused.
- [x] `tm.ts`, `translate.ts`, `review.ts`, `cache-drivers/file.ts` -- align lookup/write, metadata, review survival, and storage errors.
- [x] `maintenance.ts`, `ui-strings.ts`, CLI -- sync only valid v2; prune by exact live source digest; report `liveTmKeys`, `orphanTmKeys`, `legacyTmKeys`, `malformedTmKeys`, `ignoredFileLegacyKeys`, `ignoredFileMalformedKeys`, `ignoredRedisLegacyKeys`, and `ignoredRedisMalformedKeys`.
- [x] Fixtures/tests -- cover exact vectors, all field mutations, tiers, legacy preservation, review, sync timestamp conflicts, prune, malformed storage, and CLI output.
- [x] Package/docs -- build-pack-install a temporary Core consumer and update every active v1 formula/migration statement.

**Acceptance Criteria:**
- Given the committed vectors, when keys are derived repeatedly, then expected keys are stable and every semantic pair differs.
- Given mixed file/Redis state, when translate, review, sync, and prune run, then only v2 participates, live entries survive across contexts, ordinary translation preserves legacy data, and dry-run classifications match mutation.
- Given malformed config, Unicode, key, or storage, when a public boundary runs, then it fails closed before unsafe cache/provider behavior.
- Given packed Core, when a temporary consumer imports JavaScript and compiles declarations, then the v2 API resolves without source fallback.
- Given the patch, when focused and full gates run, then tests, contracts, build, typecheck, package probe, and diff checks pass without MCP/Brand Memory regression.

## Spec Change Log

## Design Notes

`deriveCacheIdentity` returns `{ key, contextDigest, sourceDigest }`; `parseCacheKey` returns digests or `null`. Context is JCS-hashed; source text is separately UTF-8/SHA-256 hashed; the key concatenates both digests. Review counts unique keys. Equal sync timestamps with divergent values favor committed Tier 1. V1 is `^[0-9a-f]{64}$`; other non-v2 keys are malformed.

## Verification

**Commands:**
- `pnpm vitest run packages/core/test/cache-key.test.ts packages/core/test/tiered-cache.test.ts packages/core/test/translate.test.ts packages/core/test/review.test.ts packages/core/test/maintenance.test.ts packages/core/test/ui-strings.test.ts` -- focused pass.
- `pnpm contracts:check && pnpm test && pnpm build && pnpm typecheck` -- full pass.
- Core build/pack/install runtime and declaration probe -- exported v2 API resolves.
- `git diff --check` -- clean.

## Suggested Review Order

**Identity contract**

- Start with the closed JCS/SHA-256 identity and strict public key grammar.
  [`cache-key.ts:84`](../../packages/core/src/cache-key.ts#L84)

- Translation binds cache identity to the actual provider and resolved request context.
  [`translate.ts:210`](../../packages/core/src/translate.ts#L210)

- Localized metadata exposes only the version and non-sensitive context digest.
  [`tm.ts:50`](../../packages/core/src/tm.ts#L50)

**Storage governance**

- Central validation rejects duplicate JSON members and unsafe TM entry timestamps.
  [`entry.ts:156`](../../packages/core/src/cache-drivers/entry.ts#L156)

- File storage validates v2 values lazily while preserving ignored legacy payloads.
  [`file.ts:27`](../../packages/core/src/cache-drivers/file.ts#L27)

- Redis distinguishes absence from invalid values and normalizes duplicate SCAN results.
  [`redis.ts:52`](../../packages/core/src/cache-drivers/redis.ts#L52)

**Lifecycle behavior**

- Review builds a conflict-free write plan before changing files or memory.
  [`review.ts:143`](../../packages/core/src/review.ts#L143)

- Sync resolves timestamp conflicts deterministically after validating both tiers.
  [`maintenance.ts:56`](../../packages/core/src/maintenance.ts#L56)

- Prune validates the complete local and Redis plan before any mutation.
  [`maintenance.ts:175`](../../packages/core/src/maintenance.ts#L175)

**Public surfaces**

- Core exports make the v2 identity contract available to installed consumers.
  [`index.ts:33`](../../packages/core/src/index.ts#L33)

- CLI summaries expose v2, legacy, malformed, and tier-specific classifications.
  [`report-format.ts:9`](../../packages/cli/src/report-format.ts#L9)

- The manual explains derivation, migration, synchronization, and pruning behavior.
  [`translation-memory.md:8`](../../docs/translation-memory.md#L8)

**Verification**

- Golden vectors and one-field mutations protect identity stability and partitioning.
  [`cache-key.test.ts:28`](../../packages/core/test/cache-key.test.ts#L28)

- Maintenance regressions protect Redis-newer sync and non-destructive normal prune.
  [`maintenance.test.ts:305`](../../packages/core/test/maintenance.test.ts#L305)

- Storage regressions exercise legacy tolerance, invalid timestamps, and duplicate members.
  [`tiered-cache.test.ts:114`](../../packages/core/test/tiered-cache.test.ts#L114)

- A source-free NodeNext consumer executes and type-checks the published runtime exports.
  [`packed-declarations.test.ts:16`](../../packages/core/test/contracts/packed-declarations.test.ts#L16)
