import type { Db, Prisma } from '../db/client.js';
import type { AuditAction, AuditEntity } from '../generated/prisma/enums.js';

export interface AuditEntry {
  action: AuditAction;
  entityType: AuditEntity;
  entityId?: number | undefined;
  userId?: number | undefined;
  metadata?: Prisma.InputJsonValue | undefined;
}

export async function writeAudit(
  client: Db | Prisma.TransactionClient,
  entry: AuditEntry,
): Promise<void> {
  await client.auditLog.create({
    data: {
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      userId: entry.userId ?? null,
      ...(entry.metadata === undefined ? {} : { metadata: entry.metadata }),
    },
  });
}
