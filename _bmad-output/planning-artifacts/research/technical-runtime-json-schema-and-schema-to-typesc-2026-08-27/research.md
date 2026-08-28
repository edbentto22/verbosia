---
title: 'Technical research: runtime JSON Schema and schema-to-TypeScript pipeline'
type: 'technical'
topic: 'runtime JSON Schema and schema-to-TypeScript pipeline'
decision: 'Select the runtime validator and schema-first TypeScript pipeline for Verbosia Story 1'
source: 'native web research using official primary sources'
status: complete
preset: standard
validation: normal
claims:
  verified: 3
  unverified: 0
  overturned: 0
created: '2026-08-27'
updated: '2026-08-27'
---

# Technical research: runtime JSON Schema and schema-to-TypeScript pipeline

## Executive summary

Adopt **Ajv 8.20.x** through its dedicated Draft 2020-12 entry point, with **ajv-formats 3.0.x** and a custom **bcp-47 2.1.x** format, as Verbosia's single structural-validation runtime. Adopt **json-schema-to-typescript 15.0.x** behind a repository-owned deterministic generator as the schema-to-TypeScript pipeline. Canonical `.schema.json` files remain the sole authority; generated TypeScript is a structural developer interface and never substitutes for runtime validation.

This combination clears every hard gate: Draft 2020-12, ESM consumption, Node 22/24, an offline registry, semantic format enforcement and mechanical drift prevention. Ajv 8.20.0 explicitly added Node 22/24 support and its documentation provides a dedicated 2020-12 class, strict compilation and pre-registered schema management [1][2][3]. The main caveat is deliberate: `json-schema-to-typescript` cannot encode every JSON Schema constraint in TypeScript, so Story 1 must test schemas and fixtures with Ajv independently of generated-type checks [6].

## Requirements frame

### Hard gates

- JSON Schema Draft 2020-12 is the contract dialect.
- Canonical contracts are JSON files with absolute, versioned IDs.
- Node.js 22 and 24 can build, validate and consume the ESM package.
- Every `$ref` resolves from a packaged allowlisted registry; no HTTP fallback exists.
- RFC 3339, URI and BCP 47 are asserted, not treated as annotations.
- Type declarations are generated from schemas and CI detects any stale output.
- The runtime and type generator are replaceable behind repository-owned adapters.

### Weighted preferences

| Criterion | Weight |
| --- | ---: |
| Standards/runtime correctness | 30% |
| Offline registry and security | 20% |
| Schema-first drift control | 20% |
| Maintenance and current compatibility | 15% |
| Fit with the pnpm/TypeScript monorepo | 10% |
| Exit cost | 5% |

## Runtime landscape and verdict

Ajv is the best fit for this focused local runtime. Its default export targets Draft 7, so Verbosia must import the 2020-12 class explicitly; that class supports all Draft 2020-12 keywords and intentionally cannot mix older dialects in the same instance [2]. Strict mode makes unknown formats and structurally suspicious schemas compilation errors, while coercion, default insertion and removal of unknown properties can stay disabled [3]. A single instance can pre-register and compile every packaged schema once [4]. Because Verbosia will not configure `loadSchema` or call `compileAsync`, an unknown reference fails locally instead of creating a network path.

`ajv-formats` supplies strict RFC 3339 date/time and URI implementations and documents ESM/TypeScript use, but it does not implement BCP 47 [5]. The ESM-only `bcp-47` parser fills that narrow gap, including grandfathered tags and strict non-forgiving parsing [10]. Shared fixtures, rather than library branding, define the cross-runtime result expected later from PHP.

Hyperjump remains the runner-up. It has excellent Draft 2020-12 and cross-dialect support, ESM/TypeScript exports, schema registration, formats and reusable compiled validators [9]. It loses for V1 because cross-dialect operation is unnecessary and its documented HTTP/filesystem retrieval model and async-oriented integration introduce more policy surface than Ajv's synchronous pre-registered instance. This is a project-fit inference, not a claim that Hyperjump is less standards-compliant.

## Type pipeline and drift control

`json-schema-to-typescript` directly consumes JSON files through a CLI or API and supports closed objects, definitions, local references and unions [6]. Its programmatic API lets Verbosia own a small generator adapter that:

1. reads a checked-in registry manifest;
2. maps only exact Verbosia schema IDs to files under `packages/core/schemas`;
3. disables the Ref Parser HTTP resolver [7];
4. emits one deterministic generated `.ts` file; and
5. implements a read-only `--check` mode that fails when regeneration differs.

This limitation is acceptable because runtime validation remains authoritative: formats, patterns, bounds, uniqueness and exact XOR behavior are not representable as ordinary TypeScript types [6]. Ajv plus golden fixtures therefore remains authoritative. Generated types describe structural use after successful validation.

`json-schema-to-ts` is eliminated by a hard gate: its own documentation says it expects schemas defined as TypeScript constants because imported JSON cannot be made `as const` [8]. Using it would make TypeScript or a generated wrapper the practical authority.

Sourcemeta's CLI is the leading alternative for future review. It explicitly targets Draft 2020-12 and supports `$id`, `$ref`, `$defs`, anchors and TypeScript code generation, but the project labels codegen experimental and distributes a native C++ CLI [11][12]. Revisit it after codegen stabilizes or if Verbosia later adopts Sourcemeta's broader lint/test/bundle workflow.

## Decision matrix

Scores are 1–5. Cells describing monorepo fit and exit cost are explicit inferences from the official integration models.

| Stack | Hard gates | Correctness 30 | Offline 20 | Drift 20 | Health 15 | Fit 10 | Exit 5 | Weighted |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Ajv + json-schema-to-typescript | Pass | 5 | 5 | 5 | 5 | 5 | 4 | **4.95** |
| Hyperjump + json-schema-to-typescript | Pass | 5 | 4 | 5 | 4 | 3 | 4 | 4.35 |
| Ajv + Sourcemeta codegen | Pass with experimental-tool risk | 5 | 5 | 4 | 4 | 3 | 3 | 4.35 |
| Ajv + json-schema-to-ts | **Fail: canonical JSON source** | — | — | — | — | — | — | Eliminated |

## Contrary evidence and strongest argument against the pick

The strongest objection is that `json-schema-to-typescript` does not claim complete Draft 2020-12 semantic coverage, while Sourcemeta codegen explicitly targets that dialect [6][11]. The recommendation survives because TypeScript cannot encode many JSON Schema assertions regardless of generator, Sourcemeta still labels its codegen experimental, and Verbosia can constrain generation to structural types while proving all contract behavior with the selected Draft 2020-12 runtime. A schema-convention test must reject any newly used structural keyword whose generated representation widens incorrectly.

Ajv also requires explicit guardrails: importing its default class would silently select the wrong dialect; registering formats incompletely would make valid-looking schemas unsafe; and exposing Ajv errors would couple public contracts to a dependency. The Story 1 implementation contract must make all three failure modes testable.

## Recommendations and downstream bindings

1. **Bind Story 1 to Ajv 8.20.x, ajv-formats 3.0.x, bcp-47 2.1.x and json-schema-to-typescript 15.0.x.** Pin exact resolutions in `pnpm-lock.yaml`; re-run Node 22/24 probes whenever those resolutions change. Confidence: high, based on current official release and API documentation [1][5][6][10].
2. **Create one internal Core contract-validation port.** It owns the Ajv 2020 instance, strict immutable options, semantic formats, local registry and stable internal issue normalization. No loader or MCP handler may construct its own validator. Confidence: high [2][3][4].
3. **Keep schemas public and engines private.** Export versioned JSON files and their generated TypeScript types from `@verbosia/core`; do not expose Ajv types or errors. This keeps future PHP/WordPress consumers bound to the portable contract, not the Node implementation.
4. **Make offline behavior mechanical.** Lint every `$ref` against the manifest, disable Ref Parser HTTP, omit Ajv async loading, and include a network canary that proves an unregistered HTTPS reference fails without a fetch [4][7].
5. **Treat generated types as disposable artifacts.** A single adapter and committed output provide the cheapest reversibility hedge: Ajv, the generator, or both can later change without changing schema IDs or public data contracts.

## Open questions

No blocking research question remains for Story 1. The exact patch versions must be locked and empirically exercised when dependencies are installed; a failed Node 22/24, ESM, `$ref` or generation probe reopens this decision before any domain loader is implemented.

## Source appendix

| Ref | Claim/finding supported | Publisher | Publication date | Accessed | Confidence |
| --- | --- | --- | --- | --- | --- |
| [1] | Ajv 8.20.0 adds Node 22/24 support | [Ajv release v8.20.0](https://github.com/ajv-validator/ajv/releases/tag/v8.20.0) | 2026-04-24 | 2026-08-27 | High |
| [2] | Dedicated Draft 2020-12 class and keyword support | [Ajv JSON Schema documentation](https://ajv.js.org/json-schema.html) | Living documentation | 2026-08-27 | High |
| [3] | Strict, format, mutation and all-errors options | [Ajv options](https://ajv.js.org/options.html) | Living documentation | 2026-08-27 | High |
| [4] | Pre-registering and compiling schemas once | [Ajv schema management](https://ajv.js.org/guide/managing-schemas.html) | Living documentation | 2026-08-27 | High |
| [5] | RFC 3339/URI formats and ESM usage | [ajv-formats](https://ajv.js.org/packages/ajv-formats.html) | Living documentation | 2026-08-27 | High |
| [6] | JSON-file generation, refs and TypeScript limitations | [json-schema-to-typescript](https://github.com/bcherny/json-schema-to-typescript) | Living documentation; source version 15.0.3 | 2026-08-27 | High |
| [7] | Disabling HTTP and defining custom resolvers | [JSON Schema Ref Parser options](https://apidevtools.com/json-schema-ref-parser/docs/options.html) | Living documentation | 2026-08-27 | High |
| [8] | TypeScript-constant requirement and JSON import limitation | [json-schema-to-ts](https://github.com/ThomasAribart/json-schema-to-ts) | Living documentation | 2026-08-27 | High |
| [9] | Hyperjump Draft 2020-12, ESM, registry and retrieval model | [Hyperjump JSON Schema](https://github.com/hyperjump-io/json-schema) | Living documentation | 2026-08-27 | Medium |
| [10] | ESM BCP 47 parsing and strict invalid-input behavior | [bcp-47](https://github.com/wooorm/bcp-47/blob/main/readme.md) | Living documentation; major version 2 | 2026-08-27 | High |
| [11] | Draft 2020-12 TypeScript codegen is experimental | [Sourcemeta codegen](https://github.com/sourcemeta/jsonschema/blob/main/docs/codegen.markdown) | Living documentation | 2026-08-27 | High |
| [12] | Native CLI distribution and current stable release | [Sourcemeta JSON Schema CLI](https://github.com/sourcemeta/jsonschema) | v16.8.0 released 2026-08-17 | 2026-08-27 | High |

## Staleness map

The technical pack requires version/compatibility claims to be rechecked monthly. The mechanical map marks the April Ajv release claim stale as of 2026-05-01 even though the official release page still showed 8.20.0 as latest when accessed on 2026-08-27. Therefore Story 1 must repeat `npm`/lockfile and Node 22/24 probes at dependency installation. The `json-schema-to-typescript` integration claim rechecks by 2027-08-01; the BCP 47 compatibility claim rechecks by 2026-09-01. The earliest actionable recheck is immediate at implementation start.
