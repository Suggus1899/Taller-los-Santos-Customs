import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ExchangeRateService,
  RateSource,
  type RateProvider,
} from '../src/services/exchange-rate.js';
import { createTestApp, fakeRateProvider } from './helpers/app.js';
import { resetDatabase, testDb } from './helpers/db.js';

beforeEach(() => resetDatabase());

describe('ExchangeRateService', () => {
  it('guarda las tasas en la BD y no duplica la misma publicación', async () => {
    const service = new ExchangeRateService(testDb(), fakeRateProvider, 1000);
    const rates = await service.refresh();
    await service.refresh();
    expect(rates?.oficial?.rate).toBe(100);
    expect(await testDb().exchangeRate.count()).toBe(2);
  });

  it('usa la caché mientras está vigente', async () => {
    const provider = vi.fn(fakeRateProvider);
    const service = new ExchangeRateService(testDb(), provider, 60_000);
    await service.get();
    await service.get();
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('agrupa refrescos concurrentes en una sola llamada al proveedor', async () => {
    const provider = vi.fn(fakeRateProvider);
    const service = new ExchangeRateService(testDb(), provider, 60_000);
    await Promise.all([service.get(), service.get(), service.get()]);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('si el proveedor falla, usa la última tasa de la BD marcada como no vigente', async () => {
    await testDb().exchangeRate.create({
      data: {
        source: RateSource.OFICIAL,
        rate: 90.5,
        publishedAt: new Date('2026-01-01T00:00:00Z'),
        fetchedAt: new Date('2026-01-01T00:00:00Z'),
      },
    });
    const failing: RateProvider = vi.fn(async () => {
      throw new Error('caído');
    });
    const service = new ExchangeRateService(testDb(), failing, 60_000);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rates = await service.get();
    expect(rates?.oficial?.rate).toBe(90.5);
    expect(rates?.stale).toBe(true);

    // Backoff: no se vuelve a llamar al proveedor inmediatamente.
    await service.refresh();
    expect(failing).toHaveBeenCalledTimes(1);
  });
});

describe('API /api/tasa-dolar', () => {
  it('devuelve las tasas en JSON', async () => {
    const { agent } = createTestApp();
    const res = await agent.get('/api/tasa-dolar');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      base: 'USD',
      quote: 'VES',
      oficial: { rate: 100, publishedAt: '2026-11-20T04:00:00.000Z' },
      paralelo: { rate: 120 },
      stale: false,
    });
  });

  it('convierte montos con la fuente indicada', async () => {
    const { agent } = createTestApp();
    const oficial = await agent.get('/api/tasa-dolar/convertir?monto=69');
    expect(oficial.body).toMatchObject({ amountUsd: 69, amountVes: 6900, source: 'oficial' });
    const paralelo = await agent.get('/api/tasa-dolar/convertir?monto=10&fuente=paralelo');
    expect(paralelo.body.amountVes).toBe(1200);
  });

  it('valida los parámetros', async () => {
    const { agent } = createTestApp();
    expect((await agent.get('/api/tasa-dolar/convertir?monto=-5')).status).toBe(400);
    expect((await agent.get('/api/tasa-dolar/convertir?monto=5&fuente=euro')).status).toBe(400);
  });

  it('responde 503 si no hay proveedor ni datos guardados', async () => {
    const { agent } = createTestApp({ provider: null });
    const res = await agent.get('/api/tasa-dolar');
    expect(res.status).toBe(503);
    expect(res.body.error).toBeTruthy();
  });

  it('responde JSON (no HTML) en rutas de API inexistentes', async () => {
    const { agent } = createTestApp();
    const res = await agent.get('/api/otra-cosa');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Recurso no encontrado' });
  });

  it('muestra la tasa oficial en el pie de las páginas', async () => {
    const { agent, exchangeRates } = createTestApp();
    await exchangeRates.refresh();
    const res = await agent.get('/');
    expect(res.text).toContain('Tasa oficial BCV');
    expect(res.text).toContain('Bs. 100,00');
  });
});
