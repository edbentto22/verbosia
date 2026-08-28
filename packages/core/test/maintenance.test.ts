import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import matter from 'gray-matter';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deriveCacheIdentity } from '../src/cache-key.js';
import { resolveConfig } from '../src/config.js';
import { FileCacheDriver } from '../src/cache-drivers/file.js';
import { cacheDirFor } from '../src/cache-drivers/index.js';
import { prune, syncTM } from '../src/maintenance.js';
import { translate } from '../src/translate.js';
import type { Provider, TranslateRequest } from '../src/types.js';

const { redisScanKeys, redisStore } = vi.hoisted(() => ({
  redisScanKeys: [] as string[],
  redisStore: new Map<string, string>(),
}));

vi.mock('redis', () => ({
  createClient: () => ({
    on: () => undefined,
    connect: async () => undefined,
    quit: async () => undefined,
    get: async (key: string) => redisStore.get(key) ?? null,
    set: async (key: string, value: string) => {
      redisStore.set(key, value);
    },
    async *scanIterator() {
      const keys = redisScanKeys.length ? redisScanKeys : [...redisStore.keys()].sort();
      for (const key of keys) yield key;
    },
  }),
}));

beforeEach(() => {
  redisStore.clear();
  redisScanKeys.length = 0;
});

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
    expect(plan.liveTmKeys).toBe(3);
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
    expect(report.liveTmKeys).toBe(12);
  });

  it('classifica e remove localmente v1/malformadas, preservando folhas de UI vivas', async () => {
    const root = await project();
    const i18n = join(root, 'src/i18n');
    await mkdir(i18n, { recursive: true });
    await writeFile(join(i18n, 'pt.json'), JSON.stringify({ nav: { home: 'Início' } }), 'utf8');
    const config = resolveConfig(
      {
        source: 'pt',
        targets: ['en'],
        collections: ['blog'],
        uiStrings: 'src/i18n/pt.json',
      },
      root,
    );
    const driver = new FileCacheDriver(cacheDirFor(config));
    await translate(config, { provider: new FakeProvider(), driver });
    await driver.set('a'.repeat(64), { text: 'legacy', model: config.model, ts: 1 });
    await driver.set('not-a-tm-key', { text: 'bad', model: config.model, ts: 2 });

    const plan = await prune(config, { dryRun: true });
    expect(plan).toMatchObject({
      liveTmKeys: 7, // two docs × three segments + one UI leaf
      orphanTmKeys: 0,
      legacyTmKeys: 1,
      malformedTmKeys: 1,
    });
    const done = await prune(config);
    expect(done).toMatchObject({
      liveTmKeys: plan.liveTmKeys,
      orphanTmKeys: plan.orphanTmKeys,
      legacyTmKeys: plan.legacyTmKeys,
      malformedTmKeys: plan.malformedTmKeys,
    });
    const remaining = await new FileCacheDriver(cacheDirFor(config)).keys();
    expect(remaining.every((key) => key.startsWith('v2:'))).toBe(true);
  });

  it('valida o plano completo antes de remover arquivo órfão ou chave local', async () => {
    const root = await project();
    const base = resolveConfig({ source: 'pt', targets: ['en'], collections: ['blog'] }, root);
    await translate(base, {
      provider: new FakeProvider(),
      driver: new FileCacheDriver(cacheDirFor(base)),
    });
    await rm(join(root, 'src/content/blog/b.md'));

    const orphan = join(root, 'src/content/en/blog/b.md');
    const tmFile = join(cacheDirFor(base), 'tm.json');
    const before = await readFile(tmFile, 'utf8');
    const i18n = join(root, 'src/i18n');
    await mkdir(i18n, { recursive: true });
    await writeFile(join(i18n, 'pt.json'), '{malformed', 'utf8');
    const config = resolveConfig(
      {
        source: 'pt',
        targets: ['en'],
        collections: ['blog'],
        uiStrings: 'src/i18n/pt.json',
        cache: { driver: 'redis', url: 'redis://test' },
      },
      root,
    );
    const redisKey = deriveCacheIdentity({
      sourceText: 'redis invalid',
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
    redisStore.set(`tm:${redisKey}`, '');

    await expect(prune(config)).rejects.toThrow();
    expect(await exists(orphan)).toBe(true);
    expect(await readFile(tmFile, 'utf8')).toBe(before);

    await writeFile(join(i18n, 'pt.json'), JSON.stringify({ nav: 'Início' }), 'utf8');
    await expect(prune(config)).rejects.toThrow(
      '[verbosia] dados da Translation Memory inválidos',
    );
    expect(await exists(orphan)).toBe(true);
    expect(await readFile(tmFile, 'utf8')).toBe(before);
  });

  it('sincroniza somente v2, favorece Tier 1 em empate e reporta ignoradas por tier', async () => {
    const root = await project();
    const config = resolveConfig(
      {
        source: 'pt',
        targets: ['en'],
        collections: ['blog'],
        cache: { driver: 'redis', url: 'redis://test' },
      },
      root,
    );
    const file = new FileCacheDriver(cacheDirFor(config));
    const identity = (text: string) =>
      deriveCacheIdentity({
        sourceText: text,
        sourceLang: config.source,
        targetLang: 'en',
        targetVariant: null,
        provider: 'anthropic',
        model: config.model,
        tone: null,
        glossary: [],
        doNotTranslate: [],
        promptVersion: config.promptVersion,
      }).key;
    const fileOnly = identity('file only');
    const redisOnly = identity('redis only');
    const conflict = identity('conflict');
    await file.set(fileOnly, { text: 'from file', model: config.model, ts: 1 });
    await file.set(conflict, { text: 'tier one wins', model: config.model, ts: 5 });
    await file.set('a'.repeat(64), { text: 'legacy file', model: config.model, ts: 1 });
    await file.set('bad-file-key', { text: 'bad file', model: config.model, ts: 1 });
    const fileStore = JSON.parse(await readFile(join(cacheDirFor(config), 'tm.json'), 'utf8'));
    fileStore['a'.repeat(64)] = 42;
    fileStore['bad-file-key'] = { arbitrary: ['preserved'] };
    await writeFile(join(cacheDirFor(config), 'tm.json'), JSON.stringify(fileStore), 'utf8');
    redisStore.set(
      `tm:${redisOnly}`,
      JSON.stringify({ text: 'from redis', model: config.model, ts: 2 }),
    );
    redisStore.set(
      `tm:${conflict}`,
      JSON.stringify({ text: 'redis divergent', model: config.model, ts: 5 }),
    );
    redisStore.set(
      `tm:${'b'.repeat(64)}`,
      JSON.stringify({ text: 'legacy redis', model: config.model, ts: 1 }),
    );
    redisStore.set(
      'tm:bad-redis-key',
      JSON.stringify({ text: 'bad redis', model: config.model, ts: 1 }),
    );
    // SCAN pode devolver páginas sobrepostas; classificação e ordem devem ser
    // determinísticas apesar das duplicatas e da ordem injetada.
    redisScanKeys.push(
      'tm:bad-redis-key',
      `tm:${redisOnly}`,
      `tm:${'b'.repeat(64)}`,
      `tm:${conflict}`,
      `tm:${redisOnly}`,
      'tm:bad-redis-key',
      `tm:${conflict}`,
      `tm:${'b'.repeat(64)}`,
    );

    const report = await syncTM(config);

    expect(report).toEqual({
      toRedis: 2,
      toFile: 1,
      total: 3,
      ignoredFileLegacyKeys: 1,
      ignoredFileMalformedKeys: 1,
      ignoredRedisLegacyKeys: 1,
      ignoredRedisMalformedKeys: 1,
    });
    expect(JSON.parse(redisStore.get(`tm:${conflict}`)!).text).toBe('tier one wins');
    expect((await new FileCacheDriver(cacheDirFor(config)).get(redisOnly))?.text).toBe('from redis');
    expect(redisStore.has(`tm:${'a'.repeat(64)}`)).toBe(false);
    const persisted = JSON.parse(await readFile(join(cacheDirFor(config), 'tm.json'), 'utf8'));
    expect(persisted['a'.repeat(64)]).toBe(42);
    expect(persisted['bad-file-key']).toEqual({ arbitrary: ['preserved'] });
  });

  it('resolve conflito Redis-mais-novo escrevendo somente no arquivo', async () => {
    const root = await project();
    const config = resolveConfig(
      {
        source: 'pt',
        targets: ['en'],
        collections: ['blog'],
        cache: { driver: 'redis', url: 'redis://test' },
      },
      root,
    );
    const key = deriveCacheIdentity({
      sourceText: 'newer conflict',
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
    await new FileCacheDriver(cacheDirFor(config)).set(key, {
      text: 'older file',
      model: config.model,
      ts: 1,
    });
    const redisEntry = { text: 'newer redis', model: config.model, ts: 2 };
    redisStore.set(`tm:${key}`, JSON.stringify(redisEntry));

    const report = await syncTM(config);

    expect(report).toEqual({
      toRedis: 0,
      toFile: 1,
      total: 1,
      ignoredFileLegacyKeys: 0,
      ignoredFileMalformedKeys: 0,
      ignoredRedisLegacyKeys: 0,
      ignoredRedisMalformedKeys: 0,
    });
    expect(await new FileCacheDriver(cacheDirFor(config)).get(key)).toEqual(redisEntry);
    expect(JSON.parse(redisStore.get(`tm:${key}`)!)).toEqual(redisEntry);
  });

  it('falha fechado ao encontrar valor Redis malformado sob chave v2 válida', async () => {
    const root = await project();
    const config = resolveConfig(
      {
        source: 'pt',
        targets: ['en'],
        collections: ['blog'],
        cache: { driver: 'redis', url: 'redis://test' },
      },
      root,
    );
    const key = deriveCacheIdentity({
      sourceText: 'malformed redis entry',
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
    redisStore.set(`tm:${key}`, '');

    await expect(syncTM(config)).rejects.toThrow(
      '[verbosia] dados da Translation Memory inválidos',
    );
  });

  it('conta Redis legado/malformado no prune sem apagar dados compartilhados', async () => {
    const root = await project();
    const config = resolveConfig(
      {
        source: 'pt',
        targets: ['en'],
        collections: ['blog'],
        cache: { driver: 'redis', url: 'redis://test' },
      },
      root,
    );
    redisStore.set(
      `tm:${'c'.repeat(64)}`,
      JSON.stringify({ text: 'legacy', model: config.model, ts: 1 }),
    );
    redisStore.set(
      'tm:malformed',
      JSON.stringify({ text: 'bad', model: config.model, ts: 1 }),
    );

    const report = await prune(config);

    expect(report.ignoredRedisLegacyKeys).toBe(1);
    expect(report.ignoredRedisMalformedKeys).toBe(1);
    expect(redisStore.size).toBe(2);
  });
});
