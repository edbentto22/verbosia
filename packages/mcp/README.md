# @verbosia/mcp

Servidor MCP local e somente-leitura para agentes inspecionarem projetos Verbosia e planejarem localização antes de qualquer alteração.

## Instalação

```bash
pnpm add -D @verbosia/mcp
```

Requer Node.js 20 ou superior. Configure o host MCP para executar:

```bash
verbosia-mcp --root /caminho/absoluto/do/projeto
```

A raiz é obrigatória. O servidor rejeita `contentDir`, `outputDir`, `uiStrings` e symlinks que escapem desse limite.

Arquivos `verbosia.config.mjs` e `.js` são código executável e fazem parte da base confiável do projeto autorizado por `--root`; não aponte o MCP para repositórios não confiáveis. Para configuração estritamente declarativa, use `verbosia.config.json`.

## Tools

- `verbosia.inspect_project` — retorna configuração pública resumida, status por documento/locale e totais.
- `verbosia.plan_localization` — consulta somente a Translation Memory local e estima hits/chamadas de API.

Os dois tools são read-only. Eles não escrevem arquivos, não acessam Redis/rede e não chamam provedores de tradução. Credenciais BYOK não são retornadas nos resultados.

## Exemplo de host

```json
{
  "mcpServers": {
    "verbosia": {
      "command": "verbosia-mcp",
      "args": ["--root", "/projetos/meu-site"]
    }
  }
}
```

Consulte a [documentação principal](../../README.md) para configuração, providers e Translation Memory.
