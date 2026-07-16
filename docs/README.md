# Documentação do Verbosia

**Verbosia** traduz sites estáticos com IA (BYOK), memória de tradução persistente e SEO multilíngue correto por padrão.

## Guias

1. **[Início rápido](inicio-rapido.md)** — instalação, primeira tradução, fluxo de trabalho
2. **[Configuração](configuracao.md)** — referência completa do `verbosia.config.mjs`
3. **[Provedores](providers.md)** — Anthropic · OpenAI · Gemini · DeepL
4. **[Translation Memory](translation-memory.md)** — cache-key, dois níveis, Redis, sync e prune
5. **[SEO multilíngue](seo.md)** — hreflang, canonical, sitemap, slugs localizados
6. **[Revisão humana](revisao.md)** — editor local, flag `reviewed`, edições persistentes
7. **[CLI](cli.md)** — todos os comandos

## Por framework

- **[Astro](frameworks/astro.md)** — integração de primeira classe
- **[Eleventy](frameworks/eleventy.md)** — plugin
- **[Next.js](frameworks/nextjs.md)** — helpers do App Router

## Conceitos em 30 segundos

```
conteúdo pt ──▶ discovery ──▶ segmentação (parágrafos) ──▶ masking (protege código/URLs/{vars}/MDX)
                                                              │
                              TM Tier 1 (arquivo comitado) ◀──┤  hit? usa. miss? ↓
                              TM Tier 2 (Redis, opcional)  ◀──┤  hit? usa + backfill. miss? ↓
                              Provider (Claude/GPT/Gemini/DeepL, BYOK)
                                                              │
              arquivos <lang>/... reais e indexáveis ◀── restaura masking + grava na TM
```

- **Nada é traduzido duas vezes** — a chave é `sha256(texto | idioma | modelo | glossário | prompt)`.
- **Páginas reais por idioma** — hreflang/canonical/sitemap corretos, sem troca no cliente.
- **Revisão sobrevive** — edições humanas voltam para a TM.
