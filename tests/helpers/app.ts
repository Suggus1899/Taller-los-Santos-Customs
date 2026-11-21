import supertest from 'supertest';
import { createApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { createRepositories } from '../../src/repositories/index.js';
import {
  ExchangeRateService,
  RateSource,
  type RateProvider,
} from '../../src/services/exchange-rate.js';
import type { Notification } from '../../src/services/mailer.js';
import { hashPassword } from '../../src/services/password.js';
import { addDays, todayInShopTimezone } from '../../src/services/schedule.js';
import { testDatabaseUrl, testDb } from './db.js';

export const fakeRateProvider: RateProvider = async () => [
  { source: RateSource.OFICIAL, rate: 100, publishedAt: new Date('2026-11-20T04:00:00Z') },
  { source: RateSource.PARALELO, rate: 120, publishedAt: new Date('2026-11-20T21:00:00Z') },
];

export function createTestApp(
  options: { rateLimit?: boolean; provider?: RateProvider | null } = {},
) {
  const env = loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: testDatabaseUrl(),
    SESSION_SECRET: 'test-secret-test-secret-test-secret-123',
    SITE_URL: 'https://taller.test',
    EXCHANGE_RATE_API_URL: '',
  });
  const db = testDb();
  const sent: Notification[] = [];
  const exchangeRates = new ExchangeRateService(
    db,
    options.provider === undefined ? fakeRateProvider : options.provider,
    30 * 60_000,
  );
  const app = createApp({
    env,
    db,
    repos: createRepositories(db),
    notifier: { notify: async (n) => void sent.push(n) },
    exchangeRates,
    rateLimit: options.rateLimit ?? false,
  });
  return { app, db, sent, exchangeRates, agent: supertest.agent(app) };
}

/** Obtiene el token CSRF de una página (el agente conserva la cookie asociada). */
export async function csrfToken(agent: supertest.Agent, path = '/contacto'): Promise<string> {
  const res = await agent.get(path);
  const match = /name="_csrf" value="([^"]+)"/.exec(res.text);
  if (!match?.[1]) throw new Error(`No se encontró token CSRF en ${path}`);
  return match[1];
}

/** Próximo día laborable (lunes a viernes) a partir de mañana. */
export function nextBusinessDay(offset = 1): string {
  let date = addDays(todayInShopTimezone(), offset);
  while ([0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay())) date = addDays(date, 1);
  return date;
}

export function nextSaturday(): string {
  let date = addDays(todayInShopTimezone(), 1);
  while (new Date(`${date}T00:00:00Z`).getUTCDay() !== 6) date = addDays(date, 1);
  return date;
}

export async function createUser(username = 'admin', password = 'una-clave-segura-123') {
  return testDb().user.create({
    data: { username, passwordHash: await hashPassword(password), role: 'ADMIN' },
  });
}
