# verbosia (CLI)

CLI do [Verbosia](https://github.com/edbentto22/verbosia) — tradução com IA para sites estáticos, com Translation Memory e revisão humana.

```bash
pnpm add -D verbosia @verbosia/core
export ANTHROPIC_API_KEY=sk-ant-...   # BYOK (ou OPENAI/GEMINI/DEEPL_API_KEY)
```

| Comando | O quê |
|---|---|
| `verbosia translate [--dry-run]` | Traduz o que mudou; dry-run estima custo sem gastar |
| `verbosia status` | fresh/stale/missing por documento (exit 1 se incompleto — gate de CI) |
| `verbosia review [--port 5199]` | Editor local de revisão; edições voltam para a TM |
| `verbosia prune [--dry-run]` | Remove traduções e TM órfãs (agnóstico de modelo) |
| `verbosia tm:sync` | Sincroniza TM arquivo ↔ Redis |

Config em `verbosia.config.mjs`:

```js
export default {
  provider: 'anthropic',
  source: 'pt',
  targets: ['en', 'es'],
  collections: ['blog'],
};
```

[Documentação completa](../../docs/README.md) · MIT
