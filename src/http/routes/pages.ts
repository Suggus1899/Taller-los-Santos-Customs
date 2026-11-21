import { Router } from 'express';
import { z } from 'zod';
import { galleryCategories, galleryItems } from '../../content/gallery.js';
import {
  brands,
  certifications,
  guarantees,
  guaranteeTerms,
  homeFaqs,
  processSteps,
  team,
  timeline,
  values,
} from '../../content/home.js';
import { site } from '../../config/site.js';
import type { ContentCache } from '../../services/content-cache.js';
import { renderPage } from '../render.js';

/** Mejora estimada del rendimiento tras un mantenimiento completo. */
export const FUEL_EFFICIENCY_GAIN = 0.15;

const fuelSchema = z.object({
  km: z.coerce.number().positive().max(10_000),
  rendimiento: z.coerce.number().positive().max(100),
  precio: z.coerce.number().positive().max(100),
});

export function calculateFuelSavings(kmPerWeek: number, kmPerLiter: number, pricePerLiter: number) {
  const yearlyCost = (kmPerWeek / kmPerLiter) * pricePerLiter * 52;
  const improvedCost = (kmPerWeek / (kmPerLiter * (1 + FUEL_EFFICIENCY_GAIN))) * pricePerLiter * 52;
  return { yearlyCost, improvedCost, savings: yearlyCost - improvedCost };
}

export function pagesRouter(content: ContentCache): Router {
  const router = Router();
  const yearsOfExperience = new Date().getFullYear() - site.foundedYear;

  router.get('/', async (_req, res) => {
    await renderPage(res, 'pages/home', {
      title: 'Mecánica automotriz en Cagua',
      description: site.description,
      yearsOfExperience,
      processSteps,
      values,
      brands,
      faqs: homeFaqs,
    });
  });

  router.get('/servicios', async (_req, res) => {
    await renderPage(res, 'pages/services', {
      title: 'Servicios',
      description:
        'Mantenimiento, reparaciones, diagnóstico, aire acondicionado, frenos y neumáticos en Cagua.',
    });
  });

  router.get('/servicios/:slug', async (req, res, next) => {
    const service = await content.service(req.params.slug);
    if (!service) {
      next();
      return;
    }
    await renderPage(res, 'pages/service', {
      title: service.name,
      description: service.summary,
      service,
      related: (await content.services()).filter((s) => s.slug !== service.slug).slice(0, 3),
    });
  });

  router.get('/nosotros', async (_req, res) => {
    await renderPage(res, 'pages/about', {
      title: 'Nosotros',
      description: `Taller familiar fundado en ${site.foundedYear} en Cagua, Aragua.`,
      yearsOfExperience,
      values,
      timeline,
      team,
      certifications,
    });
  });

  router.get('/garantias', async (_req, res) => {
    await renderPage(res, 'pages/guarantees', {
      title: 'Garantías',
      description: 'Garantía de 6 meses o 10.000 km en mano de obra y repuestos.',
      guarantees,
      terms: guaranteeTerms,
    });
  });

  router.get('/galeria', async (_req, res) => {
    await renderPage(res, 'pages/gallery', {
      title: 'Galería',
      description: 'Fotos de nuestro taller y de los trabajos que realizamos.',
      items: galleryItems,
      categories: galleryCategories,
    });
  });

  router.get('/promociones', async (_req, res) => {
    await renderPage(res, 'pages/promotions', {
      title: 'Promociones',
      description: 'Ofertas vigentes en mantenimiento, alineación y diagnóstico.',
      promotions: await content.promotions(),
    });
  });

  // La calculadora funciona sin JavaScript: el formulario usa GET y el servidor calcula.
  router.get('/calculadora-combustible', async (req, res) => {
    const submitted = Object.keys(req.query).length > 0;
    const parsed = fuelSchema.safeParse(req.query);
    const result = parsed.success
      ? calculateFuelSavings(parsed.data.km, parsed.data.rendimiento, parsed.data.precio)
      : null;
    await renderPage(res, 'pages/fuel-calculator', {
      title: 'Calculadora de ahorro de combustible',
      description: 'Calcula cuánto podrías ahorrar en combustible con un vehículo bien mantenido.',
      values: req.query,
      result,
      error:
        submitted && !parsed.success
          ? 'Revisa los valores: deben ser números mayores que cero.'
          : null,
      gainPercent: FUEL_EFFICIENCY_GAIN * 100,
    });
  });

  return router;
}
