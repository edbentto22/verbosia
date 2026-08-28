---
id: SPEC-brand-memory-evidence-ledger
companions:
  - 'contracts-and-schemas.md'
  - 'acceptance-matrix.md'
  - '../../planning-artifacts/architecture/architecture-VERBOSIA-2026-08-27/ARCHITECTURE-SPINE.md'
sources:
  - '../../../docs/briefs/brief-verbosia-mcp-2026-08-27/addendum.md'
  - '../../../docs/implementation/spec-mcp-read-only-foundation.md'
  - '../../planning-artifacts/research/technical-runtime-json-schema-and-schema-to-typesc-2026-08-27/research.md'
---

> **Contrato canônico.** Esta SPEC e os arquivos em `companions:` formam o contrato completo e validado do que deve ser construído, testado e demonstrado. Os documentos em `sources:` permanecem apenas para rastreabilidade.

# Brand Memory + Evidence Ledger V1

## Why

O Verbosia precisa permitir que qualquer aplicação use contexto de marca multilíngue e valide afirmações sem recriar regras de localização, SEO, GEO, evidência e risco. Esta entrega transforma a fundação MCP local em um núcleo auditável: a IA pode interpretar conteúdo, mas somente uma política determinística decide o que a marca está autorizada a comunicar.

## Capabilities

- **CAP-1 — Brand Memory canônica**
  - **intent:** O responsável pelo projeto pode definir e versionar uma Brand Memory controlada pelo cliente com identidade, tom, públicos, ofertas, diferenciais, terminologia, restrições e referências de Claims aprovados.
  - **success:** Uma memória válida é carregada sob demanda; ausência ou invalidade produz diagnósticos restritos à nova capacidade sem alterar o comportamento das tools MCP legadas.

- **CAP-2 — Resolução contextual**
  - **intent:** Uma aplicação pode obter o contexto efetivo da marca para locale, mercado, intenção da página, tipo de conteúdo, risco editorial, canal e público.
  - **success:** A resolução segue os overlays determinísticos adotados, retorna `stateDigest` reproduzível e não cria nem modifica Claims ou fatos.

- **CAP-3 — Evidence Ledger rastreável**
  - **intent:** O sistema pode avaliar evidências por proveniência, permissão, papel de suporte, escopo, validade, sensibilidade e supersession.
  - **success:** Evidências ativas e aplicáveis são distinguidas de registros expirados, indisponíveis, inválidos ou em quarentena sem revelar conteúdo restrito.

- **CAP-4 — Autorização determinística de Claims**
  - **intent:** Uma aplicação pode submeter Claims candidatos e receber uma decisão explicável sobre seu uso.
  - **success:** Cada candidato recebe exatamente um resultado ordenado entre `allow`, `allow_with_constraints`, `review_required` e `block`, além de outcome agregado determinístico conforme a `PolicyDecisionTable` e reason codes fechados.

- **CAP-5 — Inspeção segura via MCP**
  - **intent:** Um cliente MCP pode inspecionar o contexto de Brand Memory resolvido sem acessar o ledger bruto.
  - **success:** `verbosia.inspect_brand_context` retorna `text` e `structuredContent` equivalentes, versionados e limitados por allowlist, sem locators, excerpts, atores, paths, stacks, segredos ou metadados livres.

- **CAP-6 — Contratos portáveis**
  - **intent:** Consumidores Node, PHP/WordPress, CLI e futuros adaptadores podem usar contratos comuns de Brand Memory, evidência, política, diagnóstico, validação, contexto resolvido e Context Packs.
  - **success:** JSON Schemas versionados e exports do Core são resolvidos offline no pacote, permanecem mecanicamente alinhados aos tipos e aprovam fixtures compartilhadas entre runtimes.

- **CAP-7 — Governança de regras e overrides**
  - **intent:** O responsável pela política pode definir, testar, calibrar e auditar `PolicyRules` e overrides aprovados.
  - **success:** Regras e overrides preservam identidade, escopo, evidência, severidade, aprovação, validade e `most-restrictive-wins`; guardrails intrínsecos não são sobrescrevíveis e blocking editorial exige concordância humana medida.

- **CAP-8 — Decisão local reproduzível**
  - **intent:** Um operador pode reproduzir e auditar uma decisão de validação local e limitada.
  - **success:** Snapshot estável, digests JCS/SHA-256, clock do servidor, limites de recurso e ordenação determinística repetem o resultado para o mesmo estado autoritativo ou geram falha estável quando o estado muda durante a leitura.

- **CAP-9 — Seam comunitário declarativo**
  - **intent:** Integrações comunitárias podem preparar contribuições de idioma, SEO e GEO por um contrato declarativo independente dos dados do cliente.
  - **success:** O schema `ContextPackContribution` é publicado e testável, enquanto a V1 não carrega, executa ou cataloga packs e nenhum pack aprova Claims ou enfraquece governança.

## Constraints

- O [spine arquitetural](../../planning-artifacts/architecture/architecture-VERBOSIA-2026-08-27/ARCHITECTURE-SPINE.md), incluindo AD-1 a AD-20, é vinculante; conflitos devem ser apresentados, nunca sobrescritos localmente.
- `verbosia.inspect_project` e `verbosia.plan_localization` preservam nomes, outputs, erros e carregamento; `verbosia.inspect_brand_context` e `verbosia.validate_claims` são aditivas, totalizando quatro tools.
- Brand Memory e Evidence Ledger vivem sob a raiz real do projeto; Translation Memory mantém o caminho legado e cada domínio conserva autoridade e ciclo de vida próprios.
- A V1 opera por `stdio`, com raiz explícita, somente leitura, sem banco, rede, OAuth, Redis, provider, publicação ou transporte remoto iniciado pelo código de análise.
- Arquivos versionados são canônicos; evidências são add-only por Git/CI, correções usam `supersedes` e alterações seguem `draft -> validate -> approve -> apply`.
- Contratos são schema-first em JSON Schema 2020-12; JCS/RFC 8785 e SHA-256 governam digests; schemas, fixtures e exports precisam anteceder qualquer implementação dependente.
- A Story 1 usa Ajv 8.20.x em modo Draft 2020-12 estrito, `ajv-formats` 3.0.x, formato BCP 47 próprio apoiado por `bcp-47` 2.1.x e tipos estruturais gerados deterministicamente por `json-schema-to-typescript` 15.0.x; o [companion de contratos e schemas](contracts-and-schemas.md) é vinculante para registry, exports, fixtures e critérios de aceite dessa story.
- A release deste slice exige Node 22+ e CI em Node 22/24; engines Node 18/20 deixam de ser suporte declarado.
- Dados seguem minimização e default-deny: sem reviews de terceiros integrais, PII/segredos desnecessários, evidência restrita em outputs ou reutilização entre projetos/clientes.
- IA pode extrair Claims e sugerir correspondências, mas somente o policy engine determinístico autoriza comunicação.
- Tools MCP usam exclusivamente o clock UTC do processo; tempo injetável existe apenas para testes do Core e replay futuro é não autoritativo.
- Limites, snapshot/TOCTOU, IDs, ordenação, falhas globais e quarentena por dependência seguem o spine e não são alteráveis pelo request.
- Nenhum output promete ranking, tráfego, citação, custo, publicação ou comportamento de provider; o resultado expressa apenas conformidade com política e evidência.
- Fixtures com erros intencionais em `pt-BR`, `en-US` e `es-419` e concordância humana são obrigatórias antes de promover regra editorial a blocking.
- Todo defeito encontrado no cenário E2E fornecido pelo usuário gera correção e teste permanente; uma única demonstração bem-sucedida não encerra a aceitação.

## Non-goals

- Escrever, aprovar ou migrar memória via MCP; traduzir, localizar ou publicar conteúdo; expor `verbosia.localize_with_context`.
- Implementar Market Signals, analytics/Search Console, conectores Google/CRM/social, OAuth, scraping, reputation replies ou ferramentas completas de SEO/GEO.
- Adicionar provider semântico, banco/índice persistente, transporte remoto/multi-tenant, plugin WordPress, catálogo/runtime de Context Packs ou atestação criptográfica do ledger.

## Success signal

No cenário real fornecido pelo usuário, as quatro tools operam sem regressão e as duas novas capacidades resolvem contexto e Claims com resultados coerentes, rastreáveis, sanitizados e reproduzíveis. O ciclo termina somente quando todos os critérios da matriz de aceitação passam e cada defeito descoberto está coberto por regressão permanente.

## Open Questions

- Qual tamanho de amostra e limiar de concordância entre revisores autorizarão uma `PolicyRule` editorial a passar de warning para blocking?
- Qual cenário real, outcomes esperados e critérios de parada definirão o gate E2E final após a implementação?
