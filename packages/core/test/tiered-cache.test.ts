import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import matter from 'gray-matter';
import { describe, expect, it } from 'vitest';
import { deriveCacheIdentity } from '../src/cache-key.js';
import { FileCacheDriver } from '../src/cache-drivers/file.js';
import { cacheDirFor } from '../src/cache-drivers/index.js';
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

class OpenAIProviderFake implements Provider {
  readonly name = 'openai' as const;
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

  it('ignora e preserva uma entrada v1 durante tradução normal', async () => {
    const root = await project();
    const config = resolveConfig({ source: 'pt', targets: ['en'], collections: ['blog'] }, root);
    const tier1 = new MemoryDriver('file');
    const legacyKey = 'a'.repeat(64);
    tier1.store.set(legacyKey, { text: 'legacy', model: config.model, ts: 1 });
    const provider = new CountingProvider();

    const report = await translate(config, { driver: tier1, provider });

    expect(provider.calls).toBe(3);
    expect(report.misses).toBe(3);
    expect(tier1.store.get(legacyKey)?.text).toBe('legacy');
    expect([...tier1.store.keys()].filter((key) => key.startsWith('v2:'))).toHaveLength(3);
  });

  it('ignora valores arbitrários sob chaves v1/malformadas e os preserva no flush normal', async () => {
    const root = await project();
    const config = resolveConfig({ source: 'pt', targets: ['en'], collections: ['blog'] }, root);
    const cacheDir = cacheDirFor(config);
    const legacyKey = 'a'.repeat(64);
    const ignored = {
      [legacyKey]: 42,
      'not-a-tm-key': { arbitrary: [null, false, { nested: 'value' }] },
    };
    await mkdir(cacheDir, { recursive: true });
    await writeFile(join(cacheDir, 'tm.json'), JSON.stringify(ignored), 'utf8');

    const provider = new CountingProvider();
    const report = await translate(config, {
      driver: new FileCacheDriver(cacheDir),
      provider,
    });

    expect(provider.calls).toBe(3);
    expect(report.misses).toBe(3);
    const stored = JSON.parse(await readFile(join(cacheDir, 'tm.json'), 'utf8'));
    expect(stored[legacyKey]).toBe(42);
    expect(stored['not-a-tm-key']).toEqual(ignored['not-a-tm-key']);
    expect(Object.keys(stored).filter((key) => key.startsWith('v2:'))).toHaveLength(3);
  });

  it('particiona pela identidade do provider real injetado', async () => {
    const root = await project();
    const config = resolveConfig(
      { provider: 'openai', source: 'pt', targets: ['en'], collections: ['blog'] },
      root,
    );
    const shared = new MemoryDriver('file');

    await translate(config, { driver: shared, provider: new CountingProvider() });
    const actualOpenAI = new OpenAIProviderFake();
    const report = await translate(config, { driver: shared, provider: actualOpenAI });

    expect(actualOpenAI.calls).toBe(3);
    expect(report.misses).toBe(3);
    expect(shared.store.size).toBe(6);
  });

  it('trata apenas ENOENT como TM vazia e valida entradas somente em chaves v2 lidas', async () => {
    const root = await project();
    const config = resolveConfig({ source: 'pt', targets: ['en'], collections: ['blog'] }, root);
    const cacheDir = cacheDirFor(config);

    expect(await new FileCacheDriver(cacheDir).keys()).toEqual([]);
    await mkdir(cacheDir, { recursive: true });
    await writeFile(join(cacheDir, 'tm.json'), '{malformed', 'utf8');
    await expect(new FileCacheDriver(cacheDir).keys()).rejects.toThrow(
      '[verbosia] dados da Translation Memory inválidos',
    );
    await writeFile(
      join(cacheDir, 'tm.json'),
      JSON.stringify({ bad: { text: 42, model: '', ts: 'yesterday' } }),
      'utf8',
    );
    const ignored = new FileCacheDriver(cacheDir);
    expect(await ignored.keys()).toEqual(['bad']);
    expect(await ignored.get('bad')).toBeNull();

    const key = deriveCacheIdentity({
      sourceText: 'source',
      sourceLang: 'pt',
      targetLang: 'en',
      targetVariant: null,
      provider: 'anthropic',
      model: config.model,
      tone: null,
      glossary: [],
      doNotTranslate: [],
      promptVersion: config.promptVersion,
    }).key;
    await writeFile(
      join(cacheDir, 'tm.json'),
      JSON.stringify({ [key]: { text: 'valid text', model: config.model, ts: -1 } }),
      'utf8',
    );
    await expect(new FileCacheDriver(cacheDir).get(key)).rejects.toThrow(
      '[verbosia] dados da Translation Memory inválidos',
    );
  });

  it('rejeita timestamps negativos, fracionários e fora do intervalo seguro', async () => {
    const root = await project();
    const config = resolveConfig({ source: 'pt', targets: ['en'], collections: ['blog'] }, root);
    const cacheDir = cacheDirFor(config);
    const key = deriveCacheIdentity({
      sourceText: 'timestamp source',
      sourceLang: 'pt',
      targetLang: 'en',
      targetVariant: null,
      provider: 'anthropic',
      model: config.model,
      tone: null,
      glossary: [],
      doNotTranslate: [],
      promptVersion: config.promptVersion,
    }).key;
    await mkdir(cacheDir, { recursive: true });

    for (const ts of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await writeFile(
        join(cacheDir, 'tm.json'),
        JSON.stringify({ [key]: { text: 'translated', model: config.model, ts } }),
        'utf8',
      );
      await expect(new FileCacheDriver(cacheDir).get(key)).rejects.toThrow(
        '[verbosia] dados da Translation Memory inválidos',
      );
    }
  });

  it('rejeita membros JSON duplicados no store e dentro de uma entrada', async () => {
    const root = await project();
    const config = resolveConfig({ source: 'pt', targets: ['en'], collections: ['blog'] }, root);
    const cacheDir = cacheDirFor(config);
    await mkdir(cacheDir, { recursive: true });

    await writeFile(join(cacheDir, 'tm.json'), '{"a":1,"\\u0061":2}', 'utf8');
    await expect(new FileCacheDriver(cacheDir).keys()).rejects.toThrow(
      '[verbosia] dados da Translation Memory inválidos',
    );

    const key = deriveCacheIdentity({
      sourceText: 'duplicate source',
      sourceLang: 'pt',
      targetLang: 'en',
      targetVariant: null,
      provider: 'anthropic',
      model: config.model,
      tone: null,
      glossary: [],
      doNotTranslate: [],
      promptVersion: config.promptVersion,
    }).key;
    await writeFile(
      join(cacheDir, 'tm.json'),
      `{"${key}":{"text":"first","t\\u0065xt":"second","model":"m","ts":1}}`,
      'utf8',
    );
    await expect(new FileCacheDriver(cacheDir).keys()).rejects.toThrow(
      '[verbosia] dados da Translation Memory inválidos',
    );
  });
});
