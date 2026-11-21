import { z } from 'zod';
import {
  faqSchema,
  imageKeys,
  infoBlockSchema,
  serviceIcons,
  servicePlanSchema,
  type Promotion,
  type Service,
} from '../content/services.js';
import { images, type ImageKey } from '../content/images.js';
import { userRoles } from '../repositories/users.js';

/**
 * Conversión y validación de los formularios del panel. Los formularios envían
 * texto plano (qs: plans[0][name]=…); aquí se normaliza a la forma del dominio
 * y se valida con los mismos esquemas que protegen los datos JSONB.
 */

type Body = Record<string, unknown>;

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const optional = (value: unknown): string | undefined => str(value) || undefined;
const lines = (value: unknown): string[] =>
  str(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
const checked = (value: unknown): boolean => value === 'on' || value === 'true' || value === '1';

/** qs entrega arrays u objetos indexados según el número de filas: se aceptan ambos. */
const rows = (value: unknown): Body[] =>
  value && typeof value === 'object'
    ? (Object.values(value) as unknown[]).filter((v): v is Body => !!v && typeof v === 'object')
    : [];

/** Mensajes legibles: "Plan 2 · precio: …" en lugar de "plans.1.price". */
function describe(issues: z.core.$ZodIssue[]): string[] {
  const labels: Record<string, string> = { plans: 'Plan', info: 'Bloque', faqs: 'Pregunta' };
  return issues.map((issue) => {
    const [first, index, ...rest] = issue.path;
    const where =
      typeof first === 'string' && labels[first] !== undefined && typeof index === 'number'
        ? `${labels[first]} ${index + 1}${rest.length ? ` · ${rest.join('.')}` : ''}`
        : issue.path.join('.') || 'Formulario';
    return `${where}: ${issue.message}`;
  });
}

export type FormResult<T> = { ok: true; data: T } | { ok: false; errors: string[] };

// ───────────────────────────── Servicios ─────────────────────────────

const serviceFormSchema = z.object({
  slug: z
    .string()
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      'Usa solo minúsculas, números y guiones (p. ej. "cambio-de-aceite").',
    )
    .max(60),
  name: z.string().min(2, 'Escribe el nombre.').max(80),
  icon: z.enum(serviceIcons, { error: 'Elige un icono.' }),
  image: z.enum(imageKeys).optional(),
  summary: z.string().min(10, 'El resumen es demasiado corto.').max(200),
  intro: z.string().min(10, 'La introducción es demasiado corta.').max(1000),
  plans: z.array(servicePlanSchema).max(6),
  info: z.array(infoBlockSchema).max(8),
  faqs: z.array(faqSchema).max(12),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(10_000),
});

type ServiceDraft = Omit<Service, 'id'>;

/** Igual que FormResult, pero con el borrador normalizado para volver a mostrar el formulario. */
export type ServiceFormResult =
  { ok: true; data: ServiceDraft } | { ok: false; errors: string[]; draft: ServiceDraft };

export function parseServiceForm(body: Body, slug: string): ServiceFormResult {
  const price = (value: unknown) => {
    const text = str(value).replace(',', '.');
    return text === '' ? null : Number(text);
  };
  const candidate = {
    slug,
    name: str(body.name),
    icon: str(body.icon),
    image: optional(body.image),
    summary: str(body.summary),
    intro: str(body.intro),
    // Las filas con el campo principal vacío se descartan (filas en blanco para añadir).
    plans: rows(body.plans)
      .filter((p) => str(p.name))
      .map((p) => ({
        name: str(p.name),
        price: price(p.price),
        priceLabel: optional(p.priceLabel),
        unit: optional(p.unit),
        features: lines(p.features),
        highlighted: checked(p.highlighted),
      })),
    info: rows(body.info)
      .filter((b) => str(b.title))
      .map((b) => ({
        title: str(b.title),
        body: optional(b.body),
        items: lines(b.items).length ? lines(b.items) : undefined,
      })),
    faqs: rows(body.faqs)
      .filter((f) => str(f.question))
      .map((f) => ({ question: str(f.question), answer: str(f.answer) })),
    isActive: checked(body.isActive),
    sortOrder: Number(str(body.sortOrder) || 0),
  };
  const result = serviceFormSchema.safeParse(candidate);
  if (!result.success) {
    const { image, ...rest } = candidate;
    const draft = { ...rest, ...(image && image in images ? { image: image as ImageKey } : {}) };
    return { ok: false, errors: describe(result.error.issues), draft };
  }
  const { image, ...rest } = result.data;
  return { ok: true, data: { ...rest, ...(image ? { image } : {}) } };
}

// ──────────────────────────── Promociones ────────────────────────────

const promotionFormSchema = z
  .object({
    title: z.string().min(3, 'Escribe el título.').max(80),
    description: z.string().min(5, 'Escribe la descripción.').max(300),
    price: z.string().min(1, 'Escribe el precio.').max(20),
    previousPrice: z.string().max(20).nullable(),
    featured: z.boolean(),
    cta: z.object({
      label: z.string().min(2, 'Escribe el texto del botón.').max(40),
      // Solo enlaces internos: el panel no debe poder enlazar a sitios externos.
      href: z
        .string()
        .regex(/^\/(?!\/)[\w\-/?=&%.]*$/, 'El enlace debe ser una ruta del sitio, p. ej. /cita.')
        .max(200),
    }),
    isActive: z.boolean(),
    sortOrder: z.number().int().min(0).max(10_000),
    startsAt: z.date().nullable(),
    endsAt: z.date().nullable(),
  })
  .refine((p) => !p.startsAt || !p.endsAt || p.startsAt < p.endsAt, {
    message: 'La fecha de fin debe ser posterior a la de inicio.',
    path: ['endsAt'],
  });

export function parsePromotionForm(body: Body): FormResult<Omit<Promotion, 'id'>> {
  // Las fechas se interpretan como inicio del día en hora de Caracas (UTC-4).
  const date = (value: unknown) =>
    /^\d{4}-\d{2}-\d{2}$/.test(str(value)) ? new Date(`${str(value)}T00:00:00-04:00`) : null;
  const result = promotionFormSchema.safeParse({
    title: str(body.title),
    description: str(body.description),
    price: str(body.price),
    previousPrice: optional(body.previousPrice) ?? null,
    featured: checked(body.featured),
    cta: { label: str(body.ctaLabel), href: str(body.ctaHref) },
    isActive: checked(body.isActive),
    sortOrder: Number(str(body.sortOrder) || 0),
    startsAt: date(body.startsAt),
    endsAt: date(body.endsAt),
  });
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, errors: describe(result.error.issues) };
}

// ───────────────────────────── Usuarios ─────────────────────────────

export const MIN_PASSWORD_LENGTH = 12;

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`)
  .max(256);

export const newUserSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,64}$/, 'Usuario: 3-64 caracteres (letras, números, . _ -).'),
  displayName: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((v) => v || undefined),
  role: z.enum(userRoles, { error: 'Elige un rol.' }),
  password: passwordSchema,
});

export const userUpdateSchema = z.object({
  role: z.enum(userRoles),
  isActive: z.enum(['true', 'false']).transform((v) => v === 'true'),
});
