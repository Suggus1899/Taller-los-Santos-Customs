import { loadEnv, type Env } from './config/env.js';
import { createPrismaClient, type Db } from './db/client.js';
import { createRepositories, type Repositories } from './repositories/index.js';
import { ContentCache } from './services/content-cache.js';
import { dolarApiProvider, ExchangeRateService } from './services/exchange-rate.js';
import { createUseCases, type UseCases } from './use-cases/index.js';

export interface Container {
  env: Env;
  db: Db;
  repos: Repositories;
  useCases: UseCases;
  exchangeRates: ExchangeRateService;
  content: ContentCache;
}

/**
 * Raíz de composición compartida por la web (server.ts) y el worker (worker.ts):
 * crea una sola vez las dependencias y las conecta entre sí.
 */
export function bootstrap(env: Env = loadEnv()): Container {
  const db = createPrismaClient(env.DATABASE_URL);
  const repos = createRepositories(db);
  return {
    env,
    db,
    repos,
    useCases: createUseCases({ db, repos }),
    exchangeRates: new ExchangeRateService(
      db,
      env.EXCHANGE_RATE_API_URL ? dolarApiProvider(env.EXCHANGE_RATE_API_URL) : null,
      env.EXCHANGE_RATE_TTL_MINUTES * 60_000,
    ),
    content: new ContentCache(repos.content),
  };
}
