# @verbosia/core

Engine do [Verbosia](https://github.com/edbentto22/verbosia) — tradução com IA para sites estáticos, agnóstico de framework.

- **Translation Memory** endereçada por conteúdo (`sha256`), em dois níveis: arquivo comitável + Redis compartilhado (com backfill).
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

[Documentação completa](../../docs/README.md) · MIT
