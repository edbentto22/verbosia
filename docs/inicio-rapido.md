# Início rápido

Do zero à primeira tradução em 5 minutos.

## 1. Instale

```bash
pnpm add -D verbosia @verbosia/core
```

Instale o SDK do provider que for usar (peer opcional — só o que você usa entra no `node_modules`):

```bash
pnpm add @anthropic-ai/sdk    # provider: 'anthropic'
pnpm add openai               # provider: 'openai'
pnpm add @google/genai        # provider: 'gemini'
# DeepL usa REST via fetch — não precisa de SDK
```

## 2. Configure a chave (BYOK)

A chave vem **sempre** de variável de ambiente — nunca fica em arquivo comitado, nunca entra no bundle:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
# ou OPENAI_API_KEY / GEMINI_API_KEY / DEEPL_API_KEY
```

Em CI, configure como secret do pipeline.

## 3. Crie o `verbosia.config.mjs`

Na raiz do projeto:

```js
export default {
  provider: 'anthropic',          // 'anthropic' | 'openai' | 'gemini' | 'deepl'
  source: 'pt',                   // idioma de origem
  targets: ['en', 'es'],          // idiomas a gerar
  variant: { en: 'en-US', es: 'es-419' },
  collections: ['blog'],          // pastas de conteúdo (sob src/content)
  glossary: ['Chapada Diamantina'],  // termos que nunca se traduzem
};
```

A config completa está em [Configuração](configuracao.md).

## 4. Traduza

```bash
verbosia translate --dry-run
```

O dry-run mostra o plano — quantos segmentos viriam do cache e quantos chamariam a API — **sem gastar nada**. Quando estiver satisfeito:

```bash
verbosia translate
```

Isso gera:

```
src/content/
├── blog/post.md              # sua origem (pt)
├── en/blog/post.md           # gerado — página real, indexável
├── es/blog/post.md           # gerado
└── .verbosia/tm.json         # Translation Memory — COMITE este arquivo
```

Cada arquivo gerado carrega um bloco de rastreio no frontmatter:

```yaml
verbosia:
  sourceHash: 3d5d1c82a9396292   # detecta quando a origem mudou
  translatedBy: claude-sonnet-5
  translatedAt: '2026-07-16T...'
  reviewed: false                # vira true pelo editor de revisão
  lang: en
```

## 5. Comite a TM e trabalhe normalmente

O `.verbosia/tm.json` é a memória de tradução do projeto — **comite junto com o conteúdo**. A partir daí:

- **Rebuild sem mudanças** → 100% cache, 0 chamadas de API.
- **Editou um parágrafo** → só aquele parágrafo é retraduzido.
- **Post novo** → só ele chama a API.

Confira o estado a qualquer momento:

```bash
verbosia status
#   fresh    blog/post → en
#   stale    blog/post → es     (origem mudou; rode translate)
#   missing  blog/novo → en     (ainda não traduzido)
```

## 6. Revise (opcional, recomendado)

```bash
verbosia review
```

Abre um editor local em `http://127.0.0.1:5199` com origem e tradução lado a lado. Edições são salvas no arquivo **e na TM** — sobrevivem a re-runs do `translate`. Detalhes em [Revisão humana](revisao.md).

## Próximos passos

- Integre ao seu framework: [Astro](frameworks/astro.md) · [Eleventy](frameworks/eleventy.md) · [Next.js](frameworks/nextjs.md)
- Compartilhe a TM entre projetos com Redis: [Translation Memory](translation-memory.md)
- Ative slugs localizados e sitemap: [SEO multilíngue](seo.md)
