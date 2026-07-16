/**
 * Contratos centrais do Verbosia. Tudo aqui é agnóstico de framework.
 * Providers, cache-drivers e adapters (Astro, etc.) implementam estas interfaces.
 */

/** Código de idioma BCP-47 curto declarado na config (ex.: 'pt', 'en', 'es'). */
export type Lang = string;

/** Variante regional opcional por idioma (ex.: en -> 'en-US', es -> 'es-419'). */
export type VariantMap = Record<Lang, string>;

/** Provedores suportados. Só 'anthropic' no MVP; demais são placeholders v1. */
export type ProviderName = 'anthropic' | 'openai' | 'gemini' | 'deepl';

/** Drivers de cache. 'file' é comitável (Tier 1). 'redis' é v1 (Tier 2). */
export type CacheDriverName = 'file' | 'redis';

/**
 * Uma unidade de conteúdo descoberta no projeto de origem.
 * No MVP a granularidade é doc-level: um arquivo inteiro = um documento.
 */
export interface SourceDocument {
  /** ID estável do documento, independente de slug/idioma (ex.: 'blog/meu-post'). */
  id: string;
  /** Coleção à qual pertence (ex.: 'blog', 'pages'). */
  collection: string;
  /** Caminho absoluto do arquivo de origem. */
  absPath: string;
  /** Caminho relativo à raiz de conteúdo. */
  relPath: string;
  /** Frontmatter cru (chaves preservadas conforme config). */
  frontmatter: Record<string, unknown>;
  /** Corpo do documento (markdown/mdx), sem o frontmatter. */
  body: string;
  /** Extensão original (ex.: '.md', '.mdx'). */
  ext: string;
}

/** Granularidade da TM: doc inteiro (MVP) ou por parágrafo (v2, default). */
export type SegmentationMode = 'document' | 'paragraph';

/** Um segmento traduzível: um bloco do corpo, ou um campo de frontmatter. */
export interface Segment {
  /**
   * Caminho lógico dentro do documento:
   * 'body' (modo document), 'body:N' (modo paragraph) ou 'frontmatter:title'.
   */
  path: string;
  /** Texto de origem a traduzir. */
  text: string;
  /**
   * false => segmento sem prosa (só código/URLs/tokens); passa direto sem
   * chamar provider nem gravar na TM.
   */
  translatable?: boolean;
}

/** Resultado da tradução de um segmento. */
export interface TranslatedSegment extends Segment {
  targetLang: Lang;
  /** Texto traduzido, com placeholders já restaurados. */
  translated: string;
  /** Modelo que produziu a tradução. */
  translatedBy: string;
  /** Origem do resultado na cascata de resolução. */
  source: 'file' | 'redis' | 'provider';
}

/** Chave de cache endereçada por conteúdo. */
export interface CacheKeyInput {
  sourceText: string;
  targetLang: Lang;
  model: string;
  glossaryVersion: string;
  promptVersion: string;
}

/** Valor guardado na Translation Memory. */
export interface TMEntry {
  text: string;
  model: string;
  /** Epoch ms de quando foi gravado. */
  ts: number;
}

/** Interface única para qualquer driver de cache (file, redis...). */
export interface CacheDriver {
  readonly name: CacheDriverName;
  get(key: string): Promise<TMEntry | null>;
  set(key: string, entry: TMEntry): Promise<void>;
  /** Chaves conhecidas — usado por `verbosia prune` e `verbosia tm:sync`. */
  keys?(): Promise<string[]>;
  /** Libera recursos (ex.: conexão Redis). Opcional. */
  close?(): Promise<void>;
}

/** Requisição de tradução passada ao provider (com masking já aplicado). */
export interface TranslateRequest {
  /** Texto com placeholders (spans protegidos mascarados). */
  maskedText: string;
  sourceLang: Lang;
  targetLang: Lang;
  variant?: string;
  tone?: string;
  glossary: string[];
  doNotTranslate: string[];
  model: string;
}

/** Interface única para qualquer provider (Anthropic, OpenAI...). */
export interface Provider {
  readonly name: ProviderName;
  translate(req: TranslateRequest): Promise<string>;
}

/** Config resolvida e normalizada, consumida pelo engine. */
export interface ResolvedConfig {
  provider: ProviderName;
  model: string;
  source: Lang;
  targets: Lang[];
  variant: VariantMap;
  tone?: string;
  collections: string[];
  /** Raiz do conteúdo de origem (absoluto). */
  contentDir: string;
  /** Diretório onde arquivos localizados são gravados (Tier 1). */
  outputDir: string;
  glossary: string[];
  doNotTranslate: string[];
  /** Campos de frontmatter a traduzir; os demais são preservados. */
  translateFields: string[];
  /** Gera slugs localizados por idioma (mapa estável em .verbosia/slugs.json). */
  localizeSlugs: boolean;
  /** Granularidade da TM. 'paragraph' (default): editar 1 parágrafo não invalida o doc. */
  segmentation: SegmentationMode;
  /** Dicionário de strings de UI (JSON) no idioma de origem; null desativa. */
  uiStrings: string | null;
  /** Controles operacionais: retries, concorrência e limite de gasto. */
  limits: {
    /** Retentativas extras em erro retryable (429/5xx/rede). */
    retries: number;
    /** Segmentos traduzidos em paralelo. */
    concurrency: number;
    /** Máximo de chamadas de API por run (0 = ilimitado). */
    maxApiCalls: number;
  };
  cache: {
    driver: CacheDriverName;
    url?: string;
    committed: boolean;
  };
  seo: {
    hreflang: boolean;
    sitemap: boolean;
    /** Idioma servido em x-default. */
    xDefault: Lang;
    canonical: boolean;
  };
  /** Versão do template de prompt — entra no cache-key. */
  promptVersion: string;
}

/** Config pública que o usuário escreve (parcial; o resto tem defaults). */
export interface VerbaUserConfig {
  provider?: ProviderName;
  model?: string;
  source: Lang;
  targets: Lang[];
  variant?: VariantMap;
  tone?: string;
  collections?: string[];
  contentDir?: string;
  outputDir?: string;
  glossary?: string[];
  doNotTranslate?: string[];
  translateFields?: string[];
  localizeSlugs?: boolean;
  segmentation?: SegmentationMode;
  /** Caminho do JSON de strings de UI no idioma de origem (ex.: 'src/i18n/pt.json'). */
  uiStrings?: string;
  limits?: {
    retries?: number;
    concurrency?: number;
    maxApiCalls?: number;
  };
  cache?: {
    driver?: CacheDriverName;
    url?: string;
    committed?: boolean;
  };
  seo?: {
    hreflang?: boolean;
    sitemap?: boolean;
    xDefault?: Lang;
    canonical?: boolean;
  };
}

/** Status de um documento por idioma — consumido por `verbosia status`. */
export interface DocLangStatus {
  docId: string;
  collection: string;
  targetLang: Lang;
  state: 'missing' | 'stale' | 'fresh';
  reviewed: boolean;
}
