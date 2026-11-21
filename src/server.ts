import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createPrismaClient } from './db/client.js';
import { createRepositories } from './repositories/index.js';
import { dolarApiProvider, ExchangeRateService } from './services/exchange-rate.js';
import { createNotifier } from './services/mailer.js';

const env = loadEnv();
const db = createPrismaClient(env.DATABASE_URL);
const exchangeRates = new ExchangeRateService(
  db,
  env.EXCHANGE_RATE_API_URL ? dolarApiProvider(env.EXCHANGE_RATE_API_URL) : null,
  env.EXCHANGE_RATE_TTL_MINUTES * 60_000,
);
void exchangeRates.refresh(); // precarga la tasa al arrancar

const app = createApp({
  env,
  db,
  repos: createRepositories(db),
  notifier: createNotifier(env),
  exchangeRates,
  rateLimit: true,
});

const server = app.listen(env.PORT, () => {
  console.info(`Taller Los Santos escuchando en http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

/** Cierre ordenado: deja de aceptar conexiones y libera la base de datos. */
function shutdown(signal: string) {
  console.info(`${signal} recibido, cerrando…`);
  server.close(() => {
    db.$disconnect()
      .catch((error: unknown) => console.error(error))
      .finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
