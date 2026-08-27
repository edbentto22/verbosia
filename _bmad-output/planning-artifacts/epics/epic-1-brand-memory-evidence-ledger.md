---
type: execution-epic
project: VERBOSIA
spec: SPEC-brand-memory-evidence-ledger
status: ready-for-tracking
derived_from:
  - '../../specs/spec-brand-memory-evidence-ledger/SPEC.md'
  - '../../specs/spec-brand-memory-evidence-ledger/stories.yaml'
updated: '2026-08-27'
---

# Plano de execução — Brand Memory + Evidence Ledger V1

Este arquivo adapta as oito stories aprovadas ao formato determinístico do Sprint Planning. Ele não cria requisitos: a SPEC e seus companions continuam canônicos; `stories.yaml` preserva os checkpoints e instruções de invocação aprovados.

## Epic 1: Núcleo auditável de Brand Memory e Evidence Ledger

Entregar um núcleo MCP local, provider-neutral e somente leitura que resolva contexto de marca multilíngue e autorize Claims por política determinística e evidência rastreável, preservando integralmente as duas tools legadas.

Pré-requisito concluído: fundação MCP read-only publicada e coberta pelos 105 testes-base. O épico não depende de uma entrega futura para começar; as stories seguem a ordem abaixo.

### Story 1.1: Publicar contratos e schemas portáteis

Resolver a escolha do runtime JSON Schema e entregar os contratos versionados, tipos, exports e golden fixtures exigidos por CAP-6 e CAP-9. Não implementar loaders, Policy Engine ou novas tools MCP nesta story.

Critérios: `contracts-and-schemas.md`, S1-AC1 a S1-AC9. Checkpoints de especificação e conclusão obrigatórios.

### Story 1.2: Construir snapshot local seguro

Implementar o substrato de filesystem de CAP-8 com boundary de raiz, leitura estável por handle, I-JSON/JCS, digests, ordenação determinística e limites de recursos. Não incluir comportamento de Brand Memory, Evidence Ledger ou Policy Engine.

Critérios: CAP-8, AD-2, AD-3, AD-4, AD-13 a AD-16 e gates de boundary/TOCTOU da matriz de aceitação. Depende da Story 1.1.

### Story 1.3: Implementar Brand Memory e overlays

Entregar CAP-1 e CAP-2 com carregamento canônico, validação, overlays tipados, risco efetivo e contexto resolvido. Manter Evidence Ledger e política de autorização fora desta story.

Critérios: cenários CAP-1/CAP-2 e contratos publicados na Story 1.1. Depende das Stories 1.1 e 1.2.

### Story 1.4: Implementar Evidence Ledger

Entregar CAP-3 com permission default-deny, source digest, validade, escopo exato, sensibilidade, supersession linear, quarentena e enforcement add-only em CI. Não implementar decisões editoriais além dos estados de evidência definidos pela SPEC.

Critérios: cenários CAP-3, AD-4, AD-10, AD-14 e AD-17. Depende das Stories 1.1 e 1.2; integra-se à Brand Memory sem alterar sua autoridade.

### Story 1.5: Implementar Policy Engine determinístico

Entregar CAP-4 e CAP-7 com PolicyDecisionTable, reason codes fechados, agregação de outcomes, PolicyRules, overrides, hard guards e calibração humana. Manter a autorização independente de qualquer modelo de IA.

Critérios: cenários CAP-4/CAP-7, AD-7, AD-9, AD-17 e AD-18. Depende das Stories 1.3 e 1.4. Enquanto amostra e limiar de concordância não forem aprovados, regra editorial configurável permanece `warning` e nunca é promovida a `blocking`.

### Story 1.6: Expor tools MCP aditivas

Integrar CAP-4 e CAP-5 por meio de `verbosia.inspect_brand_context` e `verbosia.validate_claims`. Preservar as duas tools legadas, carregamento lazy, DTOs allowlisted, diagnósticos sanitizados e compatibilidade `stdio`.

Critérios: cenários CAP-4/CAP-5 e equivalência observável de `text`/`structuredContent`. Depende das Stories 1.3, 1.4 e 1.5.

### Story 1.7: Provar portabilidade e hardening

Concluir os gates de CAP-6 e CAP-8 para package/tarball, Node 22/24, vetores PHP, segurança com canários, boundary, CI e fixtures `pt-BR`, `en-US` e `es-419`. Não aceitar conclusão parcial dos gates transversais da matriz de aceitação.

Critérios: todos os gates transversais e fixtures multilíngues da matriz. Depende das Stories 1.1 a 1.6.

### Story 1.8: Validar cenário E2E iterativo

Executar o cenário real fornecido pelo usuário nas quatro tools, comparar outcomes esperados, corrigir causas-raiz e transformar cada defeito em regressão permanente. Encerrar apenas quando o success signal da SPEC e o gate E2E da matriz de aceitação forem satisfeitos.

Critérios: gate E2E iterativo completo. Depende da Story 1.7 e do cenário, outcomes esperados e critérios de parada aprovados pelo usuário; não começa antes desses inputs.

## Rastreabilidade e ordem

| Story | Capabilities primárias | Entrega desbloqueada |
| --- | --- | --- |
| 1.1 | CAP-6, CAP-9 | Contratos estáveis para todo o núcleo |
| 1.2 | CAP-8 | Leitura e digests seguros |
| 1.3 | CAP-1, CAP-2 | Contexto de marca resolvido |
| 1.4 | CAP-3 | Evidência efetiva e rastreável |
| 1.5 | CAP-4, CAP-7 | Autorização determinística |
| 1.6 | CAP-4, CAP-5 | Superfície MCP aditiva |
| 1.7 | CAP-6, CAP-8 | Portabilidade e hardening comprovados |
| 1.8 | CAP-1 a CAP-9 | Aceitação real e regressões permanentes |

Nenhuma story redefine o spine arquitetural. Conflito encontrado durante a implementação interrompe a story no checkpoint correspondente e retorna para correção da SPEC.
