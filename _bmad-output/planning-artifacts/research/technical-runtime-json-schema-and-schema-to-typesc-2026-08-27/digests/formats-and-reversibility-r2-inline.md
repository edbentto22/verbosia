# Digest — semantic formats and reversibility, round 2

- claim: The `bcp-47` package is ESM-only, typed, parses and validates BCP 47 language tags, handles regular/irregular grandfathered tags, and returns an empty schema on invalid input when forgiving mode is disabled.
  source: https://github.com/wooorm/bcp-47/blob/main/readme.md
  publisher: bcp-47 project on GitHub
  pub_date: undated living documentation; major version 2 at access
  accessed: 2026-08-27
  confidence: high
  class: versions-compatibility
- claim: BCP 47 validation and locale canonicalization are distinct concerns; the contract can validate well-formed tags in Story 1 while later context normalization owns canonical casing and legacy replacement, with cross-runtime fixtures fixing observable behavior.
  source: https://github.com/wooorm/bcp-47/blob/main/readme.md
  publisher: bcp-47 project on GitHub
  pub_date: undated living documentation
  accessed: 2026-08-27
  confidence: medium
  class: architecture-pattern
- claim: A committed generated type file plus a deterministic `--check` regeneration gate makes the schema the authority while keeping a future generator replacement local to one adapter; the runtime validator remains separately replaceable behind the Core contract-validation port.
  source: synthesis from the selected tools' documented APIs
  publisher: Verbosia research synthesis
  pub_date: 2026-08-27
  accessed: 2026-08-27
  confidence: high
  class: architecture-pattern

## Stop condition

Coverage reached: all hard gates have an implementation route and the remaining uncertainty is appropriately converted into Story 1 acceptance probes rather than another library search round.
