import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import matter from 'gray-matter';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config.js';
import { FileCacheDriver } from '../src/cache-drivers/file.js';
import { cacheDirFor } from '../src/cache-drivers/index.js';
import { prune } from '../src/maintenance.js';
import { translate } from '../src/translate.js';
import type { Provider, TranslateRequest } from '../src/types.js';

class FakeProvider implements Provider {
  readonly name = 'anthropic' as const;
  async translate(req: TranslateRequest): Promise<string> {
    return `[${req.targetLang}] ${req.maskedText}`;
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'verbosia-prune-'));
  const blog = join(root, 'src/content/blog');
  await mkdir(blog, { recursive: true });
  await writeFile(
    join(blog, 'a.md'),
    matter.stringify('Corpo A.\n', { title: 'A', description: 'da' }),
    'utf8',
  );
  await writeFile(
    join(blog, 'b.md'),
    matter.stringify('Corpo B.\n', { title: 'B', description: 'db' }),
    'utf8',
  );
  return root;
}

describe('prune', () => {
  it('detecta e remove arquivos localizados órfãos e TM órfã', async () => {
    const root = await project();
    const config = resolveConfig({ source: 'pt', targets: ['en'], collections: ['blog'] }, root);
    const driver = new FileCacheDriver(cacheDirFor(config));
    await translate(config, { provider: new FakeProvider(), driver });

    // Remove o doc de origem 'b' -> seu arquivo localizado vira órfão.
    await rm(join(root, 'src/content/blog/b.md'));

    // dry-run não apaga, só reporta.
    const plan = await prune(config, { dryRun: true });
    expect(plan.orphanFiles.length).toBe(1);
    expect(plan.orphanFiles[0]).toContain(join('en', 'blog', 'b.md'));
    expect(plan.orphanTmKeys).toBe(3); // title + description + body de 'b'
    expect(await exists(join(root, 'src/content/en/blog/b.md'))).toBe(true);

    // execução real remove.
    const done = await prune(config);
    expect(done.orphanFiles.length).toBe(1);
    expect(await exists(join(root, 'src/content/en/blog/b.md'))).toBe(false);
    expect(await exists(join(root, 'src/content/en/blog/a.md'))).toBe(true);

    // segunda passada: nada mais órfão.
    const clean = await prune(config);
    expect(clean.orphanFiles.length).toBe(0);
    expect(clean.orphanTmKeys).toBe(0);
  });

  it('é agnóstico de modelo: prune sob um provider não apaga o outro', async () => {
    const root = await project();
    // TM populada por dois "modelos" diferentes.
    const openaiCfg = resolveConfig(
      { provider: 'openai', model: 'gpt-4o', source: 'pt', targets: ['en'], collections: ['blog'] },
      root,
    );
    await translate(openaiCfg, {
      provider: new FakeProvider(),
      driver: new FileCacheDriver(cacheDirFor(openaiCfg)),
    });
    const anthropicCfg = resolveConfig(
      { model: 'claude-sonnet-5', source: 'pt', targets: ['en'], collections: ['blog'] },
      root,
    );
    await translate(anthropicCfg, {
      provider: new FakeProvider(),
      driver: new FileCacheDriver(cacheDirFor(anthropicCfg)),
    });

    // TM tem 2 docs × 3 segmentos × 2 modelos = 12 entradas; nada órfão.
    const driver = new FileCacheDriver(cacheDirFor(anthropicCfg));
    expect((await driver.keys()).length).toBe(12);

    const report = await prune(anthropicCfg, { dryRun: true });
    expect(report.orphanTmKeys).toBe(0); // entradas gpt-4o preservadas
  });
});
