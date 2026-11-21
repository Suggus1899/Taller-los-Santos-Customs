import { z } from 'zod';
import { images, type ImageKey } from './images.js';

/**
 * Tipos y validación del catálogo de servicios y promociones. Los datos viven en
 * la base de datos (tablas `services` y `promotions`) y se editan desde el panel;
 * estos esquemas validan lo que se guarda y lo que se lee de las columnas JSONB.
 */

export const serviceIcons = [
  'oil',
  'wrench',
  'gauge',
  'snowflake',
  'disc',
  'tire',
  'shield',
] as const;
export const imageKeys = Object.keys(images) as [ImageKey, ...ImageKey[]];

export const servicePlanSchema = z.object({
  name: z.string().trim().min(1, 'El plan necesita un nombre.').max(60),
  /** Precio en USD; `null` cuando depende del diagnóstico. */
  price: z.number().nonnegative().max(100_000).nullable(),
  /** Texto alternativo al precio ("Gratis", "Desde $60"…). */
  priceLabel: z.string().trim().max(30).optional(),
  unit: z.string().trim().max(40).optional(),
  features: z.array(z.string().trim().min(1).max(120)).max(12),
  highlighted: z.boolean().optional(),
});

export const infoBlockSchema = z.object({
  title: z.string().trim().min(1).max(100),
  body: z.string().trim().max(600).optional(),
  items: z.array(z.string().trim().min(1).max(160)).max(12).optional(),
});

export const faqSchema = z.object({
  question: z.string().trim().min(1).max(160),
  answer: z.string().trim().min(1).max(800),
});

export type ServicePlan = z.infer<typeof servicePlanSchema>;
export type InfoBlock = z.infer<typeof infoBlockSchema>;
export type Faq = z.infer<typeof faqSchema>;

export interface Service {
  id: number;
  slug: string;
  name: string;
  icon: string;
  image?: ImageKey;
  /** Resumen de una línea para tarjetas y meta description. */
  summary: string;
  intro: string;
  plans: ServicePlan[];
  info: InfoBlock[];
  faqs: Faq[];
  isActive: boolean;
  sortOrder: number;
}

export interface Promotion {
  id: number;
  title: string;
  description: string;
  price: string;
  previousPrice: string | null;
  featured: boolean;
  cta: { label: string; href: string };
  isActive: boolean;
  sortOrder: number;
  startsAt: Date | null;
  endsAt: Date | null;
}
