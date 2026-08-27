import { execFile as execFileCallback } from 'node:child_process';
import { cp, lstat, mkdir, mkdtemp, readdir, readFile, readlink, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, describe, expect, it } from 'vitest';
import { createVerbosiaServer } from '../src/server.js';
import { createReadOnlyService } from '../src/service.js';

const roots: string[] = [];
const execFile = promisify(execFileCallback);
const projectRoot = fileURLToPath(new URL('../../..', import.meta.url));
const exampleRoot = join(projectRoot, 'examples/blog-pt');

async function snapshotTree(root: string, relative = ''): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const name of (await readdir(join(root, relative))).sort()) {
    const rel = join(relative, name);
    const path = join(root, rel);
    const info = await lstat(path);
    if (info.isDirectory()) {
      out[`${rel}/`] = { type: 'directory', mtimeMs: info.mtimeMs };
      Object.assign(out, await snapshotTree(root, rel));
    } else if (info.isSymbolicLink()) {
      out[rel] = { type: 'symlink', target: await readlink(path), mtimeMs: info.mtimeMs };
    } else {
      out[rel] = {
        type: 'file',
        mtimeMs: info.mtimeMs,
        content: (await readFile(path)).toString('base64'),
      };
    }
  }
  return out;
}

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'verbosia-mcp-protocol-'));
  roots.push(root);
  await mkdir(join(root, 'src/content/blog'), { recursive: true });
  await writeFile(join(root, 'src/content/blog/post.md'), '# Olá\n', 'utf8');
  await writeFile(
    join(root, 'verbosia.config.mjs'),
    `export default { source: 'pt', targets: ['en'], collections: ['blog'] };\n`,
    'utf8',
  );
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('servidor MCP', () => {
  it('negocia, lista e executa os dois tools pelo protocolo', async () => {
    const server = createVerbosiaServer(await createReadOnlyService(await fixture()));
    const client = new Client({ name: 'verbosia-test', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);

      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name)).toEqual([
        'verbosia.inspect_project',
        'verbosia.plan_localization',
      ]);
      expect(listed.tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);

      for (const name of ['verbosia.inspect_project', 'verbosia.plan_localization']) {
        const result = await client.callTool({ name, arguments: {} });
        const output = result.content.find((item) => item.type === 'text');
        expect(output?.type).toBe('text');
        if (output?.type === 'text') {
          expect(JSON.parse(output.text)).toEqual(result.structuredContent);
        }
      }

      const invalid = await client.callTool({
        name: 'verbosia.inspect_project',
        arguments: { unexpected: true },
      });
      expect(invalid.isError).toBe(true);
      expect(invalid.content).toEqual([
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('Input validation error'),
        }),
      ]);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('é determinístico sobre uma cópia do exemplo e não altera o repositório', async () => {
    const isolatedExample = await mkdtemp(join(tmpdir(), 'verbosia-mcp-example-'));
    roots.push(isolatedExample);
    await cp(exampleRoot, isolatedExample, { recursive: true });
    const beforeSourceTree = await snapshotTree(exampleRoot);
    const beforeIsolatedTree = await snapshotTree(isolatedExample);
    const beforeGit = (await execFile('git', ['status', '--porcelain'], { cwd: projectRoot })).stdout;
    const server = createVerbosiaServer(await createReadOnlyService(isolatedExample));
    const client = new Client({ name: 'verbosia-example-test', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);

      for (const name of ['verbosia.inspect_project', 'verbosia.plan_localization']) {
        const first = await client.callTool({ name, arguments: {} });
        const second = await client.callTool({ name, arguments: {} });
        expect(second).toEqual(first);
      }
    } finally {
      await client.close();
      await server.close();
    }

    expect(await snapshotTree(isolatedExample)).toEqual(beforeIsolatedTree);
    expect(await snapshotTree(exampleRoot)).toEqual(beforeSourceTree);
    expect((await execFile('git', ['status', '--porcelain'], { cwd: projectRoot })).stdout)
      .toBe(beforeGit);
  });
});
