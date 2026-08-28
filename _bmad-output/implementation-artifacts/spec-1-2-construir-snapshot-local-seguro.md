---
title: 'Story 1.2 — Build a secure local snapshot substrate'
type: 'feature'
created: '2026-08-27'
status: 'done'
review_loop_iteration: 0
baseline_commit: '36c4e63ad57ee93b188f51e52f61cf436b66ee7d'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Verbosia has portable contracts but no trustworthy way to read their local state. Path-only reads, permissive JSON parsing, host ordering, and concurrent mutation could produce mixed or irreproducible inputs.

**Approach:** Add a provider-neutral, read-only Core substrate for root-bounded stable JSON snapshots, UTF-8/I-JSON ingestion, RFC 8785 canonicalization, bounded resources, and portable SHA-256 vectors. Domain semantics remain in later stories.

## Boundaries & Constraints

**Always:** Require a real explicit root; reject symlink components and accept only real directories plus single-link regular files. Revalidate before open, read by handle within fixed limits, compare handle/path identity and metadata before/after, re-hash inventory, and retry the whole snapshot once after detectable mutation. Reject BOM, malformed UTF-8, duplicate decoded keys, lone surrogates, non-interoperable numbers, unsafe integers, excessive depth, and overflow. Use RFC 8785, ordinal portable paths, `sha256:<lowercase-hex>`, and sanitized stable errors. V1 covers detectable mutation in a trusted workspace, not hostile privileged actors.

**Ask First:** New runtime dependencies; contract vocabulary changes; accepting links, special files, or external paths; weakening I-JSON/JCS; changing retry/digest framing; or modifying MCP behavior.

**Never:** Implement domain semantics, quarantine, locator verification, supersession, final decision/state digests, MCP/PHP, cache, writes, network, providers, or engine migration. Do not reuse tolerant loaders or expose paths, bytes, errno, stacks, or dependency errors.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Stable snapshot | Files enumerated in different orders | Same entries, canonical bytes, digests | None |
| Unsafe input | Escape, link, special file, invalid I-JSON, or limit excess | No partial/external read | Stable sanitized code |
| Mutation | Rename/edit/add/remove in any phase | Discard all; one whole retry | Repeat: `STATE_CHANGED_DURING_READ` |
| Side effects | Success and failure paths | Tree unchanged | Zero external/write calls |

</frozen-after-approval>

## Code Map

- `packages/core/src/project-config.ts:65` — reuse real-root/containment as the first boundary; add handle stability separately.
- `packages/core/src/snapshot/` — new errors, limits, I-JSON, JCS/digests, stable reads, inventory, and retry substrate.
- `packages/core/src/index.ts:8` — export only approved snapshot functions, limits, and structural result/error types.
- `packages/core/test/snapshot/` — deterministic race, boundary, limits, portability, and side-effect suites.
- `packages/core/src/{discovery,cache-drivers/file,slug,status}.ts` — permissive patterns that must not be reused.
- `test/fixtures/integrity/` — runtime-neutral UTF-8/I-JSON/JCS/SHA-256 vectors for Node now and PHP in Story 1.7.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/snapshot/{errors,limits,types}.ts` — define fixed limits, sanitized failures, portable paths, and a read-only test seam.
- [x] `packages/core/src/snapshot/{i-json,jcs,digest}.ts` — validate bytes, canonicalize RFC 8785, and hash full prefixed SHA-256.
- [x] `packages/core/src/snapshot/{safe-reader,inventory,local-snapshot}.ts` — enforce boundaries, limits, identity/inventory checks, atomic results, and retry.
- [x] `packages/core/src/snapshot/index.ts`, `packages/core/src/index.ts`, `packages/core/README.md` — expose and document the minimal domain-neutral API, guarantees, limits, threat model, and later-story boundary.
- [x] `test/fixtures/integrity/**`, `packages/core/test/snapshot/*.test.ts` — add golden bytes/digests and cover every matrix row, mutation phase, limit edge, sanitized failure, and side-effect canary.

**Acceptance Criteria:**
- Given any enumeration order, when accepted files are repeatedly snapshotted, then entries, canonical bytes, inventory digest, and content digests are identical.
- Given unsafe input or repeated mutation, when snapshotting, then the mapped code is stable, no partial data/path/content leaks, and one stable retry may succeed.
- Given mutation twice, when both whole attempts are discarded, then `STATE_CHANGED_DURING_READ` is returned.
- Given committed I-JSON/RFC 8785 vectors, when Node runs them, then canonical hex and SHA-256 match runtime-neutral expectations for Story 1.7.
- Given all success/failure paths, when canaries and regressions run, then no forbidden call occurs, MCP source is unchanged, and prior tests remain green.

## Spec Change Log

## Design Notes

The result carries relative paths, parsed values, raw/canonical digests, and an inventory digest, not the semantic `stateDigest`. Identity uses `dev`, `ino`, type, link count, size, timestamps, raw hashes, and path revalidation. The seam is test-only. JCS preserves Unicode/array order; domain projections own NFC. Whitespace/newline is accepted; BOM is rejected.

## Verification

**Commands:**
- `pnpm contracts:check && pnpm build && pnpm typecheck && pnpm test` — all contract, compile, and regression gates pass.
- `pnpm vitest run packages/core/test/snapshot` — all boundary, race, I-JSON, JCS, digest, limit, and side-effect cases pass deterministically.
- `git diff --check` — no whitespace errors.
- `git diff --name-only 36c4e63ad57ee93b188f51e52f61cf436b66ee7d -- packages/mcp/src && git status --short -- packages/mcp/src` — existing MCP implementation remains unchanged.

## Suggested Review Order

**Atomic snapshot lifecycle**

- Start with the public orchestration, whole-operation retry, and immutable result boundary.
  [`local-snapshot.ts:155`](../../packages/core/src/snapshot/local-snapshot.ts#L155)

- Follow root containment, portable naming, bounded enumeration, and inventory revalidation.
  [`inventory.ts:59`](../../packages/core/src/snapshot/inventory.ts#L59)

- Inspect handle-based bounded reads and content/metadata stability checks.
  [`safe-reader.ts:97`](../../packages/core/src/snapshot/safe-reader.ts#L97)

**Portable integrity**

- Review strict I-JSON parsing and early structural resource limits.
  [`i-json.ts:288`](../../packages/core/src/snapshot/i-json.ts#L288)

- Verify RFC 8785 canonical bytes before digest framing.
  [`jcs.ts:76`](../../packages/core/src/snapshot/jcs.ts#L76)

- Confirm fixed production ceilings remain explicit and non-configurable publicly.
  [`limits.ts:18`](../../packages/core/src/snapshot/limits.ts#L18)

**Public surface and guidance**

- Confirm Core exports only the approved domain-neutral snapshot surface.
  [`index.ts:82`](../../packages/core/src/index.ts#L82)

- Read guarantees, limits, threat model, and intended usage together.
  [`README.md:68`](../../packages/core/README.md#L68)

**Verification evidence**

- Begin with deterministic framing, immutability, limits, and side-effect canaries.
  [`local-snapshot.test.ts:23`](../../packages/core/test/snapshot/local-snapshot.test.ts#L23)

- Audit boundary attacks, collision policy, bounded fan-out, and sanitized failures.
  [`boundary.test.ts:50`](../../packages/core/test/snapshot/boundary.test.ts#L50)

- Exercise every detectable mutation phase and the single whole-snapshot retry.
  [`mutation.test.ts:29`](../../packages/core/test/snapshot/mutation.test.ts#L29)

- Validate cross-runtime I-JSON, JCS, ordering, and SHA-256 golden vectors.
  [`vectors.test.ts:27`](../../packages/core/test/snapshot/vectors.test.ts#L27)
