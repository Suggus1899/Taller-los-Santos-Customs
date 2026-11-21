import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/prisma/client.js';

export type Db = PrismaClient;
export { Prisma };

export function createPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}

/** Violación de restricción única (P2002), p. ej. un turno de cita ya ocupado. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Convierte 'YYYY-MM-DD' en el Date que Prisma espera para columnas DATE. */
export function toDbDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

/** Convierte una columna DATE de vuelta a 'YYYY-MM-DD'. */
export function fromDbDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
