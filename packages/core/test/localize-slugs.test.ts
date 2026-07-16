import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import matter from 'gray-matter';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config.js';
import { FileCacheDriver } from '../src/cache-drivers/file.js';
import { cacheDirFor } from '../src/cache-drivers/index.js';
import { localizedPath, translate } from '../src/translate.js';
import type { Provider, TranslateRequest } from '../src/types.js';

/** "Traduz" o título para um slug previsível por idioma. */
class TitleProvider implements Provider {
  readonly name = 'anthropic' as const;
  async translate(req: TranslateRequest): Promise<string> {
    // Só o title importa para o slug; devolve algo determinístico.
    return `${req.targetLang} weekend chapada`;
  }
}

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'verbosia-slug-'));
  const blog = join(root, 'src/content/blog');
  await mkdir(blog, { recursive: true });
  await writeFile(
    join(blog, 'chapada.md'),
    matter.stringify('Corpo.\n', {
      title: 'Um fim de semana',
      description: 'd',
      slug: 'fim-de-semana-chapada',
    }),
    'utf8',
  );
  return root;
}

describe('slugs localizados', () => {
  it('grava slug traduzido no frontmatter e persiste o mapa', async () => {
    const root = await project();
    const config = resolveConfig(
      { source: 'pt', targets: ['en'], collections: ['blog'], localizeSlugs: true },
      root,
    );
    await translate(config, {
      provider: new TitleProvider(),
      driver: new FileCacheDriver(cacheDirFor(config)),
    });

    const en = matter(
      await readFile(localizedPath({ relPath: 'blog/chapada.md' } as any, 'en', config), 'utf8'),
    );
    expect(en.data.slug).toBe('en-weekend-chapada');

    const map = JSON.parse(await readFile(join(cacheDirFor(config), 'slugs.json'), 'utf8'));
    expect(map['blog/chapada'].en).toBe('en-weekend-chapada');
  });

  it('mantém o slug estável mesmo com a TM quente (não regenera)', async () => {
    const root = await project();
    const config = resolveConfig(
      { source: 'pt', targets: ['en'], collections: ['blog'], localizeSlugs: true },
      root,
    );
    await translate(config, {
      provider: new TitleProvider(),
      driver: new FileCacheDriver(cacheDirFor(config)),
    });

    // Segundo run com outro provider — slug deve continuar o registrado.
    class OtherProvider implements Provider {
      readonly name = 'anthropic' as const;
      async translate(): Promise<string> {
        return 'algo totalmente diferente';
      }
    }
    await translate(config, {
      provider: new OtherProvider(),
      driver: new FileCacheDriver(cacheDirFor(config)),
    });

    const en = matter(
      await readFile(localizedPath({ relPath: 'blog/chapada.md' } as any, 'en', config), 'utf8'),
    );
    expect(en.data.slug).toBe('en-weekend-chapada'); // pinado pelo mapa
  });
});
