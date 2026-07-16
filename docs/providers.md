# Provedores

Quatro provedores, uma interface. Todos são **BYOK** (a chave vem de variável de ambiente, nunca do pacote) e todos passam pelo mesmo pipeline de masking, glossário e TM — trocar de provider é trocar uma linha de config.

| provider | env var | modelo default | SDK (peer opcional) |
|---|---|---|---|
| `anthropic` | `ANTHROPIC_API_KEY` | `claude-sonnet-5` | `@anthropic-ai/sdk` |
| `openai` | `OPENAI_API_KEY` | `gpt-4o` | `openai` |
| `gemini` | `GEMINI_API_KEY` (ou `GOOGLE_API_KEY`) | `gemini-2.0-flash` | `@google/genai` |
| `deepl` | `DEEPL_API_KEY` (ou `DEEPL_AUTH_KEY`) | — | nenhum (REST via fetch) |

Os SDKs são *peer dependencies* opcionais com import sob demanda: instale só o do provider que usar. Sem a chave, o Verbosia falha com uma mensagem clara **antes** de qualquer chamada de rede.

**Resiliência e custo** (uniforme para os 4): toda chamada passa por retry com backoff exponencial em 429/5xx/rede (`limits.retries`, default 3), roda com concorrência controlada (`limits.concurrency`, default 4) e respeita o teto de gasto por run (`limits.maxApiCalls`) — ver [Configuração](configuracao.md#limits).

## Como a qualidade é controlada (LLMs)

Para Anthropic, OpenAI e Gemini, o system prompt é compartilhado e parametrizado por:

- **idioma-alvo + variante** (`en-US`, `es-419`, `pt-PT`...)
- **tom** (`tone` na config)
- **glossário** (termos mantidos idênticos) e **do-not-translate**
- regras de preservação de Markdown/MDX e dos tokens de masking `⟦VERBOSIA_N⟧`

O texto enviado ao modelo já vai **mascarado** — código, URLs, variáveis `{x}` e tags MDX viram tokens opacos e são restaurados na volta. Se o modelo corromper qualquer token, a tradução daquele segmento é descartada e o erro é reportado (a estrutura nunca quebra silenciosamente).

### Anthropic

Usa a Messages API com `thinking` desligado (tradução não precisa de raciocínio longo — menos latência e custo) e **prompt caching** no bloco de instruções+glossário: em lotes grandes, o prefixo estável é cobrado a ~10% do preço.

### OpenAI

Chat Completions com `temperature: 0` (tradução determinística). Modelos de raciocínio (série o*/gpt-5) rejeitam esses parâmetros — o provider detecta e repete a chamada sem eles. Aceita `baseURL` para endpoints compatíveis (Azure OpenAI, OpenRouter):

```ts
import { OpenAIProvider } from '@verbosia/core';
new OpenAIProvider({ baseURL: 'https://openrouter.ai/api/v1' });
```

### Gemini

`generateContent` com o prompt em `systemInstruction` e `temperature: 0`. Se a resposta for bloqueada por filtro, o erro reporta o `finishReason`/`blockReason`.

### DeepL

Não é LLM — não aceita prompt. A proteção estrutural usa o mecanismo nativo da API: `tag_handling: 'xml'`, com tokens virando `<x id="N"/>` e termos de glossário envolvidos em `<keep>` (via `ignore_tags`). Detalhes:

- **Free vs Pro**: detectado pela chave (free termina em `:fx`) — o host certo é escolhido automaticamente.
- **Variantes**: mapeadas para os alvos do DeepL (`en`→`EN-US`, `pt`→`PT-BR`, `es-419` nativo). Variante sem suporte cai para a base (`es-AR`→`ES`); idioma sem suporte falha com erro claro.
- `tone` é ignorado (a API não suporta).

## Comparando provedores no mesmo projeto

O `model` faz parte da chave da TM — **modelos diferentes coexistem sem conflito**. Para comparar:

```bash
VERBOSIA_PROVIDER=openai verbosia translate
VERBOSIA_PROVIDER=gemini verbosia translate    # não sobrescreve o do openai
```

(assumindo a config lendo `process.env.VERBOSIA_PROVIDER` — ver [Configuração](configuracao.md)). O `verbosia prune` é agnóstico de modelo: nunca apaga as traduções de um provider por você estar rodando outro.

## Dica de escolha

- **Conteúdo com nuance técnica ou de marca** — LLMs levam vantagem (glossário + tom + contexto). Em nossos testes, o `claude-sonnet-5` acerta melhor nuances como "rode `npm run book`" (verbo de executar comando, não de telefonar).
- **Volume alto e texto direto** — DeepL é rápido, barato e não tem risco de "criatividade".
- **Na dúvida** — traduza com dois providers (a TM guarda os dois), compare no `verbosia review` e fique com o melhor.
