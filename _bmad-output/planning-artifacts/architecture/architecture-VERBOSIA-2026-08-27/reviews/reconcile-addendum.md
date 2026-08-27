# Reconciliation Review — Architecture Spine vs. Addendum

## Verdict

**CHANGES REQUIRED.** The spine preserves the addendum's separation of memory domains, evidence governance, local/read-only boundary, BCP-47 basis, and future isolation of Market Signals. However, it omits several load-bearing parts of the decision matrix that would change the Core contracts, rule model, MCP inputs, and acceptance tests.

## Findings

### R1 — Critical: the decision context is narrower than the addendum

The addendum makes `locale + market + page intent + content type + editorial risk` the canonical decision tuple. AD-6 and the conventions replace the last three dimensions with `channel/audience` and do not bind `pageIntent`, `contentType`, or `editorialRisk`. This weakens the central product rule and could make the schemas and both MCP tools incapable of expressing required cases such as transactional pages, legal/pricing content, or high-risk claims.

**Required reconciliation:** make all five addendum dimensions first-class, separate inputs to context resolution and policy evaluation. Channel and audience may remain additional dimensions, not substitutes.

### R2 — High: the rule contract and override governance are absent

The addendum requires every rule to carry an ID, scope, condition, severity, evidence, recommendation, allowed automatic action, and reference; rules must be versioned and tested. It also requires every automatic rule to be disableable/overridable with a recorded justification. AD-16 only says future packs are declarative, scoped, grounded, and tested, while the current policy model has no bound rule entity, override mechanism, or justification audit contract.

**Required reconciliation:** define a shared rule/policy contract and precedence for configured overrides. An override must never alter the evidence record or silently weaken hard safety constraints, and its actor, reason, scope, and time must be auditable.

### R3 — High: risk levels and human-review calibration are not preserved

The addendum defines Informational, Warning, and Blocking effects and requires reviewer agreement to be measured before a rule becomes blocking. The spine defines outcome states and diagnostic severity but does not map them to those effects or bind the calibration gate. This allows an implementation to mark unvalidated locale/SEO/GEO heuristics as blockers while still complying with the spine.

**Required reconciliation:** bind the level-to-outcome mapping and require measured human-review agreement before configurable editorial rules graduate to blocking. Intrinsic integrity/security failures may remain immediately blocking.

### R4 — High: Brand Memory's minimum product content is underspecified

The addendum defines Brand Memory as client-controlled tone, services, proofs, differentiators, restrictions, and terms. The spine binds a file and makes Claims central, but does not require those content families or state that the client is the governing authority. A schema containing only claims and overlays would satisfy the spine while failing the source requirement.

**Required reconciliation:** bind the minimum Brand Memory domains and client authority, while allowing schema evolution. Clearly separate approved proof/claim references from stylistic guidance and terminology.

### R5 — Medium: the evidence taxonomy omits `hypothesis`

The addendum explicitly requires the ledger to distinguish approved fact, observed signal, inference, and hypothesis. AD-7 models direct/corroborative evidence, signal, and inference, but no hypothesis classification; factual approval is correctly assigned to Claim governance. Without `hypothesis`, unsupported recommendations can be misclassified as inference or evidence.

**Required reconciliation:** represent `hypothesis` explicitly and ensure it can never support factual authorization without independent qualifying evidence and approval.

### R6 — Medium: required multilingual fixtures and reviewer validation are missing from acceptance

The addendum requires initial fixtures with intentional errors for `pt-BR`, `en-US`, and `es-419`, plus comparison against human reviewers before blocking rules are enabled. The spine only requires a future user-provided E2E scenario and generic multilingual fixtures after `localize_with_context` stabilization.

**Required reconciliation:** add these three locale fixtures and reviewer-concordance evidence to acceptance for the policy/context substrate, even if translation and publication remain deferred.

### R7 — Medium: tool naming diverges without an explicit compatibility decision

The addendum names the future public capability `verbosia.claim_validator`; AD-11 binds `verbosia.validate_claims`. Renaming may be preferable, but it is currently an unexplained contract divergence that can fragment documentation and downstream integrations.

**Required reconciliation:** select one canonical public name and record migration/alias policy if the addendum name has already been communicated externally.

### R8 — Medium: the existing localization sequence has no explicit integration seam

The addendum's sequential flow loads brand/glossary/evidence before planning and translation, then validates localization, SEO, GEO, and approval. Deferring `localize_with_context` is consistent with the V1 scope, but the spine does not bind an input/output seam from resolved brand context and claim decisions into the existing localization planner. Two independently compliant modules could therefore become difficult to compose later.

**Required reconciliation:** define a stable, provider-neutral resolved-context/validation-result contract consumable by the existing localization pipeline, without expanding the V1 MCP tool surface.

## Scope notes

No gap is raised for live connectors, OAuth, Search Console/analytics, remote transport, Market Signals ingestion, publication, or ranking measurement: the spine explicitly and correctly defers those items to separately governed initiatives.
