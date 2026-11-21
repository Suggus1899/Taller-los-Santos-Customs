import type { Db, Prisma } from '../db/client.js';
import { MessageStatus } from '../generated/prisma/enums.js';
import { writeAudit } from './audit.js';

export { MessageStatus };
export const messageStatuses = Object.values(MessageStatus);

export interface MessageRow {
  id: number;
  message: string;
  status: MessageStatus;
  createdAt: Date;
  customer: { name: string; email: string; phone: string | null };
}

export function createMessagesRepository(db: Db) {
  return {
    async insert(
      tx: Prisma.TransactionClient,
      input: { customerId: number; message: string },
    ): Promise<void> {
      await tx.contactMessage.create({ data: input });
    },

    list(status?: MessageStatus): Promise<MessageRow[]> {
      return db.contactMessage.findMany({
        where: status ? { status } : {},
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          id: true,
          message: true,
          status: true,
          createdAt: true,
          customer: { select: { name: true, email: true, phone: true } },
        },
      });
    },

    async updateStatus(id: number, status: MessageStatus, userId: number): Promise<boolean> {
      return db.$transaction(async (tx) => {
        const current = await tx.contactMessage.findUnique({
          where: { id },
          select: { status: true },
        });
        if (!current) return false;
        if (current.status === status) return true;
        await tx.contactMessage.update({ where: { id }, data: { status } });
        await writeAudit(tx, {
          action: 'STATUS_CHANGED',
          entityType: 'CONTACT_MESSAGE',
          entityId: id,
          userId,
          metadata: { from: current.status, to: status },
        });
        return true;
      });
    },

    countByStatus(status: MessageStatus): Promise<number> {
      return db.contactMessage.count({ where: { status } });
    },
  };
}

export type MessagesRepository = ReturnType<typeof createMessagesRepository>;
