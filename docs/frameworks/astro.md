# Verbosia + Astro

O adapter Astro é a integração de primeira classe: tradução no build, SEO no `<head>` e sitemap — com a TM garantindo que rebuilds custem zero.

## Instalação

```bash
pnpm add -D @verbosia/astro verbosia
pnpm add @anthropic-ai/sdk        # SDK do seu provider
```

## Configuração

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import translator from '@verbosia/astro';

export default defineConfig({
  site: 'https://site.com',
  integrations: [
    translator({
      provider: 'anthropic',
      source: 'pt',
      targets: ['en', 'es'],
      variant: { en: 'en-US', es: 'es-419' },
      collections: ['blog'],
      glossary: ['Sua Marca'],
      site: 'https://site.com',   // para canonical/hreflang/sitemap absolutos
    }),
  ],
});
```

Aceita todas as opções do `verbosia.config.mjs` ([Configuração](../configuracao.md)) mais:

| Opção | Default | Efeito |
|---|---|---|
| `runOnBuild` | `true` | Traduz no `astro:build:start` |
| `site` | — | Base das URLs absolutas (obrigatório p/ sitemap) |
| `route` | `/{lang}/{collection}/{slug}` | Padrão de rota do sitemap |

## O que acontece no build

1. **`astro:build:start`** — roda `translate()`: os arquivos `src/content/<lang>/...` são gerados/atualizados antes de o Astro construir as rotas. Com TM quente: `0 chamadas de API`.
2. **`astro:build:done`** — grava `dist/sitemap-i18n.xml` com alternates por locale (se `seo.sitemap` e `site`).

**Em `astro dev` a tradução não roda** (para não gastar API a cada reload) — use `verbosia translate` no terminal enquanto escreve.

## Roteando as coleções localizadas

Os arquivos gerados vivem nas mesmas coleções (`src/content/en/blog/...`). Um padrão comum com content collections:

```ts
// src/pages/[...lang]/blog/[slug].astro
export async function getStaticPaths() {
  const posts = await getCollection('blog');       // origem (pt)
  const en = await getCollection('en/blog');        // geradas
  // monte os paths por idioma usando o slug do frontmatter
}
```

## SEO no `<head>`

```astro
---
import { verbosiaHead } from '@verbosia/astro';

const head = verbosiaHead(
  {
    lang: 'en',
    path: '/en/blog/meu-post',
    localizedPaths: { pt: '/blog/meu-post', en: '/en/blog/meu-post', es: '/es/blog/mi-post' },
    title: post.data.title,
    description: post.data.description,
  },
  verbosiaConfig,        // o mesmo objeto de config
  'https://site.com',
);
---
<html lang={head.htmlLang}>
  <head>
    <Fragment set:html={head.tags} />
  </head>
</html>
```

Gera canonical, hreflang (+x-default), og:locale e JSON-LD `inLanguage` de uma vez.

## Fluxo recomendado

```bash
verbosia translate --dry-run   # estima custo
verbosia translate             # gera conteúdo + TM (comite os dois)
verbosia review                # revisão humana
astro build                    # build com 0 chamadas (tudo na TM)
```
