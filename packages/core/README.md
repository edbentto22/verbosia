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

[Documentação completa](../../docs/README.md) · MIT
