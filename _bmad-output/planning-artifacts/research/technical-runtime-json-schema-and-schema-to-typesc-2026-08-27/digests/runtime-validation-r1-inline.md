# Digest — runtime validation, round 1

- claim: Ajv 8 provides a dedicated Draft 2020-12 class and documents support for all Draft 2020-12 keywords; it cannot mix Draft 2020-12 with earlier dialects in the same instance.
  source: https://ajv.js.org/json-schema.html
  publisher: Ajv
  pub_date: undated living documentation
  accessed: 2026-08-27
  confidence: high
  class: versions-compatibility
- claim: Ajv strict mode can reject unknown formats and schema mistakes at compilation; `allErrors` is opt-in, while coercion, default application and additional-property removal are opt-in mutations and can remain disabled.
  source: https://ajv.js.org/options.html
  publisher: Ajv
  pub_date: undated living documentation
  accessed: 2026-08-27
  confidence: high
  class: architecture-pattern
- claim: Ajv recommends a single instance with schemas compiled once; pre-adding all schemas and omitting asynchronous `loadSchema` enables a local registry where missing references fail instead of being fetched.
  source: https://ajv.js.org/guide/managing-schemas.html
  publisher: Ajv
  pub_date: undated living documentation
  accessed: 2026-08-27
  confidence: high
  class: integration
- claim: Ajv 8.20.0 was released with explicit Node 22/24 support.
  source: https://github.com/ajv-validator/ajv/releases/tag/v8.20.0
  publisher: Ajv project on GitHub
  pub_date: 2026-04-24
  accessed: 2026-08-27
  confidence: high
  class: versions-compatibility
- claim: `ajv-formats` supplies RFC 3339 `date-time` and full `uri` validation and documents ESM/TypeScript imports; it does not supply BCP 47.
  source: https://ajv.js.org/packages/ajv-formats.html
  publisher: Ajv
  pub_date: undated living documentation
  accessed: 2026-08-27
  confidence: high
  class: integration
- claim: Hyperjump is a credible standards-first runner-up with Draft 2020-12, ESM/TypeScript, schema registration, formats and cross-dialect support, but its documented automatic filesystem/HTTP loading and async-oriented API add policy/configuration surface not needed by this local single-dialect V1.
  source: https://github.com/hyperjump-io/json-schema
  publisher: Hyperjump project on GitHub
  pub_date: undated living documentation
  accessed: 2026-08-27
  confidence: medium
  class: architecture-pattern

## Leads and gaps

- BCP 47 requires an explicit custom format implementation and shared acceptance vectors.
- The runtime adapter must never expose Ajv-native error objects as a public contract.
- Offline behavior needs a canary fixture that fails on an unregistered remote `$ref` and records zero network calls.
