#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { ProjectConfigError } from '@verbosia/core';
import { parseProjectRoot } from './args.js';
import { createVerbosiaServer } from './server.js';
import { createReadOnlyService } from './service.js';

async function loadServiceWithoutProtocolNoise(root: string) {
  const stdoutWrite = process.stdout.write;
  process.stdout.write = process.stderr.write.bind(process.stderr) as typeof process.stdout.write;
  try {
    return await createReadOnlyService(root);
  } finally {
    process.stdout.write = stdoutWrite;
  }
}

async function main(): Promise<void> {
  const root = parseProjectRoot(process.argv.slice(2));
  const service = await loadServiceWithoutProtocolNoise(root);
  serveStdio(() => createVerbosiaServer(service), {
    onerror: () => {
      console.error('[MCP_TRANSPORT_ERROR] [verbosia] falha no transporte stdio');
      process.exitCode = 1;
    },
  });
}

main().catch((err: unknown) => {
  const code = err instanceof ProjectConfigError ? err.code : 'STARTUP_FAILED';
  const message = err instanceof Error ? err.message : '[verbosia] falha ao iniciar MCP';
  console.error(`[${code}] ${message}`);
  process.exitCode = 1;
});
