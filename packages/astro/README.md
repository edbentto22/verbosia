# @verbosia/astro

Integração Astro do [Verbosia](https://github.com/edbentto22/verbosia): traduza seu conteúdo com IA (BYOK) no build, com Translation Memory (custo → zero em rebuilds) e SEO multilíngue correto por padrão.

```bash
pnpm add -D @verbosia/astro verbosia && pnpm add @anthropic-ai/sdk
export ANTHROPIC_API_KEY=sk-ant-...
```

```js
// astro.config.mjs
import translator from '@verbosia/astro';

export default defineConfig({
  site: 'https://site.com',
  integrations: [
    translator({
      source: 'pt',
      targets: ['en', 'es'],
      variant: { en: 'en-US', es: 'es-419' },
      collections: ['blog'],
      site: 'https://site.com',
    }),
  ],
});
```

- **`astro:build:start`** — traduz o que mudou (TM: nada é retraduzido sem necessidade).
- **`astro:build:done`** — gera `sitemap-i18n.xml` com hreflang alternates.
- **`verbosiaHead()`** — canonical + hreflang + og:locale + JSON-LD para o `<head>` de cada página.

[Guia Astro](../../docs/frameworks/astro.md) · [Documentação](../../docs/README.md) · MIT
