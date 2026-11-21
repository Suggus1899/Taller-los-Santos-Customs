import helmet from 'helmet';
import type { Env } from '../../config/env.js';

/**
 * Cabeceras de seguridad. La CSP solo permite recursos propios: no hay scripts
 * ni estilos inline en las vistas. Si se configura Google Analytics, se añaden
 * únicamente los dominios que necesita.
 */
export function securityHeaders(env: Env) {
  const analytics = env.GA_MEASUREMENT_ID
    ? {
        script: ['https://www.googletagmanager.com'],
        connect: [
          'https://*.google-analytics.com',
          'https://*.analytics.google.com',
          'https://*.googletagmanager.com',
        ],
        img: ['https://*.google-analytics.com', 'https://*.googletagmanager.com'],
      }
    : { script: [], connect: [], img: [] };

  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", ...analytics.script],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', ...analytics.img],
        fontSrc: ["'self'"],
        connectSrc: ["'self'", ...analytics.connect],
        frameSrc: ['https://www.google.com'], // mapa embebido
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        ...(env.NODE_ENV === 'production' ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    strictTransportSecurity: env.NODE_ENV === 'production',
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });
}
