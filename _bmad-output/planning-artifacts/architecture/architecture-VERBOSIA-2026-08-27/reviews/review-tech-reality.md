# Review — Tech Reality Gate

**Artifact:** `ARCHITECTURE-SPINE.md`

**Date:** 2026-08-27

**Lens:** versões, padrões, runtime, distribuição e compatibilidade ESM
**Verdict:** **CONDITIONAL PASS**

A stack escolhida é implementável e está alinhada com o repositório atual. As versões declaradas no spine foram confirmadas, o SDK MCP v2 é a linha estável oficial e JSON Schema Draft 2020-12 e JCS/RFC 8785 são escolhas adequadas. Antes da implementação, porém, duas lacunas de alta importância precisam ser transformadas em regras vinculantes: as pré-condições I-JSON exigidas pelo JCS e a distinção entre compatibilidade histórica e runtimes Node efetivamente suportados em produção.

## Evidência verificada

| Item | Evidência local/primária | Resultado |
| --- | --- | --- |
| Node.js local | `node --version` | `v22.22.3`, como declarado. |
| Engine MCP | `packages/mcp/package.json` e package instalado `@modelcontextprotocol/server@2.0.0` | Ambos declaram Node `>=20`; compatibilidade nominal confirmada. |
| Engine Core | `packages/core/package.json` | Node `>=18.0.0`, como descrito no envelope. |
| pnpm | `packageManager` raiz e `pnpm --version` | `10.33.2`, como declarado. |
| TypeScript | `pnpm-lock.yaml` | `5.9.3`; o manifesto usa a faixa `^5.6.3`. Typecheck de Core e MCP passou. |
| MCP SDK | lockfile, package instalado e [repositório oficial](https://github.com/modelcontextprotocol/typescript-sdk) | `@modelcontextprotocol/server@2.0.0`; v2 é oficialmente estável e usa os packages separados `server`/`client`. |
| Zod | lockfile e imports atuais | `4.4.3`; a boundary MCP já importa `zod/v4`, coerente com os exemplos oficiais do SDK v2. |
| JSON Schema | [página oficial do Draft 2020-12](https://json-schema.org/draft/2020-12) | Draft 2020-12 continua sendo a publicação oficial corrente; escolha válida para contratos portáveis. |
| JCS | [RFC 8785 no RFC Editor](https://www.rfc-editor.org/rfc/rfc8785) | Esquema de canonicalização correto para digests interoperáveis; RFC é Informational, não Standards Track, mas especifica comportamento conformante. |
| ESM atual | `type: module`, build existente e imports dos packages | Imports ESM de `@verbosia/core` e `@verbosia/mcp` executaram no Node local. Todos os imports relativos atuais possuem extensão `.js`. |
| Distribuição dos schemas | `npm pack --dry-run --json ./packages/core` | Viável após implementação, mas o tarball atual não contém `schemas/` porque `files` inclui apenas `dist`, README e LICENSE. O gate proposto no spine é necessário e adequado. |

## Findings

### Tier 1 — resolver antes de implementar

#### T1.1 — O contrato JCS não declara nem prova suas pré-condições I-JSON

**Localização:** AD-14; Convenções de consistência / Integridade.

O spine exige SHA-256 sobre JCS/RFC 8785, mas não exige que o parser rejeite nomes de propriedades duplicados antes de produzir o objeto, nem delimita números ao modelo interoperável IEEE 754. O RFC 8785 exige I-JSON: nomes únicos, strings Unicode válidas e números representáveis em precisão dupla; números que precisem de maior precisão devem ser representados como strings. Um `JSON.parse` convencional perde a informação de chaves duplicadas antes de JSON Schema ou JCS poderem validá-la. PHP e JavaScript também podem interpretar inteiros grandes de maneiras diferentes.

**Consequência:** dois documentos textualmente distintos podem convergir para o mesmo objeto/digest, ou Node e PHP podem gerar digests diferentes. Isso enfraquece exatamente a trilha de integridade que `stateDigest` e `decisionDigest` pretendem garantir.

**Correção exigida:** tornar vinculante uma etapa de ingestão I-JSON anterior à validação de schema e à canonicalização: detectar/rejeitar propriedades duplicadas no texto bruto, lone surrogates/Unicode inválido e números fora do domínio interoperável; representar identificadores, valores monetários de precisão arbitrária e inteiros longos como strings. Adicionar vetores cruzados Node/PHP para duplicatas, limites IEEE 754, `-0`, expoentes, caracteres não ASCII e ordenação UTF-16.

#### T1.2 — Os mínimos Node declarados estão tecnicamente compatíveis, mas fora de suporte em 2026

**Localização:** Stack verificado; Envelope operacional; Deferred da biblioteca de JSON Schema.

O SDK MCP 2.0.0 realmente declara Node `>=20`, e os manifests do Verbosia declaram MCP `>=20.0.0` e Core `>=18.0.0`. Entretanto, a [matriz oficial de releases do Node.js](https://nodejs.org/en/about/previous-releases) marca Node 18 como EOL desde 2025-03-27 e Node 20 como EOL desde 2026-03-24; a própria documentação recomenda produção somente em linhas Active LTS ou Maintenance LTS. O runtime local Node 22 ainda é LTS.

**Consequência:** dizer apenas “Node 18+/20+” pode ser entendido como suporte de produção a runtimes sem correções de segurança. A escolha da futura biblioteca de JSON Schema também pode ser indevidamente limitada por uma linha EOL.

**Correção exigida:** separar formalmente `compatibilityFloor` de `supportedRuntime`. Recomenda-se suportar e testar em produção Node 22+ (idealmente matriz 22/24), mantendo Node 18/20 apenas como compatibilidade best-effort temporária se a política pública não puder mudar neste slice. Definir data/versão para elevar os campos `engines` e não vincular a escolha do validador a um runtime EOL sem justificativa explícita.

### Tier 2 — fechar no design da implementação

#### T2.1 — “Schema-first portátil” precisa de identidade e política de vocabulários

**Localização:** AD-12; Convenções de consistência / Contratos.

`schemaVersion` é versão do documento Verbosia, não identifica o dialeto JSON Schema. Cada schema publicado deve declarar `$schema: "https://json-schema.org/draft/2020-12/schema"` e um `$id` absoluto, estável e versionado. Também é necessário definir se `$ref` pode sair do pacote; para a V1 local/offline, a resposta segura é impedir resolução remota e empacotar todas as referências necessárias. No Draft 2020-12, `format` pode ser apenas anotação dependendo do validador, então `date-time`, URI e BCP-47 não devem ser considerados validados sem configuração/teste explícitos ou regra semântica do Core.

**Consequência:** validadores Node e PHP podem resolver referências, formatos e vocabulários de maneira diferente apesar de aceitarem o mesmo Draft.

**Correção exigida:** definir `$schema`, `$id`, política offline de `$ref`, conjunto de vocabulários/formats obrigatórios e fixtures de conformidade executadas contra as duas implementações de referência.

#### T2.2 — Importar JSON estaticamente não é portátil em toda a faixa ESM declarada

**Localização:** AD-12; Estrutura inicial; Envelope operacional.

Node 18.0 documentava JSON modules com `assert { type: 'json' }`; Node 22 removeu import assertions e usa `with { type: 'json' }`. O histórico oficial mostra import attributes apenas a partir de Node 18.20/20.10 e a remoção das assertions no Node 22. Portanto, um import JSON estático não cobre de forma limpa `>=18.0.0` até Node 22+.

**Consequência:** o Core pode passar no runtime local e falhar no mínimo declarado, ou vice-versa, dependendo da sintaxe emitida pelo TypeScript.

**Correção exigida:** para os schemas usados em runtime, carregar bytes por `fs` relativos a `import.meta.url`, gerar módulo JavaScript durante o build, ou elevar o engine. Os exports públicos podem continuar apontando para os `.json`, mas o teste de tarball deve validar acesso via método documentado em cada runtime suportado. Referência: [Node 18 ESM](https://nodejs.org/download/release/v18.0.0/docs/api/esm.html) e [Node 22 ESM](https://nodejs.org/download/release/v22.22.0/docs/api/esm.html).

#### T2.3 — `moduleResolution: Bundler` é permissivo demais para packages executados diretamente pelo Node

**Localização:** `tsconfig.base.json`; Stack verificado / ESM.

Core e MCP são emitidos por `tsc` e executados diretamente como ESM, mas o tsconfig compartilhado usa `moduleResolution: "Bundler"`. A [documentação oficial do TypeScript](https://www.typescriptlang.org/tsconfig/moduleResolution.html) reserva `bundler` para bundlers e observa que ele não exige extensões em imports relativos, enquanto `node16`/`nodenext` modelam o resolver real do Node. O código atual está correto — todos os imports relativos verificados usam `.js` — mas o compilador não impede uma regressão futura.

**Consequência:** um novo módulo pode passar no typecheck e falhar somente no runtime/tarball com `ERR_MODULE_NOT_FOUND`.

**Correção exigida:** preferir um tsconfig NodeNext específico para Core/MCP, ou manter a configuração atual com lint obrigatório para extensões e smoke test que importe o tarball instalado em Node 22/24. O smoke test ESM deve entrar no mesmo gate do tarball dos schemas.

## Fit e conclusão

- **MCP SDK 2.0.0 + Zod 4.4.3:** fit confirmado; versões locais e orientação oficial coincidem.
- **TypeScript 5.9.3 + ESM:** fit atual confirmado; a estratégia de resolução precisa do guard descrito em T2.3.
- **JSON Schema 2020-12:** escolha adequada e portátil, condicionada à identidade, vocabulários e política offline de referências.
- **JCS/RFC 8785:** escolha adequada para reprodutibilidade, condicionada a ingestão I-JSON estrita antes de parse/validação.
- **Schemas no pacote:** viável; adicionar `schemas` a `files`, exports explícitos e teste do tarball instalado. O `npm pack --dry-run` atual confirma que isso ainda não existe e que o gate não pode ser omitido.
- **Node:** compatibilidade nominal confere com manifests e SDK; política de suporte precisa apontar para versões LTS não-EOL.

Com T1.1 e T1.2 incorporados como regras/gates, não há impedimento tecnológico para adotar o spine.

## Post-fix verification

**Date:** 2026-08-27

**Verdict:** **PASS WITH MINOR CORRECTIONS**

**Remaining critical/high:** 0

**Remaining medium:** 2
**Remaining low:** 0

### Former findings

| Finding | Status | Evidence in corrected spine |
| --- | --- | --- |
| I-JSON/JCS preconditions | **Resolved** | “Ingestão JSON” now requires strict UTF-8/I-JSON validation before parse, rejects duplicate keys, lone surrogates and non-interoperable numbers, and the acceptance gate requires identical Node/PHP vectors, preimages and digests. |
| Supported versus compatible Node runtimes | **Resolved** | Stack and envelope move the slice to Node 22+, CI binds Node 22/24 LTS, and inherited Node 18/20 engines are explicitly identified as EOL compatibility rather than future support. |
| JSON Schema identity and offline references | **Resolved** | AD-12 requires Draft 2020-12 `$schema`, absolute/versioned `$id`, packaged registry and no network resolution. |
| Static JSON imports across ESM runtimes | **Resolved** | The envelope forbids static JSON imports and requires `fs`/`import.meta.url` or generated modules. |
| Node ESM and tarball verification | **Resolved** | Acceptance installs tarballs on Node 22/24 and verifies public imports, schemas and MCP `stdio`; TypeScript must move to `NodeNext` if those smoke tests fail. |

### Remaining medium findings

#### M1 — Format validation semantics remain implicit

AD-12 closes the dialect and registry behavior, but the corrected spine still does not say whether JSON Schema `format` is assertion or annotation, nor explicitly assigns ISO/RFC 3339, URI and BCP-47 validation to the Core. Draft 2020-12 permits validators to treat formats differently. Add one normative sentence: formats are never trusted as annotations alone; the selected validator must enable the required assertion vocabulary where available, and the Core must semantically validate every required format with shared Node/PHP fixtures.

#### M2 — Schema distribution text still says “two schemas” after expanding the public set to six

“Estrutura inicial” now lists six public schema files and “Schemas públicos obrigatórios” names the corresponding contracts, but the paragraph below the tree still says “Os dois schemas são exceção”. This stale count can lead an implementer to export only Brand Memory and Evidence Record, contradicting AD-12 and the tarball gate. Replace it with “Todos os schemas públicos acima são exceções e devem possuir exports estáveis”.

### Regression scan

No new version, engine, MCP SDK, Zod, TypeScript, JCS or ESM compatibility regression was found. The normalized preimages are now structurally defined and avoid string concatenation; using NFC as an explicit application normalization before JCS does not violate RFC 8785 as long as the same normalization contract and fixtures are used in Node and PHP.
