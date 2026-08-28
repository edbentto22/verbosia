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
