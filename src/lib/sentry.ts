import * as Sentry from '@sentry/node';
import { logger } from './logger.js';

let enabled = false;

/**
 * Activa el envío de errores a Sentry solo si hay SENTRY_DSN. Sin DSN, las
 * funciones de este módulo no hacen nada, así que se pueden llamar siempre.
 */
export function initSentry(options: {
  dsn: string | undefined;
  environment: string;
  release?: string;
}) {
  if (!options.dsn) return;
  Sentry.init({
    dsn: options.dsn,
    environment: options.environment,
    ...(options.release ? { release: options.release } : {}),
    // Solo errores, sin trazas de rendimiento. El SDK no envía datos personales por defecto.
    tracesSampleRate: 0,
  });
  enabled = true;
  logger.info('Sentry activado');
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (enabled) await Sentry.flush(timeoutMs);
}
