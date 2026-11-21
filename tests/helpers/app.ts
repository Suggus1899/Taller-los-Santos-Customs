import supertest from 'supertest';
import { createApp } from '../../src/app.js';
import { loadEnv, type Env } from '../../src/config/env.js';
import { UserRole } from '../../src/generated/prisma/enums.js';
import { createJobHandlers } from '../../src/jobs/handlers.js';
import { JobWorker } from '../../src/jobs/queue.js';
import { createRepositories } from '../../src/repositories/index.js';
import { ContentCache } from '../../src/services/content-cache.js';
import {
  ExchangeRateService,
  RateSource,
  type RateProvider,
} from '../../src/services/exchange-rate.js';
import type { Email, Mailer } from '../../src/services/mailer.js';
import { hashPassword } from '../../src/services/password.js';
import { addDays, todayInShopTimezone } from '../../src/services/schedule.js';
import { createUseCases } from '../../src/use-cases/index.js';
import { testDatabaseUrl, testDb } from './db.js';

export const fakeRateProvider: RateProvider = async () => [
  { source: RateSource.OFICIAL, rate: 100, publishedAt: new Date('2026-11-20T04:00:00Z') },
  { source: RateSource.PARALELO, rate: 120, publishedAt: new Date('2026-11-20T21:00:00Z') },
];

export function testEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: testDatabaseUrl(),
    SESSION_SECRET: 'test-secret-test-secret-test-secret-123',
    SITE_URL: 'https://taller.test',
    EXCHANGE_RATE_API_URL: '',
    ...overrides,
  });
}

/** Mailer falso que guarda los correos "enviados". */
export function fakeMailer(staffRecipients: string | null = 'equipo@taller.test') {
  const sent: Email[] = [];
  const mailer: Mailer = {
    staffRecipients,
    async send(email) {
      sent.push(email);
      return 'sent';
    },
  };
  return { mailer, sent };
}

export function createTestApp(
  options: {
    rateLimit?: boolean;
    provider?: RateProvider | null;
    env?: Record<string, string>;
  } = {},
) {
  const env = testEnv(options.env);
  const db = testDb();
  const repos = createRepositories(db);
  const useCases = createUseCases({ db, repos });
  const exchangeRates = new ExchangeRateService(
    db,
    options.provider === undefined ? fakeRateProvider : options.provider,
    30 * 60_000,
  );
  const content = new ContentCache(repos.content, 0); // sin caché: cada test ve la BD
  const app = createApp({
    env,
    db,
    repos,
    useCases,
    content,
    exchangeRates,
    rateLimit: options.rateLimit ?? false,
  });
  const { mailer, sent } = fakeMailer();
  const worker = new JobWorker(
    db,
    createJobHandlers({ db, mailer, useCases, exchangeRates, retentionMonths: 12 }),
    { batchSize: 50 },
  );
  return {
    app,
    db,
    repos,
    useCases,
    exchangeRates,
    sent,
    /** Procesa todos los trabajos pendientes con el worker real y el mailer falso. */
    runJobs: async () => {
      let total = 0;
      for (let n = await worker.runOnce(); n > 0; n = await worker.runOnce()) total += n;
      return total;
    },
    agent: supertest.agent(app),
  };
}

export type TestAgent = ReturnType<typeof createTestApp>['agent'];

/** Obtiene el token CSRF de una página (el agente conserva la cookie asociada). */
export async function csrfToken(agent: TestAgent, path = '/contacto'): Promise<string> {
  const res = await agent.get(path);
  const match = /name="_csrf" value="([^"]+)"/.exec(res.text);
  if (!match?.[1]) throw new Error(`No se encontró token CSRF en ${path} (HTTP ${res.status})`);
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

export const TEST_PASSWORD = 'una-clave-segura-123';

export async function createUser(
  username = 'admin',
  role: UserRole = UserRole.ADMIN,
  password = TEST_PASSWORD,
) {
  return testDb().user.create({
    data: { username, passwordHash: await hashPassword(password), role },
  });
}

export async function login(agent: TestAgent, username = 'admin', password = TEST_PASSWORD) {
  const _csrf = await csrfToken(agent, '/admin/login');
  return agent
    .post('/admin/login')
    .type('form')
    .send({ _csrf, username, password, next: '/admin' });
}
