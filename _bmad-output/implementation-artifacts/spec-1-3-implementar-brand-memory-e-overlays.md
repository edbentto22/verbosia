---
title: 'Story 1.3 — Implement Brand Memory and deterministic overlays'
type: 'feature'
created: '2026-08-27'
status: 'done'
review_loop_iteration: 0
baseline_commit: '6abb392d71b731462c0c6ac5e45e140e7bdc894a'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The published Brand Memory contracts have no runtime loader or deterministic resolver, so applications cannot obtain safe multilingual brand context, typed overlays, effective risk, or a reproducible semantic state.

**Approach:** Build a Core-only, on-demand loader over the secure snapshot substrate, apply validated exact-match overlays in fixed precedence, and return an immutable allowlisted `ResolvedBrandContext`. Correct the missing `HISTORY_UNVERIFIED` diagnostic vocabulary; fail closed on currently unrepresentable CTA/example/compliance patch fields instead of silently dropping them.

## Boundaries & Constraints

**Always:** Read only `.verbosia/brand/brand-memory.json` beneath an explicit real root; validate I-JSON and the published schemas before semantic checks. Normalize locale to canonical BCP 47 and strings to NFC; default omitted market/pageIntent/contentType/channel/audience to `unspecified`. Omitted editorial risk, page intent, or content type yields `critical`; otherwise effective risk is the maximum of request and all exactly matching minima. Apply `base -> locale -> market -> pageIntent -> contentType -> channel -> audience`; duplicate IDs/selectors, dangling non-evidence references, add/remove overlap, unsafe state, or unsupported overlay fields fail closed. Preserve global Claim values and expose only ID, statement, and status. Emit one stable `HISTORY_UNVERIFIED` warning on success.

**Ask First:** Any other schema/vocabulary change; a different default, digest domain, precedence, matching rule, or public API; accepting CTA/example/compliance patches without corresponding typed catalogs and output fields; changing the snapshot public behavior.

**Never:** Load Evidence Ledger, authorize Claims, execute policy or Context Packs, change MCP/legacy tools, read Translation Memory, write/cache/migrate state, call network/provider/Redis/database, expose approval/evidence IDs, paths, bytes, Ajv details, stacks, or free-form metadata.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Canonical load | Valid memory at the fixed path | Immutable validated memory and stable state digest | None |
| Missing/invalid | Missing file, malformed I-JSON, schema/major error | No partial context; legacy code untouched | Stable safe domain code and diagnostics |
| Context resolution | Exact selectors across all six dimensions | Fixed-order patches, canonical context, ordered overlay IDs | Duplicate selector or reference fails closed |
| Monotonicity | Voice set, term/Claim selection, added restrictions, risk floor | Typed replacement/add-remove; facts unchanged; risk never decreases | Orphan CTA/example/compliance fields are invalid |
| Reproducibility | Equivalent bytes/order or different requests over same state | Same state digest; golden resolved projection for fixed clock | Mutation retries once through snapshot substrate |
| Side effects | Success and every failure path | Project bytes unchanged; zero external calls | Sanitized output only |

</frozen-after-approval>

## Code Map

- `packages/core/src/snapshot/local-snapshot.ts:75` — reuse atomic exact-file reads; add only an internal missing-file classification seam.
- `packages/core/src/contracts/registry.ts:255` — reuse the single offline Ajv registry and normalized issues; never instantiate Ajv.
- `packages/core/schemas/{brand-memory,resolved-brand-context,diagnostic}.schema.json` — semantic authority; add only `HISTORY_UNVERIFIED` to the closed diagnostic enum.
- `packages/core/src/contracts/generated.ts:286` — generated Brand Memory, request, context, and diagnostic shapes; never edit manually.
- `packages/core/src/brand-memory/` — new safe error, loader, semantic identity/reference validation, and immutable model boundary.
- `packages/core/src/context-resolution/` — new request normalization, scope/risk matching, overlay composition, projections, and digest framing.
- `packages/core/src/index.ts:82` — export the minimal provider-neutral loader/resolver API and safe structural types.
- `packages/core/test/{brand-memory,context-resolution}/` — CAP-1/CAP-2 golden, adversarial, mutation, privacy, and side-effect suites.
- `packages/mcp/src/` — read-only evidence: no changes in this story.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/schemas/diagnostic.schema.json`, generated contracts, fixtures — add and mechanically verify `HISTORY_UNVERIFIED` without changing other vocabulary.
- [x] `packages/core/src/snapshot/local-snapshot.ts`, `packages/core/src/brand-memory/{errors,loader,semantic-validation}.ts` — distinguish optional exact-file absence internally, validate schema/IDs/references, freeze results, and map only sanitized failures.
- [x] `packages/core/src/context-resolution/{normalize,overlays,risk,state-digest,resolve}.ts` — implement exact precedence, typed membership changes, applicable restrictions/minima, projections, evaluation-time seam, and golden JCS/SHA-256 state.
- [x] `packages/core/src/{brand-memory,context-resolution}/index.ts`, `packages/core/src/index.ts`, `packages/core/README.md` — expose and document the minimal Core API, defaults, guarantees, limits, diagnostics, and deferred fields.
- [x] `packages/core/test/{brand-memory,context-resolution}/**`, `test/fixtures/brand-memory/**` — cover every matrix row, selector, semantic conflict, limit edge, locale normalization, risk floor, privacy allowlist, immutability, digest vector, and no-side-effect canary.

**Acceptance Criteria:**
- Given CAP-1 valid, missing, invalid, unsupported-version, oversized, and legacy-project cases, when the loader runs, then it returns one immutable canonical memory or the exact sanitized domain failure without changing legacy MCP behavior.
- Given CAP-2 base and each exact selector, when a fixed request and clock are resolved, then the output validates as `ResolvedBrandContext`, applies overlays once in normative order, and matches committed golden bytes and digest.
- Given duplicate identities/selectors, dangling differentiator/term/Claim references, add/remove overlap, Claim mutation, or unrepresentable patch fields, when validation runs, then resolution fails before returning partial data.
- Given risk floors or omitted page intent/content type/risk, when context resolves, then effective risk is monotonic and unknown input is `critical`.
- Given semantically identical Brand Memory with different whitespace/key order or different requests, when state is computed, then `stateDigest` is identical; semantic memory changes alter it.
- Given all new success/failure paths, when the full suite and canaries run, then no project write, network/provider/Redis/database call, sensitive field, absolute path, stack, raw bytes, or MCP source change occurs.

## Spec Change Log

## Design Notes

The public Core root exports `loadBrandMemory({ projectRoot })`, `resolveBrandContext({ projectRoot, request })`, `BrandMemoryError`, and their structural input/result types. Only internal test seams may inject snapshot I/O or `evaluationTime`; production resolution uses the process UTC clock with millisecond precision. Safe errors expose a closed code plus immutable `Diagnostic[]`: missing maps to `BRAND_MEMORY_NOT_FOUND`; malformed/schema/semantic state to `BRAND_MEMORY_INVALID` with `CONTRACT_SCHEMA_INVALID` issues; unsupported version, duplicate ID, unresolved reference, and snapshot failures retain their exact published codes.

`stateDigest` hashes JCS of `{ contractVersion, schemaVersions, policyVersion: "1.0.0", policyEngineVersion: "1.0.0", brandMemory, evidence: [] }`. `schemaVersions` contains Brand Memory and Resolved Brand Context at `1.0.0`, ordered by UTF-8 schema ID. Request, overlays selected, diagnostics, and evaluation time are excluded; Story 1.4 extends only `evidence` and Story 1.5 owns policy behavior without changing framing.

Matching compares canonical locale or exact NFC values. Each dimension/value has at most one overlay. Membership starts with all base terminology and Claims; every overlay applies removals then additions, rejects overlap, and final set-like collections sort by portable ID. Voice arrays remain ordered replacements. Restrictions are additive, unique by ID, filtered by exact scope, and never removed.

## Verification

**Commands:**
- `pnpm contracts:check && pnpm build && pnpm typecheck && pnpm test` — contracts, compilation, CAP-1/CAP-2 suites, and all regressions pass.
- `pnpm vitest run packages/core/test/brand-memory packages/core/test/context-resolution` — focused deterministic and adversarial coverage passes.
- `git diff --check` — no whitespace errors.
- `git diff --name-only 6abb392d71b731462c0c6ac5e45e140e7bdc894a -- packages/mcp/src && git status --short -- packages/mcp/src` — MCP source remains unchanged.

## Suggested Review Order

**Public resolution boundary**

- Validates requests, resolves immutable context, and sanitizes every public failure.
  [`resolve.ts:78`](../../packages/core/src/context-resolution/resolve.ts#L78)

- Loads exactly one fixed Brand Memory through the secure snapshot substrate.
  [`loader.ts:96`](../../packages/core/src/brand-memory/loader.ts#L96)

- Exposes only the provider-neutral production API and structural result types.
  [`index.ts:102`](../../packages/core/src/index.ts#L102)

**Semantic safety and canonical state**

- Preserves exact duplicate-restriction pointers across base and overlay origins.
  [`semantic-validation.ts:51`](../../packages/core/src/brand-memory/semantic-validation.ts#L51)

- Normalizes, validates references, canonicalizes collections, and deeply freezes state.
  [`semantic-validation.ts:161`](../../packages/core/src/brand-memory/semantic-validation.ts#L161)

- Distinguishes true optional absence from malformed fixed-path components.
  [`inventory.ts:245`](../../packages/core/src/snapshot/inventory.ts#L245)

**Deterministic context composition**

- Canonicalizes BCP-47 locales, NFC strings, dates, and conservative defaults.
  [`normalize.ts:103`](../../packages/core/src/context-resolution/normalize.ts#L103)

- Applies exact overlays once in the fixed six-dimension precedence.
  [`overlays.ts:56`](../../packages/core/src/context-resolution/overlays.ts#L56)

- Computes monotonic effective risk from requests and exact matching floors.
  [`risk.ts:17`](../../packages/core/src/context-resolution/risk.ts#L17)

- Frames request-independent canonical state before JCS and SHA-256 hashing.
  [`state-digest.ts:18`](../../packages/core/src/context-resolution/state-digest.ts#L18)

**Contracts and consumer guidance**

- Publishes the closed history-warning vocabulary used on every successful resolution.
  [`diagnostic.schema.json:21`](../../packages/core/schemas/diagnostic.schema.json#L21)

- Documents installation-independent guarantees, defaults, diagnostics, and deferred patch fields.
  [`README.md:139`](../../packages/core/README.md#L139)

**Regression evidence**

- Proves the complete public projection, digest, overlays, risk, Unicode, and BCP-47 behavior.
  [`resolve.test.ts:75`](../../packages/core/test/context-resolution/resolve.test.ts#L75)

- Proves missing, malformed, boundary, mutation, pointer, privacy, and side-effect behavior.
  [`loader.test.ts:70`](../../packages/core/test/brand-memory/loader.test.ts#L70)

- Locks the resolved CAP-2 projection and state digest as committed bytes.
  [`cap-2-resolved-golden.json:1`](../../test/fixtures/brand-memory/cap-2-resolved-golden.json#L1)
