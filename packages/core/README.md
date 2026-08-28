# @verbosia/core

Engine do [Verbosia](https://github.com/edbentto22/verbosia) — tradução com IA para sites estáticos, agnóstico de framework.

- **Translation Memory v2** com contexto JCS/SHA-256 e digest exato do texto, em dois níveis: arquivo comitável + Redis compartilhado (com backfill).
- **Segment-level**: tradução por parágrafo; editar um não invalida os outros. Blocos de código passam direto.
- **Masking estrutural**: código, URLs, `{variáveis}` e tags MDX protegidos por tokens, com validação fail-safe na volta.
- **4 providers BYOK**: Anthropic, OpenAI, Gemini, DeepL — mesma interface, SDKs como peers opcionais.
- **SEO**: hreflang/canonical/og:locale/JSON-LD, sitemap com alternates, slugs localizados estáveis.
- **Revisão**: `applyReview` grava edições humanas de volta na TM.

```ts
import { resolveConfig, translate } from '@verbosia/core';

const config = resolveConfig({
  provider: 'anthropic',
  source: 'pt',
  targets: ['en', 'es'],
  collections: ['blog'],
});
const report = await translate(config);
// { hits: 42, misses: 3, written: 12, ... }
```

O contrato de identidade também é público no pacote compilado:

```ts
import { TM_KEY_VERSION, deriveCacheIdentity, parseCacheKey } from '@verbosia/core';

const identity = deriveCacheIdentity({
  sourceText: 'Olá',
  sourceLang: 'pt-BR',
  targetLang: 'en',
  targetVariant: 'en-US',
  provider: 'anthropic',
  model: 'claude-sonnet-5',
  tone: null,
  glossary: [],
  doNotTranslate: [],
  promptVersion: 'v1',
});
console.log(TM_KEY_VERSION, parseCacheKey(identity.key));
```

O runtime lê e grava somente `v2:<contextDigest>:<sourceDigest>`. Entradas v1 não são
promovidas nem sincronizadas; a limpeza local é explícita e o Redis legado é preservado.

Normalmente você não usa o core diretamente — use o adapter do seu framework ([`@verbosia/astro`](https://npmjs.com/package/@verbosia/astro), [`@verbosia/eleventy`](https://npmjs.com/package/@verbosia/eleventy), [`@verbosia/next`](https://npmjs.com/package/@verbosia/next)) e a CLI [`verbosia`](https://npmjs.com/package/verbosia).

## Portable contracts

The files under `schemas/` are the semantic authority for Brand Memory, Evidence Ledger,
policy, diagnostics, resolved context, Claim validation, and Context Pack contributions.
They use JSON Schema Draft 2020-12 and stable IDs in
`https://schemas.verbosia.dev/contracts/v1/`. Persisted documents use
`schemaVersion: "1.0.0"`; requests and results use `contractVersion: "1.0.0"`.
An unsupported major version must be rejected rather than migrated silently.

Generated TypeScript types are structural conveniences. They cannot enforce formats,
patterns, uniqueness, numeric bounds, or conditional rules; runtime validation against the
published schemas remains authoritative.

```ts
import { readFile } from 'node:fs/promises';
import { CONTRACT_SCHEMA_IDS, CONTRACT_VERSION } from '@verbosia/core';
import type { BrandMemory } from '@verbosia/core';

const schemaUrl = import.meta.resolve('@verbosia/core/schemas/brand-memory');
const brandMemorySchema = JSON.parse(await readFile(new URL(schemaUrl), 'utf8'));

void (brandMemorySchema as object);
void (CONTRACT_SCHEMA_IDS as readonly string[]);
void (CONTRACT_VERSION satisfies '1.0.0');
declare const brandMemory: BrandMemory;
void brandMemory;
```

The manifest is available at `@verbosia/core/schemas/manifest`; every schema is exposed by
the corresponding `@verbosia/core/schemas/<name>` subpath. Consumers should resolve those
subpaths to URLs/filesystem paths and read the JSON. First-party runtime code does not use
static JSON imports, remote references, or network fallback.

From the repository root:

```sh
pnpm contracts:generate # atomically refresh committed structural types
pnpm contracts:check    # compare in memory; never writes
pnpm contracts:test     # registry, formats, fixtures, exports, and generator probes
```

## Secure local JSON snapshots

`readLocalJsonSnapshot` is the domain-neutral, read-only filesystem substrate used by
later Brand Memory and Evidence Ledger loaders. The caller supplies an explicit project
root plus project-relative file or directory scopes. Directory scopes are recursive and
every regular file they contain is treated as JSON; callers should therefore select only
directories whose files are authoritative JSON inputs.

```ts
import { readLocalJsonSnapshot } from '@verbosia/core';

const snapshot = await readLocalJsonSnapshot({
  projectRoot: '/real/workspace/root',
  paths: ['.verbosia/brand', '.verbosia/evidence'],
});

for (const entry of snapshot.entries) {
  console.log(entry.path, entry.rawDigest, entry.canonicalDigest);
}
console.log(snapshot.inventoryDigest);
```

The reader resolves the explicit root once per whole attempt, rejects traversal,
symlink components, Windows aliases/reserved names, special files, and regular files with
multiple hard links, then enumerates through bounded directory handles in UTF-8 bytewise
portable-path order. Each file is revalidated immediately before open, opened read-only,
non-blocking, and without following its final component, then read twice in bounded chunks by
handle, and compared by device, inode, type, link count, size, mode, and nanosecond
change/modify timestamps before and after. A second inventory pass detects added,
removed, renamed, or edited entries. Detectable mutation discards every partial result;
one complete retry is allowed before `STATE_CHANGED_DURING_READ`.

Inventory paths retain their original spelling in immutable results and digest preimages.
Before any content read, a deterministic NFC plus repository default Unicode case-fold
policy (non-Turkic scalar mappings with full expansions) rejects paths that
would collide on common case-insensitive or normalization-insensitive filesystems.

Bytes are decoded as fatal UTF-8/I-JSON before object construction. BOMs, malformed
UTF-8, duplicate decoded keys, lone surrogates, non-finite/underflowing numbers,
integer-valued numbers outside the safe range regardless of spelling, excessive nesting,
and resource overflow fail with a sanitized closed error code. Accepted values are
canonicalized with RFC 8785/JCS without Unicode
normalization and hashed as full `sha256:<lowercase-hex>` digests. The inventory digest
uses a versioned JCS object containing each ordered relative path plus its raw and
canonical digests; it is intentionally not the later semantic `stateDigest`.

V1 fixed limits are exported as `SNAPSHOT_LIMITS`:

| Limit | Value |
| --- | ---: |
| Input scopes | 256 |
| Portable path | 1,024 UTF-8 bytes |
| Regular files | 10,000 |
| Filesystem inventory entries | 20,000 |
| One file | 1 MiB |
| Whole snapshot | 64 MiB |
| JSON container depth | 64 |
| JSON values across one snapshot attempt | 1,000,000 |
| JSON number lexeme | 128 characters |

The 20,000-entry inventory ceiling accommodates the 10,000-record V1 ledger plus its
root and substantial directory overhead. These are substrate ceilings, not domain
entitlements: later Evidence Ledger loaders may lower an individual evidence-record
file to 256 KiB while keeping the substrate itself domain-neutral.

The threat model covers detectable concurrent mutation in a trusted local workspace. It
does not claim resistance to a hostile kernel, administrator, or privileged writer able
to perform indistinguishable swap-back attacks. This layer performs no schema/domain
validation, quarantine, locator verification, supersession, policy decisions, cache,
writes, network access, provider calls, or MCP behavior.

## Brand Memory and deterministic context

Core loads Brand Memory on demand from the single fixed path
`.verbosia/brand/brand-memory.json` beneath an explicit project root. The loader uses the
secure snapshot substrate, validates I-JSON and the published Brand Memory schema, checks
portable identities and non-evidence references, normalizes strings to NFC and locales to
canonical BCP 47, and returns a deeply immutable canonical model. It never reads the
Evidence Ledger, Translation Memory, Context Packs, providers, caches, or databases and it
does not write or migrate project state.

```ts
import { loadBrandMemory, resolveBrandContext } from '@verbosia/core';

const memory = await loadBrandMemory({ projectRoot: '/real/workspace/root' });
const context = await resolveBrandContext({
  projectRoot: '/real/workspace/root',
  request: {
    contractVersion: '1.0.0',
    locale: 'pt-BR',
    market: 'br',
    pageIntent: 'product',
    contentType: 'landing-page',
    channel: 'website',
    audience: 'developers',
    editorialRisk: 'medium',
  },
});

console.log(memory.brandId, context.stateDigest);
```

Resolution uses exact selectors in the fixed order `locale -> market -> pageIntent ->
contentType -> channel -> audience`. Missing market, page intent, content type, channel,
or audience values become `unspecified`. Missing editorial risk, page intent, or content
type makes effective risk `critical`; otherwise applicable risk floors may only raise the
requested risk. Voice leaves are ordered replacements, terminology and Claim membership
uses remove-then-add ID sets, restrictions are additive and scope-filtered, and all final
set-like collections use portable-ID order.

`ResolvedBrandContext` exposes Claims only as `claimId`, `statement`, and `status`. It does
not expose evidence or approval IDs, paths, raw bytes, schema-validator details, stacks, or
free-form metadata. Every successful resolution emits exactly one stable
`HISTORY_UNVERIFIED` warning. The reproducible `stateDigest` covers canonical Brand Memory
and fixed contract/policy framing; request, selected overlays, diagnostics, and evaluation
time are deliberately excluded.

Failures throw `BrandMemoryError`, whose public surface is a closed safe code plus immutable
contract-valid diagnostics. Missing, invalid, unsupported-version, duplicate-ID,
unresolved-reference, resource, boundary, and concurrent-change states fail without a
partial result. CTA IDs, example IDs, and compliance patches remain deferred until typed
catalogs and output fields exist; their presence is rejected rather than ignored.

## Evidence Ledger

Core reads Evidence Records only from direct
`.verbosia/evidence/<evidence-id>.json` files beneath an explicit real project root. A
missing directory is an empty ledger. Layout, I-JSON, envelope, filename/ID, duplicate-ID,
unsupported-major, boundary, mutation, and resource failures are global and fail without
partial state. Schema-invalid payloads, source-digest failures, and invalid supersession
components are quarantined behind opaque safe projections.

```ts
import { evaluateEvidence, loadEvidenceLedger } from '@verbosia/core';

const ledger = await loadEvidenceLedger({ projectRoot: '/real/workspace/root' });
const evaluation = evaluateEvidence({
  ledger,
  context: {
    locale: 'pt-BR',
    market: 'br',
    pageIntent: 'product',
    contentType: 'landing-page',
    channel: 'website',
    audience: 'developers',
    editorialRisk: 'medium',
  },
});

console.log(evaluation.entries);
```

`project_file` locators are hashed from stable raw bytes in the same retryable read attempt
as the ledger. Missing local files, `public_uri` locators, and `record_reference` locators
are unavailable; V1 performs no URI/reference resolution, network, provider, database,
Redis, fallback, migration, cache, or write. Supersession is a
linear successor-to-predecessor history that activates at the successor's `validFrom` and
never redirects a Claim. Evaluation is default-deny with half-open validity, exact record
and permission scopes, direct support role, non-restricted permission, and closed ordered
states/reasons. Restricted sensitivity changes reference exposure only. Public results do
not include canonical records, source locators, excerpts, provenance actors, source bytes,
absolute paths, stacks, secrets, or free-form metadata.

Repository history is separately guarded by `pnpm evidence:add-only:check -- --base <sha>
--head <sha>`. Additions beneath any root or nested `.verbosia/evidence/` pass; modification,
deletion, and rename fail.

[Documentação completa](../../docs/README.md) · MIT
