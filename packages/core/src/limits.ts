/**
 * Controles operacionais do Verbosia: retries com backoff, limite de gasto e
 * concorrência. Aplicados numa camada única (tm.ts/translate.ts), valem
 * uniformemente para os 4 providers.
 */

/* ------------------------------------------------------------------ retry */

export interface RetryOptions {
  /** Tentativas EXTRAS após a primeira falha retryable. Default: 3. */
  retries: number;
  /** Delay base do backoff exponencial (ms). Default: 500. */
  baseDelayMs?: number;
  /** Teto do delay (ms). Default: 8000. */
  maxDelayMs?: number;
  /** Callback por retentativa (log/telemetria). */
  onRetry?: (attempt: number, err: unknown, delayMs: number) => void;
}

const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504, 529]);
const RETRYABLE_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'EPIPE', 'UND_ERR_SOCKET',
]);

/** Um erro merece retry se for rate limit, erro de servidor ou falha de rede. */
export function isRetryable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as Record<string, any>;

  const status = e.status ?? e.statusCode ?? e.response?.status;
  if (typeof status === 'number') return RETRYABLE_STATUS.has(status);

  const code = e.code ?? e.cause?.code;
  if (typeof code === 'string' && RETRYABLE_CODES.has(code)) return true;

  // fetch nativo falha com TypeError('fetch failed'); SDKs usam APIConnectionError.
  const name = e.name ?? '';
  if (name === 'APIConnectionError' || name === 'APIConnectionTimeoutError') return true;
  if (name === 'TypeError' && /fetch failed/i.test(String(e.message))) return true;

  return false;
}

/** Executa `fn` com backoff exponencial + jitter em erros retryable. */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const base = opts.baseDelayMs ?? 500;
  const max = opts.maxDelayMs ?? 8000;

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= opts.retries || !isRetryable(err)) throw err;
      const delay = Math.min(base * 2 ** attempt, max) * (0.5 + Math.random() * 0.5);
      opts.onRetry?.(attempt + 1, err, Math.round(delay));
      await new Promise((r) => setTimeout(r, delay));
      attempt++;
    }
  }
}

/* ----------------------------------------------------------------- budget */

/**
 * Limite de gasto por run: conta chamadas LÓGICAS ao provider (retries da
 * mesma chamada não contam de novo). Ao exceder, lança erro claro — o que já
 * foi traduzido está na TM, então um re-run continua de onde parou.
 */
export class CallBudget {
  private used = 0;

  /** `max` 0 (ou negativo) = ilimitado. */
  constructor(private readonly max: number) {}

  consume(context: string): void {
    if (this.max > 0 && this.used >= this.max) {
      throw new Error(
        `[verbosia] limite de gasto atingido: ${this.max} chamadas de API neste run ` +
          `(ao traduzir "${context}"). O que já foi traduzido está salvo na TM — ` +
          `rode de novo para continuar, ou aumente limits.maxApiCalls na config.`,
      );
    }
    this.used++;
  }

  get count(): number {
    return this.used;
  }
}

/* ------------------------------------------------------------ concurrency */

/**
 * map com limite de concorrência, preservando a ordem dos resultados.
 * Falhou uma => rejeita (as demais em voo terminam, novas não iniciam).
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const n = Math.max(1, limit | 0);
  const results = new Array<R>(items.length);
  let next = 0;
  let failed: unknown = null;

  async function worker(): Promise<void> {
    while (true) {
      if (failed) return;
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = await fn(items[i]!, i);
      } catch (err) {
        failed ??= err;
        return;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  if (failed) throw failed;
  return results;
}
