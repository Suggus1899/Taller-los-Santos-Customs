import { z } from 'zod';
import type { Db } from '../db/client.js';
import { images, type ImageKey } from '../content/images.js';
import {
  faqSchema,
  infoBlockSchema,
  servicePlanSchema,
  type Promotion,
  type Service,
} from '../content/services.js';
import type {
  Promotion as PromotionRow,
  Service as ServiceRow,
} from '../generated/prisma/client.js';
import { logger } from '../lib/logger.js';

/** Lee un documento JSONB validándolo; si está corrupto, lo omite y avisa en vez de romper la página. */
function parseJsonArray<T>(schema: z.ZodType<T>, value: unknown, where: string): T[] {
  const result = z.array(schema).safeParse(value);
  if (result.success) return result.data;
  logger.error(
    { where, issues: result.error.issues },
    'contenido JSON inválido en la base de datos',
  );
  return [];
}

export function toService(row: ServiceRow): Service {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    icon: row.icon,
    ...(row.imageKey && row.imageKey in images ? { image: row.imageKey as ImageKey } : {}),
    summary: row.summary,
    intro: row.intro,
    plans: parseJsonArray(servicePlanSchema, row.plans, `services.${row.slug}.plans`),
    info: parseJsonArray(infoBlockSchema, row.info, `services.${row.slug}.info`),
    faqs: parseJsonArray(faqSchema, row.faqs, `services.${row.slug}.faqs`),
    isActive: row.isActive,
    sortOrder: row.sortOrder,
  };
}

export function toPromotion(row: PromotionRow): Promotion {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    price: row.price,
    previousPrice: row.previousPrice,
    featured: row.featured,
    cta: { label: row.ctaLabel, href: row.ctaHref },
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
  };
}

const serviceOrder = [{ sortOrder: 'asc' as const }, { id: 'asc' as const }];

export function createContentRepository(db: Db) {
  return {
    async listServices(options: { includeInactive?: boolean } = {}): Promise<Service[]> {
      const rows = await db.service.findMany({
        where: options.includeInactive ? {} : { isActive: true },
        orderBy: serviceOrder,
      });
      return rows.map(toService);
    },

    async findService(slug: string): Promise<Service | null> {
      const row = await db.service.findUnique({ where: { slug } });
      return row ? toService(row) : null;
    },

    async updateService(slug: string, data: Omit<Service, 'id' | 'slug'>): Promise<boolean> {
      const result = await db.service.updateMany({
        where: { slug },
        data: {
          name: data.name,
          icon: data.icon,
          imageKey: data.image ?? null,
          summary: data.summary,
          intro: data.intro,
          plans: data.plans,
          info: data.info,
          faqs: data.faqs,
          isActive: data.isActive,
          sortOrder: data.sortOrder,
        },
      });
      return result.count > 0;
    },

    async createService(data: Omit<Service, 'id'>): Promise<void> {
      await db.service.create({
        data: {
          slug: data.slug,
          name: data.name,
          icon: data.icon,
          imageKey: data.image ?? null,
          summary: data.summary,
          intro: data.intro,
          plans: data.plans,
          info: data.info,
          faqs: data.faqs,
          isActive: data.isActive,
          sortOrder: data.sortOrder,
        },
      });
    },

    /** Promociones visibles ahora: activas y dentro de su ventana de vigencia. */
    async listVisiblePromotions(now = new Date()): Promise<Promotion[]> {
      const rows = await db.promotion.findMany({
        where: {
          isActive: true,
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
          ],
        },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      });
      return rows.map(toPromotion);
    },

    async listPromotions(): Promise<Promotion[]> {
      const rows = await db.promotion.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
      return rows.map(toPromotion);
    },

    async findPromotion(id: number): Promise<Promotion | null> {
      const row = await db.promotion.findUnique({ where: { id } });
      return row ? toPromotion(row) : null;
    },

    async savePromotion(id: number | null, data: Omit<Promotion, 'id'>): Promise<number> {
      const fields = {
        title: data.title,
        description: data.description,
        price: data.price,
        previousPrice: data.previousPrice,
        featured: data.featured,
        ctaLabel: data.cta.label,
        ctaHref: data.cta.href,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
      };
      if (id === null)
        return (await db.promotion.create({ data: fields, select: { id: true } })).id;
      await db.promotion.update({ where: { id }, data: fields });
      return id;
    },

    async deletePromotion(id: number): Promise<boolean> {
      return (await db.promotion.deleteMany({ where: { id } })).count > 0;
    },
  };
}

export type ContentRepository = ReturnType<typeof createContentRepository>;
