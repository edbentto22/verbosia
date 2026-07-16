import type { CacheDriver, TMEntry } from '../types.js';

const PREFIX = 'tm:';

/**
 * Cache-driver `redis` — Tier 2, a TM compartilhada entre projetos.
 *
 * Chave `tm:{cacheKey}` -> JSON `{ text, model, ts }`. Pré-popula novos
 * projetos e evita retradução entre clientes (persona Agência). Usa o SDK
 * oficial `redis` (node-redis v4, peer dependency opcional, importado sob
 * demanda). Política de conflito: last-write-wins (o cache-key já isola por
 * conteúdo/modelo/glossário/prompt, então corridas reescrevem o mesmo valor).
 */
export class RedisCacheDriver implements CacheDriver {
  readonly name = 'redis' as const;
  /** Memoizado: conexões concorrentes compartilham o mesmo client. */
  private clientPromise: Promise<any> | null = null;
  private connected = false;
  private readonly url: string;

  constructor(url: string | undefined) {
    if (!url) {
      throw new Error(
        '[verbosia] driver "redis" requer cache.url (ex.: process.env.REDIS_URL).',
      );
    }
    this.url = url;
  }

  private getClient(): Promise<any> {
    this.clientPromise ??= (async () => {
      let mod: any;
      try {
        mod = await import('redis');
      } catch {
        throw new Error(
          '[verbosia] instale o peer `redis` para usar o driver "redis": pnpm add redis',
        );
      }
      const client = mod.createClient({ url: this.url });
      client.on('error', (err: unknown) => {
        // Não derruba o build por um erro transitório de conexão; loga uma vez.
        if (this.connected) console.warn('[verbosia] Redis:', String(err));
      });
      await client.connect();
      this.connected = true;
      return client;
    })();
    return this.clientPromise;
  }

  async get(key: string): Promise<TMEntry | null> {
    const client = await this.getClient();
    const raw = await client.get(PREFIX + key);
    return raw ? (JSON.parse(raw) as TMEntry) : null;
  }

  async set(key: string, entry: TMEntry): Promise<void> {
    const client = await this.getClient();
    await client.set(PREFIX + key, JSON.stringify(entry));
  }

  async keys(): Promise<string[]> {
    const client = await this.getClient();
    const out: string[] = [];
    for await (const key of client.scanIterator({ MATCH: `${PREFIX}*`, COUNT: 200 })) {
      out.push(typeof key === 'string' ? key.slice(PREFIX.length) : String(key));
    }
    return out;
  }

  async close(): Promise<void> {
    if (this.connected && this.clientPromise) {
      const client = await this.clientPromise;
      await client.quit();
      this.connected = false;
      this.clientPromise = null;
    }
  }
}
