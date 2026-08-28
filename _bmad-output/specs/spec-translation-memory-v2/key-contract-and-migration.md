# TM V2 Key and Migration Contract

This companion is normative for `SPEC-translation-memory-v2`.

## Confirmed failure model

| Current behavior | Proven risk | V2 requirement |
| --- | --- | --- |
| Fields are joined with `NUL + pipe`. | Distinct tuples containing the delimiter can produce the same preimage. | Encode a typed context object canonically; never frame untrusted fields with a sentinel. |
| Glossary and do-not-translate values are merged, then sorted. | `glossary=['A'], doNotTranslate=['B']` equals `glossary=['A','B'], doNotTranslate=[]`; provider behavior differs. | Preserve both partitions and their order. |
| Key omits source language, provider, regional variant, and tone. | A translation produced for one semantic request can be returned for another. | Include every resolved field listed below. |
| Empty model is accepted. | Invalid configuration reaches shared cache and provider boundaries. | Reject empty or whitespace-only model values during configuration resolution. |
| Redis uses the shared `tm:` prefix. | A wrong identity can propagate between projects. | Put v2 behind a disjoint, recognizable key version. |

The report at `docs/bugs-2026-08-27.md` initiated the audit. The binding conclusions above come from reproductions against `packages/core/src/cache-key.ts`, `types.ts`, `tm.ts`, `review.ts`, `maintenance.ts`, and both cache drivers.

## Canonical identity

The context preimage is this JSON value with every property present:

```json
{
  "domain": "verbosia.translation-memory.context",
  "version": 2,
  "sourceLang": "pt-BR",
  "targetLang": "en",
  "targetVariant": "en-US",
  "provider": "anthropic",
  "model": "claude-sonnet-5",
  "tone": null,
  "glossary": ["Verbosia = Verbosia"],
  "doNotTranslate": ["Verbosia"],
  "promptVersion": "v1"
}
```

Rules:

- `sourceLang`, `targetLang`, `provider`, `model`, and `promptVersion` are the exact non-empty resolved values used for the provider request.
- `provider` identifies the actual provider instance that executes the request, not only the configured default.
- `targetVariant` and `tone` are exact strings when present and explicit `null` otherwise.
- `glossary` and `doNotTranslate` are exact ordered arrays. Empty arrays remain present.
- `sourceText` is not embedded in this context object. It is hashed separately as exact UTF-8 text, including whitespace, NUL, Unicode composition, and line endings.
- Any change to masking, prompt construction, built-in provider payload semantics, or another unrepresented output-affecting rule requires a `promptVersion` bump before release.

## Derivation and external key

```text
contextBytes  = JCS(contextPreimage)                 // RFC 8785 UTF-8 bytes
contextDigest = sha256(contextBytes)                 // 64 lowercase hex chars
sourceDigest  = sha256(utf8(sourceText))             // 64 lowercase hex chars
key           = "v2:" + contextDigest + ":" + sourceDigest
```

The accepted key grammar is:

```text
^v2:[0-9a-f]{64}:[0-9a-f]{64}$
```

The two-digest shape is deliberate: it keeps the full semantic context collision-resistant while allowing maintenance to recognize whether the exact source text still exists without reconstructing historical provider/model configurations. File storage uses the external key unchanged. Redis prepends its transport namespace, producing `tm:v2:<contextDigest>:<sourceDigest>`.

## Public contract and validation

- Core exposes one v2 identity input type, one derivation function, one v2-key parser/predicate, and the key-version constant used by all consumers.
- The derivation function rejects missing, empty, or structurally invalid required values; it does not accept the old five-field shape.
- `resolveConfig` rejects `model: ''` and whitespace-only variants with a sanitized Verbosia configuration error before filesystem or network work.
- The old `glossaryVersion` export may remain temporarily as deprecated utility only if no v2 runtime path consumes it. Documentation must not describe it as part of the active key.
- Each localized document records `tmKeyVersion: 2` and the non-sensitive `contextDigest` that produced it alongside the existing translation/review metadata. It never stores the context preimage, source text, glossary, tone, or credentials.
- Packed `@verbosia/core` JavaScript and declarations expose the v2 functions and types; a source-only import is insufficient evidence.

## Legacy and migration behavior

| Operation | V2 entry | V1 hash-only entry | Malformed key |
| --- | --- | --- | --- |
| Translation lookup | Read and backfill normally. | Ignore as miss. | Ignore as miss. |
| Translation write | Write v2 only. | Never overwrite or promote. | Never write. |
| Human review | Update v2 keys derived from the same canonical request. | Never update as substitute for v2. | Never update. |
| `tm:sync` | Transfer and resolve by timestamp. | Ignore and report count per tier. | Ignore and report count per tier. |
| `prune --dry-run` | Classify by live source digest. | Report as local legacy cleanup candidate. | Report as local malformed cleanup candidate. |
| `prune` | Delete only when the exact source digest is no longer live. | Delete locally after reporting; never delete shared Redis. | Delete locally after reporting; never delete shared Redis. |
| Normal startup/translation | Preserve. | Preserve without reading. | Preserve without reading. |

No automatic migration is valid: a v1 key does not encode enough information to prove its source language, provider, variant, tone, or glossary partition, and its delimiter framing is ambiguous. A first v2 run may therefore call the provider again.

Maintenance reports must distinguish at least live/orphan v2 entries, local legacy entries, malformed entries, and ignored Redis legacy/malformed entries. Counts must be deterministic and dry-run must produce the same classification as the corresponding mutation run.

## Required consumer alignment

- `resolveSegment` derives the key from the same resolved request passed to the provider.
- `writeLocalized` records the v2 context digest while preserving the existing `translatedBy`, language, timestamp, and review semantics.
- `applyReview` composes the historical key from the recorded v2 context digest plus each source segment digest, and also writes the current context when it can derive it. It must not fabricate a historical provider or other missing context.
- `prune` parses the v2 key and compares its source digest to the set of exact live translatable segment digests; provider/model history alone never makes an entry orphaned.
- `syncTM` filters keys before reading or transferring values and never copies v1/malformed entries between tiers.
- File and Redis drivers remain storage mechanisms; semantic version acceptance belongs in the TM lifecycle layer so driver behavior stays generic and testable.
- Translation reports preserve current hit/miss semantics: ignored v1 data is a miss, not a hit or error.

## Golden and integration vectors

The committed deterministic vector set must contain exact input and expected key for at least:

1. A baseline `pt-BR -> en-US` request.
2. The same request repeated and with object property insertion order changed.
3. Source text containing `NUL`, `|`, `:`, U+241E, newlines, and JSON escape characters.
4. A former tuple collision constructed from delimiter-bearing adjacent fields.
5. `glossary=['A'], doNotTranslate=['B']` versus `glossary=['A','B'], doNotTranslate=[]`.
6. Reversed glossary order and reversed do-not-translate order; both must differ because provider input differs.
7. One-at-a-time mutations of source language, target language, target variant, provider, model, tone, glossary, do-not-translate, prompt version, and source text.
8. `null` versus present optional values and empty versus non-empty arrays.
9. Composed versus decomposed Unicode source text; they remain distinct because the provider receives distinct exact text.
10. Invalid empty/whitespace model and every malformed external key grammar case.

Focused integration tests must additionally prove:

- file hit, Redis hit with file backfill, full miss with write-through, and a second-run v2 hit;
- v1 seed data never suppresses a provider call and is not deleted by translation;
- human review writes the key later queried by translation;
- sync transfers only v2 and reports ignored entries;
- prune dry-run and mutation agree, preserve v2 entries for live source text across multiple contexts, and remove only local legacy/malformed candidates;
- full Core/MCP/CLI regression, build, typecheck, contract checks, diff checks, and packed-package runtime export probe pass.

## Expected implementation surface

The smallest expected surface includes `packages/core/src/cache-key.ts`, `types.ts`, `config.ts`, `tm.ts`, `translate.ts`, `review.ts`, `maintenance.ts`, Redis/file-facing lifecycle tests, public exports, `docs/translation-memory.md`, and the README. Any additional file must be justified by a contract or verification need above.
