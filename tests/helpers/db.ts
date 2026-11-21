import fs from 'node:fs';
import path from 'node:path';
import { createPrismaClient, type Db } from '../../src/db/client.js';

const DEFAULT_TEST_URL = 'postgresql://taller:taller@localhost:5432/taller_test';

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_URL;
  // Salvaguarda: los tests vacían tablas, así que solo se permiten bases *_test.
  const name = new URL(url).pathname.slice(1);
  if (!name.endsWith('_test')) {
    throw new Error(
      `TEST_DATABASE_URL debe apuntar a una base cuyo nombre termine en _test (recibido: ${name}).`,
    );
  }
  return url;
}

let client: Db | undefined;

export function testDb(): Db {
  client ??= createPrismaClient(testDatabaseUrl());
  return client;
}

/**
 * Catálogo inicial: los INSERT de la migración que lo crea. Se toma de la fuente
 * canónica (no del estado actual de la BD) para que un test que edita contenido
 * nunca contamine las ejecuciones siguientes.
 */
function initialContentSql(): string[] {
  const dir = path.join('prisma', 'migrations');
  const migration = fs
    .readdirSync(dir)
    .find((name) => name.endsWith('_editable_content_jobs_rate_limits'));
  if (!migration) throw new Error('No se encontró la migración del catálogo inicial');
  return fs
    .readFileSync(path.join(dir, migration, 'migration.sql'), 'utf8')
    .split('\n')
    .filter((line) => /^INSERT INTO "(services|promotions)"/.test(line));
}

let contentInserts: string[] | undefined;

/** Vacía los datos operativos y restaura el catálogo a su estado inicial. */
export async function resetDatabase(db: Db = testDb()): Promise<void> {
  contentInserts ??= initialContentSql();
  await db.$executeRawUnsafe(`
    TRUNCATE TABLE audit_logs, sessions, contact_messages, quote_requests, appointments,
      vehicles, customers, users, exchange_rates, jobs, rate_limits, services, promotions
      RESTART IDENTITY CASCADE`);
  for (const sql of contentInserts) await db.$executeRawUnsafe(sql);
}
