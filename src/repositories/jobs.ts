import type { Db } from '../db/client.js';

export interface JobStats {
  pending: number;
  failed: number;
  completedLast24h: number;
  oldestPendingAt: Date | null;
}

export interface FailedJob {
  id: string;
  type: string;
  attempts: number;
  lastError: string | null;
  failedAt: Date | null;
  createdAt: Date;
}

/** Consultas de la cola para la página de sistema del panel. */
export function createJobsRepository(db: Db) {
  return {
    async stats(now = new Date()): Promise<JobStats> {
      const pendingWhere = { completedAt: null, failedAt: null };
      const [pending, failed, completedLast24h, oldest] = await Promise.all([
        db.job.count({ where: pendingWhere }),
        db.job.count({ where: { failedAt: { not: null } } }),
        db.job.count({ where: { completedAt: { gte: new Date(now.getTime() - 86_400_000) } } }),
        db.job.findFirst({
          where: pendingWhere,
          orderBy: { runAt: 'asc' },
          select: { runAt: true },
        }),
      ]);
      return { pending, failed, completedLast24h, oldestPendingAt: oldest?.runAt ?? null };
    },

    async failed(limit = 50): Promise<FailedJob[]> {
      const rows = await db.job.findMany({
        where: { failedAt: { not: null } },
        orderBy: { failedAt: 'desc' },
        take: limit,
        select: {
          id: true,
          type: true,
          attempts: true,
          lastError: true,
          failedAt: true,
          createdAt: true,
        },
      });
      return rows.map((row) => ({ ...row, id: row.id.toString() }));
    },

    /** Vuelve a poner en cola un trabajo fallido. */
    async retry(id: bigint): Promise<boolean> {
      const result = await db.job.updateMany({
        where: { id, failedAt: { not: null } },
        data: { failedAt: null, attempts: 0, runAt: new Date(), lockedAt: null },
      });
      return result.count > 0;
    },
  };
}

export type JobsRepository = ReturnType<typeof createJobsRepository>;
