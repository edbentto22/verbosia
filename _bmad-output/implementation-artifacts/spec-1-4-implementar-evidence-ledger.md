---
title: 'Story 1.4 — Implement the Evidence Ledger'
type: 'feature'
created: '2026-08-28'
status: 'done'
review_loop_iteration: 0
baseline_commit: '94e693c8222d4807d30c4ceb14af28257a057d85'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/specs/spec-brand-memory-evidence-ledger/contracts-and-schemas.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Evidence Record contracts exist, but Core cannot load or evaluate the canonical ledger. Policy work cannot safely distinguish usable evidence from invalid, expired, unavailable, superseded, or quarantined records.

**Approach:** Add a read-only Core ledger with deterministic evaluation, source integrity, component quarantine, linear supersession, safe projections, and add-only CI.

## Boundaries & Constraints

**Always:** Read only direct `.verbosia/evidence/<evidence-id>.json` beneath an explicit real root; absence means empty. Unsafe layout, unreadable I-JSON, unsupported major, duplicate ID, filename mismatch, or invalid `{schemaVersion,evidenceId,supersedes?}` envelope fails globally; recoverable invalid payloads are quarantined. Verify `project_file` raw bytes in one ledger/locator attempt with one retry; non-local locators are unavailable without network/fallback. Quarantine connected invalid payload/digest/dependency/graph components. Supersession is successor→predecessor, activates at successor `validFrom`, inherits nothing, and never redirects Claims. Support requires half-open validity, exact scopes, direct `claim_support`, non-restricted permission/basis, and future/absent review, expiry, and revocation instants; restricted sensitivity affects exposure only. Order every valid or quarantined record by `evidenceId`. Enforce 256 KiB/record, 10,000 records, 64 MiB, chain 100, and 1,000 diagnostics.

**Ask First:** Schema/vocabulary changes; URI/reference resolution; different envelope, time, quarantine, digest, DTO, limit, add-only policy, or `resolveBrandContext` output.

**Never:** Implement Claim outcomes, policy, reapproval, tools, writes, migration, network/provider/Redis/cache, history attestation, or expose private source fields, paths, bytes, stacks, secrets, or metadata.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid/empty | Shuffled records or absent directory | Immutable ordered ledger and stable evaluations | One `HISTORY_UNVERIFIED` warning |
| Global invalid | Unsafe root/layout, unreadable envelope, duplicate ID, unsupported major | No partial state | Sanitized closed `EvidenceLedgerError` |
| Quarantine | Invalid payload/digest/dependency/graph component | Opaque projection; independent components remain usable | Stable diagnostics without private content |
| Evaluation | Time, role, scopes, permission, sensitivity, locator | Closed state and eligibility | Default-deny; no editorial outcome |
| Supersession | Chain, boundary, fork, cycle, dangling edge | Linear effective history; no redirect/fallback | Component quarantine; depth overflow fails |
| CI history | Git A/M/D/R under any `.verbosia/evidence/` | Add passes; modify/delete/rename fails | Deterministic nonzero check |

</frozen-after-approval>

## Code Map

- `packages/core/src/snapshot/{local-snapshot,inventory,safe-reader}.ts:75` — reuse safe retry/handles/digests; add an internal mixed JSON/raw attempt.
- `packages/core/src/brand-memory/{loader,errors}.ts:79` — mirror phased validation, safe errors, immutability, and test seams.
- `packages/core/src/evidence-ledger/` — add loader, integrity, graph, evaluation, state, errors, and types.
- `packages/core/src/context-resolution/state-digest.ts:7`, `contracts/registry.ts:255`, `contracts/generated.ts:680`, `index.ts:89` — reuse contracts, accept evidence projections, and export Core API without changing Brand-only output.
- `.github/workflows/ci.yml:9`, `scripts/check-evidence-add-only.mjs` — reject M/D/R using PR base or push-before SHA.
- `packages/core/test/evidence-ledger/`, `test/fixtures/evidence-ledger/` — CAP-3 golden, adversarial, privacy, limit, digest, and CI coverage.
- `packages/mcp/src/`, `packages/cli/src/` — no changes.

## Tasks & Acceptance

**Execution:**
- [x] Snapshot raw seam and `evidence-ledger/` — load, verify, quarantine, supersede, evaluate, project, freeze, and export deterministic CAP-3 state.
- [x] CI script/workflow — enforce add-only history for root/nested projects without claiming verified authorship.
- [x] Fixtures/tests and Core README — prove the matrix, exports, privacy, limits, determinism, side effects, and Brand/MCP regressions.

**Acceptance Criteria:**
- Given any ledger and fixed clock/context, when Core evaluates it, then safe results, diagnostics, chains, quarantine, projection, and digest match golden bytes regardless of filesystem order.
- Given boundary, mutation, limit, integrity, or semantic failure, when Core runs, then the matrix applies without partial state, fallback, disclosure, write, network, provider, Redis, or cache.
- Given Git changes, when the add-only checker runs for PR and push ranges, then additions pass and modification, removal, or rename of every protected ledger path fails deterministically.
- Given the patch, when all gates run, then contracts, builds, types, exports, regressions, and diff checks pass.

## Spec Change Log

## Design Notes

Core exports `loadEvidenceLedger`, `evaluateEvidence`, `EvidenceLedgerError`, and structural types. Production uses UTC; only internal tests inject time/I/O. Safe entries expose `evidenceId`, `supportEligible`, `referenceExposure: allowed|restricted`, existing ordered reasons/diagnostics, and state precedence `quarantined|unavailable|superseded|not_yet_valid|expired|revoked|permission_denied|scope_mismatch|insufficient_role|eligible`. Raw records stay private.

`project_file` hashes raw bytes; non-local locators are `unavailable`. Combined state retains `{ contractVersion, schemaVersions, policyVersion, policyEngineVersion, brandMemory, evidence }`; Evidence Record `1.0.0` joins ordered versions only there. Valid records contribute canonical values; quarantine contributes `{ relativePath, evidenceId, status, rawSha256 }`.

## Verification

**Commands:**
- `pnpm vitest run packages/core/test/evidence-ledger packages/core/test/context-resolution/resolve.test.ts packages/core/test/contracts` — CAP-3 and regression proof passes.
- `pnpm contracts:check && pnpm build && pnpm typecheck && pnpm test` — all workspace gates pass.
- Add-only A/M/D/R probe plus `git diff --check` — governance and whitespace pass.
- `git diff --name-only 94e693c8222d4807d30c4ceb14af28257a057d85 -- packages/mcp/src packages/cli/src` — transport surfaces remain unchanged.

## Suggested Review Order

1. Start at the public loader and follow its phased fail-closed boundary.
   - [`packages/core/src/evidence-ledger/loader.ts#L190`](../../packages/core/src/evidence-ledger/loader.ts#L190)
2. Inspect mixed JSON/raw snapshots, retry behavior, limits, and source consistency.
   - [`packages/core/src/snapshot/mixed-snapshot.ts#L161`](../../packages/core/src/snapshot/mixed-snapshot.ts#L161)
3. Verify optional-path ancestry cannot escape or degrade into false absence.
   - [`packages/core/src/snapshot/inventory.ts#L199`](../../packages/core/src/snapshot/inventory.ts#L199)
4. Review source availability, raw-byte integrity, and quarantine entry conditions.
   - [`packages/core/src/evidence-ledger/integrity.ts#L35`](../../packages/core/src/evidence-ledger/integrity.ts#L35)
5. Follow supersession validation, component quarantine, depth limits, and chain construction.
   - [`packages/core/src/evidence-ledger/graph.ts#L156`](../../packages/core/src/evidence-ledger/graph.ts#L156)
6. Check deterministic eligibility precedence, scopes, permissions, time, and exposure.
   - [`packages/core/src/evidence-ledger/evaluation.ts#L90`](../../packages/core/src/evidence-ledger/evaluation.ts#L90)
7. Confirm Evidence joins combined state without changing Brand-only digests.
   - [`packages/core/src/context-resolution/state-digest.ts#L24`](../../packages/core/src/context-resolution/state-digest.ts#L24)
8. Audit add-only enforcement across commits, renames, and repository hash formats.
   - [`scripts/check-evidence-add-only.mjs#L28`](../../scripts/check-evidence-add-only.mjs#L28)
9. Validate CAP-3 golden behavior, adversarial boundaries, privacy, and fixed limits.
   - [`packages/core/test/evidence-ledger/ledger.test.ts#L79`](../../packages/core/test/evidence-ledger/ledger.test.ts#L79)
10. Finish with installed-package runtime and declaration compatibility.
    - [`packages/core/test/contracts/packed-declarations.test.ts#L17`](../../packages/core/test/contracts/packed-declarations.test.ts#L17)
