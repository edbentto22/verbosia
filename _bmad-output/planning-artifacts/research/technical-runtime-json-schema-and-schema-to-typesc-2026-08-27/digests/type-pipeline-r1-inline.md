# Digest — schema-to-TypeScript pipeline, round 1

- claim: `json-schema-to-typescript` consumes JSON Schema files through a CLI or programmatic API, supports filesystem references, `$defs`, required properties, closed objects and unions, and can resolve `$ref` from a configured working directory.
  source: https://github.com/bcherny/json-schema-to-typescript
  publisher: json-schema-to-typescript project on GitHub
  pub_date: undated living documentation; package source reports 15.0.3 at access
  accessed: 2026-08-27
  confidence: high
  class: integration
- claim: `json-schema-to-typescript` explicitly documents that semantic constraints such as `format`, pattern, bounds, uniqueness and exact `oneOf` semantics are not expressible in TypeScript; generated types therefore cannot replace runtime validation.
  source: https://github.com/bcherny/json-schema-to-typescript#not-expressible-in-typescript
  publisher: json-schema-to-typescript project on GitHub
  pub_date: undated living documentation
  accessed: 2026-08-27
  confidence: high
  class: implementation-reality
- claim: Its underlying JSON Schema Ref Parser allows HTTP resolution to be disabled and custom resolvers to be installed, enabling an allowlisted mapping from Verbosia absolute schema IDs to packaged local files.
  source: https://apidevtools.com/json-schema-ref-parser/docs/options.html
  publisher: APIDevTools
  pub_date: undated living documentation
  accessed: 2026-08-27
  confidence: high
  class: integration
- claim: `json-schema-to-ts` infers types in type space, but its own documentation says canonical schemas must be authored as TypeScript constants because imported JSON cannot receive `as const`; that conflicts with Verbosia's canonical JSON-file requirement.
  source: https://github.com/ThomasAribart/json-schema-to-ts
  publisher: json-schema-to-ts project on GitHub
  pub_date: undated living documentation
  accessed: 2026-08-27
  confidence: high
  class: implementation-reality
- claim: Sourcemeta JSON Schema CLI has an explicit Draft 2020-12 TypeScript code-generation command and broad schema tooling, but the project labels codegen experimental and distributes a native C++ CLI, increasing contributor and CI installation cost.
  source: https://github.com/sourcemeta/jsonschema/blob/main/docs/codegen.markdown
  publisher: Sourcemeta
  pub_date: living documentation; current stable CLI 16.8.0 released 2026-08-17
  accessed: 2026-08-27
  confidence: high
  class: implementation-reality

## Leads and gaps

- Use a repository-owned generator adapter rather than invoking a third-party CLI directly; this keeps exit cost low.
- The generator must use a custom resolver for the exact Verbosia ID registry, disable HTTP, emit one deterministic generated TypeScript file and support a read-only `--check` mode.
- A schema convention linter must reject keywords the chosen generator cannot structurally represent when they would widen a public type unexpectedly.
