import { z } from 'zod';

const optionalString = z
  .string()
  .trim()
  .transform((value) => (value === '' ? undefined : value))
  .optional();

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    /** URL pública del sitio, usada en el sitemap y en las etiquetas canónicas. */
    SITE_URL: z.url().default('http://localhost:3000'),
    DATABASE_URL: z
      .string({ error: 'Define DATABASE_URL (postgresql://usuario:clave@host:5432/base)' })
      .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL debe ser una URL de PostgreSQL'),
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET debe tener al menos 32 caracteres'),
    /** Número de proxies de confianza delante de la app (0 = ninguno). Necesario para leer la IP real. */
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    /** ID de medición de Google Analytics 4 (opcional). */
    GA_MEASUREMENT_ID: z
      .string()
      .regex(/^G-[A-Z0-9]+$/, 'Formato esperado: G-XXXXXXX')
      .optional()
      .or(z.literal('').transform(() => undefined)),
    /** Proveedor de la tasa USD→VES (formato DolarApi). Vacío desactiva la consulta externa. */
    EXCHANGE_RATE_API_URL: z
      .union([z.url(), z.literal('')])
      .default('https://ve.dolarapi.com/v1/dolares'),
    /** Minutos que se considera vigente la tasa en caché antes de refrescarla. */
    EXCHANGE_RATE_TTL_MINUTES: z.coerce.number().int().min(1).max(1440).default(30),
    SMTP_HOST: optionalString,
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_USER: optionalString,
    SMTP_PASS: optionalString,
    MAIL_FROM: optionalString,
    /** Destinatarios de las notificaciones, separados por comas. */
    MAIL_TO: optionalString,
  })
  .superRefine((env, ctx) => {
    const smtp = [env.SMTP_HOST, env.SMTP_USER, env.SMTP_PASS, env.MAIL_TO];
    if (smtp.some(Boolean) && !smtp.every(Boolean)) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Para enviar correos define SMTP_HOST, SMTP_USER, SMTP_PASS y MAIL_TO (o ninguno).',
        path: ['SMTP_HOST'],
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(env)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuración de entorno inválida:\n${details}`);
  }
  return result.data;
}
