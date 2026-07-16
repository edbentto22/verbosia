import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import matter from 'gray-matter';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config.js';
import { translate } from '../src/translate.js';
import type { CacheDriver, CacheDriverName, Provider, TMEntry, TranslateRequest } from '../src/types.js';

/** Driver em memória parametrizável (simula file/redis para testar a cascata). */
class MemoryDriver implements CacheDriver {
  store = new Map<string, TMEntry>();
  sets = 0;
  constructor(readonly name: CacheDriverName) {}
  async get(key: string): Promise<TMEntry | null> {
    return this.store.get(key) ?? null;
  }
  async set(key: string, entry: TMEntry): Promise<void> {
    this.sets++;
    this.store.set(key, entry);
  }
  async keys(): Promise<string[]> {
    return [...this.store.keys()];
  }
}

class CountingProvider implements Provider {
  readonly name = 'anthropic' as const;
  calls = 0;
  async translate(req: TranslateRequest): Promise<string> {
    this.calls++;
    return `[${req.targetLang}] ${req.maskedText}`;
  }
}

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'verbosia-tier-'));
  const blog = join(root, 'src/content/blog');
  await mkdir(blog, { recursive: true });
  await writeFile(
    join(blog, 'p.md'),
    matter.stringify('Corpo único.\n', { title: 'T', description: 'D' }),
    'utf8',
  );
  return root;
}

describe('cache em dois níveis (file → redis → provider)', () => {
  it('miss em ambos: chama provider e faz write-through nos dois tiers', async () => {
    const root = await project();
    const config = resolveConfig({ source: 'pt', targets: ['en'], collections: ['blog'] }, root);
    const tier1 = new MemoryDriver('file');
    const tier2 = new MemoryDriver('redis');
    const provider = new CountingProvider();

    const report = await translate(config, { drivers: [tier1, tier2], provider });

    expect(provider.calls).toBe(3); // 3 segmentos
    expect(report.misses).toBe(3);
    expect(tier1.store.size).toBe(3); // write-through
    expect(tier2.store.size).toBe(3);
  });

  it('hit no Tier 2 (Redis): não chama provider e faz BACKFILL no Tier 1', async () => {
    const root = await project();
    const config = resolveConfig({ source: 'pt', targets: ['en'], collections: ['blog'] }, root);

    // Pré-popula só o Tier 2 traduzindo com ele sozinho.
    const seed = new MemoryDriver('redis');
    await translate(config, { drivers: [seed], provider: new CountingProvider() });
    expect(seed.store.size).toBe(3);

    // Agora Tier 1 vazio + Tier 2 populado (mesmas entradas).
    const tier1 = new MemoryDriver('file');
    const tier2 = new MemoryDriver('redis');
    tier2.store = new Map(seed.store);
    const provider = new CountingProvider();

    const report = await translate(config, { drivers: [tier1, tier2], provider });

    expect(provider.calls).toBe(0); // tudo veio do Redis
    expect(report.hits).toBe(3);
    expect(tier1.store.size).toBe(3); // BACKFILL: Tier 1 foi pré-populado
  });
});
