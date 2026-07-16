# Configuração

O Verbosia lê `verbosia.config.mjs` (ou `.js`/`.json`) na raiz do projeto. O arquivo exporta (default) um objeto `VerbosiaUserConfig`. Tudo tem default sensato — só `source` e `targets` são obrigatórios.

## Referência completa

```js
/** @type {import('@verbosia/core').VerbosiaUserConfig} */
export default {
  // ─── Provider ─────────────────────────────────────────────────────────
  provider: 'anthropic',        // 'anthropic' | 'openai' | 'gemini' | 'deepl'
  model: 'claude-sonnet-5',     // default depende do provider (ver docs/providers.md)

  // ─── Idiomas ──────────────────────────────────────────────────────────
  source: 'pt',                 // OBRIGATÓRIO — idioma de origem
  targets: ['en', 'es'],        // OBRIGATÓRIO — idiomas a gerar
  variant: {                    // variante regional por idioma (BCP-47)
    en: 'en-US',                // usada no prompt, no hreflang e no <html lang>
    es: 'es-419',
  },
  tone: 'informal e acolhedor', // tom desejado (vai no prompt; opcional)

  // ─── Conteúdo ─────────────────────────────────────────────────────────
  collections: ['blog', 'pages'],  // pastas sob contentDir; vazio = todas
  contentDir: 'src/content',       // raiz do conteúdo de origem
  outputDir: 'src/content',        // onde gravar <lang>/... (default: igual)
  translateFields: ['title', 'description'],  // frontmatter a traduzir; aceita
                                               // aninhados: 'hero.title',
                                               // 'sections.*.heading'

  // ─── Qualidade ────────────────────────────────────────────────────────
  glossary: ['Chapada Diamantina'],   // termos mantidos idênticos
  doNotTranslate: ['Verbosia'],       // nunca traduzir (ficam na origem)
  segmentation: 'paragraph',          // 'paragraph' (default) | 'document'

  // ─── Slugs localizados ────────────────────────────────────────────────
  localizeSlugs: false,         // true => slug traduzido por idioma,
                                // mapa estável em .verbosia/slugs.json

  // ─── Strings de UI ────────────────────────────────────────────────────
  uiStrings: 'src/i18n/pt.json',  // dicionário JSON de origem; gera
                                   // en.json/es.json ao lado (opcional)

  // ─── Limites operacionais ─────────────────────────────────────────────
  limits: {
    retries: 3,                 // retentativas extras em 429/5xx/rede
                                // (backoff exponencial com jitter)
    concurrency: 4,             // segmentos traduzidos em paralelo
    maxApiCalls: 0,             // teto de chamadas de API por run
                                // (0 = ilimitado; ao exceder, aborta com erro
                                // claro — o que já foi pago fica na TM)
  },

  // ─── Cache / Translation Memory ───────────────────────────────────────
  cache: {
    driver: 'file',             // 'file' | 'redis'
    url: process.env.REDIS_URL, // obrigatório para driver 'redis'
    committed: true,            // mantém o Tier 1 (arquivo) mesmo com Redis
  },

  // ─── SEO ──────────────────────────────────────────────────────────────
  seo: {
    hreflang: true,             // <link rel="alternate" hreflang>
    canonical: true,            // <link rel="canonical">
    sitemap: true,              // sitemap-i18n.xml no build (Astro/Eleventy)
    xDefault: 'pt',             // idioma servido em hreflang="x-default"
  },
};
```

## Campos em detalhe

### `segmentation`

- **`'paragraph'`** (default) — o corpo é dividido em blocos (parágrafos, listas, títulos; blocos de código são atômicos). Cada bloco tem entrada própria na TM: **editar um parágrafo retraduz só ele**. Blocos sem prosa (código puro, URLs) passam direto — zero API.
- **`'document'`** — corpo inteiro como um segmento. Mais simples, mas qualquer edição retraduz o documento todo.

Trocar a granularidade muda as chaves do corpo na TM — a primeira rodada após a troca retraduz os corpos (custo único; frontmatter não é afetado).

### `translateFields`

Só os campos listados são traduzidos. `slug`, `date`, `tags`, `author`, `image` e qualquer outro campo são copiados intactos. O bloco `verbosia:` de rastreio é gerenciado pelo próprio Verbosia.

**Frontmatter aninhado** (páginas institucionais/landing pages): os padrões aceitam dot-notation e o curinga `*` (casa qualquer chave de objeto ou índice de array):

```js
// frontmatter:                          // config:
// hero:                                 translateFields: [
//   title: Transformamos ideias           'title',
//   image: /hero.png                      'hero.title',
// sections:                               'sections.*.heading',
//   - heading: Consultoria                'sections.*.body',
//     body: ...                         ]
//   - heading: Desenvolvimento
```

Cada valor casado vira um segmento próprio na TM (editar um `heading` não retraduz os outros), e o resto da estrutura (`image`, ícones, números) é preservado byte a byte. Só folhas **string** são traduzíveis; chaves com ponto no nome não são endereçáveis. O editor de revisão mostra cada caminho concreto como um campo editável.

### `glossary` vs `doNotTranslate`

Ambos são protegidos, com intenções diferentes: `glossary` são termos de marca/lugares que devem aparecer **idênticos** na tradução; `doNotTranslate` é a lista dura de nunca-traduzir. Os dois entram no hash `glossaryVersion` do cache-key — editar a lista invalida seletivamente as traduções afetadas.

### `variant`

A variante refina o alvo: `en` com `variant: { en: 'en-US' }` pede inglês americano no prompt, emite `hreflang="en-US"` e `<html lang="en-US">`. No DeepL, a variante é mapeada para os alvos suportados (`EN-US`, `PT-BR`, `ES-419`...).

### `limits`

- **`retries`** — todo miss que chega ao provider passa por uma camada uniforme de retry (os 4 providers): backoff exponencial com jitter em rate limit (429/529), erro de servidor (5xx) e falha de rede. Erros de request (400/401) estouram imediatamente — insistir não resolve chave errada.
- **`concurrency`** — quantos segmentos são traduzidos em paralelo (a ordem do documento é preservada na remontagem). Suba para lotes grandes; desça se estiver batendo em rate limit do provider.
- **`maxApiCalls`** — o freio de gasto por run. Ao exceder, o Verbosia aborta com instrução clara; como cada segmento pago já foi gravado na TM, **um re-run continua exatamente de onde parou** (nada é pago duas vezes). `--dry-run` nunca consome orçamento.

### `cache`

Ver [Translation Memory](translation-memory.md). Resumo: `file` é o Tier 1 comitável (sempre recomendado); `redis` adiciona o Tier 2 compartilhado por cima — os dois coexistem quando `committed: true`.

### Variáveis de ambiente

| Variável | Uso |
|---|---|
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` / `DEEPL_API_KEY` | Chave BYOK do provider ativo |
| `REDIS_URL` | Endereço do Tier 2 (ex.: `redis://localhost:6379`) |

O arquivo de config é JavaScript — você pode ler `process.env` para alternar provider/modelo por ambiente:

```js
export default {
  provider: process.env.VERBOSIA_PROVIDER ?? 'anthropic',
  model: process.env.VERBOSIA_MODEL,   // undefined => default do provider
  // ...
};
```
