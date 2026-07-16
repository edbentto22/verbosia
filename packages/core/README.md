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

[Documentação completa](../../docs/README.md) · MIT
