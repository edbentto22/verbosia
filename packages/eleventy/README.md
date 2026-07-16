# @verbosia/eleventy

Plugin Eleventy do [Verbosia](https://github.com/edbentto22/verbosia): tradução com IA (BYOK) no `eleventy.before`, Translation Memory e SEO multilíngue.

```bash
pnpm add -D @verbosia/eleventy verbosia && pnpm add @anthropic-ai/sdk
```

```js
// eleventy.config.js
import verbosia from '@verbosia/eleventy';

export default function (eleventyConfig) {
  eleventyConfig.addPlugin(verbosia, {
    source: 'pt',
    targets: ['en', 'es'],
    contentDir: 'content',
    outputDir: 'content',
    site: 'https://site.com',
  });
}
```

Registra: tradução pré-build, filtros `verbosiaHead`/`verbosiaHreflang`, global data `verbosia` e `sitemap-i18n.xml` no `eleventy.after`.

[Guia Eleventy](../../docs/frameworks/eleventy.md) · [Documentação](../../docs/README.md) · MIT
