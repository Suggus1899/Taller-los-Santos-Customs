import pino from 'pino';

/**
 * Logger estructurado (JSON en producción, legible en desarrollo).
 * Se configura desde el entorno al importarse para poder usarlo en cualquier
 * módulo, incluidos los que se cargan antes de validar la configuración.
 */
const env = process.env.NODE_ENV ?? 'development';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (env === 'test' ? 'silent' : 'info'),
  base: { service: 'taller-los-santos' },
  // Nunca registrar credenciales ni cookies, aunque lleguen en una cabecera.
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
    ],
    censor: '[oculto]',
  },
  ...(env === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname,service' },
        },
      }
    : {}),
});

export type Logger = typeof logger;
