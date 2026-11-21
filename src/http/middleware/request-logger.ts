import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import { logger } from '../../lib/logger.js';

const REQUEST_ID = /^[\w-]{8,128}$/;

/**
 * Log estructurado por petición con un identificador de correlación:
 * se respeta el X-Request-Id del proxy si es válido, o se genera uno, y se
 * devuelve en la respuesta para poder cruzar quejas de usuarios con los logs.
 * No se registran cuerpos ni cookies (datos personales y sesiones).
 */
export const requestLogger = pinoHttp({
  logger,
  genReqId(req, res) {
    const incoming = req.headers['x-request-id'];
    const id = typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  autoLogging: { ignore: (req) => req.url === '/healthz' || req.url === '/readyz' },
  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req: (req: { id: string; method: string; url: string }) => ({
      id: req.id,
      method: req.method,
      url: req.url,
    }),
    res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
  },
});
