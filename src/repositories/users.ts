import type { Db } from '../db/client.js';
import type { UserRole } from '../generated/prisma/enums.js';

export interface AuthUser {
  id: number;
  username: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
}

export function createUsersRepository(db: Db) {
  return {
    findByUsername(username: string): Promise<AuthUser | null> {
      return db.user.findUnique({
        where: { username: username.toLowerCase() },
        select: { id: true, username: true, passwordHash: true, role: true, isActive: true },
      });
    },

    async recordLogin(id: number): Promise<void> {
      await db.user.update({ where: { id }, data: { lastLoginAt: new Date() } });
    },

    /** Crea el usuario o, si ya existe, actualiza contraseña y rol y lo reactiva. */
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
