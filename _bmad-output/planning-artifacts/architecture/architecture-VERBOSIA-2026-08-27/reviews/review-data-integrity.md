# Review — Integridade de dados, segurança e privacidade

**Artefato:** `ARCHITECTURE-SPINE.md`

**Lente:** Evidence Ledger, boundary de arquivos, confidencialidade, digests, overrides e isolamento
**Veredito:** **CHANGES REQUIRED** — o spine tem uma base prudente e adequada para V1 local, mas ainda permite implementações conformes que aceitam estado histórico adulterado, leem um snapshot inconsistente ou vazam metadados restritos; os achados High devem ser resolvidos antes do handoff para build.

## High

### DI-01 — A boundary por `realpath` continua vulnerável a TOCTOU e snapshot misto

- **Localização:** AD-1; Envelope operacional; Aceitação pós-implementação.
- **Trigger condition:** “Revalidar imediatamente antes da leitura” separa a checagem da operação de `read`; outro processo pode trocar um arquivo, symlink ou diretório entre `realpath`/`lstat`, `readdir` e `readFile`. O carregamento de vários registros também pode combinar versões de instantes diferentes e produzir um digest de um estado que nunca existiu.
- **Guard snippet:** Fixar o threat model: a V1 confia no usuário/conta local e não promete resistência a um adversário com escrita concorrente. Mesmo assim, exigir leitura por handle aberto, verificação de tipo/identidade antes e depois, rejeição de symlink/non-regular file em cada entrada, inventário ordenado antes/depois e retry limitado; se o inventário ou identidade mudar, retornar `STATE_CHANGED_DURING_READ`. Se resistência a escritor hostil for requisito, adiar a garantia até existir primitive descriptor-relative/openat ou isolamento equivalente, em vez de alegar que a checagem atual “previne” a corrida.
- **Potential consequence:** leitura fora da raiz, decisão calculada sobre evidências trocadas durante a operação ou `stateDigest` não reproduzível.
- **Ação:** discutir o threat model e autofixar AD-1 + critérios de aceitação.

### DI-02 — “Ledger imutável” não é garantido por arquivos Git nem por SHA-256 do estado atual

- **Localização:** AD-3, AD-4 e AD-14.
- **Trigger condition:** qualquer editor pode modificar ou apagar `.verbosia/evidence/<id>.json`; Git fornece histórico somente se o commit anterior estiver disponível e revisado. `stateDigest` prova igualdade do snapshot atual, não append-only, autoria, aprovação nem ausência de remoção.
- **Guard snippet:** Renomear a garantia para **imutabilidade lógica sob governança do repositório** e definir o mecanismo: CI compara com a base aprovada e rejeita alteração/remoção de evidence records, aceitando apenas adição; cada registro carrega `contentDigest` verificável; a aprovação de Claim referencia a revisão/digest exatos. A V1 deve declarar que não detecta exclusão histórica em um checkout isolado. Se imutabilidade verificável sem Git for necessária, deferir manifest append-only/hash chain e assinatura, sem atribuir essa propriedade ao digest atual.
- **Potential consequence:** evidência pode ser reescrita ou removida mantendo o mesmo ID, e uma auditoria posterior atribui a uma aprovação material diferente do que foi realmente aprovado.
- **Ação:** autofix do texto e da aceitação; discutir se CI contra branch-base é requisito V1.

### DI-03 — A semântica de `supersedes` permite substituição ambígua ou escalada silenciosa

- **Localização:** AD-4, AD-10 e AD-14.
- **Trigger condition:** o spine rejeita ciclos de modo genérico, mas não decide múltiplos sucessores, cadeia parcial, predecessor ausente, alteração de permission/scope/sensitivity nem se um Claim que referencia o registro antigo segue automaticamente para o novo.
- **Guard snippet:** Definir `supersedes` como relação histórica, sem herança de permissão, escopo, validade, sensibilidade ou autorização. Exigir grafo acíclico, predecessor existente, no máximo um sucessor efetivo por registro e conflito global em branches. Registro superseded deixa de sustentar Claim; o sucessor só sustenta após referência e reaprovação explícitas do Claim. Um sucessor inválido não reativa o predecessor silenciosamente.
- **Potential consequence:** dois adaptadores escolhem evidências atuais diferentes ou uma “correção” amplia território/permissão e continua autorizando conteúdo sem revisão humana.
- **Ação:** autofix em AD-4/AD-10/AD-14 e adicionar fixtures de branches, chain e downgrade de permissão.

### DI-04 — Quarentena isolada não é fail-closed quando o envelope do registro é ilegível

- **Localização:** AD-15.
- **Trigger condition:** um JSON malformado ou schema-inválido pode ser justamente o registro que revoga/substitui uma evidência anterior. Se o Core não consegue ler `evidenceId` e `supersedes`, ele também não consegue descobrir os Claims dependentes; “isolar apenas dependentes” pode deixar o predecessor autorizando.
- **Guard snippet:** Usar validação em duas fases. O envelope mínimo (`schemaVersion`, `evidenceId`, `supersedes`, classification) deve ser válido para construir o grafo completo; envelope ilegível, arquivo inesperado, filename/ID mismatch ou inventário incompleto falha a operação inteira. Somente payload inválido após identidade/grafo confiáveis pode entrar em quarentena, contaminando transitivamente todos os Claims dependentes.
- **Potential consequence:** corrupção deliberada ou acidental de uma revogação preserva uma autorização que deveria ter sido bloqueada.
- **Ação:** autofix em AD-15 e nos reason codes de domínio.

### DI-05 — O contrato dos digests não define integralmente o estado ou a decisão

- **Localização:** AD-14; Convenções de consistência.
- **Trigger condition:** “SHA-256 sobre JCS” não especifica o envelope canônico, ordenação do conjunto, inclusão de paths/filenames, registros em quarentena, schema/policy/engine version ou resultado. A fórmula textual `stateDigest + request + evaluationTime + contractVersion` admite concatenação ambígua e permite o mesmo `decisionDigest` para políticas executáveis diferentes.
- **Guard snippet:** Publicar algoritmo normativo e vetores: rejeitar duplicate JSON keys/non-I-JSON; criar objeto canônico com domain separator e algorithm version; ordenar entradas por ID; vincular relative path + conteúdo canônico/byte digest + schemas + policy bundle/version + engine decision algorithm + contexto resolvido. Calcular `decisionDigest` sobre um objeto que inclui os digests de input **e o relatório normalizado produzido**, nunca por concatenação de strings. Decidir explicitamente como arquivos inválidos/quarentenados entram no digest.
- **Potential consequence:** Node e PHP produzem digests distintos, ou um digest aparentemente igual referencia outra política/decisão e perde valor auditável.
- **Ação:** autofix de AD-14 e incluir vetores adversariais (Unicode, ordem, números, duplicate keys, arquivo inválido).

### DI-06 — “Nunca expor material restrito” não está materializado em DTOs allowlist

- **Localização:** AD-7, AD-11, AD-13, AD-15 e Envelope operacional.
- **Trigger condition:** `inspect_brand_context`, reason codes, remediação, descritor, locator, ator e strings de schema podem revelar nomes internos, PII ou segredos mesmo sem “texto bruto”. Campos controlados pelo repositório também podem virar prompt injection ao serem enviados ao cliente/LLM.
- **Guard snippet:** Definir projeções MCP separadas dos modelos canônicos, com allowlist por classificação. Nunca serializar source locator, excerpt, approval actor ou metadado livre para o MCP; expor apenas opaque refs/codes quando necessário. Mensagens de diagnóstico devem ser templates internos, não interpolar conteúdo inválido; impor limites de comprimento/quantidade e redaction tests. `inspect_brand_context` retorna somente campos explicitamente classificados como consumíveis, não o objeto resolvido inteiro.
- **Potential consequence:** um host MCP ou modelo recebe dados restritos, paths comerciais, dados pessoais ou instruções maliciosas embutidas em memória/evidência.
- **Ação:** autofix do contrato de saída e criar teste de snapshot com canários secretos.

### DI-07 — `permission` e `provenance` são declarações autoatribuídas, não atestações governadas

- **Localização:** AD-7 e AD-13.
- **Trigger condition:** um arquivo pode declarar `permission=authorized` sem registrar base, finalidade, território, quem atestou, expiração ou revogação; a runtime não distingue declaração bem formada de autorização confiável. Para locator interno, também não está explícito que o digest da fonte será recomputado e comparado.
- **Guard snippet:** Adotar enums fechados e deny-by-default. Exigir `permissionBasis`, `allowedPurposes`, scope territorial/linguístico, `assertedBy`, `reviewedAt`, `expiresAt` quando aplicável e `revokedAt`; `unknown`, expired ou revoked nunca sustentam comunicação pública. Declarar o modelo de confiança V1: o runtime confia em atestação aprovada no repositório, não autentica o ator. Para locator local, recomputar o digest na mesma leitura protegida e usar `SOURCE_DIGEST_MISMATCH`/`review_required` ou `block` conforme risco.
- **Potential consequence:** material sem licença, revogado ou alterado sustenta claims como se tivesse autorização e integridade atuais.
- **Ação:** autofix no schema conceitual e políticas; assinatura/autenticação forte pode permanecer Deferred.

### DI-08 — Overrides não possuem autoridade, precedência e limites mecanicamente verificáveis

- **Localização:** AD-17 e AD-18.
- **Trigger condition:** “nunca enfraquece hard-coded” não enumera quais regras são hard, onde overrides vivem, quem pode aprová-los, precedência, expiração ou vínculo à versão da regra. Um campo textual `actor` é falsificável e conflitos entre base/overlay/pack podem ser resolvidos de modos diferentes.
- **Guard snippet:** Enumerar invariantes não sobrescrevíveis (`root`, schema/version, IDs/grafo, permission, sensitivity, PII/secret policy e integridade). Override referencia exact `ruleId@version`, possui stable ID, target scope, expiry, justification e `approvalRef`; precedência é determinística e most-restrictive-wins em conflito. V1 pode apertar automaticamente; relaxar regra editorial exige aprovação e nunca reduz `block` intrínseco. Declarar a atestação de aprovação como procedural/Git na V1.
- **Potential consequence:** uma configuração local desliga controle de permissão ou reduz severidade sem trilha confiável, enquanto duas implementações produzem outcomes incompatíveis.
- **Ação:** autofix em AD-17/AD-18 e fixtures de conflito/override expirado.

### DI-09 — `evaluationTime` injetável pode ressuscitar evidência expirada

- **Localização:** AD-10; Convenção Tempo.
- **Trigger condition:** se o MCP aceitar tempo fornecido pelo caller para uma decisão operacional, basta enviar data passada para tornar vigente uma prova expirada ou ainda não válida.
- **Guard snippet:** Separar modos. Tool operacional usa clock do processo e não aceita downgrade temporal; replay/audit aceita `evaluationTime` explícito, marca o resultado `nonAuthoritativeReplay: true` e nunca o trata como autorização de publicação. O Core continua com clock injetável para testes, mas a trust boundary do transporte decide a fonte.
- **Potential consequence:** validade temporal deixa de ser controle de governança e claims expirados voltam a receber `allow`.
- **Ação:** autofix em AD-10 e contrato MCP.

## Medium

### DI-10 — Isolamento entre projetos depende de disciplina implícita de adapter/cache

- **Localização:** AD-1, AD-4, AD-9 e Envelope operacional.
- **Trigger condition:** IDs são únicos apenas por projeto, mas o spine não proíbe estado global nem fixa cache/session key. Um futuro cache reconstruível pode servir `claimId`/`evidenceId` homônimo carregado de outra raiz no mesmo processo.
- **Guard snippet:** Criar `ProjectContext` imutável por operação, ligado ao canonical root handle e `brandId/projectId`; todos os stores/resolvers recebem esse contexto. Proibir caches module-global sem namespace; chave mínima inclui project scope + `stateDigest` + contract/policy version. Toda referência deve resolver dentro do mesmo contexto e nenhum caminho absoluto entra no scope ID ou saída.
- **Potential consequence:** decisões ou metadados de um cliente contaminam outro projeto, especialmente em CLI/WordPress ou transporte futuro que reutilize processo.
- **Ação:** autofix de boundary; multi-tenant remoto continua Deferred.

### DI-11 — Persistência versionada pode tornar PII/segredos permanentes no histórico Git

- **Localização:** AD-3, AD-13 e AD-16.
- **Trigger condition:** o trecho “sanitizado” e locators vivem em arquivos canônicos versionados; um erro de redação deixa PII/segredo replicado no histórico. Não há regra distinguindo repositório OSS, repositório privado do cliente e artefato bruto confidencial.
- **Guard snippet:** Proibir dados pessoais e segredos em documentos canônicos; para evidence `restricted`, permitir apenas descritor mínimo/digest/opaque source ref, sem excerpt ou path revelador. Exigir política de repositório privado ou store externo futuro para artefato sensível; fixtures, Context Packs e pacote publicado nunca incluem dados de cliente. Tratar scanners como defesa adicional, não garantia, com teste-canário e guia de resposta/rotação quando vazamento ocorrer.
- **Potential consequence:** dados regulados ou credenciais permanecem em clones, forks e releases mesmo após remover o arquivo atual.
- **Ação:** autofix de AD-13 e documentação operacional.

### DI-12 — Faltam limites de recursos para arquivos e saídas controlados pelo projeto

- **Localização:** AD-12, AD-13, AD-15 e Envelope operacional.
- **Trigger condition:** número de evidence records, bytes por arquivo, profundidade JSON, tamanho de strings, quantidade de diagnósticos e resposta MCP são ilimitados.
- **Guard snippet:** Definir limites configurados e máximos absolutos para file count, total bytes, bytes/file, depth, string/array size, diagnostic count e output size; validar tamanho antes do parse, truncar somente dados informativos e falhar com `RESOURCE_LIMIT_EXCEEDED` antes de autorizar qualquer Claim quando o inventário ficar incompleto.
- **Potential consequence:** workspace malformado causa uso excessivo de memória/CPU, bloqueia stdio ou produz avaliação parcial apresentada como completa.
- **Ação:** autofix no envelope e testes de limites.

### DI-13 — Portabilidade de `evidenceId`/filename não cobre colisões de filesystem

- **Localização:** AD-14; Convenção IDs.
- **Trigger condition:** “opaco” não fixa regex, case, Unicode ou extensão; macOS/Windows podem colidir por case/normalização, e entradas especiais, devices, sockets, symlinks ou hardlinks não são explicitamente rejeitados.
- **Guard snippet:** Usar formato ASCII canônico estrito para `evidenceId` e filename, comparação byte/case definida, nenhum separador/dot segment; aceitar somente regular file com exatamente `.json`, reject symlink e arquivo inesperado. Detectar colisões após normalização/case-fold no inventário e decidir política para hardlink no threat model.
- **Potential consequence:** um ledger válido em Linux carrega registro diferente ou falha silenciosamente em macOS/Windows.
- **Ação:** autofix da convenção e fixtures multiplataforma.

### DI-14 — Entradas de risco e contexto podem ser usadas para reduzir a política

- **Localização:** AD-6 e AD-18.
- **Trigger condition:** `editorialRisk`, locale, market, pageIntent e contentType são inputs; não está definido se o caller pode escolher `low`/contexto mais permissivo ou como múltiplos scopes aplicáveis se combinam.
- **Guard snippet:** Classificar risco mínimo a partir do Claim/policy e tratar input do caller apenas como aumento, nunca downgrade. Combinar regras aplicáveis por interseção de permissões e `most-restrictive-wins`; contexto ausente, desconhecido ou contraditório retorna `review_required`, não seleciona overlay permissivo.
- **Potential consequence:** o consumidor escolhe um contexto conveniente e obtém `allow` para conteúdo que seria bloqueado no mercado/risco real.
- **Ação:** autofix de AD-6/AD-18 e matriz de precedência.

## Cenários obrigatórios para o loop E2E

1. Trocar symlink/arquivo e adicionar/remover evidence record durante o scan; esperar retry ou `STATE_CHANGED_DURING_READ`, nunca decisão parcial.
2. Modificar e apagar evidence record previamente aprovado; CI deve rejeitar e o runtime não deve alegar imutabilidade verificável no checkout isolado.
3. Criar branch de supersession, sucessor inválido e sucessor com permission/scope mais amplo; esperar conflito/reaprovação, nunca herança automática.
4. Tornar ilegível o envelope de um suposto successor/revocation; esperar falha global da nova operação.
5. Inserir canários secretos/PII em excerpt, locator, descrição, JSON error e policy message; nenhum canário pode aparecer em MCP text, `structuredContent`, stderr ou stack.
6. Alterar policy/engine mantendo state/request iguais; `decisionDigest` deve mudar ou incluir o resultado/policy bundle de modo verificável em Node e PHP.
7. Repetir IDs em duas raízes no mesmo processo/cache; resultados e diagnósticos devem permanecer isolados.
8. Pedir `evaluationTime` passado e `editorialRisk=low` para um Claim expirado/alto risco; transporte operacional deve negar downgrade.
9. Exceder limites de bytes/files/depth/diagnostics; esperar erro estável e nenhuma autorização parcial.

## Conclusão

Não há necessidade de banco, assinatura criptográfica ou transporte remoto na V1. Há, porém, necessidade de alinhar as promessas ao trust model local e tornar cinco contratos normativos antes do build: snapshot de filesystem, imutabilidade lógica, grafo de supersession, digest envelope e projeção confidencial de saída. Com essas correções, a arquitetura mantém o recorte read-only e ganha uma base auditável honesta para o looping de validação solicitado.

## Post-fix verification

**Veredito:** **CHANGES REQUIRED** — três dos cinco achados prioritários foram fechados; imutabilidade histórica permanece parcialmente aberta e ainda existem quatro boundaries de autoridade/confidencialidade anteriores que podem produzir autorização ou exposição indevida. Não foi encontrada regressão Critical.

### Verificação dos cinco achados prioritários

| Achado | Estado | Evidência no spine corrigido |
| --- | --- | --- |
| DI-01 — TOCTOU/snapshot misto | **Partially resolved — Medium** | AD-19 exige handle, identidade/metadata antes/depois, revalidação final, retry único e `STATE_CHANGED_DURING_READ`. Falta apenas declarar que a garantia cobre mutação concorrente detectável em workspace local confiável, não resistência absoluta a escritor hostil capaz de swap-back/hardlink. |
| DI-02 — append-only/imutabilidade | **Partially resolved — High** | AD-3 tornou a promessa honesta, adicionou CI add-only e `historyStatus`; Deferred reconhece assinatura futura. Porém não define a fonte confiável de `historyStatus: verified`, a base aprovada comparada pelo CI nem como a runtime recebe essa atestação. No estado atual, um arquivo/config pode declarar `verified`, ou `unverified` ainda resulta em `allow_with_constraints`. |
| DI-03 — supersession | **Resolved** | AD-20 fixa cadeia linear, rejeita dangling/fork/cycle, proíbe herança, exige reaprovação e impede fallback; AD-15/PolicyDecisionTable cobrem quarentena e ausência. |
| DI-04 — envelope ilegível/revogação | **Resolved** | AD-15 agora falha a operação para envelope ilegível e isola apenas payload com identidade recuperável; AD-20 coloca o componente conhecido em quarentena. |
| DI-05 — digests | **Resolved** | Preimages normativos incluem versões de contrato/schema/policy/engine, conjunto ordenado, raw hash de quarentena e resultado normalizado; ingestão I-JSON fecha duplicate keys e números não interoperáveis. |

### Remaining High

#### PF-H1 — `historyStatus: verified` não possui emissor ou prova confiável

- **Localização:** AD-3; PolicyDecisionTable v1; Deferred assinatura/autoria.
- **Trigger condition:** o spine não diz se `historyStatus` vem de input, documento canônico, ambiente ou artefato CI; nenhum deles é confiável por padrão no mesmo workspace editável. Também não define qual commit/branch-base foi verificado. `unverified` continua sendo um outcome autorizativo (`allow_with_constraints`).
- **Guard snippet:** Na V1, runtime deve produzir `unverified` por default e nunca aceitar esse campo dos documentos/request. `verified` exige attestation separada gerada pelo CI, vinculada a repository identity + base revision + head revision + stateDigest e validada contra trust anchor configurado fora do repo; sem esse mecanismo, remover `verified` da runtime V1 e tratar a checagem CI apenas como gate externo. Decidir se `unverified` exige `review_required` para Claims de risco alto ou se a constraint obrigatória inclui aprovação humana.
- **Potential consequence:** um checkout alterado se autodeclara historicamente verificado ou continua liberando material adulterado com uma constraint genérica.

#### PF-H2 — Saídas MCP ainda não possuem projeção allowlist por sensibilidade

- **Localização:** AD-7, AD-11, AD-15; Schemas públicos obrigatórios; Envelope operacional.
- **Trigger condition:** “material restrito nunca é exposto” e “erros sanitizados” não decidem quais campos de `ResolvedBrandContext`, referências, locators, atores e mensagens são permitidos; schema-first pode validar um vazamento perfeitamente bem.
- **Guard snippet:** Tornar os DTOs públicos explicitamente menores que os modelos canônicos: allowlist fechada, sem locator/excerpt/approval actor/free-form source metadata; somente opaque evidence refs quando necessário. Diagnósticos usam templates internos e nunca interpolam valor inválido. Adicionar canary tests em `structuredContent`, text, stderr e erros.
- **Potential consequence:** o host MCP/LLM recebe PII, segredo, path comercial ou prompt injection originado nos arquivos locais.

#### PF-H3 — `permission`/`provenance` continuam autoatribuídas e o locator digest não é revalidado normativamente

- **Localização:** AD-7, AD-13; PolicyDecisionTable v1.
- **Trigger condition:** “permitida” não possui vocabulário fechado, basis, purpose, território, attestor, revogação ou regra deny-by-default. O digest persistido pode continuar válido enquanto o artefato do locator mudou.
- **Guard snippet:** Definir permission attestation versionada com enums fechados, basis/purpose/scope, asserted/reviewed/expiry/revocation e default `unknown`. A runtime V1 confia proceduralmente no repo aprovado, mas não autentica o ator. Recalcular digest de locator interno no snapshot e produzir `SOURCE_DIGEST_MISMATCH`; unknown/expired/revoked nunca satisfaz evidência direta permitida.
- **Potential consequence:** fonte revogada, alterada ou sem direito de uso sustenta Claim público.

#### PF-H4 — Overrides ainda não têm precedência, authority binding ou hard guards enumerados

- **Localização:** AD-17 e AD-18.
- **Trigger condition:** o texto não fixa onde override vive, `ruleId@version`, expiração, approval reference, conflito ou lista de invariantes não sobrescrevíveis.
- **Guard snippet:** Enumerar hard guards (`root`, schema, IDs/grafo, permission, sensitivity, PII/secrets e integridade); override possui ID, exact rule version, scope, expiry e approvalRef. Conflito usa most-restrictive-wins; V1 só aperta automaticamente, e relaxamento editorial exige aprovação sem jamais reduzir block intrínseco.
- **Potential consequence:** configuração local reduz controle de compliance/integridade ou implementações escolhem outcomes diferentes.

#### PF-H5 — Tempo injetável ainda pode ressuscitar evidência expirada

- **Localização:** AD-10; PolicyDecisionTable v1; Convenção Tempo.
- **Trigger condition:** permanece indefinido se o MCP aceita `evaluationTime` do caller; uma data passada transforma evidência expirada em ativa.
- **Guard snippet:** Tool operacional usa exclusivamente clock do processo. Replay/audit pode aceitar tempo explícito, mas retorna `nonAuthoritativeReplay: true` e nunca autoriza publicação. Clock injetável permanece apenas na boundary Core/testes.
- **Potential consequence:** validade temporal é contornada pelo consumidor e Claim expirado recebe `allow`.

### Medium/Low após correções

- **Medium: 7** — threat model residual de AD-19; namespace/caches cross-project; PII/segredos permanentes em Git; limites de recursos; formato multiplataforma de `evidenceId`; caller downgrade de `editorialRisk`; AD-6 deve limitar “adicionar Claims” a referências de Claims já aprovados, sem criar autorização em overlay.
- **Low: 0**.

### Regression scan

Nenhuma regressão Critical foi encontrada. A única ambiguidade nova relevante está em AD-6: “Claims ... podem ser adicionados” precisa significar apenas selecionar/referenciar Claim global já aprovado; caso contrário, um overlay de mercado pode criar autorização material e contrariar AD-5/AD-20.

## Final targeted verification

**Veredito final:** **PASS** — nenhum achado Critical ou High permanece na lente de integridade, segurança e privacidade no altitude deste spine.

| Bloqueio revalidado | Resultado final |
| --- | --- |
| Append-only/history proof | Fechado: AD-3 torna `historyStatus: unverified` fixo e não autorizativo na V1; `verified` exige futura atestação assinada e CI add-only permanece gate externo. |
| Projeção de dados restritos | Fechado: AD-11 exige DTO público por allowlist, exclui locator/excerpt/atores/metadados livres e usa diagnóstico template/opaco; aceitação inclui canary tests em todos os canais. |
| Permission/provenance/source integrity | Fechado: AD-7 define default-deny, vocabulário e campos de governança; AD-13 recalcula source digest no snapshot e quarentena em mismatch; PolicyDecisionTable impede fallback. |
| Overrides | Fechado: AD-17 vincula regra/versão, escopo, validade e approvalRef, usa most-restrictive-wins e enumera invariantes não sobrescrevíveis. |
| `evaluationTime` | Fechado: AD-10 e convenção temporal reservam o clock operacional ao processo MCP; injeção fica no Core/testes e replay futuro é não autorizativo. |

Os contratos corrigidos também preservam os fechamentos anteriores de snapshot/TOCTOU (AD-19 com threat model explícito), supersession (AD-20), envelope ilegível/quarentena (AD-15) e preimages de digest normativos. Não foi detectada regressão Critical/High nesta passagem final direcionada.
