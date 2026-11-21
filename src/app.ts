import compression from 'compression';
import cookieParser from 'cookie-parser';
import csrf from '@dr.pogodin/csurf';
import express from 'express';
import session from 'express-session';
import { PUBLIC_DIR, VIEWS_DIR } from './config/paths.js';
import type { AppContext, AppDeps } from './http/context.js';
import { errorHandler, notFoundHandler } from './http/middleware/errors.js';
import { createLimiters } from './http/middleware/rate-limit.js';
import { requestLogger } from './http/middleware/request-logger.js';
import { securityHeaders } from './http/middleware/security.js';
import { adminRouter, SESSION_COOKIE } from './http/routes/admin/index.js';
import { apiRouter } from './http/routes/api.js';
import { formsRouter } from './http/routes/forms.js';
import { healthRouter } from './http/routes/health.js';
import { pagesRouter } from './http/routes/pages.js';
import { privacyRouter, readConsent } from './http/routes/privacy.js';
import { seoRouter } from './http/routes/seo.js';
import { viewHelpers } from './http/view-helpers.js';
import { usdToVes } from './services/exchange-rate.js';
import { PrismaSessionStore } from './services/session-store.js';

export function createApp(deps: AppDeps): express.Express {
  const { env, db } = deps;
  const ctx: AppContext = { ...deps, limiters: createLimiters(db, deps.rateLimit) };
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
    services: [],
    analyticsEnabled: false,
    showConsentBanner: false,
  });

  // Sondas antes de todo lo demás: sin logs, sin cookies, sin rate limit.
  app.use(healthRouter(db));

  app.use(securityHeaders(env));
  app.use(compression());
  app.use(
    express.static(PUBLIC_DIR, {
      maxAge: isProduction ? '7d' : 0,
      setHeaders(res, filePath) {
        // Fuentes e imágenes casi no cambian: caché larga.
        if (isProduction && /\.(woff2|webp|svg)$/.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
        }
      },
    }),
  );
  // Después de los estáticos: solo se registran las peticiones a la aplicación.
  app.use(requestLogger);

  // `extended` permite campos anidados (plans[0][name]) en los formularios del panel.
  app.use(express.urlencoded({ extended: true, limit: '50kb', parameterLimit: 500 }));
  app.use(cookieParser());

  // La API pública va antes del CSRF: es de solo lectura y no usa cookies.
  app.use('/api', apiRouter(ctx));

  // CSRF con cookie de doble envío: protege todos los formularios POST.
  app.use(
    csrf({
      cookie: { key: '_csrf', httpOnly: true, sameSite: 'strict', secure: isProduction, path: '/' },
    }),
  );

  // Datos comunes a todas las vistas. `peek()` de la tasa nunca bloquea la respuesta.
  app.use(async (req, res, next) => {
    const official = ctx.exchangeRates.peek()?.oficial ?? null;
    const consent = readConsent(req);
    res.locals.csrfToken = req.csrfToken();
    res.locals.currentPath = req.path;
    res.locals.officialRate = official;
    res.locals.toVes = (usd: number) => (official ? usdToVes(usd, official.rate) : null);
    res.locals.services = await ctx.content.services();
    res.locals.analyticsEnabled = Boolean(env.GA_MEASUREMENT_ID) && consent === 'granted';
    res.locals.showConsentBanner = Boolean(env.GA_MEASUREMENT_ID) && consent === null;
    next();
  });

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

  app.use(seoRouter(env, ctx.content));
  app.use(privacyRouter(env));
  app.use(pagesRouter(ctx.content));
  app.use(formsRouter(ctx));
  app.use('/admin', sessionMiddleware, adminRouter(ctx));

  app.use(notFoundHandler);
  app.use(errorHandler(isProduction));

  return app;
}
