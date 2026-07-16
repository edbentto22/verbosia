/**
 * Provider/modelo vêm do ambiente para facilitar o teste dos dois:
 *   ANTHROPIC_API_KEY=... verbosia translate
 *   OPENAI_API_KEY=... VERBOSIA_PROVIDER=openai verbosia translate
 * @type {import('@verbosia/core').VerbaUserConfig}
 */
export default {
  provider: process.env.VERBOSIA_PROVIDER ?? 'anthropic',
  model: process.env.VERBOSIA_MODEL, // undefined => default por provider (claude-sonnet-5 / gpt-4o)
  source: 'pt',
  targets: ['en', 'es'],
  variant: { en: 'en-US', es: 'es-419' },
  collections: ['blog'],
  glossary: ['Pousada Mirante de Lençóis', 'Chapada Diamantina'],
  translateFields: ['title', 'description'],
  localizeSlugs: false, // true => slug traduzido por idioma, mapa estável em .verbosia/slugs.json
  // Tier 2 (TM compartilhada) liga automaticamente quando REDIS_URL está definido:
  cache: {
    driver: process.env.REDIS_URL ? 'redis' : 'file',
    url: process.env.REDIS_URL,
    committed: true,
  },
  seo: { hreflang: true, sitemap: true, xDefault: 'pt' },
};
