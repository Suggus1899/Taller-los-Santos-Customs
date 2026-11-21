import { Router } from 'express';
import { z } from 'zod';
import { usdToVes, type ExchangeRates, type RateQuote } from '../../services/exchange-rate.js';
import type { AppContext } from '../context.js';

const convertSchema = z.object({
  monto: z.coerce
    .number({ error: 'monto debe ser un número' })
    .positive('monto debe ser mayor que 0')
    .max(1_000_000_000, 'monto demasiado grande'),
  fuente: z.enum(['oficial', 'paralelo']).default('oficial'),
});

const serializeQuote = (quote: RateQuote | null) =>
  quote && { rate: quote.rate, publishedAt: quote.publishedAt.toISOString() };

function serializeRates(rates: ExchangeRates) {
  return {
    base: 'USD',
    quote: 'VES',
    provider: 'DolarApi',
    oficial: serializeQuote(rates.oficial),
    paralelo: serializeQuote(rates.paralelo),
    fetchedAt: rates.fetchedAt.toISOString(),
    stale: rates.stale,
  };
}

/**
 * API pública de solo lectura (JSON).
 *   GET /api/tasa-dolar
 *   GET /api/tasa-dolar/convertir?monto=69&fuente=oficial
 */
export function apiRouter(ctx: AppContext): Router {
  const router = Router();

  router.use(ctx.limiters.api);

  router.get('/tasa-dolar', async (_req, res) => {
    const rates = await ctx.exchangeRates.get();
    if (!rates) {
      res.status(503).json({ error: 'La tasa del dólar no está disponible en este momento.' });
      return;
    }
    res.set('Cache-Control', 'public, max-age=300').json(serializeRates(rates));
  });

  router.get('/tasa-dolar/convertir', async (req, res) => {
    const parsed = convertSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Parámetros inválidos' });
      return;
    }
    const rates = await ctx.exchangeRates.get();
    const quote = rates?.[parsed.data.fuente];
    if (!rates || !quote) {
      res.status(503).json({ error: 'La tasa del dólar no está disponible en este momento.' });
      return;
    }
    res.set('Cache-Control', 'public, max-age=300').json({
      amountUsd: parsed.data.monto,
      amountVes: usdToVes(parsed.data.monto, quote.rate),
      rate: quote.rate,
      source: parsed.data.fuente,
      publishedAt: quote.publishedAt.toISOString(),
      stale: rates.stale,
    });
  });

  // Cualquier otra ruta bajo /api responde en JSON, no con la página HTML de error.
  router.use((_req, res) => {
    res.status(404).json({ error: 'Recurso no encontrado' });
  });

  return router;
}
