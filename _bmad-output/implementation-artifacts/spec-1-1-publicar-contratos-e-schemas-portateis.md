---
title: 'Story 1.1 — Publish portable contracts and schemas'
type: 'feature'
created: '2026-08-27'
status: 'done'
review_loop_iteration: 0
baseline_commit: '06afab9633df91e12c7642cbc3025cfe0264a79d'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/specs/spec-brand-memory-evidence-ledger/contracts-and-schemas.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Verbosia has no portable, executable contract for Brand Memory, Evidence Ledger, policy, diagnostics, resolved context, Claim validation, or community Context Pack contributions. Dependent Core, MCP, PHP, and WordPress work would otherwise invent incompatible shapes.

**Approach:** Publish canonical JSON Schema Draft 2020-12 files, a closed offline registry, normalized validation results, deterministic generated TypeScript types, stable package exports, and golden fixtures before implementing any domain loader or policy behavior.

## Boundaries & Constraints

**Always:** Treat the eleven JSON schemas as the sole semantic authority; use absolute versioned IDs under `https://schemas.verbosia.dev/contracts/v1/`, closed objects, explicit required fields, and absent rather than implicit `null`. Compile through one strict Ajv 2020 registry with formats enabled, no coercion/default insertion/property removal, and no asynchronous or network resolution. Keep generated TypeScript structural, committed, byte-deterministic, and mechanically checked. Lock exact patches and prove the contract runtime on Node 22 and 24 while preserving the 105-test baseline.

**Ask First:** Any change to published schema names, identity namespace, version `1.0.0`, closed vocabularies, fixture envelope, dependency major, or Story 1 acceptance boundary; any need to alter a legacy public type or existing MCP behavior.

**Never:** Add Brand Memory/evidence filesystem loaders, I-JSON/JCS snapshots, overlay resolution, evidence evaluation, policy decisions, new MCP tools, PHP execution, remote refs, provider calls, or runtime writes. Do not modify `packages/mcp/src`, migrate package engines, replace the existing Node 20 regression job, expose Ajv-native errors, or make TypeScript override runtime schema semantics.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid contract | Manifest plus all eleven schemas and a valid fixture | Registry compiles offline and validation succeeds | No diagnostics |
| Invalid instance | Extra field, missing required field, `null`, bad enum, ID, digest, or bound | Validation fails without mutating the instance | Normalized keyword and instance path; no Ajv object leaks |
| Semantic format | RFC 3339, absolute URI, or BCP 47 including `pt-BR`, `en-US`, `es-419` | Valid forms pass and malformed/residual forms fail | Stable normalized failure independent of message text |
| Unsafe reference | Missing, duplicate, external, or out-of-namespace `$id`/`$ref` | Registry construction fails synchronously and locally | Network canary remains untouched |
| Generated type drift | Committed `generated.ts` differs from schema output | `contracts:check` exits non-zero without writing | Existing file bytes and mtime remain unchanged |
| Package consumer | Consumer resolves manifest or schema subpath | Export target is readable from the Core package root | Unknown subpath has no fallback |

</frozen-after-approval>

## Code Map

- `package.json:9-14` — add root `contracts:generate` and `contracts:check` delegations.
- `.github/workflows/ci.yml:8-26` — retain the Node 20 regression job and add a bounded Node 22/24 contract probe.
- `packages/core/package.json:9-32` — add schema/manifest exports, package files, scripts, runtime validators, and the type-generator dev dependency; keep `engines` unchanged.
- `packages/core/schemas/manifest.json` and `packages/core/schemas/*.schema.json` — new canonical registry and eleven Draft 2020-12 contracts.
- `packages/core/scripts/generate-contract-types.mjs` — new repository-owned offline generator/check adapter with atomic write behavior.
- `packages/core/src/contracts/{generated,registry,validator}.ts` — generated structural types, manifest-backed schema loading, the sole Ajv factory, and normalized internal issues.
- `packages/core/src/index.ts:8-79` — reexport generated types and contract constants without creating internal subpath APIs.
- `packages/core/test/contracts/` — new convention, registry, format, generator, type-probe, package-export, and provider-neutral fixture coverage; Vitest already discovers this tree.
- `packages/mcp/test/{protocol,stdio}.test.ts` — existing exact-two-tool regression evidence; read-only in this story.
- `packages/core/README.md` — document contract constants, type authority, and schema subpath consumption via URL/filesystem.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/package.json`, root `package.json`, `pnpm-lock.yaml`, `.github/workflows/ci.yml` — lock the approved stack, expose scripts/assets, and add the isolated Node 22/24 contract probe without changing engines or the full regression matrix.
- [x] `packages/core/schemas/manifest.json`, `packages/core/schemas/*.schema.json` — implement the sorted one-to-one manifest, common definitions, eleven public contracts, closed vocabularies, examples, and exact offline refs.
- [x] `packages/core/scripts/generate-contract-types.mjs`, `packages/core/src/contracts/generated.ts` — implement deterministic in-memory rendering, atomic generate mode, non-writing check mode, local manifest resolution, and committed output.
- [x] `packages/core/src/contracts/registry.ts`, `packages/core/src/contracts/validator.ts`, `packages/core/src/index.ts` — register every schema before compilation, add RFC 3339/URI/strict BCP-47 formats, normalize issues, and expose only approved types/constants/helpers.
- [x] `packages/core/test/contracts/fixtures/*.json`, `packages/core/test/contracts/*.test.ts`, `packages/core/test/contracts/tsconfig.json` — cover the complete edge-case matrix, compile the generated type probe explicitly, and verify source-package exports.
- [x] `packages/core/README.md` — explain schema authority, versioning, commands, imports, and the boundary between structural types and runtime validation.

**Acceptance Criteria:**
- Given the published registry, when its manifest and schemas are audited, then exactly eleven unique versioned schemas compile and every file, ID, export, closed object, required field, and vocabulary is mechanically consistent.
- Given unregistered or duplicate references and a network canary, when registry construction runs, then it fails locally without invoking fetch or exposing third-party error objects publicly.
- Given unchanged schemas, when generation runs twice and check mode runs, then output is byte-identical; given stale output, check mode fails without modifying the workspace.
- Given positive and focused negative fixtures, when validation runs, then RFC 3339, URI, BCP-47, bounds, patterns, enums, absence/null, and additional-property expectations match the fixture envelope.
- Given a Core source-package consumer, when every declared contract subpath is resolved, then manifest and schemas are readable and root exports expose generated types plus `CONTRACT_VERSION` and `CONTRACT_SCHEMA_IDS`.
- Given the Story 1 diff, when all gates run, then contract checks, build, typecheck, full tests, and whitespace checks pass; Node 22/24 contract probes are configured; the original 105 tests remain green; and `packages/mcp/src` is unchanged.

## Spec Change Log

## Design Notes

The CI split is intentional: Story 1 proves only the new contract runtime on Node 22/24 while retaining Node 20 regression coverage. Story 7 owns the coordinated engine migration, complete tarballs, PHP vectors, and cross-runtime distribution proof.

`common.schema.json` is a public definitions catalog registered before roots, not an instantiable document. Generated TypeScript describes structure only; formats, patterns, uniqueness, numeric bounds, and conditional rules remain runtime obligations proven by fixtures.

Draft 2020-12 `uniqueItems` enforces only duplicate candidate objects. Candidate identity uniqueness by `candidateId` and aggregate report outcome derivation are PolicyDecisionTable semantics deferred to Story 1.5; Story 1.1 does not add non-portable schema keywords or policy behavior for either rule.

## Verification

**Commands:**
- `pnpm contracts:generate && pnpm contracts:check` — generated types match canonical schemas and check mode is clean.
- `pnpm build && pnpm typecheck && pnpm test` — all packages compile and the complete suite, including the 105 baseline tests, passes.
- `git diff --check` — no whitespace errors.
- `git diff --name-only 06afab9633df91e12c7642cbc3025cfe0264a79d -- packages/mcp/src && git status --short -- packages/mcp/src` — no committed, working-tree, or untracked MCP implementation file changed.

## Suggested Review Order

**Contract authority and runtime boundary**

- One registry validates identity, references, sync behavior, and normalized failures offline.
  [`registry.ts:152`](../../packages/core/src/contracts/registry.ts#L152)

- The sorted manifest defines every public contract and package subpath.
  [`manifest.json:4`](../../packages/core/schemas/manifest.json#L4)

- The sole Ajv factory enables strict 2020-12 and semantic formats without mutation.
  [`validator.ts:47`](../../packages/core/src/contracts/validator.ts#L47)

**Schema semantics**

- Shared primitives centralize portable IDs, SemVer, paths, pointers, and version rules.
  [`common.schema.json:127`](../../packages/core/schemas/common.schema.json#L127)

- Evidence locators discriminate URI, record reference, and project-file safety.
  [`evidence-record.schema.json:22`](../../packages/core/schemas/evidence-record.schema.json#L22)

- Overlay selectors bind locale values differently from portable dimension IDs.
  [`brand-memory.schema.json:203`](../../packages/core/schemas/brand-memory.schema.json#L203)

- Policy conditions constrain value cardinality according to each operator.
  [`policy-rule.schema.json:43`](../../packages/core/schemas/policy-rule.schema.json#L43)

**Generation and package surface**

- Type rendering validates the manifest and preserves canonical public root names.
  [`generate-contract-types.mjs:141`](../../packages/core/scripts/generate-contract-types.mjs#L141)

- Generate/check modes provide concurrent-safe atomic replacement and non-writing drift detection.
  [`generate-contract-types.mjs:201`](../../packages/core/scripts/generate-contract-types.mjs#L201)

- Core exports publish schemas directly while keeping validation internals private.
  [`package.json:14`](../../packages/core/package.json#L14)

- Stable constants expose the exact contract version and schema identities.
  [`constants.ts:3`](../../packages/core/src/contracts/constants.ts#L3)

**Verification and adoption**

- Portable fixtures enforce cross-runtime success and focused failure expectations.
  [`fixtures.test.ts:24`](../../packages/core/test/contracts/fixtures.test.ts#L24)

- Adversarial registry tests cover unsafe refs, nested IDs, async schemas, and failures.
  [`offline-registry.test.ts:39`](../../packages/core/test/contracts/offline-registry.test.ts#L39)

- Generator tests prove determinism, concurrency, failure atomicity, and type compilation.
  [`generated-types.test.ts:14`](../../packages/core/test/contracts/generated-types.test.ts#L14)

- CI isolates Node 22/24 contract probes from the unchanged Node 20 regression job.
  [`ci.yml:35`](../../.github/workflows/ci.yml#L35)

- Core documentation explains authority, commands, imports, and semantic limitations.
  [`README.md:27`](../../packages/core/README.md#L27)
