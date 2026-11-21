import { z } from 'zod';
import type { Db } from '../db/client.js';
import { RateSource } from '../generated/prisma/enums.js';

export { RateSource };

export interface RateQuote {
  source: RateSource;
  /** Bolívares por 1 USD. */
  rate: number;
  publishedAt: Date;
}

export interface ExchangeRates {
  oficial: RateQuote | null;
  paralelo: RateQuote | null;
  /** Cuándo se obtuvieron (del proveedor o de la BD). */
  fetchedAt: Date;
  /** true si los datos superan el TTL y no se pudieron refrescar. */
  stale: boolean;
}

/** Función que obtiene las tasas del proveedor externo (inyectable en tests). */
export type RateProvider = () => Promise<RateQuote[]>;

// ───────────────────────────── Proveedor ─────────────────────────────

const dolarApiSchema = z.array(
  z.object({
    moneda: z.literal('USD'),
    fuente: z.string(),
    promedio: z.number().positive(),
    fechaActualizacion: z.iso.datetime({ offset: true }),
  }),
);

const sourceMap: Record<string, RateSource> = {
  oficial: RateSource.OFICIAL,
  paralelo: RateSource.PARALELO,
};

/**
 * Proveedor DolarApi (https://ve.dolarapi.com). La respuesta se valida con Zod:
 * nunca se confía en el formato de una API externa.
 */
export function dolarApiProvider(url: string, timeoutMs = 5000): RateProvider {
  return async () => {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`DolarApi respondió ${response.status}`);
    const data = dolarApiSchema.parse(await response.json());
    return data.flatMap((item) => {
      const source = sourceMap[item.fuente];
      return source
        ? [{ source, rate: item.promedio, publishedAt: new Date(item.fechaActualizacion) }]
        : [];
    });
  };
}

// ───────────────────────────── Servicio ──────────────────────────────

/**
 * Tasa USD→VES con caché en memoria y estrategia stale-while-revalidate:
 * - Las páginas usan `peek()`, que nunca espera a la red.
 * - Si la caché caducó, se refresca en segundo plano.
 * - Si el proveedor falla, se usa la última tasa guardada en la base de datos.
 */
export class ExchangeRateService {
  private cache: ExchangeRates | null = null;
  private inflight: Promise<ExchangeRates | null> | null = null;
  /** Tras un fallo del proveedor no se reintenta hasta pasado este tiempo. */
  private retryAt = 0;
  static readonly RETRY_AFTER_MS = 60_000;

  constructor(
    private readonly db: Db,
    private readonly provider: RateProvider | null,
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  private isFresh(rates: ExchangeRates): boolean {
    return this.now() - rates.fetchedAt.getTime() < this.ttlMs;
  }

  /** Devuelve lo que haya en caché sin esperar; dispara un refresco si hace falta. */
  peek(): ExchangeRates | null {
    if (!this.cache || !this.isFresh(this.cache)) void this.refresh();
    return this.cache;
  }

  /** Devuelve tasas vigentes, esperando al proveedor o a la BD si la caché está vacía. */
  async get(): Promise<ExchangeRates | null> {
    if (this.cache && this.isFresh(this.cache)) return this.cache;
    if (this.cache) {
      void this.refresh();
      return this.cache;
    }
    return this.refresh();
  }

  /** Refresca desde el proveedor; agrupa llamadas concurrentes en una sola. */
  refresh(): Promise<ExchangeRates | null> {
    this.inflight ??= this.load().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async load(): Promise<ExchangeRates | null> {
    if (this.provider && this.now() >= this.retryAt) {
      try {
        const quotes = await this.provider();
        await this.persist(quotes);
        this.cache = this.build(quotes, new Date(this.now()), false);
        return this.cache;
      } catch (error) {
        this.retryAt = this.now() + ExchangeRateService.RETRY_AFTER_MS;
        console.warn('No se pudo obtener la tasa del dólar:', (error as Error).message);
      }
    }
    // Respaldo: última tasa conocida en la base de datos (marcada como no vigente).
    const fromDb = await this.latestFromDb().catch(() => null);
    if (fromDb) this.cache = fromDb;
    return this.cache;
  }

  private async persist(quotes: RateQuote[]): Promise<void> {
    if (!quotes.length) return;
    await this.db.exchangeRate.createMany({
      data: quotes.map((q) => ({ source: q.source, rate: q.rate, publishedAt: q.publishedAt })),
      skipDuplicates: true, // la misma publicación ya registrada no se duplica
    });
  }

  private async latestFromDb(): Promise<ExchangeRates | null> {
    const rows = await Promise.all(
      Object.values(RateSource).map((source) =>
        this.db.exchangeRate.findFirst({ where: { source }, orderBy: { publishedAt: 'desc' } }),
      ),
    );
    const quotes = rows.flatMap((row) =>
      row ? [{ source: row.source, rate: row.rate.toNumber(), publishedAt: row.publishedAt }] : [],
    );
    if (!quotes.length) return null;
    const fetchedAt = new Date(Math.max(...rows.map((r) => r?.fetchedAt.getTime() ?? 0)));
    return this.build(quotes, fetchedAt, true);
  }

  private build(quotes: RateQuote[], fetchedAt: Date, fromBackup: boolean): ExchangeRates {
    const find = (source: RateSource) => quotes.find((q) => q.source === source) ?? null;
    const rates: ExchangeRates = {
      oficial: find(RateSource.OFICIAL),
      paralelo: find(RateSource.PARALELO),
      fetchedAt,
      stale: false,
    };
    rates.stale = fromBackup && !this.isFresh(rates);
    return rates;
  }
}

/** Convierte USD a VES redondeando a céntimos. */
export function usdToVes(amountUsd: number, rate: number): number {
  return Math.round(amountUsd * rate * 100) / 100;
}
