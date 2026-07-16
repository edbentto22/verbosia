# @verbosia/next

Helpers Next.js (App Router) do [Verbosia](https://github.com/edbentto22/verbosia). A tradução roda no `prebuild` via CLI; este pacote cobre o SEO no Metadata API.

```bash
pnpm add @verbosia/next && pnpm add -D verbosia
```

```json
{ "scripts": { "prebuild": "verbosia translate" } }
```

```ts
import { verbosiaAlternates } from '@verbosia/next';

export async function generateMetadata(): Promise<Metadata> {
  return {
    alternates: verbosiaAlternates(
      { lang: 'en', path: '/en/blog/post', localizedPaths: { pt: '/blog/post', en: '/en/blog/post' } },
      verbosiaConfig,
      'https://site.com',
    ),
    // => { canonical, languages: { pt, 'en-US', 'x-default' } }
  };
}
```

Também exporta `verbosiaTranslate()` (tradução programática) e `buildSitemapXml()`.

[Guia Next.js](../../docs/frameworks/nextjs.md) · [Documentação](../../docs/README.md) · MIT
