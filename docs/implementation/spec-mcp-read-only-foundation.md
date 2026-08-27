---
title: 'MCP local somente-leitura para inspeção e planejamento'
type: 'feature'
created: '2026-08-27'
status: 'done'
baseline_commit: '20a26db57dddcb4491815e3c81dae657d62b7fc9'
context:
  - '{project-root}/docs/briefs/brief-verbosia-mcp-2026-08-27/brief.md'
  - '{project-root}/docs/implementation-readiness-report-2026-08-27.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Agentes não possuem uma interface MCP segura e estruturada para conhecer o estado multilíngue de um projeto Verbosia ou estimar traduções sem executar comandos, escrever arquivos ou acessar provedores.

**Approach:** Criar `@verbosia/mcp`, servidor local MCP v2 por `stdio`, configurado com uma raiz explícita. A primeira entrega expõe apenas `verbosia.inspect_project` e `verbosia.plan_localization`, reutilizando o core e consultando exclusivamente a TM local.

## Boundaries & Constraints

**Always:** exigir `--root`; resolver a raiz real; rejeitar config, `contentDir` ou `outputDir` fora dela, inclusive escapes por symlink existentes; usar Node 20+ e o SDK estável `@modelcontextprotocol/server` v2; retornar texto e `structuredContent` equivalentes; usar códigos de erro estáveis; escrever logs somente em `stderr`; garantir que os tools não escrevam, não chamem provedores e não acessem Redis/rede.

**Ask First:** qualquer alteração sem compatibilidade no comportamento da CLI atual; inclusão de transporte HTTP, autenticação, write tools, prompts/resources MCP, SEO/GEO ou novas configurações públicas; mudança do requisito de raiz explícita.

**Never:** traduzir ou publicar conteúdo; fazer backfill/prune/sync da TM; carregar conteúdo fora da raiz; aceitar raiz implícita pelo CWD; adicionar WordPress/CMS; apresentar o plano como garantia de custo, ranking ou publicação.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Status válido | raiz com config e conteúdo | `verbosia.inspect_project` retorna config resumida, linhas e totais | N/A |
| Plano válido | TM local completa ou parcial | `verbosia.plan_localization` retorna progresso por documento/locale, hits e chamadas estimadas | N/A |
| Config ausente | raiz válida sem `verbosia.config.*` | nenhum tool executa análise | erro `CONFIG_NOT_FOUND` sem stack/segredo |
| Escape de raiz | config resolve conteúdo/saída fora da raiz ou symlink existente escapa | servidor rejeita o projeto | erro `ROOT_BOUNDARY_VIOLATION` |
| Entrada inválida | argumentos extras em tool sem parâmetros | chamada rejeitada pelo schema | erro de validação MCP |
| Cache Redis configurado | config contém Redis e credenciais | plano ignora Redis e usa apenas TM em arquivo | nenhuma conexão ou backfill |

</frozen-after-approval>

## Code Map

- `packages/core/src/project-config.ts` — carregamento compartilhado de config e validação da raiz autorizada.
- `packages/core/src/translation-plan.ts` — planejamento read-only com TM local e provider sentinela.
- `packages/core/src/index.ts` — exports públicos para CLI e MCP.
- `packages/cli/src/config-loader.ts` — delegação compatível ao loader compartilhado.
- `packages/mcp/src/service.ts` — serviço testável e schemas de resultados.
- `packages/mcp/src/server.ts` — registro dos dois tools e conversão de erros.
- `packages/mcp/src/args.ts` — validação isolada da raiz explícita.
- `packages/mcp/src/stdio.ts` — entrada executável, parsing de `--root` e `serveStdio`.
- `packages/mcp/test/` — raiz/config, ausência de efeitos, outputs e smoke MCP.
- `packages/mcp/package.json` — pacote ESM, binário, Node 20 e dependências MCP v2/Zod.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/project-config.ts`, `packages/cli/src/config-loader.ts` — centralizar config com guardas de raiz preservando a API da CLI.
- [x] `packages/core/src/translation-plan.ts` — criar planejamento que lê somente a TM em arquivo e nunca instancia/acessa Redis ou provider real.
- [x] `packages/mcp/` — criar package, serviço, servidor `stdio`, binário, README e licença seguindo os padrões do monorepo.
- [x] `packages/mcp/test/` — cobrir toda a matriz de I/O, equivalência text/structuredContent e prova de zero escrita/rede/provider.
- [x] `README.md`, `pnpm-lock.yaml` — documentar instalação/configuração local e registrar dependências reproduzíveis.

**Acceptance Criteria:**
- Given o exemplo `examples/blog-pt`, when um host chama os dois tools, then recebe resultados estruturados determinísticos sem alteração no Git ou filesystem observado.
- Given uma config com Redis, when `verbosia.plan_localization` roda, then nenhum cliente Redis é criado e somente a TM local influencia hits.
- Given caminhos externos ou symlinks de escape, when o projeto é carregado, then a execução falha antes de descobrir conteúdo.
- Given a CLI existente, when build, typecheck, testes e smoke offline rodam, then o comportamento anterior permanece compatível.
- Given o binário sem `--root`, when iniciado, then encerra com mensagem acionável em `stderr` e código diferente de zero.

## Design Notes

`verbosia.plan_localization` não deve chamar `translate({ dryRun: true })` com a cascata padrão: um hit Redis pode fazer backfill no arquivo. O core deve injetar somente `FileCacheDriver` e um provider sentinela que falha caso seja chamado. A factory MCP usa `serveStdio` para negociação moderna/legada; `stdout` fica reservado ao protocolo.

## Verification

**Commands:**
- `pnpm build` — todos os seis pacotes compilam na ordem do workspace.
- `pnpm typecheck` — TypeScript estrito sem erros.
- `pnpm test` — regressão existente e novos cenários aprovados.
- `git diff --check` — sem erros de whitespace.

**Resultado da implementação e revisão (2026-08-27):** build e typecheck dos seis pacotes aprovados; 105/105 testes aprovados, incluindo negociação pelo processo `stdio` real; smoke da CLI existente aprovado; pacote gerado com `dist` e binário executável; binário sem `--root` encerra com código 1 e `PROJECT_ROOT_REQUIRED`.

## Suggested Review Order

**Entrada e boundary local**

- Inicializa stdio sem permitir que logs de config contaminem o protocolo.
  [`stdio.ts:18`](../../packages/mcp/src/stdio.ts#L18)

- Revalida cada caminho derivado imediatamente antes das leituras autorizadas.
  [`service.ts:39`](../../packages/mcp/src/service.ts#L39)

- Centraliza resolução real, erros estáveis e política estrita opcional.
  [`project-config.ts:65`](../../packages/core/src/project-config.ts#L65)

**Planejamento e contrato MCP**

- Planeja somente com TM em arquivo e provider sentinela.
  [`translation-plan.ts:32`](../../packages/core/src/translation-plan.ts#L32)

- Expõe dois tools namespaced com schemas e erros sanitizados equivalentes.
  [`server.ts:90`](../../packages/mcp/src/server.ts#L90)

- Preserva a semântica legada da CLI fora da boundary MCP.
  [`config-loader.ts:8`](../../packages/cli/src/config-loader.ts#L8)

**Provas e distribuição**

- Negocia MCP pelo binário real e verifica stdout limpo.
  [`stdio.test.ts:26`](../../packages/mcp/test/stdio.test.ts#L26)

- Cobre escapes aninhados de TM e conteúdo localizado.
  [`service.test.ts:106`](../../packages/mcp/test/service.test.ts#L106)

- Prova determinismo e ausência de mutações no exemplo.
  [`protocol.test.ts:99`](../../packages/mcp/test/protocol.test.ts#L99)

- Garante build de `dist` antes do empacotamento público.
  [`package.json:23`](../../packages/mcp/package.json#L23)

- Registra Signals e as quatro memórias como evolução, sem ampliar este runtime.
  [`addendum.md:87`](../briefs/brief-verbosia-mcp-2026-08-27/addendum.md#L87)
