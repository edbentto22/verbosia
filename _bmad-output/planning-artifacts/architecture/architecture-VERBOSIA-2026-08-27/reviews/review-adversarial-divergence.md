# Adversarial divergence review

## Verdict

**NEEDS REVISION — the paradigm and boundaries are coherent, but five feature-level contracts remain under-specified.** Two independent units could obey every adopted AD and still produce incompatible authorization decisions, resolved contexts, digests, MCP payloads, and failure behavior. The first three findings are release blockers because they affect the public contract or the security decision itself.

## Review method

For each load-bearing area, assume two implementation teams see only this spine and both comply literally. The finding is retained only when their different choices can break composition, security, data integrity, backward compatibility, or deterministic output. Story-level implementation choices are excluded.

## Tier 1 — Release blockers

### D1. The authorization function has principles, but no normative decision table

**Bound decisions:** AD-5, AD-7, AD-8, AD-10, AD-17, AD-18.

The spine fixes the four outcomes and several prohibitions, but it does not define the complete mapping from Claim state, approval/review dates, evidence `supportRole`, permission, scope, validity, sensitivity, evidence availability, and editorial risk to one outcome. For example, with an approved Claim supported by one current corroborative restricted source, one unit can return `allow` because restricted evidence may contribute without disclosure, while another can return `review_required` because corroborative evidence is not direct. Both comply. The same ambiguity exists for an overdue optional review, partially matching scopes, mixed valid and expired evidence, and multiple PolicyRules of different severities.

**Impact:** the central safety decision differs between compliant implementations; consumers cannot rely on Verbosia to authorize the same content consistently.

**Required closure:** add a normative, ordered policy algorithm or truth table. It must define evidence sufficiency by Claim class/editorial risk, precedence among intrinsic failures and PolicyRules, aggregation of multiple evidence records, validity boundary semantics, approval review semantics, and the exact outcome/reason-code set for every branch. Publish executable golden fixtures for at least `pt-BR`, `en-US`, and `es-419`.

### D2. The named public contracts are not structurally specified

**Bound decisions:** frontmatter `binds`, AD-9, AD-11, AD-12, conventions, capability map.

`ResolvedBrandContext`, `ClaimValidationReport`, `PolicyRule`, the two MCP request shapes, their result envelopes, and domain error envelopes are named but have no normative field-level contract. The spine specifies JSON Schemas only for Brand Memory and evidence records. One unit can return decisions per candidate and another a single aggregate decision; one can expose `stateDigest` at the top level and another per result; either can choose different optionality, null behavior, reason-code details, ordering, or contract-version representation while satisfying every AD.

**Impact:** `@verbosia/mcp`, CLI/WordPress consumers, and future `localize_with_context` can compile or integrate against mutually incompatible shapes. Additive implementation now can create an accidental public API that is difficult to correct without a breaking change.

**Required closure:** bind versioned schemas for both MCP inputs and outputs plus exported Core contracts before implementation. Specify required/optional/null semantics, stable reason-code vocabulary, aggregate-versus-per-Claim outcome, ordering of all arrays, redaction representation, diagnostic envelope, and unknown-field policy. Include cross-package contract tests and golden stdio responses.

### D3. JCS fixes byte canonicalization, but the digest domain and normalization are undefined

**Bound decisions:** AD-6, AD-10, AD-14 and consistency conventions.

JCS/RFC 8785 canonicalizes a JSON value; it does not decide which value is hashed. The spine alternately refers to “state”, “resolved memory”, and `stateDigest`, without specifying whether the digest includes raw documents or validated semantic projections; unused, expired, superseded, or quarantined evidence; schema defaults; diagnostic state; relative locators; or only evidence reachable from selected Claims. “Request normalizado” likewise leaves BCP-47 canonicalization, Unicode normalization, omitted-versus-default fields, set ordering, duplicate handling, and `evaluationTime` precision unspecified.

Two units can therefore return different `stateDigest`/`decisionDigest` for identical files and can even return the same decision digest for semantically different inputs if they select different domains before JCS.

**Impact:** reproducibility, cache keys, audit records, and the promised Node/PHP test vectors are unreliable.

**Required closure:** define canonical intermediate representations for state and request, including exact included/excluded records and fields, ordering/set rules, Unicode/locale normalization, default materialization, timestamp precision, path normalization, quarantine treatment, and digest preimage framing. Bind golden byte-level vectors with expected SHA-256 values across Node and PHP.

## Tier 2 — Load-bearing ambiguity

### D4. Overlay order is stated, but merge and conflict semantics are not

**Bound decisions:** AD-5, AD-6, AD-14, conventions.

The dimension order does not define how multiple matching overlays within a dimension are selected, how specificity is ranked, or how objects, arrays, scalar values, deletions, and Claim references merge. It also does not define whether locale inheritance such as `pt` → `pt-BR`, market hierarchy, multiple audiences/channels, or equally specific overlays are legal. One unit can concatenate terminology/Claims and another replace them; one can let declaration order resolve ties and another reject them.

**Impact:** identical Brand Memory resolves to different tone, terminology, restrictions, Claims, and digest. A permissive merge can also silently weaken a restriction even though factual changes are prohibited.

**Required closure:** specify the overlay selector grammar, specificity ranking, tie behavior, inheritance model, per-field merge strategy, deletion semantics, and immutable/non-weakenable fields. Reject unresolved conflicts and add golden resolution fixtures.

### D5. Evidence graph validity and quarantine boundaries are inconsistent enough to diverge

**Bound decisions:** AD-4, AD-10, AD-14, AD-15.

AD-14 says the Core rejects dangling references and cycles, while AD-15 quarantines an invalid evidence record and affects only dependents. It is not defined whether a missing Claim→evidence reference, filename/`evidenceId` mismatch, dangling `supersedes`, forked supersession chain, or cycle is a global rejection, a quarantined connected component, or a dependent Claim failure. Supersession also lacks effective-time semantics: a corrected record could invalidate its predecessor for all historical evaluations or only from the successor's validity start. Both behaviors fit the current wording.

**Impact:** compliant units differ on availability, historical replay, which evidence is active, and whether a Claim is allowed or blocked. Corrupt graph fragments can receive inconsistent isolation treatment.

**Required closure:** define evidence graph invariants, successor cardinality/fork policy, effective-time selection, historical evaluation behavior, and a fault-classification matrix mapping every referential violation to global failure, component quarantine, or Claim-level outcome. Add fixtures for chains, forks, cycles, dangling edges, invalid successors, and historical `evaluationTime`.

## Recommended disposition

Keep the current architecture and close D1–D5 with a compact “Normative contracts” section plus executable contract fixtures. No new technology choice is required. After those additions, rerun this divergence review against the exact policy matrix, schemas, canonicalization vectors, overlay algorithm, and evidence-graph rules.

## Post-fix verification

### Verdict

**NEEDS REVISION — materially improved, with one remaining critical and three high-severity divergence points.** D5 is closed. D1, D3, and D4 are only partially closed. D2 is architecturally closed by a contract-first merge gate, but one contradictory packaging sentence must be corrected.

### Former-gap status

| Gap | Status | Verification |
| --- | --- | --- |
| D1 — decision table | **Partial** | Status precedence, evidence validity interval, direct-evidence minimum, aggregate precedence, and duplicate candidate handling are now fixed. Permission, scope applicability, and `historyStatus` predicates remain undefined while changing outcomes. |
| D2 — public contracts | **Closed with correction required** | AD-12 now requires versioned schemas and prevents dependent implementation before schemas/goldens merge. However, the structure section still says only “the two schemas” receive stable exports, contradicting AD-12 and the six listed public schemas. |
| D3 — digest domains | **Partial** | State contents, quarantine representation, request normalization, framing, and JCS/SHA-256 are defined. `decisionDigest` remains self-referential if `normalizedResult` contains the digest, and `engineVersion` lacks a cross-runtime identity definition. |
| D4 — overlay merge | **Partial** | Exact selector order, no inheritance, typed operations, array behavior, and same-precedence failure are fixed. The security-relevant meaning of “strengthen” remains non-normative. |
| D5 — evidence graph | **Closed** | Linear successor→predecessor chains, no forks/cycles/dangling edges, `validFrom` activation, exact Claim references, reapproval, no inheritance, and component quarantine now converge. |

### Critical

#### PF-C1. `decisionDigest` has a circular preimage

The preimage includes `normalizedResult`, while the public result is expected to carry `decisionDigest`. One unit can omit only `decisionDigest`, another can omit both digests, and a third can attempt an impossible fixed-point hash; all can plausibly claim compliance.

**Required correction:** define a named `DecisionBody` projection that explicitly excludes `decisionDigest` and any nondeterministic operational metadata. Hash exactly `{ contractVersion, stateDigest, normalizedRequest, evaluationTime, decisionBody }`. Define `engineVersion` as a language-neutral policy-engine contract version, not a package/runtime version, or remove it from `stateDigest`.

### High

#### PF-H1. Authorization still depends on three undefined predicates

“Permitted”, “applicable”, and `historyStatus: verified` affect `allow` versus `allow_with_constraints`/`review_required`, but no permission matrix, scope matching algorithm, or verifiability criterion exists. Two units can disagree on wildcard/absent scope, locale-market intersection, public-reference permission, or whether a Git checkout is verified.

**Required correction:** bind closed permission values to allowed uses; define exact scope matching for every dimension, including absent/global semantics; and define `historyStatus` from an explicit attestation input or always return `unverified` in V1 unless a prescribed verifiable artifact is present.

#### PF-H2. Monotonic overlay “strengthening” is not mechanically decidable

Claims, facts, restrictions, and compliance rules may be “strengthened”, but no partial order defines stronger versus weaker values. One unit can treat a replacement as stricter while another rejects it, including for editorial or compliance constraints.

**Required correction:** make those collections append-only in V1, or define field-specific ordered lattices in the schema/policy contract. Any incomparable replacement must fail resolution; `remove` must be schema-forbidden for monotonic collections.

#### PF-H3. Public schema packaging is internally contradictory

AD-12 requires all public document/Core/diagnostic/tool schemas in stable `files`/`exports`, and the structure lists six schemas, but the text beneath it says “the two schemas” are the exceptions receiving stable exports. Compliant packaging units could export two or all schemas.

**Required correction:** replace that sentence with an exhaustive export rule: every schema named under “Schemas públicos obrigatórios” has a stable package export and tarball test; no internal source directory becomes a public subpath.

### Medium / low scan

- **Medium: 2.** The spine requires deterministic diagnostic/reference ordering without naming the sort keys; AD-19 allows implementations to choose materially different file identity/change predicates for snapshot verification. Both should be bound by golden fixtures and an explicit comparison tuple.
- **Low: 0.** No additional feature-altitude low-severity divergence retained.

### Post-fix disposition

Correct PF-C1 and PF-H1–H3 before adoption. Then regenerate golden vectors for authorization, overlays, package exports, and digest preimages and rerun this two-unit test. No architectural paradigm change is required.

## Final targeted verification

**PASS — no critical or high two-independent-unit divergence remains.**

The final corrections make the authorization predicates, overlay mutation boundary, public schema exports, digest projection/version identity, diagnostic ordering, and snapshot comparison obligations implementation-convergent at feature altitude. Evidence supersession and quarantine remain closed. Remaining choices are schema/fixture or implementation details already subordinated to the contract-first merge gate and golden tests; they do not constitute critical/high architectural divergence.
