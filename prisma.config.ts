import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma 7 no carga .env automáticamente.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // `prisma generate` no necesita conexión: así `npm install` funciona sin .env.
    // Los comandos que sí conectan (migrate, studio) fallarán con un error claro si falta.
    url: process.env.DATABASE_URL ?? '',
  },
});
