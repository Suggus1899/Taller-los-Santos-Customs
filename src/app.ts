import compression from 'compression';
import cookieParser from 'cookie-parser';
import csrf from '@dr.pogodin/csurf';
import express from 'express';
import session from 'express-session';
import morgan from 'morgan';
import { PUBLIC_DIR, VIEWS_DIR } from './config/paths.js';
import type { Db } from './db/client.js';
import type { AppContext } from './http/context.js';
import { errorHandler, notFoundHandler } from './http/middleware/errors.js';
import { securityHeaders } from './http/middleware/security.js';
import { adminRouter, SESSION_COOKIE } from './http/routes/admin.js';
import { apiRouter } from './http/routes/api.js';
import { formsRouter } from './http/routes/forms.js';
import { pagesRouter } from './http/routes/pages.js';
import { seoRouter } from './http/routes/seo.js';
import { viewHelpers } from './http/view-helpers.js';
import { usdToVes } from './services/exchange-rate.js';
import { PrismaSessionStore } from './services/session-store.js';

export interface CreateAppOptions extends AppContext {
  db: Db;
}

export function createApp({ db, ...ctx }: CreateAppOptions): express.Express {
  const { env } = ctx;
  const isProduction = env.NODE_ENV === 'production';
  const app = express();

  app.set('views', VIEWS_DIR);
  app.set('view engine', 'ejs');
  app.set('trust proxy', env.TRUST_PROXY);
  app.locals = Object.assign(app.locals, viewHelpers, {
    gaMeasurementId: env.GA_MEASUREMENT_ID,
    siteUrl: env.SITE_URL.replace(/\/$/, ''),
    // Valores por defecto para vistas renderizadas antes de los middlewares de locals
    // (p. ej. un error de CSRF): res.locals los sobrescribe en el flujo normal.
    currentPath: '/',
    csrfToken: '',
    officialRate: null,
    toVes: () => null,
  });

  app.use(securityHeaders(env));
  app.use(compression());
  if (env.NODE_ENV !== 'test') app.use(morgan(isProduction ? 'combined' : 'dev'));

  app.use(
    express.static(PUBLIC_DIR, {
      maxAge: isProduction ? '7d' : 0,
      setHeaders(res, filePath) {
        // Fuentes e imágenes no cambian de nombre al editarse poco: caché larga.
        if (isProduction && /\.(woff2|webp|svg)$/.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
        }
      },
    }),
  );

  app.use(express.urlencoded({ extended: false, limit: '20kb' }));
  app.use(cookieParser());

  // Solo el panel usa sesión: los visitantes no generan registros en la tabla `sessions`.
  const sessionMiddleware = session({
    name: SESSION_COOKIE,
    secret: env.SESSION_SECRET,
    store: new PrismaSessionStore(db),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      maxAge: 2 * 60 * 60 * 1000, // 2 horas de inactividad
    },
  });

  // La API pública va antes del CSRF: es de solo lectura y no usa cookies.
  app.use('/api', apiRouter(ctx));

  // CSRF con cookie de doble envío: protege todos los formularios POST.
  app.use(
    csrf({
      cookie: { key: '_csrf', httpOnly: true, sameSite: 'strict', secure: isProduction, path: '/' },
    }),
  );
  app.use((req, res, next) => {
    res.locals.csrfToken = req.csrfToken();
    res.locals.currentPath = req.path;
    next();
  });

  // Tasa oficial para mostrar equivalentes en bolívares. `peek()` nunca bloquea la respuesta.
  app.use((_req, res, next) => {
    const official = ctx.exchangeRates.peek()?.oficial ?? null;
    res.locals.officialRate = official;
    res.locals.toVes = (usd: number) => (official ? usdToVes(usd, official.rate) : null);
    next();
  });

  app.use(seoRouter(env));
  app.use(pagesRouter());
  app.use(formsRouter(ctx));
  app.use('/admin', sessionMiddleware, adminRouter(ctx));

  app.use(notFoundHandler);
  app.use(errorHandler(isProduction));

  return app;
}
