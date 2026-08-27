- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-publicar-contratos-e-schemas-portateis.md`
  summary: Enforce ClaimValidationRequest candidateId uniqueness by identity in Story 5.
  evidence: JSON Schema 2020-12 uniqueItems compares complete candidate objects, so duplicate IDs with different text or claimIds require deterministic Policy Engine semantic validation rather than a non-portable custom schema keyword.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-publicar-contratos-e-schemas-portateis.md`
  summary: Enforce ClaimValidationReport aggregate outcome consistency in Story 5.
  evidence: The aggregate is defined by the PolicyDecisionTable and requires cross-item outcome precedence that belongs to deterministic policy evaluation, not the portable structural schema published in Story 1.
