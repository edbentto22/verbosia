<p align="center">
  <img src="/verbosia-cover.png" alt="Verbosia — tradução com IA para sites estáticos" />
</p>


# Verbosia

**Tradução com IA para sites estáticos — Astro-first, com Translation Memory e SEO de primeira classe.**

Verbosia traduz o conteúdo do seu site **uma única vez**, guarda cada tradução numa **memória de tradução** (cache endereçado por conteúdo, comitável no repo) e gera **páginas localizadas reais e indexáveis**. A qualidade vem de LLMs com **a sua própria chave de API (BYOK)**; o custo tende a zero porque nada é retraduzido sem necessidade.

```
Editou 1 parágrafo?  →  retraduz SÓ aquele parágrafo.
Rebuild sem mudanças?  →  100% cache, 0 chamadas de API.
```

## Por que Verbosia

- **Translation Memory em dois níveis** — arquivo comitável no repo (revisável em PR) + Redis opcional compartilhado entre projetos. Hit no Redis pré-popula o projeto novo automaticamente.
- **Segment-level** — o corpo é traduzido parágrafo a parágrafo; editar um não invalida os outros. Blocos de código passam direto, sem custo e sem risco.
- **Masking estrutural** — código, URLs, variáveis `{x}` e componentes MDX são protegidos por tokens antes da tradução e restaurados depois. Se o modelo corromper um token, a tradução é descartada (fail-safe).
- **4 provedores, 1 interface** — Anthropic, OpenAI, Gemini e DeepL. Modelos diferentes convivem na mesma TM.
- **SEO por padrão** — páginas estáticas reais por idioma, `hreflang` + `x-default`, `canonical`, `og:locale`, JSON-LD `inLanguage`, sitemap com alternates, slugs localizados com mapa estável.
- **Revisão humana de verdade** — `verbosia review` abre um editor local; edições **voltam para a TM** e sobrevivem a re-runs.
- **BYOK** — a chave vem de variável de ambiente. Nunca entra no bundle, nunca vai ao cliente.

## Pacotes

| Pacote | O quê |
|---|---|
| [`@verbosia/core`](packages/core) | Engine agnóstico de framework: discovery, segmentação, masking, TM, providers, SEO, revisão |
| [`@verbosia/astro`](packages/astro) | Integração Astro: tradução no build, `<head>` SEO, `sitemap-i18n.xml` |
| [`@verbosia/eleventy`](packages/eleventy) | Plugin Eleventy: tradução no `eleventy.before`, filtros de SEO, sitemap |
| [`@verbosia/next`](packages/next) | Helpers Next.js (App Router): `verbosiaAlternates` para o Metadata API |
| [`verbosia`](packages/cli) | CLI: `translate` · `status` · `prune` · `tm:sync` · `review` |

## Início rápido

```bash
pnpm add -D verbosia @verbosia/core
pnpm add @anthropic-ai/sdk               # ou openai / @google/genai (DeepL não precisa de SDK)
export ANTHROPIC_API_KEY=sk-ant-...      # BYOK
```

```js
// verbosia.config.mjs
export default {
  provider: 'anthropic',
  source: 'pt',
  targets: ['en', 'es'],
  variant: { en: 'en-US', es: 'es-419' },
  collections: ['blog'],
  glossary: ['Nomes De Marca Que Não Se Traduzem'],
};
```

```bash
verbosia translate --dry-run   # planeja sem gastar API
verbosia translate             # traduz e grava src/content/<lang>/...
verbosia status                # fresh / stale / missing por documento
verbosia review                # editor de revisão em http://127.0.0.1:5199
```

## Documentação

| Guia | Conteúdo |
|---|---|
| [Início rápido](docs/inicio-rapido.md) | Instalação, primeira tradução, fluxo de trabalho |
| [Configuração](docs/configuracao.md) | Referência completa do `verbosia.config.mjs` |
| [Provedores](docs/providers.md) | Anthropic, OpenAI, Gemini, DeepL — chaves, modelos, qualidade |
| [Translation Memory](docs/translation-memory.md) | Cache-key, dois níveis, Redis, `tm:sync`, `prune` |
| [SEO multilíngue](docs/seo.md) | hreflang, canonical, sitemap, slugs localizados |
| [Revisão humana](docs/revisao.md) | Editor, flag `reviewed`, edições que sobrevivem |
| [CLI](docs/cli.md) | Todos os comandos e flags |
| [Astro](docs/frameworks/astro.md) · [Eleventy](docs/frameworks/eleventy.md) · [Next.js](docs/frameworks/nextjs.md) | Guias por framework |

Exemplo funcional em [`examples/blog-pt`](examples/blog-pt).

## Desenvolvimento

```bash
pnpm install && pnpm test && pnpm build
```

## Segurança & compliance

- **BYOK por env var** — a chave nunca entra no bundle nem no cliente.
- **Só chave de API** — sem OAuth de assinatura (Pro/Max/ChatGPT), conforme os ToS dos provedores.
- O editor de revisão escuta apenas em `127.0.0.1`.
- Sem PII em logs; a TM é tratada como dado do projeto.

## Licença

MIT.
