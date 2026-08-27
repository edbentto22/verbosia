# Deferred Work

## 2026-08-27 — revisão da fundação MCP read-only

- **Status não detecta mudança apenas em frontmatter traduzível.** `status()` usa somente o hash do corpo; alterações em `title`, `description` ou outros `translateFields` podem continuar aparecendo como `fresh`. É um comportamento anterior à fundação MCP e requer uma mudança própria no contrato de hash/migração.
- **TM em arquivo mascara JSON corrompido como cache vazio.** `FileCacheDriver.load()` trata qualquer erro como ausência de cache. Separar `ENOENT` de falhas de parse/I/O em uma história de integridade e recuperação da Translation Memory.
- **Ordenação depende do locale do host.** `discover()` usa `localeCompare()` sem locale explícito. Avaliar uma ordenação binária estável em todos os ambientes como mudança transversal do core.
