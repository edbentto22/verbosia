# Verbosia + Eleventy

Plugin fino sobre o core: tradução no `eleventy.before`, filtros de SEO e sitemap no `eleventy.after`.

## Instalação

```bash
pnpm add -D @verbosia/eleventy verbosia
pnpm add @anthropic-ai/sdk        # SDK do seu provider
```

## Configuração

```js
// eleventy.config.js
import verbosia from '@verbosia/eleventy';

export default function (eleventyConfig) {
  eleventyConfig.addPlugin(verbosia, {
    provider: 'anthropic',
    source: 'pt',
    targets: ['en', 'es'],
    variant: { en: 'en-US', es: 'es-419' },
    contentDir: 'content',        // ajuste à sua estrutura
    outputDir: 'content',
    collections: ['blog'],
    site: 'https://site.com',
  });
}
```

Aceita todas as opções da [Configuração](../configuracao.md) mais `runOnBuild` (default `true`), `site` e `route`.

## O que o plugin registra

| Registro | O quê |
|---|---|
| `eleventy.before` | Roda `translate()` — os arquivos `content/<lang>/...` existem antes do build |
| `eleventy.after` | Grava `sitemap-i18n.xml` no diretório de saída (se `site` e `seo.sitemap`) |
| Filtro `verbosiaHead` | Bloco `<head>` completo (canonical + hreflang + og:locale + JSON-LD) |
| Filtro `verbosiaHreflang` | Só as tags hreflang |
| Global data `verbosia` | `{ source, targets, variant }` para usar em templates |

## Uso nos templates

```njk
{# layout.njk #}
<html lang="{{ lang }}">
<head>
  {{ headInput | verbosiaHead | safe }}
</head>
```

Onde `headInput` é montado no template/data com `lang`, `canonical`, `alternates` e `xDefault` (mesma forma do core — ver [SEO](../seo.md)).

## Fluxo

```bash
verbosia translate    # ou deixe o eleventy.before fazer
npx @11ty/eleventy    # build com TM quente = 0 chamadas
```
