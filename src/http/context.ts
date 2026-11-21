import type { Env } from '../config/env.js';
import type { Db } from '../db/client.js';
import type { Repositories } from '../repositories/index.js';
import type { ContentCache } from '../services/content-cache.js';
import type { ExchangeRateService } from '../services/exchange-rate.js';
import type { UseCases } from '../use-cases/index.js';
import type { Limiters } from './middleware/rate-limit.js';

/** Dependencias que recibe la app. Se inyectan para poder sustituirlas en los tests. */
export interface AppDeps {
  env: Env;
  db: Db;
  repos: Repositories;
  useCases: UseCases;
  content: ContentCache;
  exchangeRates: ExchangeRateService;
  /** Permite desactivar los límites de peticiones en los tests. */
  rateLimit: boolean;
}

/** Lo que reciben las rutas: las dependencias más los limitadores ya construidos. */
export interface AppContext extends AppDeps {
  limiters: Limiters;
}
