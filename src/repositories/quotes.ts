import type { Db, Prisma } from '../db/client.js';
import { QuoteStatus, type VehicleType } from '../generated/prisma/enums.js';
import { writeAudit } from './audit.js';

export { QuoteStatus };
export const quoteStatuses = Object.values(QuoteStatus);

export interface QuoteSummary {
  vehicleType: VehicleType;
  serviceCode: string;
  extraCode: string;
  estimateCents: number;
  currency: string;
}

export interface QuoteRow extends QuoteSummary {
  id: number;
  status: QuoteStatus;
  notes: string | null;
  createdAt: Date;
  customer: { name: string; email: string; phone: string | null };
}

export function createQuotesRepository(db: Db) {
  return {
    async insert(
      tx: Prisma.TransactionClient,
      input: QuoteSummary & { customerId: number; notes: string | null },
    ): Promise<string> {
      const quote = await tx.quoteRequest.create({
        data: {
          customerId: input.customerId,
          vehicleType: input.vehicleType,
          serviceCode: input.serviceCode,
          extraCode: input.extraCode,
          estimateCents: input.estimateCents,
          currency: input.currency,
          notes: input.notes,
        },
        select: { publicId: true },
      });
      return quote.publicId;
    },

    findByPublicId(publicId: string): Promise<QuoteSummary | null> {
      return db.quoteRequest.findUnique({
        where: { publicId },
        select: {
          vehicleType: true,
          serviceCode: true,
          extraCode: true,
          estimateCents: true,
          currency: true,
        },
      });
    },

    list(status?: QuoteStatus): Promise<QuoteRow[]> {
      return db.quoteRequest.findMany({
        where: status ? { status } : {},
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          id: true,
          vehicleType: true,
          serviceCode: true,
          extraCode: true,
          estimateCents: true,
          currency: true,
          status: true,
          notes: true,
          createdAt: true,
          customer: { select: { name: true, email: true, phone: true } },
        },
      });
    },

    async updateStatus(id: number, status: QuoteStatus, userId: number): Promise<boolean> {
      return db.$transaction(async (tx) => {
        const current = await tx.quoteRequest.findUnique({
          where: { id },
          select: { status: true },
        });
        if (!current) return false;
        if (current.status === status) return true;
        await tx.quoteRequest.update({ where: { id }, data: { status } });
        await writeAudit(tx, {
          action: 'STATUS_CHANGED',
          entityType: 'QUOTE_REQUEST',
          entityId: id,
          userId,
          metadata: { from: current.status, to: status },
        });
        return true;
      });
    },

    countByStatus(status: QuoteStatus): Promise<number> {
      return db.quoteRequest.count({ where: { status } });
    },
  };
}

export type QuotesRepository = ReturnType<typeof createQuotesRepository>;
