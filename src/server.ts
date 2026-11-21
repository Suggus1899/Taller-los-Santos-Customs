import { createApp } from './app.js';
import { bootstrap } from './bootstrap.js';
import { logger } from './lib/logger.js';
import { flushSentry, initSentry } from './lib/sentry.js';

const container = bootstrap();
const { env, db, exchangeRates } = container;
initSentry({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV });

void exchangeRates.refresh(); // precarga la tasa al arrancar

const app = createApp({ ...container, rateLimit: true });

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Taller Los Santos escuchando');
});

/** Cierre ordenado: deja de aceptar conexiones, termina las peticiones en curso y libera la BD. */
function shutdown(signal: string) {
  logger.info({ signal }, 'cerrando servidor…');
  setTimeout(() => process.exit(1), 10_000).unref();
  server.close(() => {
    void flushSentry()
      .then(() => db.$disconnect())
      .catch((error: unknown) => logger.error({ err: error }, 'error al cerrar'))
      .finally(() => process.exit(0));
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
