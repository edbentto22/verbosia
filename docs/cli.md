# CLI

A CLI `verbosia` opera sobre o `verbosia.config.mjs` do diretório atual. Todos os comandos respeitam BYOK — sem chave no ambiente, os que precisam de API falham com instrução clara antes de qualquer rede.

## `verbosia translate [--dry-run]`

Descobre o conteúdo, resolve cada segmento pela cascata de TM (arquivo → Redis → provider) e grava os arquivos localizados + strings de UI.

```
provider=anthropic model=claude-sonnet-5 source=pt targets=en,es
  ✓ blog/chapada → en (5 hit, 0 API)
  ↻ blog/novo    → en (0 hit, 4 API)

Concluído: 2 docs × 2 idiomas — 10 hits, 8 chamadas de API, 4 arquivos gravados
```

`--dry-run` mostra o plano (hits × chamadas) **sem chamar a API nem escrever** — use para estimar custo antes de rodar.

## `verbosia status`

Estado de cada par documento→idioma:

- **`fresh`** — tradução sincronizada com a origem (via `sourceHash`).
- **`stale`** — a origem mudou depois da tradução.
- **`missing`** — ainda não traduzido.
- **`[não revisado]`** — existe mas ninguém marcou `reviewed`.

Exit code: `0` se tudo fresh; `1` se há stale/missing — útil como gate de CI:

```yaml
# .github/workflows/ci.yml
- run: verbosia status   # falha o build se faltar tradução
```

## `verbosia review [--port 5199]`

Editor local de revisão em `http://127.0.0.1:5199`. Ver [Revisão humana](revisao.md).

## `verbosia prune [--dry-run]`

Remove arquivos localizados órfãos (origem apagada) e entradas de TM sem uso vivo. Agnóstico de modelo (nunca apaga traduções de outro provider); nunca toca o Redis. Ver [Translation Memory](translation-memory.md).

## `verbosia tm:sync`

Sincroniza a TM entre o arquivo comitável e o Redis (união, last-write-wins por timestamp). Requer `cache: { driver: 'redis', url }`.

## Receitas

```bash
# Estimar o custo de um lote novo
verbosia translate --dry-run

# Comparar dois providers no mesmo conteúdo (coexistem na TM)
VERBOSIA_PROVIDER=openai verbosia translate
VERBOSIA_PROVIDER=gemini verbosia translate

# Semear o Redis da agência com um projeto existente
verbosia tm:sync

# Limpeza pós-refatoração de conteúdo
verbosia prune --dry-run && verbosia prune
```

(As receitas com `VERBOSIA_PROVIDER` assumem a config lendo `process.env` — ver [Configuração](configuracao.md).)
