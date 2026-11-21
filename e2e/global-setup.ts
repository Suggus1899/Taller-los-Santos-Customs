import { execFileSync } from 'node:child_process';
import { createPrismaClient } from '../src/db/client.js';
import { hashPassword } from '../src/services/password.js';
import { E2E_DATABASE_URL } from '../playwright.config.js';

export const E2E_ADMIN = { username: 'e2e-admin', password: 'e2e-clave-segura-123' };

/** Aplica migraciones, vacía los datos operativos y crea un administrador de prueba. */
export default async function globalSetup(): Promise<void> {
  const name = new URL(E2E_DATABASE_URL).pathname.slice(1);
  if (!/_(e2e|test)$/.test(name)) {
    throw new Error(`E2E_DATABASE_URL debe apuntar a una base *_e2e o *_test (recibido: ${name}).`);
  }
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    stdio: 'pipe',
  });

  const db = createPrismaClient(E2E_DATABASE_URL);
  try {
    await db.$executeRawUnsafe(`
      TRUNCATE TABLE audit_logs, sessions, contact_messages, quote_requests, appointments,
        vehicles, customers, users, jobs, rate_limits RESTART IDENTITY CASCADE`);
    await db.user.create({
      data: {
        username: E2E_ADMIN.username,
        passwordHash: await hashPassword(E2E_ADMIN.password),
        role: 'ADMIN',
      },
    });
  } finally {
    await db.$disconnect();
  }
}
