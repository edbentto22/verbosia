- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-publicar-contratos-e-schemas-portateis.md`
  summary: Enforce ClaimValidationRequest candidateId uniqueness by identity in Story 5.
  evidence: JSON Schema 2020-12 uniqueItems compares complete candidate objects, so duplicate IDs with different text or claimIds require deterministic Policy Engine semantic validation rather than a non-portable custom schema keyword.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-publicar-contratos-e-schemas-portateis.md`
  summary: Enforce ClaimValidationReport aggregate outcome consistency in Story 5.
  evidence: The aggregate is defined by the PolicyDecisionTable and requires cross-item outcome precedence that belongs to deterministic policy evaluation, not the portable structural schema published in Story 1.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-implementar-brand-memory-e-overlays.md`
  summary: Add committed `es-419` Brand Memory and resolution vectors during the multilingual portability gate.
  evidence: Story 1.3 validates generic canonical BCP 47 resolution, while the epic assigns mandatory `pt-BR`, `en-US`, and `es-419` cross-runtime coverage to the release portability and hardening work.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-implementar-brand-memory-e-overlays.md`
  summary: Verify the new Core runtime exports through the packed package artifact.
  evidence: Story 1.3 builds and tests the source package API, while tarball construction and consumer import canaries are explicit release portability and hardening gates.

- source_spec: `_bmad-output/implementation-artifacts/spec-translation-memory-v2-hardening.md`
  summary: Harden review locale boundaries before exposing mutation workflows beyond trusted local callers.
  evidence: `applyReview` accepts `input.targetLang` without proving membership in configured targets, so path-like values can escape the intended localized-language directory; this predates TM v2 identity changes.

- source_spec: `_bmad-output/implementation-artifacts/spec-translation-memory-v2-hardening.md`
  summary: Restrict review frontmatter mutations to the configured translated-field allowlist and define blank-edit semantics.
  evidence: Review currently accepts any client-supplied path backed by a string source value, and blank edits are saved without updating TM, allowing later translation to restore stale machine content; both behaviors predate TM v2.

- source_spec: `_bmad-output/implementation-artifacts/spec-translation-memory-v2-hardening.md`
  summary: Make committed Translation Memory file replacement atomic and crash-safe.
  evidence: `FileCacheDriver.flush` writes `tm.json` directly, so interruption can truncate the entire store; TM v2 changed validation and identity but did not introduce this persistence pattern.

- source_spec: `_bmad-output/implementation-artifacts/spec-translation-memory-v2-hardening.md`
  summary: Add optimistic concurrency protection to shared Redis synchronization.
  evidence: `tm:sync` resolves a winner after independent reads and writes without compare-and-set, so a newer concurrent Redis translation can be overwritten; the race existed in the original sync lifecycle.
