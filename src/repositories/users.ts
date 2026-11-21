import type { Db } from '../db/client.js';
import { UserRole } from '../generated/prisma/enums.js';

export { UserRole };
export const userRoles = Object.values(UserRole);

export interface AuthUser {
  id: number;
  username: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
}

export interface UserRow {
  id: number;
  username: string;
  displayName: string | null;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

const rowSelect = {
  id: true,
  username: true,
  displayName: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

/** Operación que dejaría el panel sin ningún administrador activo. */
export class LastAdminError extends Error {
  constructor() {
    super('Debe quedar al menos un administrador activo.');
    this.name = 'LastAdminError';
  }
}

export function createUsersRepository(db: Db) {
  return {
    findByUsername(username: string): Promise<AuthUser | null> {
      return db.user.findUnique({
        where: { username: username.toLowerCase() },
        select: { id: true, username: true, passwordHash: true, role: true, isActive: true },
      });
    },

    findById(id: number): Promise<AuthUser | null> {
      return db.user.findUnique({
        where: { id },
        select: { id: true, username: true, passwordHash: true, role: true, isActive: true },
      });
    },

    list(): Promise<UserRow[]> {
      return db.user.findMany({
        orderBy: [{ isActive: 'desc' }, { username: 'asc' }],
        select: rowSelect,
      });
    },

    async recordLogin(id: number): Promise<void> {
      await db.user.update({ where: { id }, data: { lastLoginAt: new Date() } });
    },

    async create(input: {
      username: string;
      passwordHash: string;
      role: UserRole;
      displayName?: string | undefined;
    }) {
      return db.user.create({
        data: {
          username: input.username.toLowerCase(),
          passwordHash: input.passwordHash,
          role: input.role,
          displayName: input.displayName ?? null,
        },
        select: { id: true },
      });
    },

    /**
     * Cambia rol o estado. Comprueba, dentro de la misma transacción, que siga
     * habiendo al menos un administrador activo.
     */
    async update(id: number, data: { role?: UserRole; isActive?: boolean }): Promise<boolean> {
      return db.$transaction(async (tx) => {
        const updated = await tx.user.updateMany({ where: { id }, data });
        if (updated.count === 0) return false;
        const admins = await tx.user.count({ where: { role: UserRole.ADMIN, isActive: true } });
        if (admins === 0) throw new LastAdminError();
        return true;
      });
    },

    async setPassword(id: number, passwordHash: string): Promise<boolean> {
      return (await db.user.updateMany({ where: { id }, data: { passwordHash } })).count > 0;
    },

    /** Crea el usuario o, si ya existe, actualiza contraseña y rol y lo reactiva (CLI). */
    async upsert(input: {
      username: string;
      passwordHash: string;
      role: UserRole;
    }): Promise<'created' | 'updated'> {
      const username = input.username.toLowerCase();
      const existing = await db.user.findUnique({ where: { username }, select: { id: true } });
      await db.user.upsert({
        where: { username },
        create: { username, passwordHash: input.passwordHash, role: input.role },
        update: { passwordHash: input.passwordHash, role: input.role, isActive: true },
      });
      return existing ? 'updated' : 'created';
    },
  };
}

export type UsersRepository = ReturnType<typeof createUsersRepository>;
