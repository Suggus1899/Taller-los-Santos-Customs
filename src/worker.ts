/**
 * Proceso worker: ejecuta la cola de trabajos (correos, recordatorios, tasa del
 * dólar, retención de datos) y programa las tareas periódicas. Se despliega aparte
 * de la web para que un pico de tráfico no retrase los correos y viceversa.
 * Se pueden ejecutar varias réplicas: FOR UPDATE SKIP LOCKED evita duplicados.
 */
import { bootstrap } from './bootstrap.js';
import { createJobHandlers } from './jobs/handlers.js';
import { JobWorker } from './jobs/queue.js';
import { Scheduler } from './jobs/scheduler.js';
import { logger } from './lib/logger.js';
import { flushSentry, initSentry } from './lib/sentry.js';
import { createMailer } from './services/mailer.js';

const container = bootstrap();
const { env, db } = container;
initSentry({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV });

const worker = new JobWorker(
  db,
  createJobHandlers({
    db,
    mailer: createMailer(env),
    useCases: container.useCases,
    exchangeRates: container.exchangeRates,
    retentionMonths: env.DATA_RETENTION_MONTHS,
  }),
);
const scheduler = new Scheduler(db, { reminderHour: env.REMINDER_HOUR });

worker.start();
scheduler.start();
logger.info('worker iniciado');

async function shutdown(signal: string) {
  logger.info({ signal }, 'deteniendo worker…');
  scheduler.stop();
  const force = setTimeout(() => process.exit(1), 25_000);
  force.unref();
  await worker.stop(); // termina el lote en curso antes de salir
  await flushSentry();
  await db.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
