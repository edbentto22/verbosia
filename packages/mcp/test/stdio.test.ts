import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

const execFile = promisify(execFileCallback);
const projectRoot = fileURLToPath(new URL('../../..', import.meta.url));
const executable = join(projectRoot, 'packages/mcp/dist/stdio.js');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const roots: string[] = [];

beforeAll(async () => {
  await execFile(pnpm, ['--filter', '@verbosia/core', 'build'], { cwd: projectRoot });
  await execFile(pnpm, ['--filter', '@verbosia/mcp', 'build'], { cwd: projectRoot });
}, 30_000);

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('verbosia-mcp stdio', () => {
  it('negocia pelo processo real sem contaminar stdout com logs da config', async () => {
    const root = await mkdtemp(join(tmpdir(), 'verbosia-mcp-stdio-'));
    roots.push(root);
    await mkdir(join(root, 'src/content/blog'), { recursive: true });
    await writeFile(join(root, 'src/content/blog/post.md'), '# Olá\n', 'utf8');
    await writeFile(
      join(root, 'verbosia.config.mjs'),
      `console.log('config-log-redirecionado');
       export default { source: 'pt', targets: ['en'], collections: ['blog'] };\n`,
      'utf8',
    );

    let stderr = '';
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [executable, '--root', root],
      cwd: projectRoot,
      stderr: 'pipe',
    });
    transport.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    const client = new Client({ name: 'verbosia-stdio-test', version: '1.0.0' });

    try {
      await client.connect(transport);
      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name)).toEqual([
        'verbosia.inspect_project',
        'verbosia.plan_localization',
      ]);
      const result = await client.callTool({
        name: 'verbosia.inspect_project',
        arguments: {},
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        project: { source: 'pt', targets: ['en'] },
      });
    } finally {
      await client.close();
    }

    expect(stderr).toContain('config-log-redirecionado');
  });
});
