---
type: spec-companion
spec: SPEC-brand-memory-evidence-ledger
content: acceptance-matrix
status: derived
updated: '2026-08-27'
---

# Matriz de aceitação — Brand Memory + Evidence Ledger V1

Esta matriz define as provas mínimas de cada capability. O spine arquitetural continua normativo para contratos, decisão, segurança e limites.

## Capabilities e provas

| Capability | Cenários obrigatórios | Evidência de conclusão |
| --- | --- | --- |
| CAP-1 | Brand Memory válida; arquivo ausente; schema inválido; major desconhecida; conteúdo acima do limite; projeto legado sem memória | Loader sob demanda, diagnósticos estáveis e tools legadas inalteradas |
| CAP-2 | Base isolada; cada seletor exato; conflito na mesma precedência; tentativa de criar/mutar Claim; downgrade de risco; locale BCP-47 inválido | `ResolvedBrandContext`, `stateDigest` e fixtures golden determinísticos |
| CAP-3 | Evidência direta/corroborativa; permissão válida, expirada, revogada, restrita e signal-only; escopo global/exato; locator divergente; cadeia, fork, ciclo, dangling edge, envelope ilegível e payload inválido | Grafo efetivo correto, `SOURCE_DIGEST_MISMATCH`, falha global ou quarentena conforme spine, sem vazamento |
| CAP-4 | Claim desconhecido, ambíguo, draft, approved, suspended e retired; evidência ausente/expirada/quarentenada; warning e blocking; candidatos duplicados | Um resultado por candidato em ordem, agregado por precedência e golden responses da `PolicyDecisionTable` |
| CAP-5 | Tool válida; memória ausente; input inválido; evidência restrita; erro de domínio; config com log em stdout | Quatro tools no handshake, equivalência `text`/`structuredContent`, stdout limpo e allowlist sem canários |
| CAP-6 | Todos os schemas; `$id`/`$schema`; `$ref` offline; formats RFC 3339/URI/BCP-47; pacote instalado em Node 22/24; consumidor PHP | Tarballs resolvem exports, tipos não divergem e fixtures cross-runtime produzem os mesmos resultados/digests |
| CAP-7 | Rule completa/incompleta; override válido/expirado/conflitante; tentativa de sobrescrever hard guard; promoção warning→blocking | `most-restrictive-wins`, auditoria completa e evidência de concordância humana antes de blocking |
| CAP-8 | Leitura estável; troca concorrente de arquivo/symlink; repetição idêntica; limite de arquivo/ledger/Claims/diagnósticos; ordem de filesystem distinta | `stateDigest`/`decisionDigest` portáveis, `STATE_CHANGED_DURING_READ` e códigos estáveis de limite |
| CAP-9 | LocaleProfile completo/inválido; PolicyRule declarativa; pack com código, dado de cliente, Claim ou enfraquecimento de regra; tentativa de carregar pack em runtime | Contrato publicado e validado; nenhuma execução, catálogo, rede ou influência na decisão V1 |

## Contrato comunitário mínimo

`ContextPackContribution` deve conseguir representar, sem código executável:

- locale BCP-47, idioma, região/script opcionais, direção de escrita, conjunto terminológico, unidades, formato de data, moeda, pistas de intenção e níveis de revisão;
- regra com ID, versão, escopo, condição, severidade, evidência, recomendação, ação automática permitida e referência;
- aplicabilidade por locale, mercado, intenção, tipo de conteúdo e risco editorial;
- classificação explícita de recomendação sem evidência como hipótese, nunca requisito.

O contrato não habilita catálogo, precedência entre packs, carregamento runtime, publicação ou uso de dados de clientes na V1.

## Gates transversais

- `pnpm build`, `pnpm typecheck`, `pnpm test` e `git diff --check` passam com os 105 testes originais preservados e as novas suítes.
- O E2E `stdio` real lista quatro tools e preserva contratos observáveis das duas tools legadas.
- Código first-party das análises novas comprova zero escrita, rede, Redis e provider; `stdout` permanece exclusivo do protocolo.
- Testes de boundary cobrem diretório, Brand Memory, evidence record, locator interno, symlink e troca concorrente.
- CI rejeita alteração/remoção de evidence record existente e exige revisão da Brand Memory.
- Scanner e canários provam ausência de PII/segredos em `text`, `structuredContent`, `stderr`, diagnósticos e erros.
- Tarballs instalam e iniciam Core/MCP em Node 22 e 24; todos os schemas públicos são resolvidos offline.
- Vetores I-JSON/JCS, preimages e SHA-256 coincidem entre Node e PHP.
- Reason codes, diagnósticos e referências mantêm vocabulário/ordem fechados e versionados.

## Fixtures multilíngues

Cada conjunto `pt-BR`, `en-US` e `es-419` inclui pelo menos:

- termo obrigatório correto e alterado;
- Claim factual com evidência válida, ausente e expirada;
- moeda, data, unidade e CTA aplicáveis ao contexto;
- promessa comercial ou fato material alterado por overlay;
- conteúdo de alto risco e tentativa de downgrade pelo request;
- hipótese ou sinal tratado incorretamente como evidência direta;
- warning editorial e candidato a blocking avaliado por revisores humanos.

O relatório automatizado deve ser comparado com revisores humanos antes de habilitar blocking editorial. O tamanho da amostra e o limiar de concordância permanecem uma pergunta aberta da SPEC.

## Gate E2E iterativo

Após a implementação, o usuário fornece um cenário real com projeto, Brand Memory, evidências, Claims, contextos e outcomes esperados. Cada ciclo executa as quatro tools, compara resultados e rastreabilidade, classifica divergências, corrige a causa no Core ou contrato e adiciona regressão permanente.

O gate encerra somente quando:

- todos os outcomes esperados são atendidos ou renegociados explicitamente;
- nenhuma evidência restrita ou dado sensível aparece nos canais observáveis;
- execuções repetidas sobre o mesmo estado produzem os mesmos digests e decisões;
- tools legadas permanecem compatíveis;
- a suíte completa passa após cada correção;
- não existe defeito conhecido sem teste, decisão ou deferimento explícito.
