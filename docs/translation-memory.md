# Translation Memory

A TM é o coração do Verbosia: **nada é traduzido duas vezes**. Toda tradução é indexada por um hash do conteúdo de origem — mesmo input, mesmo alvo, mesma configuração → hit → zero API.

## A chave de cache

```
key = sha256(sourceText | targetLang | model | glossaryVersion | promptVersion)
```

Consequências práticas:

| Você fez... | O que acontece |
|---|---|
| Rebuild sem mudanças | 100% hit — custo zero |
| Editou um parágrafo | Só o hash daquele bloco muda → retraduz só ele |
| Trocou o modelo (`gpt-4o` → `claude-sonnet-5`) | Chaves novas → retraduz, **sem apagar** as antigas (coexistem) |
| Editou o glossário | `glossaryVersion` muda → invalida seletivamente |
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

Chaves no Redis: `tm:{sha256}` → `{ text, model, ts }`. Política de conflito: last-write-wins (a chave já isola conteúdo/modelo/glossário, então corridas reescrevem o mesmo valor).

Subir um Redis local para testar:

```bash
docker run -d --name verbosia-redis -p 6379:6379 redis:7-alpine
export REDIS_URL=redis://localhost:6379
```

## `verbosia tm:sync`

Sincroniza Tier 1 ↔ Redis (união dos dois, resolvendo pelo `ts` mais recente):

```bash
verbosia tm:sync
# TM sincronizada: 6 → Redis, 0 → arquivo (6 no total)
```

Use para: semear o Redis com o histórico de um projeto existente, ou puxar para o arquivo o que outros projetos já traduziram.

## `verbosia prune`

Remove órfãos com segurança:

- **Arquivos localizados** cujo documento de origem foi apagado.
- **Entradas de TM** (só do Tier 1) que não correspondem a nenhum texto de origem vivo.

```bash
verbosia prune --dry-run   # só lista
verbosia prune             # remove
```

Garantias:

- **Agnóstico de modelo** — o prune considera todos os modelos presentes na TM; rodar sob um provider nunca apaga traduções de outro.
- **O Redis nunca é podado** — outros projetos podem depender dele.

## Segment-level e a TM

Com `segmentation: 'paragraph'` (default), cada bloco do corpo tem entrada própria. Um post de 20 parágrafos com 1 editado = 1 chamada de API. Blocos sem prosa (código, URLs soltas) nem entram na TM — passam direto.

## Revisão humana e a TM

Edições feitas no `verbosia review` são gravadas **de volta na TM** (sob o modelo que traduziu o arquivo e o modelo configurado) — por isso sobrevivem a qualquer re-run. Ver [Revisão humana](revisao.md).
