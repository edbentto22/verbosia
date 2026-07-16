# SEO multilíngue

A tese do Verbosia: **conteúdo traduzido que não ranqueia não vale nada**. Por isso cada locale é uma página estática real — nunca troca de idioma no cliente — e o SEO técnico sai correto por padrão.

## O que é gerado

Por página, por idioma:

- `<html lang="en-US">` — via `htmlLang()` / `verbosiaHead()`
- `<link rel="canonical" href="...">` — por locale (evita duplicate content)
- `<link rel="alternate" hreflang="...">` para **cada** locale + **`x-default`** apontando para o idioma configurado em `seo.xDefault`
- `<meta property="og:locale">` + `og:locale:alternate`
- JSON-LD `WebPage` com `inLanguage`
- `sitemap-i18n.xml` com `xhtml:link` alternates por URL

## Helper de `<head>` (qualquer framework)

```ts
import { buildHeadSeo, resolveConfig } from '@verbosia/core';

const html = buildHeadSeo(
  {
    lang: 'en-US',
    canonical: 'https://site.com/en/blog/post',
    alternates: [
      { lang: 'pt', href: 'https://site.com/blog/post' },
      { lang: 'en-US', href: 'https://site.com/en/blog/post' },
      { lang: 'es-419', href: 'https://site.com/es/blog/post' },
    ],
    xDefault: 'pt',
    title: 'Post',
  },
  config,
);
```

Nos adapters isso vem pronto: `verbosiaHead()` no Astro, filtro `verbosiaHead` no Eleventy, `verbosiaAlternates()` no Next.

## Sitemap com alternates

Com `seo: { sitemap: true }` e `site` informado, os adapters Astro e Eleventy gravam `sitemap-i18n.xml` no fim do build — uma `<url>` por documento por idioma, cada uma com o conjunto completo de alternates:

```xml
<url>
  <loc>https://site.com/en/blog/post</loc>
  <xhtml:link rel="alternate" hreflang="pt" href="https://site.com/blog/post" />
  <xhtml:link rel="alternate" hreflang="en-US" href="https://site.com/en/blog/post" />
  <xhtml:link rel="alternate" hreflang="es-419" href="https://site.com/es/blog/post" />
  <xhtml:link rel="alternate" hreflang="x-default" href="https://site.com/blog/post" />
</url>
```

O padrão de rota default é `/{collection}/{slug}` (origem) e `/{lang}/{collection}/{slug}` (alvos). Se o seu roteamento é outro, passe um `route`:

```ts
translator({
  // ...
  site: 'https://site.com',
  route: ({ lang, isSource, collection, slug }) =>
    isSource ? `/${collection}/${slug}/` : `/${lang}/${collection}/${slug}/`,
});
```

## Slugs localizados

`localizeSlugs: true` gera um slug por idioma derivado do **título traduzido**:

```
pt: /blog/fim-de-semana-chapada
en: /en/blog/a-weekend-in-chapada-diamantina
es: /es/blog/un-fin-de-semana-en-la-chapada
```

O mapa vive em `.verbosia/slugs.json` (comitável) e é **estável**: uma vez registrado, o slug não muda mesmo que o título seja reescrito — links externos e indexação não quebram. O arquivo localizado continua espelhando o caminho da origem; só o `slug` do frontmatter muda (o framework roteia por ele).

Para renomear um slug deliberadamente, edite o `slugs.json` e configure um redirect 301 no seu host.

## Fallback de conteúdo não traduzido

`verbosia status` mostra o que está `missing`. Enquanto uma tradução não existe, a recomendação é **não** publicar a rota do idioma (páginas vazias/duplicadas prejudicam o ranqueamento) — os adapters só constroem o que existe em `outputDir/<lang>/`.

## Checklist do Search Console

1. Cada página localizada responde 200 com conteúdo no idioma certo.
2. `hreflang` é **recíproco** (todas as variantes se referenciam — o Verbosia já gera assim).
3. `x-default` aponta para o idioma principal.
4. Envie o `sitemap-i18n.xml` no Search Console.
