import { execFileSync } from 'node:child_process';
import { testDatabaseUrl } from './helpers/db.js';

/** Aplica las migraciones a la base de datos de test antes de toda la suite. */
export default function setup(): void {
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
    stdio: 'pipe',
  });
}
