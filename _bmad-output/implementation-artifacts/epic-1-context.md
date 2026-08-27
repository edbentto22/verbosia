# Epic 1 Context: Núcleo auditável de Brand Memory e Evidence Ledger

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Entregar um núcleo MCP local, provider-neutral, determinístico e somente leitura que resolva contexto de marca multilíngue e autorize Claims com base em política versionada e evidência rastreável. A entrega transforma o Verbosia em uma camada reutilizável de governança de conteúdo para MCP, CLI, WordPress e integrações futuras, sem permitir que IA, transporte ou sinais transitórios decidam o que uma marca pode afirmar e sem alterar o comportamento das duas tools MCP existentes.

## Stories

- Story 1.1: Publicar contratos e schemas portáteis
- Story 1.2: Construir snapshot local seguro
- Story 1.3: Implementar Brand Memory e overlays
- Story 1.4: Implementar Evidence Ledger
- Story 1.5: Implementar Policy Engine determinístico
- Story 1.6: Expor tools MCP aditivas
- Story 1.7: Provar portabilidade e hardening
- Story 1.8: Validar cenário E2E iterativo

## Requirements & Constraints

- Brand Memory deve representar identidade, voz, públicos, ofertas, diferenciais, terminologia, restrições, Claims aprovados, mínimos de risco e overlays contextuais. Evidence Ledger deve manter proveniência, permissão default-deny, papel de suporte, escopo, validade, sensibilidade, digest da fonte e supersession.
- A resolução separa locale, mercado, intenção da página, tipo de conteúdo, canal, público e risco editorial. Overlays adaptam apenas campos permitidos, nunca criam ou alteram Claims, fatos ou guardrails; o risco efetivo só pode aumentar.
- Cada Claim candidato recebe um resultado ordenado entre `allow`, `allow_with_constraints`, `review_required` e `block`, acompanhado de reason codes fechados, diagnósticos sanitizados e referências auditáveis. Evidência factual válida exige suporte direto, permitido, vigente e exatamente aplicável ao contexto.
- O estado versionado no repositório é canônico. Evidence records são add-only por Git/CI; correções criam successors explícitos. Índices ou caches futuros são apenas derivados e isolados por projeto.
- Toda leitura exige raiz real explícita, boundary contra escape e symlink, snapshot estável e falha fechada em alterações concorrentes. O código de análise não escreve, acessa rede, banco, Redis, OAuth ou provider e não publica conteúdo.
- Outputs públicos usam allowlists e nunca expõem locator, excerpt, atores, paths absolutos, stacks, segredos, PII ou metadados livres. Evidência restrita pode afetar a decisão sem atravessar a boundary MCP.
- Preservar integralmente `verbosia.inspect_project` e `verbosia.plan_localization`; adicionar apenas `verbosia.inspect_brand_context` e `verbosia.validate_claims`, mantendo `stdio`, idempotência e equivalência entre `text` e `structuredContent`.
- A release deve passar build, typecheck, testes, contratos, tarballs e canários em Node 22 e 24, preservar os 105 testes-base e produzir vetores equivalentes em Node e PHP. Fixtures multilíngues obrigatórias cobrem `pt-BR`, `en-US` e `es-419`.
- Nenhum resultado pode prometer ranking, tráfego ou presença em experiências generativas. Context Packs permanecem apenas como contrato declarativo; catálogo, carregamento e execução ficam fora da V1.

## Technical Decisions

- O domínio reside em `@verbosia/core` segundo Ports and Adapters; `@verbosia/mcp` valida I/O, invoca o Core e apresenta respostas. IA pode extrair ou sugerir correspondências, mas a autorização pertence exclusivamente à `PolicyDecisionTable` determinística.
- Contratos são schema-first em JSON Schema Draft 2020-12, com `$id` absoluto/versionado, objetos fechados, campos required explícitos e `$ref` resolvido somente pelo registry empacotado. JSON Schema é a autoridade; tipos TypeScript são gerados e verificados mecanicamente.
- A stack contratual usa Ajv 8.20.x em modo 2020-12 estrito, `ajv-formats` 3.0.x, validação BCP 47 própria apoiada por `bcp-47` 2.1.x e geração determinística por `json-schema-to-typescript` 15.0.x. Schemas, manifest e golden fixtures antecedem qualquer loader ou regra dependente.
- Brand Memory vive em `.verbosia/brand/brand-memory.json`; cada evidência ocupa `.verbosia/evidence/<evidence-id>.json`. IDs são ASCII portáveis e referências são por ID estável, nunca por texto ou posição.
- Snapshots validam bytes UTF-8/I-JSON antes do parse, leem por handle, verificam identidade e `fstat`, ordenam deterministicamente e usam JCS/RFC 8785 com SHA-256 para `stateDigest` e `decisionDigest`. Uma única nova tentativa é permitida antes de `STATE_CHANGED_DURING_READ`.
- Contexto segue precedência fixa `base -> locale -> market -> pageIntent -> contentType -> channel -> audience`, com seletores exatos e sem herança implícita. Conflitos na mesma precedência falham.
- Supersession forma cadeia linear successor→predecessor, sem ciclo, fork ou referência ausente; successor não herda permissão ou escopo. Violações colocam o componente inteiro em quarentena.
- Regras e overrides são declarativos, versionados e auditáveis; conflitos usam `most-restrictive-wins`, e integridade, privacidade, permission, sensitivity, schema e boundary não podem ser sobrescritos.

## Cross-Story Dependencies

Os contratos e fixtures da Story 1.1 bloqueiam toda implementação dependente. O snapshot seguro da Story 1.2 sustenta os loaders de Brand Memory e Evidence Ledger; ambos precisam estar prontos antes do Policy Engine. As duas novas tools dependem do contexto resolvido, do ledger e da política, enquanto portabilidade e hardening validam o conjunto integrado antes do E2E. Até haver amostra e limiar de concordância aprovados, regra editorial configurável permanece `warning`. A Story 1.8 só começa após o usuário fornecer cenário, outcomes esperados e critérios de parada; cada defeito encontrado deve gerar correção de causa-raiz e regressão permanente.
