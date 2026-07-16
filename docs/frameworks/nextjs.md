# Verbosia + Next.js (App Router)

No Next, a tradução roda **fora** do build (via CLI no `prebuild`) e o pacote `@verbosia/next` fornece os helpers de SEO para o Metadata API.

## Instalação

```bash
pnpm add -D verbosia
pnpm add @verbosia/next @anthropic-ai/sdk
```

## Tradução no prebuild

```json
// package.json
{
  "scripts": {
    "prebuild": "verbosia translate",
    "build": "next build"
  }
}
```

Com a TM comitada, o `prebuild` em CI custa zero quando nada mudou. Alternativa programática:

```ts
import { verbosiaTranslate } from '@verbosia/next';
await verbosiaTranslate(verbosiaConfig);
```

## SEO com o Metadata API

`verbosiaAlternates()` monta o objeto `alternates` (canonical + hreflang languages map + x-default):

```ts
// app/[lang]/blog/[slug]/page.tsx
import type { Metadata } from 'next';
import { verbosiaAlternates } from '@verbosia/next';
import { verbosiaConfig } from '@/verbosia.shared';

export async function generateMetadata({ params }): Promise<Metadata> {
  const { lang, slug } = await params;
  return {
    title: post.title,
    alternates: verbosiaAlternates(
      {
        lang,
        path: `/${lang}/blog/${slug}`,
        localizedPaths: {
          pt: `/blog/${slug}`,
          en: `/en/blog/${slug}`,
          es: `/es/blog/${slug}`,
        },
      },
      verbosiaConfig,
      'https://site.com',
    ),
  };
}
```

Saída (o Next renderiza como `<link rel="canonical">` e `<link rel="alternate" hreflang>`):

```ts
{
  canonical: 'https://site.com/en/blog/post',
  languages: {
    'pt': 'https://site.com/blog/post',
    'en-US': 'https://site.com/en/blog/post',
    'es-419': 'https://site.com/es/blog/post',
    'x-default': 'https://site.com/blog/post',
  },
}
```

As variantes (`en-US`, `es-419`) vêm da sua config — mantenha um módulo compartilhado (`verbosia.shared.ts`) exportando o mesmo objeto usado no `verbosia.config.mjs`.

## Sitemap

Gere no prebuild com o core:

```ts
// scripts/sitemap.mjs
import { writeFile } from 'node:fs/promises';
import { buildSitemapXml, resolveConfig } from '@verbosia/next';
import config from '../verbosia.config.mjs';

const xml = await buildSitemapXml(resolveConfig(config), 'https://site.com');
await writeFile('public/sitemap-i18n.xml', xml);
```

## Conteúdo

Os arquivos localizados vivem em `contentDir/<lang>/...` — consuma com o que você já usa (leitura direta, contentlayer, MDX). O frontmatter carrega `verbosia.lang`, `verbosia.reviewed` etc. para filtros e gates de publicação.
