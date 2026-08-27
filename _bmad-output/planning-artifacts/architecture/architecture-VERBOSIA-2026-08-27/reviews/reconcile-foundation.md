# Reconciliação com a fundação MCP/Core

**Artefato revisado:** `ARCHITECTURE-SPINE.md`

**Baseline confrontado:** `docs/implementation/spec-mcp-read-only-foundation.md`, commit `db9d19e` e código brownfield atual em `packages/core` e `packages/mcp`
**Veredito:** **CHANGES REQUIRED antes da implementação.** A direção é compatível com a fundação, mas três ambiguidades podem quebrar compatibilidade/distribuição e outras quatro precisam virar regras executáveis.

## Findings

### F1 — BLOCKER — “Duas tools” pode remover a API já entregue

AD-11 diz limitar a superfície MCP V1 a `verbosia.inspect_brand_context` e `verbosia.validate_claims`. A fundação já publica `verbosia.inspect_project` e `verbosia.plan_localization`, e os testes de protocolo/stdio verificam esses nomes. Interpretar AD-11 como superfície total removeria tools públicas e violaria a compatibilidade brownfield.

**Correção necessária:** declarar **duas novas tools**, preservando as duas existentes (quatro no total), seus nomes, semântica, outputs e erros. A versão de contrato nova não deve ser injetada retroativamente nos outputs antigos sem uma decisão explícita de compatibilidade. Atualizar testes para exigir o conjunto aditivo.

### F2 — BLOCKER — Schemas fora do artefato publicado

A estrutura propõe `packages/core/schemas/*.json`, mas o `tsconfig` do Core inclui apenas `src`, o build é somente `tsc`, e `packages/core/package.json` publica apenas `dist`, `README.md` e `LICENSE`. Assim, os contratos portáveis não entrarão no pacote npm nem terão um subpath exportável.

**Correção necessária:** escolher e registrar o mecanismo de distribuição: copiar schemas para `dist` no build e exportar subpaths estáveis, ou incluir `schemas` em `files`/`exports`. O `prepack` e um teste sobre o tarball devem provar a presença e a resolução dos dois schemas.

### F3 — BLOCKER — Determinismo contradiz validade dependente do relógio

AD-10 recalcula validade a cada execução, enquanto o envelope promete o mesmo output para os mesmos arquivos, contexto e versão. Sem um instante de avaliação explícito, o mesmo input muda ao atravessar uma expiração. O digest também não especifica se incorpora esse instante e todas as evidências que afetaram a decisão.

**Correção necessária:** tornar `asOf`/`evaluationTime` parte explícita do contexto determinístico (com relógio injetável no Core), incluí-lo no output e na definição do digest. O MCP pode aplicar um default documentado, mas testes e reprodução devem fornecer/fixar o instante.

### F4 — HIGH — Local canônico `.verbosia` está ambíguo no brownfield

O spine mostra `<projectRoot>/.verbosia/...`; o código atual usa `cacheDirFor(config) = <outputDir>/.verbosia` para TM/slugs. Reutilizar `cacheDirFor` colocaria Brand Memory/Evidence Ledger em outro local quando `outputDir` não é a raiz, contrariando AD-4 e podendo misturar ciclos de vida que AD-2 separa.

**Correção necessária:** declarar inequivocamente se o novo estado vive em `join(projectRoot, '.verbosia', ...)` ou sob `outputDir`. Se a intenção é a raiz do projeto, criar um resolver próprio; não reutilizar `cacheDirFor`. Documentar que TM continua no caminho legado.

### F5 — HIGH — Ausência/invalidade da nova memória não pode derrubar as tools legadas

O servidor atual carrega apenas a config ao iniciar e depois atende as duas tools existentes. Se o novo loader for executado no construtor/factory e `brand-memory.json` ausente ou inválido falhar a inicialização, projetos antigos deixarão de usar `inspect_project` e `plan_localization`.

**Correção necessária:** carregar/validar Brand Memory e Ledger sob demanda apenas nas duas novas operações. Definir `BRAND_MEMORY_NOT_FOUND` (ou equivalente) como erro da nova capability; manter as tools legadas funcionais e inalteradas.

### F6 — HIGH — A regra de boundary precisa ser aplicada a cada arquivo real

AD-1/Envelope herdam corretamente raiz explícita e proteção contra symlink, mas a implementação atual demonstra o padrão concreto: caminho derivado é revalidado imediatamente antes da leitura. Um ledger por diretório adiciona enumeração, arquivos individuais e locators internos; validar apenas o diretório não protege cada entrada de symlink ou troca de alvo.

**Correção necessária:** usar `assertWithinProjectRoot` no diretório e em **cada** Brand Memory, evidence record e artefato referenciado imediatamente antes da leitura. Adicionar regressões para symlink no diretório, em um arquivo de evidência e em locator interno, além de provar zero escrita/rede/provider/Redis.

### F7 — HIGH — “Sem rede/escrita” precisa reconhecer a config JS como trust boundary

O loader brownfield importa `verbosia.config.mjs/js`; esse módulo é código do projeto e pode produzir efeitos, inclusive o teste stdio comprova execução de `console.log`. Logo, “V1 não usa rede/escrita” é verdadeiro para código Verbosia das tools, mas não é uma garantia sandbox contra efeitos do módulo de configuração fornecido pelo projeto.

**Correção necessária:** qualificar a garantia como “nenhum código first-party de análise inicia rede/escrita/provider/Redis” e declarar config JS como código local confiável; ou, se isolamento forte for requisito, restringir as novas operações a config JSON/manifesto declarativo em uma iniciativa própria.

### F8 — MEDIUM — Diagnósticos de domínio não cabem no mapper atual

`errorResult` só reconhece `ProjectConfigError`; qualquer outra falha vira `ANALYSIS_FAILED`. Isso perderia os códigos, severidade, caminho relativo, JSON Pointer e remediação exigidos por AD-15.

**Correção necessária:** introduzir erros/diagnósticos de domínio discriminados e um mapper MCP sanitizado, sem stack, paths absolutos, segredos ou trechos restritos. Não ampliar mensagens de `ProjectConfigError` existentes.

### F9 — MEDIUM — Canonicalização precisa ser portátil e não herdar ordenação do host

A descrição do digest ainda não define canonicalização numérica/Unicode nem ordenação binária. O brownfield já registra `localeCompare()` dependente do host em `docs/implementation/deferred-work.md`.

**Correção necessária:** adotar uma canonicalização completamente especificada ou definir bytes/test vectors equivalentes para Node e PHP, usando comparação ordinal explícita. Não usar `localeCompare()` no novo domínio. Especificar exatamente quais entradas, evidências, schema/contract version e `asOf` entram no digest.

### F10 — MEDIUM — Compatibilidade de runtime do Core está subespecificada

O Core publicado declara Node `>=18`, embora o MCP declare Node `>=20`. O deferred da biblioteca JSON Schema exige apenas prova de Node 20; colocar uma dependência Node-20-only no Core quebraria consumidores atuais.

**Correção necessária:** exigir que a biblioteca escolhida suporte ESM **e Node 18** enquanto o engine do Core permanecer `>=18`, ou tratar o aumento do engine como mudança incompatível separada. As versões listadas de pnpm, TypeScript, MCP SDK e Zod conferem com o lockfile.

### F11 — LOW — Paths de módulos são conceituais, não exports reais

O mapa cita `@verbosia/core/brand-memory`, `@verbosia/core/claim-policy` etc., mas o pacote exporta somente `@verbosia/core` (`"."`).

**Correção necessária:** esclarecer que são diretórios internos importados pelo `src/index.ts`, ou adicionar subpath exports e testes de pacote. Não deixar implementadores criarem imports que o pacote publicado não resolve.

## Compatibilidades confirmadas

- O uso de `@verbosia/core` para política e `@verbosia/mcp` como adapter fino coincide com o desenho existente.
- Namespacing `verbosia.snake_case`, `stdio`, Node 20+ no MCP, SDK `@modelcontextprotocol/server@2.0.0` e Zod v4 na boundary conferem com código/lockfile.
- Read-only, raiz explícita, `stdout` reservado ao protocolo, erros sanitizados e ausência de Redis/provider são extensões coerentes das garantias existentes.
- A separação Brand Memory/Evidence Ledger não exige alterar TM, CLI, providers ou fluxos de escrita existentes.

## Gate de reconciliação

O spine fica reconciliado após incorporar F1–F6 como regras normativas e resolver F2/F3/F4 antes de gerar a especificação de implementação. F7–F11 devem constar como constraints/testes ou decisões deferred explícitas; nenhuma exige abandonar a arquitetura proposta.
