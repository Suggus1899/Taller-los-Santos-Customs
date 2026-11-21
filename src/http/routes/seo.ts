import { Router } from 'express';
import type { Env } from '../../config/env.js';
import type { ContentCache } from '../../services/content-cache.js';

/** URLs del sitio anterior → nuevas rutas en español (301 conserva el posicionamiento). */
export const legacyRedirects: Record<string, string> = {
  '/about': '/nosotros',
  '/maintenance': '/servicios/mantenimiento',
  '/repairs': '/servicios/reparaciones',
  '/diagnosis': '/servicios/diagnostico',
  '/ac-service': '/servicios/aire-acondicionado',
  '/brakes': '/servicios/frenos',
  '/tires': '/servicios/neumaticos',
  '/gallery': '/galeria',
  '/promotions': '/promociones',
  '/guarantees': '/garantias',
  '/quote': '/cotizar',
  '/appointment': '/cita',
  '/fuel-calculator': '/calculadora-combustible',
  '/thanks': '/',
  '/contactos': '/admin',
  '/auth/login': '/admin/login',
};

const staticPaths = [
  '/',
  '/servicios',
  '/promociones',
  '/nosotros',
  '/garantias',
  '/galeria',
  '/cotizar',
  '/cita',
  '/contacto',
  '/calculadora-combustible',
  '/privacidad',
];

export function seoRouter(env: Env, content: ContentCache): Router {
  const router = Router();
  const base = env.SITE_URL.replace(/\/$/, '');

  for (const [from, to] of Object.entries(legacyRedirects)) {
    router.get(from, (_req, res) => res.redirect(301, to));
  }

  router.get('/robots.txt', (_req, res) => {
    res
      .type('text/plain')
      .send(`User-agent: *\nDisallow: /admin\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`);
  });

  router.get('/sitemap.xml', async (_req, res) => {
    const servicePaths = (await content.services()).map((s) => `/servicios/${s.slug}`);
    const urls = [...staticPaths, ...servicePaths]
      .map((p) => `  <url><loc>${base}${p}</loc></url>`)
      .join('\n');
    res
      .type('application/xml')
      .send(
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      );
  });

  return router;
}
