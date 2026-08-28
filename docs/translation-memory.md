# Translation Memory

A TM é o coração do Verbosia: **nada é traduzido duas vezes**. Toda tradução é indexada por um hash do conteúdo de origem — mesmo input, mesmo alvo, mesma configuração → hit → zero API.

## A chave v2

```
contextDigest = sha256(JCS({
  domain, version, sourceLang, targetLang, targetVariant,
  provider, model, tone, glossary, doNotTranslate, promptVersion
}))
sourceDigest = sha256(utf8(sourceText))
key = v2:<contextDigest>:<sourceDigest>
```

Todos os campos usam os valores exatos resolvidos para a requisição. O provider é a
instância que realmente executa a chamada; `targetVariant` e `tone` são `null` quando
ausentes; `glossary` e `doNotTranslate` permanecem separados e na ordem original. Não há
trim, sort, deduplicação, normalização Unicode nem delimitador sentinela. A chave nunca
expõe texto, termos ou configuração: contém apenas dois SHA-256 em hexadecimal minúsculo.

Consequências práticas:

| Você fez... | O que acontece |
|---|---|
| Rebuild sem mudanças | 100% hit — custo zero |
| Editou um parágrafo | Só o hash daquele bloco muda → retraduz só ele |
| Trocou o modelo (`gpt-4o` → `claude-sonnet-5`) | Chaves novas → retraduz, **sem apagar** as antigas (coexistem) |
| Editou ou reordenou glossário/do-not-translate | O contexto exato muda → invalida seletivamente |
| O Verbosia atualizou o template de prompt | `promptVersion` muda → idem |

## Dois níveis

```
Tier 1 (arquivo comitado)  →  Tier 2 (Redis, opcional)  →  Provider (API)
```

### Tier 1 — `file` (sempre recomendado)

`​.verbosia/tm.json` dentro do `outputDir`. JSON determinístico (chaves ordenadas) → diffs limpos em PR. **Comite este arquivo**: é a fonte de verdade do projeto e o que torna o build reproduzível em CI sem chave de API (quando tudo está cacheado).

### Tier 2 — `redis` (TM compartilhada)

Para agências e times com muitos sites: um Redis central reaproveita traduções **entre projetos**.

```js
cache: {
  driver: 'redis',
  url: process.env.REDIS_URL,
  committed: true,   // mantém o Tier 1 — recomendado
}
```

Comportamento da cascata em cada tradução:

- **Hit no Tier 1** → usa direto.
- **Miss no 1, hit no Redis** → usa e faz **backfill** no Tier 1 (o projeto novo nasce pré-populado; o arquivo continua comitável).
- **Miss nos dois** → chama o provider e faz **write-through** nos dois tiers.

Chaves no Redis: `tm:v2:<contextDigest>:<sourceDigest>` → `{ text, model, ts }`.
O namespace é disjunto das entradas v1 compartilhadas.

Subir um Redis local para testar:

```bash
docker run -d --name verbosia-redis -p 6379:6379 redis:7-alpine
export REDIS_URL=redis://localhost:6379
```

## `verbosia tm:sync`

Sincroniza somente chaves v2 entre Tier 1 ↔ Redis. O maior `ts` vence; em empate com
valores divergentes, o Tier 1 comitável vence. Chaves v1/malformadas são ignoradas e
contadas por tier:

```bash
verbosia tm:sync
# TM sincronizada: 6 → Redis, 0 → arquivo (6 no total)
```

Use para: semear o Redis com o histórico de um projeto existente, ou puxar para o arquivo o que outros projetos já traduziram.

## `verbosia prune`

Remove órfãos com segurança:

- **Arquivos localizados** cujo documento de origem foi apagado.
- **Entradas v2 da TM local** cujo `sourceDigest` não corresponde a texto exato vivo,
  incluindo folhas de strings de UI.
- **Entradas v1 ou malformadas locais**, classificadas separadamente.

```bash
verbosia prune --dry-run   # só lista
verbosia prune             # remove
```

Garantias:

- **Agnóstico de contexto** — provider/modelo/variante históricos não tornam uma entrada
  órfã enquanto o texto exato continuar vivo.
- **O Redis nunca é podado** — v1 e chaves malformadas compartilhadas são apenas contadas.

## Migração de v1

Uma chave v1 é um hash isolado com 64 caracteres hexadecimais. Ela não contém contexto
suficiente para provar provider, idioma de origem, variante, tom ou partição dos termos.
Por isso o Verbosia nunca lê, promove, converte ou sincroniza v1 como v2. A primeira
execução v2 pode chamar o provider novamente e grava somente v2; tradução normal preserva
os dados legados. Use `verbosia prune --dry-run` antes da limpeza local. Entradas v1 do
Redis compartilhado não são apagadas automaticamente.

## Segment-level e a TM

Com `segmentation: 'paragraph'` (default), cada bloco do corpo tem entrada própria. Um post de 20 parágrafos com 1 editado = 1 chamada de API. Blocos sem prosa (código, URLs soltas) nem entram na TM — passam direto.

## Revisão humana e a TM

Edições feitas no `verbosia review` são gravadas **de volta na TM** pela chave histórica
registrada no arquivo e pela chave do contexto atual quando derivável, com deduplicação.
Contexto legado ausente nunca é inventado. Por isso a revisão sobrevive a re-runs sem
reaproveitar v1 de forma insegura. Ver [Revisão humana](revisao.md).
