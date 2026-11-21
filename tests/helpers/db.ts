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

/** Vacía todas las tablas de datos (no la de migraciones). */
export async function resetDatabase(db: Db = testDb()): Promise<void> {
  await db.$executeRawUnsafe(`
    TRUNCATE TABLE audit_logs, sessions, contact_messages, quote_requests, appointments,
      vehicles, customers, users, exchange_rates RESTART IDENTITY CASCADE`);
}
