import { z } from 'zod';
import { quoteExtraIds, quoteServiceIds, vehicleTypeIds } from '../content/quote.js';
import { timeSlots } from '../services/schedule.js';

/** Elimina espacios y convierte '' en undefined para los campos opcionales. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .optional()
    .transform((value) => (value ? value : undefined));

const name = z
  .string({ error: 'Escribe tu nombre.' })
  .trim()
  .min(2, 'Escribe tu nombre.')
  .max(80, 'Máximo 80 caracteres.');

const email = z
  .string({ error: 'Escribe tu correo.' })
  .trim()
  .toLowerCase()
  .max(254, 'Correo demasiado largo.')
  .pipe(z.email('Escribe un correo válido, por ejemplo nombre@correo.com.'));

const phonePattern = /^\+?[\d\s()-]{7,20}$/;
const phone = z
  .string({ error: 'Escribe tu teléfono.' })
  .trim()
  .regex(phonePattern, 'Escribe un teléfono válido, por ejemplo +58 412 555 1234.');
const optionalPhone = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined))
  .pipe(z.string().regex(phonePattern, 'Escribe un teléfono válido.').optional());

/**
 * Campo trampa ("honeypot"): oculto para personas, los bots suelen rellenarlo.
 * Es una defensa ligera contra spam que no requiere servicios externos.
 */
const honeypot = z.string().max(0).optional();

export const contactSchema = z.object({
  name,
  email,
  phone: optionalPhone,
  message: z
    .string({ error: 'Escribe tu mensaje.' })
    .trim()
    .min(10, 'Cuéntanos un poco más (mínimo 10 caracteres).')
    .max(2000, 'Máximo 2000 caracteres.'),
  website: honeypot,
});

export const appointmentSchema = z.object({
  name,
  email,
  phone,
  vehicle: optionalText(80),
  // La existencia del servicio se comprueba contra el catálogo (BD) en la ruta.
  service: z
    .string({ error: 'Elige un servicio.' })
    .regex(/^[a-z0-9-]{1,60}$/, 'Elige un servicio.'),
  date: z.string({ error: 'Elige una fecha.' }).trim().min(1, 'Elige una fecha.'),
  time: z.enum(timeSlots, { error: 'Elige un horario.' }),
  notes: optionalText(1000),
  website: honeypot,
});

export const quoteSchema = z.object({
  vehicleType: z.enum(vehicleTypeIds, { error: 'Elige el tipo de vehículo.' }),
  service: z.enum(quoteServiceIds, { error: 'Elige un servicio.' }),
  extra: z.enum(quoteExtraIds, { error: 'Elige una opción.' }),
  name,
  email,
  phone: optionalPhone,
  notes: optionalText(1000),
  website: honeypot,
});

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});

export type FieldErrors = Record<string, string>;

/** Convierte los errores de Zod en `{ campo: primer mensaje }` para mostrarlos en el formulario. */
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    errors[key] ??= issue.message;
  }
  return errors;
}

/** Valores del formulario como texto, para volver a rellenarlo tras un error. */
export function formValues(body: unknown): Record<string, string> {
  if (!body || typeof body !== 'object') return {};
  return Object.fromEntries(
    Object.entries(body as Record<string, unknown>)
      .filter(([key, value]) => typeof value === 'string' && key !== '_csrf' && key !== 'password')
      .map(([key, value]) => [key, value as string]),
  );
}
