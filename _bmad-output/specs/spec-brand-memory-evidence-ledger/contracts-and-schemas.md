---
type: spec-companion
spec: SPEC-brand-memory-evidence-ledger
content: contract-stack-and-schemas
status: derived
updated: '2026-08-27'
---

# Contratos e schemas — checkpoint técnico da Story 1

Este companion resolve a decisão tecnológica e define o contrato executável de “Publicar contratos e schemas portáteis”. Em conflito, o spine arquitetural continua soberano; este documento resolve apenas o deferred de runtime/pipeline e detalha sua implementação.

## Decisão vinculante

| Área | Escolha | Papel |
| --- | --- | --- |
| Validação runtime | `ajv` `8.20.x`, classe Draft 2020-12 | Compilar e validar todos os contratos estruturais em um único registry Core |
| Formats padrão | `ajv-formats` `3.0.x`, modo `full` | Validar RFC 3339 `date-time` e URI |
| Locale | `bcp-47` `2.1.x`, formato customizado `verbosia-bcp47` | Validar tags BCP 47 em modo estrito, sem normalizar ou mutar o input |
| Tipos TypeScript | `json-schema-to-typescript` `15.0.x` | Gerar tipos estruturais a partir dos JSON Schemas canônicos |
| Resolução de refs no gerador | resolver customizado do repositório | Mapear somente IDs do manifest para arquivos locais; HTTP desabilitado |

As versões patch exatas ficam registradas no `pnpm-lock.yaml`. Qualquer atualização repete os probes de Draft 2020-12, ESM, Node 22/24, formats, `$ref` offline e geração determinística antes do merge.

## Porta única de validação

`packages/core/src/contracts/validator.ts` é a única fábrica de validadores deste slice. Loaders e handlers futuros a reutilizam; nenhum deles instancia Ajv diretamente.

Configuração normativa:

```ts
{
  strict: true,
  allErrors: true,
  validateFormats: true,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
  $data: false
}
```

- Importar a classe 2020 por `ajv/dist/2020.js`; o default Draft 7 é proibido.
- Registrar `ajv-formats` em modo `full` e `verbosia-bcp47` antes de compilar schemas.
- Carregar o manifest, registrar todos os schemas e só então compilar os roots.
- Não definir `loadSchema`, não chamar `compileAsync` e não instalar resolver HTTP.
- Falta, duplicidade ou divergência entre manifest, arquivo e `$id` falha na inicialização do registry.
- O Core normaliza issues internamente; tipos, objetos de erro e mensagens nativas do Ajv não fazem parte de nenhum export público.
- O validator não aceita bytes nem arquivos. I-JSON, boundary, tamanho, snapshot e parse seguro pertencem à Story 2.

## Identidade, versão e convenções

- Dialeto obrigatório: `https://json-schema.org/draft/2020-12/schema`.
- Namespace de identidade: `https://schemas.verbosia.dev/contracts/v1/`.
- Cada root declara `$schema`, `$id`, `title`, `type: "object"` e `additionalProperties: false`.
- Documentos persistidos usam `schemaVersion: "1.0.0"`; requests/results usam `contractVersion: "1.0.0"`.
- Compatibilidade é por major: major desconhecida falha fechado; nenhuma migração silenciosa existe.
- Todo `$ref` deve resolver para um `$id` exato listado em `packages/core/schemas/manifest.json`.
- Todo objeto, inclusive objetos aninhados, declara `additionalProperties: false`.
- Campos e coleções necessários constam em `required`; coleção vazia é `[]`, não ausência.
- Campo opcional significa ausente; `null` não é aceito salvo se um schema futuro o declarar explicitamente.
- Maps livres são proibidos. Estruturas extensíveis usam arrays de registros identificados e fechados.
- Schemas canônicos não usam `tsType`, `tsEnumNames` ou qualquer keyword privada do gerador.
- Ordenação de propriedades no arquivo é determinística: metadados, identidade/versão, campos de domínio e `$defs`.
- IDs de domínio usam ASCII portátil, 1–128 caracteres, padrão `^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$`.
- Digest usa `^sha256:[0-9a-f]{64}$`; versão usa SemVer sem prefixo `v`.
- Arrays que representam sets declaram `uniqueItems: true`; ordem semântica permanece preservada apenas onde o contrato a nomeia.

## Registry e exports públicos

O manifest é ordenado por `name` e contém, para cada entrada, `name`, `file`, `id` e `export`. Não contém URL de download nem fallback remoto.

| Schema | Arquivo | Export de `@verbosia/core` |
| --- | --- | --- |
| Common definitions | `common.schema.json` | `./schemas/common` |
| Brand Memory | `brand-memory.schema.json` | `./schemas/brand-memory` |
| Evidence Record | `evidence-record.schema.json` | `./schemas/evidence-record` |
| Policy Rule | `policy-rule.schema.json` | `./schemas/policy-rule` |
| Policy Override | `policy-override.schema.json` | `./schemas/policy-override` |
| Diagnostic | `diagnostic.schema.json` | `./schemas/diagnostic` |
| Resolved Brand Context | `resolved-brand-context.schema.json` | `./schemas/resolved-brand-context` |
| Inspect Brand Context Request | `inspect-brand-context-request.schema.json` | `./schemas/inspect-brand-context-request` |
| Claim Validation Request | `claim-validation-request.schema.json` | `./schemas/claim-validation-request` |
| Claim Validation Report | `claim-validation-report.schema.json` | `./schemas/claim-validation-report` |
| Context Pack Contribution | `context-pack-contribution.schema.json` | `./schemas/context-pack-contribution` |

`./schemas/manifest` também é exportado. `files` inclui `dist`, `schemas`, `README.md` e `LICENSE`. O consumidor resolve o subpath e lê JSON por `fs`/`import.meta.url`; código first-party não usa import JSON estático.

## Vocabulário comum

### Contexto

`ContextDimensions` mantém dimensões separadas: `locale`, `market`, `pageIntent`, `contentType`, `channel`, `audience` e `editorialRisk`. `locale` usa `verbosia-bcp47`; risco usa `low < medium < high < critical`. Scope ausente significa global; não há wildcard.

### Efeitos e outcomes

- Efeito de regra: `informational | warning | blocking`.
- Outcome: `allow | allow_with_constraints | review_required | block`.
- A precedência agregada é `block > review_required > allow_with_constraints > allow`.

### Reason codes de Claim V1

```text
CLAIM_UNKNOWN
CLAIM_AMBIGUOUS
CLAIM_DRAFT
CLAIM_SUSPENDED
CLAIM_RETIRED
KNOWN_PROHIBITION
DIRECT_EVIDENCE_MISSING
EVIDENCE_NOT_YET_VALID
EVIDENCE_EXPIRED
EVIDENCE_REVOKED
EVIDENCE_RESTRICTED
EVIDENCE_PERMISSION_DENIED
EVIDENCE_SCOPE_MISMATCH
EVIDENCE_QUARANTINED
EVIDENCE_UNAVAILABLE
POLICY_WARNING
POLICY_BLOCKING
HUMAN_REVIEW_REQUIRED
```

### Diagnostic codes V1

```text
BRAND_MEMORY_NOT_FOUND
BRAND_MEMORY_INVALID
CONTRACT_SCHEMA_INVALID
CONTRACT_VERSION_UNSUPPORTED
DUPLICATE_ID
EVIDENCE_ENVELOPE_INVALID
EVIDENCE_PAYLOAD_INVALID
EVIDENCE_QUARANTINED
HISTORY_UNVERIFIED
ID_FILENAME_MISMATCH
OUTPUT_LIMIT_EXCEEDED
OVERRIDE_FORBIDDEN
POLICY_RULE_INVALID
REFERENCE_NOT_FOUND
REQUEST_INVALID
RESOURCE_LIMIT_EXCEEDED
ROOT_BOUNDARY_VIOLATION
SOURCE_DIGEST_MISMATCH
STATE_CHANGED_DURING_READ
SUPERSESSION_CYCLE
SUPERSESSION_DANGLING
SUPERSESSION_FORK
```

Adicionar ou renomear valor é alteração explícita de contrato; nenhum código livre atravessa a boundary pública.

## Contratos de domínio

Os schemas JSON são a definição campo a campo final. As tabelas abaixo fixam a shape que a implementação deve materializar e impedem decisões divergentes.

### `BrandMemory`

Campos top-level obrigatórios:

| Campo | Shape |
| --- | --- |
| `schemaVersion` | constante `1.0.0` |
| `brandId`, `revision`, `updatedAt` | ID portátil, SemVer e RFC 3339 |
| `identity` | `name` obrigatório; `legalName`, `description` e `website` opcionais |
| `voice` | arrays obrigatórios `toneTraits`, `avoidTraits`, `styleInstructions` |
| `audiences` | registros `audienceId`, `label`, `description` |
| `offerings` | registros `offeringId`, `name`, `description`, `status: active|inactive` |
| `differentiators` | registros `differentiatorId`, `statement`, `claimIds[]` |
| `terminology` | registros `termId`, `sourceTerm`, `preferred[]`, `forbidden[]`; cada variante possui `locale` e `value` |
| `restrictions` | registros `restrictionId`, `classification`, `text`, `scope` opcional |
| `claims` | registros globais `claimId`, `statement`, `status`, `evidenceIds[]`, `approval` condicional |
| `editorialRiskMinimums` | registros de scope + `minimumRisk` |
| `overlays` | overlays ordenados com selector exato e patch tipado |

Claim persiste apenas `draft | approved | suspended | retired`. `approved` exige `approval.approvedBy` e `approval.approvedAt`; `reviewAt` é opcional. Outros estados não carregam `approval`. Overlay selector contém exatamente um `dimension` entre `locale | market | pageIntent | contentType | channel | audience` e um `value`.

Patch permite somente:

- `set` de folhas estilísticas de voice;
- `add/removeIds` para terminology, CTA, examples e referências de Claims globais;
- adição de restrictions/compliance, nunca remoção;
- nenhum campo de identity, offering, differentiator, Claim statement/status/evidence ou fato material.

Patch vazio, ID duplicado, selector duplicado na mesma precedência e referência a Claim inexistente são inválidos; os três últimos exigem validação semântica nas Stories 3/5, não são simulados pelo JSON Schema.

### `EvidenceRecord`

| Campo | Shape |
| --- | --- |
| `schemaVersion`, `evidenceId`, `recordedAt` | versão, ID e RFC 3339 |
| `source` | `sourceType`, `title`, `locator`, `capturedAt`, `sourceDigest`, `excerpt` opcional e limitado |
| `provenance` | `originType`, `collectedAt`; publisher/ator opcionais e privados |
| `permission` | `mode`, `basis`, `purpose`, `scope`, attestation, revisão/expiração/revogação e `restricted` |
| `supportRole` | `direct | corroborative | signal | inference | hypothesis` |
| `scope` | dimensões exatas, sem wildcard |
| `validity` | `validFrom` obrigatório; `validUntil` opcional |
| `sensitivity` | `public | internal | confidential | restricted` |
| `supersedes` | `evidenceId` predecessor opcional |

`permission.mode` usa `claim_support | signal_only | prohibited`; `basis` usa `owned | authorized | licensed | public_reference | restricted`. Locator fechado usa `project_file | public_uri | record_reference` + `value`. Esses campos pertencem ao arquivo canônico e nunca são automaticamente expostos pelas respostas MCP.

### `PolicyRule` e `PolicyOverride`

`PolicyRule` exige `schemaVersion`, `ruleId`, `version`, `title`, `scope`, `conditions[]`, `effect`, `evidence[]`, `recommendation`, `automaticAction`, `reference`, `tests[]` e `calibration` condicional. Condition é uma lista fechada de átomos `{ fact, operator, values[] }`; operators são `equals | in | exists | absent`. Não há JavaScript, expressão textual executável ou template dinâmico.

`automaticAction` usa `none | suggest | safe_transform`; V1 só publica o contrato e não executa ação de Context Pack. Regra `blocking` exige `calibration` com `sampleSize`, `agreementRate`, `methodologyRef`, `approvedBy` e `approvedAt`; o threshold que torna esses valores suficientes continua sendo a open question de calibração.

`PolicyOverride` exige `schemaVersion`, `overrideId`, `ruleRef` no formato `ruleId@version`, `scope`, `effect`, `justification`, `approvalRef`, `validFrom` e `validUntil` opcional. Hard guards não são IDs de regra sobrescrevíveis; a Story 5 aplica `most-restrictive-wins`.

### `Diagnostic`

Todos os campos são obrigatórios para garantir ordenação e ausência/null determinísticos: `severityRank`, `severity`, `code`, `relativePath`, `jsonPointer`, `claimId`, `evidenceId`, `message` e `remediation`. Referências inaplicáveis usam string vazia. A relação é fixa: `0/info`, `1/warning`, `2/error`, `3/fatal`. Nenhum campo aceita stack, path absoluto, excerpt, segredo ou metadata livre.

### `ResolvedBrandContext`

Exige `contractVersion`, `evaluationTime`, `schemaVersions[]`, `stateDigest`, `brandId`, `revision`, `context`, `effectiveEditorialRisk`, `identity`, `voice`, `audiences`, `offerings`, `differentiators`, `terminology`, `restrictions`, `claims`, `appliedOverlayIds` e `diagnostics`.

É uma projeção allowlisted: Claim expõe apenas `claimId`, `statement` e `status`; nenhum evidence record, evidence ID, locator, excerpt, ator, path ou metadata livre aparece. `schemaVersions` e coleções sem ordem semântica são ordenadas deterministicamente.

### Requests e report de tools

`InspectBrandContextRequest` exige `contractVersion` e `locale`; `market`, `pageIntent`, `contentType`, `channel`, `audience` e `editorialRisk` são opcionais e, quando ausentes, são normalizados para defaults explícitos pela Story 3. Não recebe root, clock, path, limite ou flag de mutação.

`ClaimValidationRequest` exige `contractVersion`, `context` e `candidates[]` (1–100). Cada candidato exige `candidateId`, `text` e `claimIds[]`; zero IDs representa desconhecido, mais de um representa ambíguo e exatamente um segue para decisão determinística. Ordem é preservada; duplicidades são inválidas. O request não recebe `evaluationTime`.

`ClaimValidationReport` exige `contractVersion`, `evaluationTime` UTC com milissegundos, `policyEngineVersion`, `stateDigest`, `decisionDigest`, `outcome`, `results[]` e `diagnostics`. Cada result exige `candidateId`, `claimId` (vazio quando não resolvido), `outcome`, `reasonCodes[]`, `constraints[]` e `evidenceRefs[]`. A ordem de results reproduz a ordem de candidatos; reason codes seguem ordem normativa da PolicyDecisionTable.

### `ContextPackContribution`

Exige `schemaVersion`, `packId`, `version`, `name`, `description`, `license`, `locales[]`, `rules[]`, `references[]` e `tests[]`.

Cada LocaleProfile exige `locale`, `language`, `writingDirection`, `terminologySet` e `requiredReviewLevels[]`; `region`, `script`, `units`, `dateFormat`, `currency` e `searchIntentHints[]` são opcionais. Rules usam o contrato declarativo de `PolicyRule`; referências distinguem `evidence | hypothesis`. A allowlist não possui campos para código, segredo, dados de cliente, definição/mutação de Claim, loader, precedência de catálogo ou enfraquecimento de hard guard.

## Pipeline de tipos sem drift

`packages/core/scripts/generate-contract-types.mjs` lê o manifest e gera deterministicamente `packages/core/src/contracts/generated.ts`.

- O arquivo gerado é commitado, possui banner “do not edit” e exporta os tipos dos onze schemas.
- Root `@verbosia/core` reexporta tipos e constantes `CONTRACT_VERSION`/`CONTRACT_SCHEMA_IDS`; não reexporta Ajv.
- `pnpm contracts:generate` escreve por arquivo temporário + rename.
- `pnpm contracts:check` gera em memória, compara bytes e falha sem escrever.
- HTTP é `false`; resolver customizado aceita somente IDs exatos do manifest e lê somente o arquivo associado.
- O gerador usa `unknownAny: true`, `enableConstEnums: false`, estilo fixo e nomes derivados de `title`.
- Um teste compila o output gerado com o TypeScript bloqueado no lockfile.
- Um teste de convenções impede keywords estruturais não suportadas sem fixture explícita de equivalência entre schema e tipo.
- Nenhum interface manual duplica os contratos gerados.

## Golden fixtures

Formato compartilhável:

```json
{
  "fixtureVersion": "1.0.0",
  "schemaId": "https://schemas.verbosia.dev/contracts/v1/brand-memory.schema.json",
  "caseId": "brand-memory/missing-required",
  "valid": false,
  "instance": {},
  "expected": {
    "keyword": "required",
    "instancePath": ""
  }
}
```

Caso inválido acrescenta `expected.keyword` e `expected.instancePath`; caso válido omite `expected`. Nenhuma fixture fixa mensagem textual do Ajv. Fixtures são JSON puro e não importam código Node, permitindo consumo posterior pelo harness PHP.

Cobertura mínima:

- um documento completo válido e casos inválidos focados para cada root instanciável;
- `$schema`, `$id`, manifest 1:1, refs internas, ref ausente, ref fora do namespace e `$id` duplicado;
- objeto adicional, required ausente, `null`, enum inválido, ID/digest/version inválidos e limites de array;
- RFC 3339 com timezone, sem timezone, data impossível e instante UTC com/sem milissegundos onde aplicável;
- URI absoluta válida e entradas relativas/malformadas nos campos que exigem URI;
- BCP 47 válido `pt-BR`, `en-US`, `es-419`, script/extensão/grandfathered; inválido `pt_BR`, vazio, subtag excessiva e lixo residual;
- `fetch` canário não chamado quando um HTTPS `$ref` não está registrado;
- examples válidos em cada schema e fixtures inválidas realmente rejeitadas;
- geração mostra que formato/pattern/bounds continuam validados em runtime mesmo quando o tipo TypeScript é apenas `string`/`number`.

Story 1 executa todas as fixtures em Node. Story 7 reutiliza os mesmos arquivos no consumidor PHP e nos tarballs; não cria um conjunto paralelo.

## Code map da Story 1

```text
packages/core/
├── schemas/
│   ├── manifest.json
│   └── *.schema.json
├── scripts/generate-contract-types.mjs
├── src/contracts/
│   ├── generated.ts
│   ├── registry.ts
│   └── validator.ts
└── test/contracts/
    ├── fixtures/*.json
    ├── contracts.test.ts
    ├── formats.test.ts
    ├── offline-registry.test.ts
    └── generated-types.test.ts
```

Mudanças complementares permitidas: root/package scripts, `packages/core/package.json`, `packages/core/src/index.ts`, `pnpm-lock.yaml` e documentação dos exports. `packages/mcp/src` não muda nesta story.

## Critérios de aceitação da Story 1

| ID | Prova obrigatória |
| --- | --- |
| S1-AC1 | As dependências escolhidas estão lockadas; o probe usa Ajv 2020 e passa em Node 22 e 24. |
| S1-AC2 | Os onze schemas e o manifest cumprem identidade, fechamento, required, versão, vocabulários e refs allowlisted. |
| S1-AC3 | Todos os schemas compilam em um único registry offline; ref ausente/externa e ID duplicado falham sem chamada de rede. |
| S1-AC4 | `contracts:generate` é determinístico e `contracts:check` falha para output stale sem modificar o workspace. |
| S1-AC5 | Golden fixtures positivas/negativas e formats RFC 3339/URI/BCP-47 produzem os resultados esperados. |
| S1-AC6 | Tipos gerados são reexportados, nenhum tipo manual diverge e semantic constraints continuam cobertas no runtime. |
| S1-AC7 | Subpath exports e `files` resolvem manifest/schemas no pacote Core; a prova completa de tarball/PHP permanece na Story 7. |
| S1-AC8 | `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm contracts:check` e `git diff --check` passam, preservando os 105 testes-base. |
| S1-AC9 | Diff confirma ausência de loaders, snapshots, policy engine, novas tools MCP e alteração comportamental das duas tools legadas. |

## Fora desta story

- Parser I-JSON, leitura segura, boundary, snapshot, JCS/SHA-256 e limites de filesystem: Story 2.
- Loader/semântica de Brand Memory, overlays e normalização contextual: Story 3.
- Ledger, permission, validity, sensitivity, supersession e quarentena: Story 4.
- PolicyDecisionTable, reason-code emission, calibration e overrides: Story 5.
- Registro e execução das duas tools novas: Story 6.
- Migração conjunta de engines, tarballs finais, PHP e hardening cross-runtime: Story 7.
- Cenário real iterativo: Story 8.
