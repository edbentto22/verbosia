# Addendum — Matrizes de Inteligência Linguística, SEO e GEO

## Objetivo

Criar uma camada de decisão que adapte localização, SEO e preparação para mecanismos generativos à combinação de **locale**, **mercado**, **intenção da página**, **tipo de conteúdo** e **risco editorial**. A matriz deve tornar regras explícitas e auditáveis; não deve simular uma capacidade de prever ou garantir ranking.

## Modelo de decisão

```text
Perfil de locale + Perfil de mercado + Intenção + Tipo de conteúdo + Política de risco
                                      ↓
                  Regras aplicáveis, evidências requeridas e ações permitidas
                                      ↓
                    Achados explicáveis → revisão → publicação controlada
```

Cada regra terá: `id`, escopo, condição, severidade, evidência, recomendação, ação automática permitida e referência. Regras são versionadas e testadas; uma recomendação sem evidência será classificada como hipótese, nunca como requisito.

## Matrizes propostas

| Matriz | Pergunta que responde | Exemplo de decisão |
|---|---|---|
| Locale e escrita | Como o conteúdo deve ser expresso neste idioma/variante? | `pt-BR` e `pt-PT` compartilham idioma-base, mas exigem variantes, vocabulário e revisão independentes. |
| Mercado e intenção | Para quem e para qual intenção de busca a página existe? | Uma landing page transacional para México pode exigir moeda, prova local, CTA e variante `es-MX`; um guia informativo não deve receber os mesmos requisitos. |
| SEO internacional | A relação técnica entre versões está correta? | Exigir URLs distintas e um conjunto recíproco de alternates/hreflang, incluindo a própria variante quando aplicável. |
| Qualidade de localização | A variante preserva propósito, entidades, tom e fatos? | Bloquear publicação quando um termo obrigatório, uma entidade ou um aviso legal for alterado indevidamente. |
| GEO responsável | O conteúdo é claro, verificável e recuperável como fonte? | Sinalizar alegação factual sem fonte, resposta central ausente, autoria opaca, dados sem data ou contradição entre idiomas. |
| Risco e aprovação | O agente pode publicar sozinho? | Saúde, finanças, jurídico, páginas de preço e conteúdo com alegação factual exigem revisão humana. |

## Perfil de locale

O `LocaleProfile` não é uma coleção de estereótipos culturais. É uma configuração explícita, revisável e extensível por negócio:

```ts
interface LocaleProfile {
  locale: string;                 // BCP-47, por exemplo: pt-BR, es-419, en-US
  language: string;
  region?: string;
  script?: string;
  writingDirection: 'ltr' | 'rtl';
  terminologySet: string;
  units?: 'metric' | 'imperial' | 'market-defined';
  dateFormat?: string;
  currency?: string;
  searchIntentHints?: string[];
  requiredReviewLevels: string[];
}
```

Os primeiros perfis devem refletir os pares já demonstrados pelo produto (`pt-BR`, `en-US`, `es-419`), mas a matriz precisa nascer com BCP-47 como chave — não apenas o idioma-base — para evitar tratar mercados diferentes como se fossem equivalentes.

## Lógica sequencial para agentes

1. **Classificar** documento, intenção, mercado, idioma de origem, locale alvo e risco.
2. **Carregar contexto**: guia de marca, glossário, entidades, fontes permitidas, regras locais e limites de custo.
3. **Planejar localização**: segmentos, campos, slug, metadados e variações necessárias; nenhuma escrita ainda.
4. **Executar tradução** preservando termos, estrutura e memória de tradução.
5. **Validar qualidade**: fidelidade, termos obrigatórios, entidades, datas, unidades, moeda, links e campos críticos.
6. **Validar SEO internacional**: URL, `lang`, canonical, `hreflang`, `x-default`, sitemap e dados estruturados suportados pelo adaptador.
7. **Avaliar prontidão GEO**: resposta útil e direta, estrutura semântica, autoria/atualização, alegações com evidência e consistência entre variantes.
8. **Aplicar política de aprovação**: liberar, solicitar revisão ou bloquear; o relatório explica cada decisão.
9. **Publicar e medir**: registrar a versão, as regras aplicadas e os resultados disponíveis em sistemas de analytics. Medição de ranking/citação será posterior e nunca altera uma regra sem validação humana.

## Níveis de decisão

| Nível | Efeito | Exemplo |
|---|---|---|
| Informativo | Aponta oportunidade sem impedir publicação. | Melhorar a resposta-resumo ou adicionar data de atualização. |
| Aviso | Requer justificativa ou revisão configurada. | Pouca adaptação local para uma página de conversão. |
| Bloqueador | Impede publicação até resolução. | `hreflang` inválido, idioma não permitido, termo protegido alterado, alegação de alto risco sem fonte. |

## Regras de produto

- SEO técnico é verificável; recomendações editoriais e GEO devem declarar grau de confiança e evidência.
- A matriz nunca cria fatos, fontes, avaliações de clientes, disponibilidade local ou sinais de autoridade inexistentes.
- Localização pode adaptar linguagem, formato e intenção; não pode alterar promessa comercial, preço, requisitos legais ou fato material sem aprovação.
- Toda regra automática precisa ser desligável e sobrescrevível, com justificativa registrada.
- Regras por idioma devem ser adicionadas por evidência, feedback de revisão e resultados medidos — não por suposição.

## Evolução e validação

1. Construir fixtures com erros intencionais para `pt-BR`, `en-US` e `es-419`.
2. Medir concordância entre o relatório e revisores humanos antes de tornar qualquer regra bloqueadora.
3. Integrar dados de Search Console e analytics apenas como observabilidade; correlação não prova causalidade.
4. Criar conectores e perfis adicionais conforme demanda comprovada por mercado e aplicação.

## Verbosia Signals — inteligência de mercado com memória separada

O produto não deve armazenar sinais de mercado como se fossem traduções aprovadas ou fatos permanentes. A evolução proposta separa quatro camadas:

| Camada | Conteúdo | Política de persistência |
|---|---|---|
| Translation Memory | Traduções aprovadas por segmento | Permanente e versionada, como já existe |
| Brand Memory | Tom, serviços, provas, diferenciais, restrições e termos da marca | Permanente, versionada e controlada pelo cliente |
| Market Signals | Temas, dores, linguagem, objeções e perguntas por nicho/localidade | Agregada, com TTL; sem retenção longa de reviews crus |
| Evidence Ledger | Fonte, data, localidade, licença/permissão e suporte de cada afirmação | Rastreável e vinculada à decisão produzida |

### Fontes e finalidade

| Fonte | Sinal extraído | Uso permitido |
|---|---|---|
| Google Maps / Places | Categorias, atributos, temas e linguagem local agregada | Brief transitório por cidade/nicho, respeitando atribuição e políticas |
| Google Business Profile próprio | Reviews, respostas e mudanças autorizadas | FAQ, reputação e melhoria de páginas do próprio cliente |
| Canais sociais próprios | Dúvidas, objeções, desejos e vocabulário emocional | Tom local, CTAs e planejamento editorial |
| Search Console | Consultas, impressões, CTR e páginas com oportunidade | Priorização baseada em desempenho observado |
| Site e CRM autorizados | Perguntas comerciais, termos de leads e motivos de perda | Conteúdo que reduz atrito de decisão, com governança de dados |

### Família futura de tools

- `verbosia.market_scan` — produz brief de demanda, linguagem e objeções por nicho, cidade, idioma e público.
- `verbosia.content_gap_analysis` — compara o conteúdo autorizado com sinais agregados e aponta lacunas.
- `verbosia.localize_with_context` — combina Translation Memory, Brand Memory e Market Brief sem criar promessas.
- `verbosia.geo_readiness` — avalia clareza, utilidade, evidência, rastreabilidade e estrutura técnica.
- `verbosia.reputation_reply_draft` — prepara resposta para review do perfil próprio, sem publicação automática.
- `verbosia.claim_validator` — bloqueia superlativos, proximidade, segurança ou números sem evidência aprovada.

### Guardrails de produto e compliance

- Dados próprios e autorizados podem alimentar Brand Memory conforme a política do cliente.
- Dados públicos de terceiros geram somente sinais agregados, com origem, localidade, data e TTL.
- Texto bruto de review usa retenção mínima necessária e nunca atravessa clientes.
- O Evidence Ledger distingue fato aprovado, sinal observado, inferência e hipótese.
- Integrações respeitam API, field masks, atribuição, custo, termos e permissões aplicáveis; não haverá scraping disfarçado.
- Toda ação externa nasce como rascunho; publicação ou resposta exige aprovação explícita.
- GEO permanece extensão de conteúdo útil, original, acessível e verificável — nunca um conjunto de hacks ou garantia de ranking.

O fluxo analítico futuro passa a ser: coletar sob autorização → minimizar → agregar → registrar evidência → gerar brief → localizar/transcriar → validar claims → aprovar → aplicar → medir.

## Referências de partida

- [Google: versões localizadas](https://developers.google.com/search/docs/advanced/crawling/localized-versions)
- [Google: sites multilíngues e multirregionais](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)
- [Google: conteúdo útil e confiável](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [Google: conteúdo gerado por IA](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content)
- [Google: otimização para recursos de IA](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
- [Google: dados estruturados de negócios locais](https://developers.google.com/search/docs/appearance/structured-data/local-business)
- [Google Places: Place Details](https://developers.google.com/maps/documentation/places/web-service/place-details)
- [Google Places: políticas](https://developers.google.com/maps/documentation/places/web-service/policies)
- [Google Business Profile: reviews](https://developers.google.com/my-business/content/review-data)
