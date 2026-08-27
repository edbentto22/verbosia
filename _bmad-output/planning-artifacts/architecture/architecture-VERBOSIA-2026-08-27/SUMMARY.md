---
name: 'Resumo — Verbosia Brand Memory + Evidence Ledger'
type: architecture-summary
audience: 'stakeholders, contribuidores e equipe de implementação'
status: final
updated: '2026-08-27'
companion: 'ARCHITECTURE-SPINE.md'
---

# Verbosia Brand Memory + Evidence Ledger

**Arquitetura aprovada:** o Verbosia evoluirá de um motor de localização para um núcleo local de governança de conteúdo. Aplicações poderão consultar as regras de comunicação da marca e verificar se cada afirmação está autorizada e sustentada, sem delegar essa decisão a um modelo de IA.

## O que a V1 entrega

A V1 adiciona duas tools de somente leitura ao conjunto MCP existente:

- `verbosia.inspect_brand_context` resolve o tom, a terminologia, as restrições e os Claims aplicáveis a uma combinação de idioma, mercado, intenção da página, tipo de conteúdo, risco editorial, canal e público.
- `verbosia.validate_claims` classifica cada Claim como `allow`, `allow_with_constraints`, `review_required` ou `block`, sempre com motivos auditáveis.

A lógica de domínio permanece em `@verbosia/core`; o MCP atua apenas como camada de integração. Assim, a CLI, o WordPress e aplicações futuras reutilizam as mesmas regras.

## Como a confiança é construída

```text
Brand Memory controlada pelo cliente
        ↓
Claim aprovado e identificado
        ↓
Evidence Ledger imutável por política Git/CI
        ↓
Policy engine determinístico
        ↓
decisão explicável e reproduzível
```

A Brand Memory registra identidade, tom, públicos, serviços, diferenciais, termos, restrições e Claims aprovados. O Evidence Ledger registra origem, permissão, escopo, validade e suporte de cada evidência e retém apenas os dados necessários à auditoria.

A IA pode identificar afirmações e sugerir correspondências. Ela nunca autoriza conteúdo. A decisão final é determinada por uma tabela de políticas versionada, testada e independente do provedor de IA.

## Guardrails do produto

- Arquivos versionados no projeto são a fonte de verdade; qualquer banco ou índice futuro será derivado.
- Reviews e conteúdo público de terceiros não são arquivados integralmente.
- Dados restritos podem influenciar a decisão, mas nunca aparecem nas respostas MCP.
- Overlays locais adaptam linguagem, mas não criam Claims nem alteram fatos.
- Overrides são auditáveis e nunca enfraquecem integridade, privacidade ou compliance.
- Resultados SEO/GEO indicam conformidade e oportunidade; nunca prometem ranking, tráfego ou presença em plataformas generativas.

## Sequência recomendada

1. Publicar os JSON Schemas e fixtures contratuais.
2. Implementar loaders, snapshot estável e validação estrutural no Core.
3. Implementar resolução contextual, Evidence Ledger e PolicyDecisionTable.
4. Expor as duas novas tools MCP sem alterar as tools existentes.
5. Validar os pacotes, os controles de segurança, o comportamento multilíngue e a compatibilidade com Node 22 e 24.
6. Executar o cenário real fornecido pelo usuário em ciclos até atender aos critérios de aceitação.

Cada defeito encontrado nesses ciclos resultará em uma correção e em um teste permanente. A aceitação exige coerência, rastreabilidade, segurança, determinismo e ausência de regressões — não apenas uma demonstração bem-sucedida.

## Limites desta entrega

Permanecem fora da V1:

- Interfaces: escrita via MCP, publicação automática e `verbosia.localize_with_context`.
- Integrações: conectores/OAuth, transporte remoto e multi-tenant.
- Inteligência futura: providers semânticos, Market Signals e catálogo de Context Packs comunitários declarativos, sempre separado da memória privada do cliente.

A implementação desses itens só começará quando os contratos locais estiverem estáveis e os controles de autorização e isolamento estiverem definidos.

## Referências técnicas

O contrato técnico completo está em [ARCHITECTURE-SPINE.md](./ARCHITECTURE-SPINE.md). Os padrões verificados são [JSON Schema 2020-12](https://json-schema.org/specification), [JCS/RFC 8785](https://www.rfc-editor.org/info/rfc8785/) e as [linhas LTS do Node.js](https://nodejs.org/en/about/previous-releases).
