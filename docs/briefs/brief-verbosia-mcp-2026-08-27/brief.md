---
title: "Product Brief — Verbosia MCP"
status: draft
created: 2026-08-27
updated: 2026-08-27
---

# Product Brief — Verbosia MCP

## Resumo executivo

O Verbosia MCP será uma camada local de inteligência para conteúdo multilingue. Ele permitirá que qualquer agente ou aplicação compatível com MCP planeje, traduza, revise, valide e publique conteúdo localizado com as mesmas regras de qualidade, SEO internacional e governança editorial, sem que cada integração precise reinventar esses fluxos.

O produto não será vendido como um gerador de posições ou citações em mecanismos de busca. Sua promessa é mais útil e defensável: produzir artefatos localizados corretos, rastreáveis, tecnicamente indexáveis, semanticamente consistentes e acompanhados de evidências para decisões editoriais. A qualidade, a originalidade e a autoridade do conteúdo continuam sendo responsabilidades humanas e do negócio.

## Problema e oportunidade

Hoje, traduzir, revisar, localizar, aplicar `hreflang`, manter sitemaps e preparar conteúdo para experiências de busca generativa são atividades fragmentadas entre CMS, planilhas, especialistas e scripts. Em aplicações com IA, essa fragmentação força cada agente a improvisar regras de idioma, SEO e publicação — com alto risco de traduções literais, versões inconsistentes, metadados inválidos e conteúdo automatizado sem revisão.

O Verbosia já possui um motor de tradução segmentada, memória de tradução, glossário, masking, revisão e SEO multilíngue. O MCP transforma esse motor em uma interface padronizada, controlada e explicável para agentes. O diferencial não é somente traduzir: é decidir e registrar *como* o conteúdo deve ser localizado e se está pronto para publicar.

## Usuários e resultado esperado

**Usuário primário:** equipes e produtos que usam agentes de IA para criar ou manter sites e conteúdo estruturado. Elas querem delegar a operação, mas preservar políticas de marca, orçamento, evidências e aprovação humana.

**Usuário secundário:** profissionais de conteúdo, SEO e localização que precisam revisar exceções e entender por que uma versão foi liberada ou bloqueada.

**Resultado:** para cada documento e idioma, o agente consegue apresentar um plano de baixo risco, executar somente as ações autorizadas e devolver um relatório estruturado com qualidade linguística, cobertura técnica, evidências e pendências de revisão.

## Proposta de solução

O pacote `@verbosia/mcp` rodará localmente por `stdio`, inicialmente sobre os projetos de arquivos já suportados pelo Verbosia. Ele fornecerá três superfícies MCP:

1. **Ferramentas** para ações e análises: status, planejamento, tradução, revisão, validação de SEO, avaliação de prontidão GEO e publicação.
2. **Recursos** somente-leitura para contexto: configuração, glossário, política editorial, entidades aprovadas, inventário de conteúdo e relatórios de qualidade.
3. **Prompts guiados** para tarefas recorrentes: localizar uma página, revisar uma variante, diagnosticar cobertura internacional e preparar uma publicação.

Toda ação de custo ou escrita será planejável antes de executar, limitada por orçamento e explícita sobre os arquivos, idiomas e efeitos envolvidos.

## Princípios de produto

- **Fonte canônica antes de variante.** Uma tradução é uma variante rastreável de uma fonte; não uma cópia independente.
- **Contexto vence literalidade.** Idioma, região, intenção, público, tom, glossário, entidades e campos estruturados entram na decisão de localização.
- **Política antes de automação.** O agente pode agir somente dentro de políticas declaradas de custo, publicação, termos e revisão.
- **Evidência antes de score.** Toda recomendação de SEO/GEO aponta a regra, o trecho e a condição que a motivou.
- **Humano para risco.** Conteúdo regulado, fatos sem fonte, alteração de estrutura, baixa confiança e publicação externa exigem aprovação.
- **Sem promessa de ranking.** “GEO readiness” mede qualidade de preparação e verificabilidade, não previsão de posição ou citação.

## O que torna o Verbosia diferente

- Une localização, revisão, SEO internacional e preparação para busca generativa num único contrato para agentes.
- Mantém memória de tradução e decisões editoriais como ativos do projeto, não como estado opaco de um chat.
- Trata SEO/GEO como políticas auditáveis e validações estruturadas, em vez de comandos vagos de “otimizar”.
- Mantém o conteúdo e as chaves BYOK locais no MVP.

## Escopo do MVP: MCP local para projetos de arquivos

O MVP deve incluir:

- pacote `@verbosia/mcp`, executável local por `stdio`;
- seleção explícita da raiz do projeto e carregamento seguro de `verbosia.config.*`;
- ferramentas somente-leitura: `content_status`, `translation_plan`, `content_get`, `seo_validate`, `geo_readiness`;
- ferramentas de escrita controlada: `translate`, `review_apply` e `publish_localized_content`;
- recursos para configuração, glossário, inventário de documentos, TM e relatórios;
- contrato de política com limite de chamadas, idiomas permitidos, campos traduzíveis, exigência de revisão e escopo publicável;
- relatórios estruturados com achados, severidade, evidência, recomendação e ação bloqueada/liberada;
- validações iniciais: pares `hreflang`, `canonical`, `x-default`, locale/URL, sitemap, idioma no HTML/JSON-LD, presença de metadados e estado da revisão;
- avaliação GEO inicial baseada em critérios verificáveis: clareza da resposta, estrutura semântica, entidade principal, atribuição/autoria, alegações factuais sem evidência e consistência entre idiomas.

Ficam fora do MVP:

- promessa de ranking, de indexação ou de ser citado por uma IA;
- publicação automática irreversível sem aprovação configurada;
- conectores WordPress, CMS headless ou SaaS hospedado;
- rastreamento de SERP, coleta de backlinks e análise de concorrentes;
- produção autônoma de conteúdo novo em escala;
- uma taxonomia universal e fixa de “regras de GEO”.

## Fluxo de decisão de um agente

```text
Ler contexto e políticas → inventariar conteúdo → planejar alteração
→ analisar idioma + SEO + GEO → solicitar aprovação quando necessário
→ traduzir/revisar → validar artefatos → publicar dentro do escopo
→ devolver relatório, evidências e pendências
```

Uma ação será bloqueada quando sair da raiz autorizada, exceder orçamento, usar idioma não permitido, violar termo obrigatório, introduzir alegação sem fonte, falhar em validação crítica de SEO ou exigir revisão humana ainda pendente.

## Métricas de sucesso

**Adoção e utilidade**

- Um agente conclui o fluxo de plano → tradução → validação em um projeto Astro de exemplo sem comandos manuais do usuário.
- Pelo menos 80% das execuções repetidas têm zero chamadas desnecessárias ao provedor graças à TM, para conteúdo sem alteração de política/modelo.

**Qualidade e segurança**

- 100% das ferramentas de escrita devolvem plano/efeitos e respeitam raiz, orçamento e política configurados.
- 100% dos relatórios de validação críticos incluem regra, evidência e ação recomendada.
- Nenhuma chave de provedor, conteúdo fora da raiz ou ação de publicação é exposta ao cliente MCP sem autorização explícita.

**SEO/GEO responsável**

- 100% dos documentos publicados pelo fluxo têm cobertura de idioma, URL e `hreflang` verificável quando o framework suportar esses artefatos.
- O score de prontidão GEO nunca é apresentado como estimativa de ranking ou garantia de citação.

## Roteiro de implementação

| Fase | Resultado | Critério de saída |
|---|---|---|
| 0 — Contratos | Modelo de política, achados, relatório e abstração de conteúdo/publicação. | O core pode receber uma análise sem depender de MCP ou de arquivos. |
| 1 — Fundação MCP | Servidor `stdio`, recursos e ferramentas somente-leitura. | Um host MCP obtém status, plano e relatório de SEO sem efeitos no projeto. |
| 2 — Execução segura | Tradução e revisão por ferramentas, confirmação e orçamento. | Ações gravam apenas artefatos previstos e todos os efeitos são testados. |
| 3 — Qualidade multilingue | Validador SEO, analisador GEO explicável e matrizes de inteligência linguística, com políticas por locale. | Relatórios detectam casos críticos criados intencionalmente no fixture e apontam a regra aplicada por idioma/mercado. |
| 4 — Publicação e conectores | Contrato de adaptadores; WordPress/CMS conforme demanda validada. | Um segundo adaptador reutiliza o mesmo fluxo e a mesma política. |

## Visão

Em dois a três anos, Verbosia será o plano de controle de conteúdo multilingue para agentes: uma aplicação conecta sua fonte de conteúdo e recebe não apenas texto traduzido, mas versões culturalmente adequadas, revisáveis, tecnicamente corretas e explicáveis. Conectores ampliarão o alcance, enquanto o núcleo preservará as mesmas políticas, memória e evidências em qualquer plataforma.

## Premissas a validar

- [ASSUMPTION] O primeiro usuário aceita instalar Node e configurar um servidor MCP local.
- [ASSUMPTION] Projetos de conteúdo em arquivos são o melhor ambiente para validar o contrato antes de WordPress.
- [ASSUMPTION] A principal diferenciação percebida será a combinação de qualidade, governança e explicabilidade — não o preço da tradução isolada.
- [ASSUMPTION] A política editorial poderá ser expressa em configuração estruturada, com extensão futura para regras específicas por domínio.
- [ASSUMPTION] As primeiras matrizes de locale priorizarão pares com procura real do público-alvo, e não uma cobertura genérica de todos os idiomas.

## Base de evidências

- [Google: gestão de sites multilíngues e multirregionais](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites): versões por idioma devem ter URLs próprias e `hreflang` quando aplicável.
- [Google: versões localizadas](https://developers.google.com/search/docs/advanced/crawling/localized-versions): a relação `hreflang` deve listar todas as variantes, inclusive a própria página.
- [Google: conteúdo gerado por IA](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content): a automação deve preservar precisão, qualidade e relevância; uso em escala sem valor ao usuário pode violar políticas de spam.
- [Google: recursos generativos na busca](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide): boas práticas de SEO continuam sendo a base para experiências generativas.
- [MCP: recursos, prompts e ferramentas](https://modelcontextprotocol.io/specification/2025-06-18/server/index): o protocolo oferece as primitivas necessárias para contexto de projeto, fluxos guiados e operações controladas.
