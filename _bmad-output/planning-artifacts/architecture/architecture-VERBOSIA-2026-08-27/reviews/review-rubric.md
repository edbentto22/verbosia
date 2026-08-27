# Reviewer Gate — Rubric Walker

**Artefato revisado:** `ARCHITECTURE-SPINE.md`

**Lente:** checklist de good-spine do `bmad-architecture`

**Data:** 2026-08-27
**Veredito:** **FAIL — a arquitetura está bem delimitada e ratifica grande parte do brownfield, mas ainda permite implementações incompatíveis no cálculo de overlays, na autorização de Claims e nos digests; além disso, o envelope nomeia runtimes Node já EOL.**

## Achados críticos

### C1 — Não existe política normativa completa que transforme Claim + evidências em um único outcome

**Referências:** AD-5 (linhas 57–61), AD-7 (69–73), AD-8 (75–79), AD-10 (87–91), AD-15 (117–121), AD-18 (135–139) e envelope operacional (228).

**Divergência concreta:** dois módulos que implementem `claim-policy` podem cumprir todas as regras e ainda produzir respostas incompatíveis. Por exemplo, para um Claim `approved` com uma evidência direta expirada, uma corroborativa ativa e uma evidência inválida em quarentena, uma implementação pode retornar `block`; outra, `review_required`; uma terceira pode aceitar a evidência corroborativa e retornar `allow_with_constraints`. AD-15 diz apenas que a evidência inválida “afeta” os dependentes, sem fixar o outcome. AD-18 mapeia severidade de `PolicyRule`, mas não resolve o lattice entre estado editorial, suporte, permissão, validade, supersession, ambiguidade e falhas de integridade.

**Por que o AD não previne o que promete:** o Core é chamado de determinístico, mas a função decisória não tem precedência normativa nem requisitos mínimos de suporte. Os reason codes também podem divergir porque não há relação obrigatória entre causa e outcome.

**Correção recomendada:** **discutir e fixar antes do handoff.** Adicionar uma regra/lattice normativa que determine, no mínimo:

- precedência entre falha de integridade, estado do Claim, estado da evidência e regra editorial;
- outcome de `draft`, `suspended`, `retired`, Claim desconhecido e Claim ambíguo;
- requisito mínimo para “sustentado” por categoria de Claim e risco editorial;
- quais `permission` e `supportRole` contribuem, e quando corroborativa/inferência/sinal nunca bastam;
- resolução de `supersedes`, incluindo cadeia válida e registro efetivo;
- comportamento de referência ausente, evidência inválida, expirada, futura, fora de escopo e restrita;
- regra conservadora de composição (por exemplo, outcome mais restritivo vence) e reason codes mínimos para cada causa.

**Teste de fechamento:** uma tabela de casos normativa deve fazer implementações Node e PHP produzirem o mesmo outcome e os mesmos reason codes ordenados.

### C2 — A ordem dos overlays está fixada, mas a semântica de merge e conflito não

**Referências:** AD-6 (63–67), convenções de contexto (147–149) e capability map (209–210).

**Divergência concreta:** `base -> locale -> mercado -> pageIntent/contentType -> canal/público` não determina o resultado quando dois overlays aplicáveis alteram o mesmo campo, quando há múltiplos overlays na mesma camada, nem como arrays/mapas são combinados. Duas implementações podem escolher “last write wins”, união de coleções, merge por chave, substituição total ou erro — todas compatíveis com a redação atual, mas com `ResolvedBrandContext`, seleção de Claims e `stateDigest` diferentes.

**Por que o AD não previne o que promete:** a precedência entre dimensões não é uma operação de composição completa. Também não está definido como remover uma entrada herdada, distinguir ausência de valor de remoção intencional, ou tratar colisões de overlays com a mesma especificidade.

**Correção recomendada:** **discutir e fixar antes do handoff.** Especificar uma álgebra mínima de overlays:

- cardinalidade e ordenação estável de overlays por dimensão;
- comparação de especificidade quando mais de um overlay casa;
- semântica para scalar, object e collection (substituição, merge por ID/chave, concatenação proibida etc.);
- mecanismo explícito de remoção/tombstone, se permitido;
- campos imutáveis por overlay e erro produzido quando houver tentativa de alterá-los;
- comportamento de empate/conflito não resolvível;
- normalização que alimenta `ResolvedBrandContext` e o digest.

**Teste de fechamento:** fixtures com dois overlays concorrentes devem produzir o mesmo JSON resolvido byte a byte em implementações independentes.

## Achados altos

### H1 — `stateDigest` e `decisionDigest` nomeiam o algoritmo, mas não definem o preimage canônico

**Referências:** AD-14 (111–115), convenção de integridade (151) e envelope (227).

JCS/RFC 8785 canonicaliza um valor JSON; não determina **qual** valor compõe o digest. O spine não fixa se `stateDigest` cobre documentos crus, memória resolvida, evidências válidas, evidências em quarentena, todos os records ou apenas os referenciados; tampouco fixa envelope, ordenação de records, normalização BCP-47/tempo/paths e ordem de reason codes. `request normalizado` também não possui contrato. Assim, vetores Node/PHP podem divergir mesmo usando SHA-256 + JCS corretamente.

**Correção recomendada:** **autofix arquitetural claro.** Definir envelopes JSON versionados para os dois preimages, lista exata de campos, inclusão/exclusão de registros, ordenação por ID, normalização de strings/contexto/instantes e representação de ausência. O `decisionDigest` deve hashear um objeto canônico, não a concatenação textual ambígua sugerida por `stateDigest + request + ...`.

### H2 — O runtime “verificado” permite somente versões Node EOL na base mínima

**Referências:** stack (160), envelope (221) e brownfield `packages/core/package.json` / `packages/mcp/package.json`.

Na data do spine, Node 18 e Node 20 já estão EOL; Node 22 e 24 são linhas LTS mantidas. A tabela registra Node `>=20` para MCP e o envelope preserva Core `>=18`, o que falha o requisito de tecnologia corrente e deixa uma fundação de segurança/compliance aceitar runtimes sem correções. A fonte oficial do Node lista v18 e v20 como EOL e v22/v24 como LTS: [Node.js releases](https://nodejs.org/en/about/previous-releases).

**Correção recomendada:** **discutir por ser mudança brownfield pública.** Fixar a linha mínima suportada e testada em uma LTS mantida (pelo menos Node 22; avaliar Node 24 como baseline), declarar matriz de CI e plano de mudança de `engines`. Se compatibilidade EOL for temporariamente mantida, rotulá-la como exceção com prazo e sem chamá-la de runtime suportado/verificado-current.

### H3 — Imutabilidade do ledger e autoridade de aprovação são promessas sem mecanismo verificável na V1

**Referências:** AD-3 (45–49), AD-4 (51–55), AD-5 (57–61) e AD-10 (87–91).

Um `evidenceId` opaco/UUID não vincula o ID ao conteúdo, e um loader que vê apenas o checkout atual não consegue distinguir uma evidência nova de uma edição retroativa. Da mesma forma, qualquer editor do JSON pode trocar um Claim para `approved` e preencher `ator/data`; o Core não sabe se esse ator tinha autoridade. Logo, “imutável”, “controlada pelo cliente” e “aprovação explícita” podem ser interpretados como enforcement do Core, regra de PR/CI ou mera convenção humana — implementações incompatíveis e expectativas de segurança distintas.

**Correção recomendada:** **discutir o trust boundary.** Para V1, escolher e declarar uma destas garantias: (a) repositório/branch protection é a autoridade, Core trata arquivos como input confiável e imutabilidade é fiscalizada por CI contra merge-base; (b) records são content-addressed/verificados; ou (c) assinatura/attestation é exigida. Se a escolha for (a), não representar `actor` como identidade autenticada e incluir o verificador append-only no gate de aceitação.

### H4 — A biblioteca/pipeline de validação estrutural está diferida até um ponto que ainda permite divergência V1

**Referências:** AD-12 (99–103), stack (168) e Deferred (243).

O spine exige JSON Schema 2020-12 e tipos derivados ou verificados, mas deixa para “antes da implementação do loader” tanto o validador runtime quanto o pipeline schema→TypeScript. Brand Memory e Evidence Ledger podem ser construídos por unidades diferentes e escolher engines, opções de formato/coerção/defaults e geração de tipos distintas. Isso afeta aceitação de dados, JSON Pointer, compatibilidade ESM/Node e diagnósticos — não é apenas detalhe local.

**Correção recomendada:** **resolver antes do handoff ou fechar a seam.** Vincular uma única porta de validação estrutural no Core com opções normativas (`no coercion`, `no default mutation`, formatos aceitos, coleta/ordenação de erros) e um único pipeline de tipos; então a biblioteca concreta pode continuar diferida sem permitir que loaders escolham independentemente. Se o handoff já é para implementação, selecionar e verificar a tecnologia agora.

## Achados médios

### M1 — O envelope operacional não fixa limites de recursos para um ledger controlado por arquivos

**Referências:** AD-4, AD-13, AD-15 e envelope (219–229).

A arquitetura cobre processo, transporte, efeitos externos, symlinks e determinismo, mas não tamanho máximo de Brand Memory/record/trecho, número máximo de records, profundidade JSON ou política de timeout/cancelamento. Um diretório grande ou JSON patológico pode bloquear o processo MCP local; implementações podem impor limites incompatíveis e produzir diagnósticos diferentes.

**Correção recomendada:** **deferir explicitamente com revisit condition ou fixar limites configuráveis com defaults seguros antes da implementação.** Pelo menos deve existir um budget único do Core e um erro estável para excesso.

### M2 — O contrato V1 de Context Packs não tem seam suficientemente delimitada

**Referências:** AD-16 (123–127), estrutura (182), capability map (215) e Deferred (248).

O spine diz que a V1 “define apenas o contrato de composição”, mas não decide se esse contrato é público, se é parte de `ResolvedBrandContext`, quais inputs/outputs possui, se é apenas tipos sem runtime ou se um pack local já pode participar da resolução. A precedência entre packs está corretamente adiada, mas a ausência do seam V1 permite que duas unidades exponham contratos diferentes agora.

**Correção recomendada:** **autofix/defer claro.** Declarar que V1 exporta somente tipos/schema sem loader e sem efeito em resolução, ou fixar a porta provider-neutral e seu ponto exato na sequência de overlays. Se nenhuma capacidade runtime existe, retirar `context-packs` da estrutura V1 e mantê-lo somente em Deferred.

### M3 — A restrição de produto contra promessas de ranking não sobrevive como invariante

**Referências:** fonte `addendum.md` (objetivo e guardrails) versus AD-16/AD-17/AD-18.

O addendum exige que SEO/GEO nunca sejam apresentados como previsão/garantia de ranking. O spine governa rastreabilidade e severidade, mas nenhuma regra impede uma `PolicyRule`, recomendação futura ou Context Pack de afirmar garantia de ranking. Isso é uma restrição silenciosa da fonte, especialmente relevante porque AD-16/17 já estabelecem o seam futuro de SEO/GEO.

**Correção recomendada:** **autofix de reconciliação.** Acrescentar à regra dos Context Packs/PolicyRule que outputs SEO/GEO são achados/recomendações explicáveis e jamais previsão ou garantia de ranking/citação.

## Checklist consolidado

| Critério | Resultado | Evidência resumida |
| --- | --- | --- |
| Divergências reais do nível abaixo foram fixadas | **FAIL** | Política decisória, merge de overlays, preimages de digest e trust boundary ainda divergem. |
| Cada AD é enforceable e previne o stated divergence | **FAIL** | AD-4, AD-6, AD-8/15 e AD-14 prometem propriedades sem mecanismo/semântica suficiente. |
| Deferred não permite divergência V1 | **FAIL** | Pipeline/semântica de validação é necessário antes dos dois loaders; Context Packs V1 está ambíguo. |
| Tecnologias nomeadas são atuais | **FAIL** | Versões de pacote/standards conferem com lockfile, mas mínimos Node 18/20 estão EOL em 2026-08-27. |
| Brownfield foi ratificado | **PASS com ressalva** | Pacotes, root boundary, ferramentas legadas, stdio e exports existentes foram preservados; a ressalva é ratificar engines EOL. |
| Capacidades/restrições das fontes foram cobertas | **PASS parcial** | Brand Memory, Ledger, Claims, tools read-only e separação das memórias estão cobertos; falta preservar explicitamente “sem garantia de ranking”. |
| Toda dimensão do feature está decidida/deferred/open | **PASS parcial** | Há envelope operacional, compatibilidade, dados, segurança e distribuição; faltam budgets operacionais e seam V1 inequívoca de Context Packs. |

## Pontos fortes que devem ser preservados

- Paradigma nomeado e coerente com o brownfield: Core provider-neutral, filesystem adapter local e MCP fino/read-only.
- Compatibilidade aditiva das tools, isolamento das capacidades novas e boundary de raiz/symlink estão explicitamente ratificados.
- Separação entre estado editorial persistido e suporte calculado com `evaluationTime` injetável é uma boa invariante.
- Portabilidade schema-first, ausência de migração silenciosa, tarball test e diagnósticos sanitizados formam um bom contrato de distribuição.
- O envelope exclui rede, provider, OAuth, Redis, multi-tenant e publicação, evitando expansão indevida da V1.

## Recomendação de gate

Não finalizar ainda. Resolver **C1, C2, H1 e H2** antes do status `final`; fixar o trust boundary de **H3** e fechar a seam de validação de **H4** no mesmo passe. M1–M3 podem ser tratados como autofix/deferred explícito, desde que o spine deixe de permitir interpretações V1 incompatíveis.

## Post-fix verification

**Data da nova verificação:** 2026-08-27
**Veredito pós-correção:** **FAIL — nenhum crítico permanece, e os antigos C1/C2/H1/H2 foram substancialmente corrigidos; ainda restam quatro achados altos de contrato que permitem respostas ou pacotes incompatíveis.**

### Verificação dos antigos críticos/altos

| Achado original | Resultado | Evidência pós-fix |
| --- | --- | --- |
| C1 — decisão Claim + evidência | **Corrigido parcialmente** | `PolicyDecisionTable v1`, evidência direta mínima, precedência conservadora e supersession fecham o núcleo; restam conflito de warning e semântica de `permission`, promovidos abaixo como PF-H1. |
| C2 — merge de overlays | **Corrigido** | AD-6 agora fixa ordem exata, cardinalidade, patches tipados, operações de coleção, proibição de concatenação e falha em conflito. |
| H1 — preimages de digest | **Corrigido parcialmente** | Os envelopes de preimage e normalização foram definidos; `engineVersion` e inclusão do próprio digest no resultado ainda são ambíguos, promovidos como PF-H3. |
| H2 — runtimes EOL | **Corrigido** | Stack e envelope agora elevam Core/MCP para Node 22+, com CI em 22/24 e migração na release do slice. |
| H3 — imutabilidade/aprovação | **Corrigido parcialmente** | CI add-only, trust statement e ausência de alegação criptográfica foram fixados; falta definir como o runtime deriva `historyStatus`, promovido como PF-H2. |
| H4 — schema runtime/pipeline | **Aceitável com ressalva média** | Merge prévio dos schemas/golden fixtures impede loaders independentes; a escolha única continua gate anterior ao loader, mas opções normativas do validator ainda merecem fechamento. |

### Altos remanescentes

#### PF-H1 — `PolicyDecisionTable` ainda conflita com AD-18 e não fecha o vocabulário de permissão

**Referências pós-fix:** AD-7, AD-8, AD-18 e `PolicyDecisionTable v1`.

- AD-18 permite que `warning` produza `allow_with_constraints` **ou** `review_required`; a tabela normativa exige `allow_with_constraints` para Claim aprovado/sustentado com warning. Como AD-8 manda aplicar exclusivamente a tabela, as duas regras são contraditórias.
- A tabela exige evidência “permitida”, mas não fixa valores de `permission` nem a matriz que determina quais classes podem sustentar um Claim. Dois engines podem aceitar de forma diferente fonte própria, autorizada, licenciada, pública ou restrita.

**Correção necessária:** tornar AD-18 idêntico à tabela (ou adicionar à tabela a condição objetiva que promove warning a revisão) e definir um vocabulário fechado de `permission` com contribuição decisória explícita. Golden fixtures devem cobrir cada valor.

#### PF-H2 — `historyStatus` altera o outcome, mas sua fonte de confiança não está definida

**Referências pós-fix:** AD-3, `PolicyDecisionTable v1` e aceitação CI add-only.

O runtime retorna `historyStatus: verified|unverified`, e `unverified` degrada um Claim sustentado para `allow_with_constraints`; porém o spine não diz como uma execução MCP local sabe que o checkout passou pela verificação CI. Inspecionar Git, confiar em um marker, receber attestation externa ou sempre usar `unverified` são implementações incompatíveis e produzem outcomes diferentes. Um marker dentro do próprio repositório não provaria o histórico que afirma.

**Correção necessária:** definir o boundary. Opção simples V1: MCP local sempre retorna `unverified`; somente o verificador CI separado emite um artefato/resultado `verified`, que a tool não consome como autoridade. Se `verified` precisar afetar runtime, especificar o canal de attestation, assinatura/trust root e falha segura.

#### PF-H3 — O preimage de decisão pode ser autorreferente e `engineVersion` ameaça vetores cross-runtime

**Referências pós-fix:** AD-14 e `Preimages de integridade`.

`decisionDigest = SHA256(JCS({ ..., normalizedResult }))` é impossível de calcular se `normalizedResult` contiver o próprio `decisionDigest`, como tende a ocorrer no contrato de resposta. Além disso, `engineVersion` em `stateDigest` não está definido: se significar versão da implementação/pacote, Node e PHP necessariamente produzirão digests diferentes, contrariando os vetores cross-runtime; se significar versão do algoritmo, deve ser renomeado/definido como constante contratual comum.

**Correção necessária:** declarar que `normalizedResult` exclui `decisionDigest` (e quaisquer campos não decisórios) e definir `engineVersion` como versão do algoritmo/policy compartilhada, ou removê-la do `stateDigest` e usar apenas `contractVersion`/`policyVersion`.

#### PF-H4 — A estrutura e o texto de exports divergem sobre dois versus seis schemas públicos

**Referências pós-fix:** AD-12, `Schemas públicos obrigatórios`, estrutura inicial e parágrafo imediatamente posterior à árvore.

AD-12 e a lista normativa exigem schemas públicos para oito contratos/áreas; a árvore mostra seis arquivos, mas o texto ainda afirma: “Os **dois** schemas são exceção: devem possuir exports estáveis”. Um implementador pode exportar apenas Brand Memory/Evidence, enquanto outro exporta todos, gerando tarballs incompatíveis.

**Correção necessária:** substituir “os dois schemas” por “todos os schemas públicos obrigatórios” e alinhar a árvore/exports com a lista normativa; se vários contratos compartilham arquivo, mapear explicitamente contrato → arquivo/export.

### Médios/baixos remanescentes

**4 médios, 0 baixos.**

1. **Budgets operacionais:** continuam ausentes limites de tamanho, quantidade, profundidade e timeout/cancelamento para ledger/JSON.
2. **Context Packs V1:** ainda não fica inequívoco se o contrato é apenas tipo/schema sem runtime ou uma porta já participando da resolução.
3. **SEO/GEO:** a restrição de nunca prometer ranking/citação continua não preservada como invariante.
4. **Validator runtime:** a seleção única está corretamente bloqueada antes dos loaders, mas ainda convém fixar `no coercion`, `no default mutation`, formatos, ordenação/coleta de erros e uma única porta de validação no Core.

### Scan de regressões

- **Sem regressão** na boundary local, compatibilidade das tools legadas, separação Core/MCP, ausência de rede/escrita/provider/Redis e isolamento de carregamento.
- AD-19 fecha adequadamente snapshot/TOCTOU; AD-20 fecha cadeia de supersession, fallback e reaprovação.
- Ingestão I-JSON, `$ref` offline, schemas/golden fixtures e testes em tarball fortalecem portabilidade e distribuição.
- A frase desatualizada sobre “dois schemas” é a única regressão estrutural evidente introduzida pela expansão da árvore de schemas.

### Recomendação pós-fix

Corrigir **PF-H1 a PF-H4** antes de marcar `status: final`. Os quatro médios podem ser resolvidos por regras curtas ou movidos para Deferred com condição objetiva, sem reabrir o desenho principal.

## Final targeted verification

**Data:** 2026-08-27
**Veredito:** **PASS — nenhum achado crítico ou alto do checklist good-spine permanece.**

- A `PolicyDecisionTable`, AD-7 e AD-18 agora fecham permission, suporte direto, warning e precedência de outcomes sem alternativas incompatíveis.
- `historyStatus` é diagnóstico não autoritativo na V1 e não interfere na decisão; futura verificação foi corretamente movida para atestação vinculada à revisão e ao digest.
- Os preimages definem `policyEngineVersion` cross-language e excluem digests/metadados do `DecisionBody`, removendo autorreferência e divergência Node/PHP.
- Todos os schemas obrigatórios possuem arquivos/exports estáveis alinhados, incluindo `ContextPackContribution` sem runtime V1.
- Os antigos médios de budgets, seam de Context Packs, garantias SEO/GEO e formatos/validator foram resolvidos no nível apropriado ao spine.
- O scan dirigido não identificou regressão crítica/alta nas boundaries brownfield, compatibilidade MCP, segurança local, snapshot, supersession, distribuição ou envelope operacional.

**Critical/high remaining:** `0/0`.
