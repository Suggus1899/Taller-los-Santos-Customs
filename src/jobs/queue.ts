import { z } from 'zod';
import type { Db, Prisma } from '../db/client.js';
import { logger } from '../lib/logger.js';
import { captureException } from '../lib/sentry.js';

/**
 * Cola de trabajos sobre PostgreSQL (patrón "transactional outbox").
 *
 * - `enqueue` recibe el cliente de la transacción en curso: el trabajo se guarda
 *   en la MISMA transacción que el dato de negocio. Si la transacción falla, no
 *   queda ningún trabajo huérfano; si se confirma, el trabajo está garantizado.
 * - El worker reclama lotes con `FOR UPDATE SKIP LOCKED`, de modo que varios
 *   workers pueden ejecutarse a la vez sin procesar dos veces el mismo trabajo.
 * - Reintentos con backoff exponencial; tras `maxAttempts` el trabajo queda como
 *   fallido para revisarlo desde el panel.
 */

/** Destinatario especial: se resuelve a MAIL_TO en el momento del envío. */
export const STAFF_RECIPIENT = 'staff';

export const jobSchemas = {
  'email.send': z.object({
    to: z.string().min(1),
    subject: z.string().min(1).max(200),
    text: z.string().min(1),
    replyTo: z.email().optional(),
  }),
  'appointments.send-reminders': z.object({ date: z.iso.date() }),
  'exchange-rates.refresh': z.object({}),
  'privacy.retention': z.object({}),
  'maintenance.prune': z.object({}),
} as const;

export type JobType = keyof typeof jobSchemas;
export type JobPayload<T extends JobType> = z.infer<(typeof jobSchemas)[T]>;

export interface EnqueueOptions {
  runAt?: Date;
  /** Si ya existe un trabajo con esta clave, no se encola otro. */
  dedupeKey?: string;
  maxAttempts?: number;
}

type Client = Db | Prisma.TransactionClient;

export async function enqueue<T extends JobType>(
  client: Client,
  type: T,
  payload: JobPayload<T>,
  options: EnqueueOptions = {},
): Promise<void> {
  const data = jobSchemas[type].parse(payload) as Prisma.InputJsonValue;
  await client.job.createMany({
    data: [
      {
        type,
        payload: data,
        ...(options.runAt ? { runAt: options.runAt } : {}),
        ...(options.dedupeKey ? { dedupeKey: options.dedupeKey } : {}),
        ...(options.maxAttempts ? { maxAttempts: options.maxAttempts } : {}),
      },
    ],
    skipDuplicates: true, // ON CONFLICT (dedupe_key) DO NOTHING
  });
}

// ───────────────────────────── Worker ─────────────────────────────

export type JobHandlers = {
  [T in JobType]: (payload: JobPayload<T>) => Promise<void>;
};

interface ClaimedJob {
  id: bigint;
  type: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
}

export interface WorkerOptions {
  batchSize?: number;
  pollIntervalMs?: number;
  /** Un trabajo bloqueado más tiempo que esto se considera abandonado (worker caído). */
  lockTimeoutMs?: number;
}

/** Espera antes del siguiente intento: 30 s, 1 min, 2 min… con tope de 1 hora. */
export function retryDelayMs(attempt: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 60 * 60_000);
}

export class JobWorker {
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<unknown> | null = null;
  private stopped = true;
  private readonly batchSize: number;
  private readonly pollIntervalMs: number;
  private readonly lockTimeoutMs: number;

  constructor(
    private readonly db: Db,
    private readonly handlers: JobHandlers,
    options: WorkerOptions = {},
  ) {
    this.batchSize = options.batchSize ?? 10;
    this.pollIntervalMs = options.pollIntervalMs ?? 2000;
    this.lockTimeoutMs = options.lockTimeoutMs ?? 5 * 60_000;
  }

  /** Reclama y procesa un lote. Devuelve cuántos trabajos procesó. */
  async runOnce(): Promise<number> {
    const lockSeconds = Math.ceil(this.lockTimeoutMs / 1000);
    const jobs = await this.db.$queryRaw<ClaimedJob[]>`
      UPDATE jobs SET locked_at = now(), attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM jobs
        WHERE completed_at IS NULL AND failed_at IS NULL AND run_at <= now()
          AND (locked_at IS NULL OR locked_at < now() - make_interval(secs => ${lockSeconds}))
        ORDER BY run_at, id
        LIMIT ${this.batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, type, payload, attempts, max_attempts AS "maxAttempts"`;

    for (const job of jobs) await this.process(job);
    return jobs.length;
  }

  private async process(job: ClaimedJob): Promise<void> {
    const log = logger.child({
      jobId: job.id.toString(),
      jobType: job.type,
      attempt: job.attempts,
    });
    try {
      if (!(job.type in jobSchemas))
        throw new PermanentJobError(`Tipo de trabajo desconocido: ${job.type}`);
      const type = job.type as JobType;
      const parsed = jobSchemas[type].safeParse(job.payload);
      if (!parsed.success) throw new PermanentJobError(`Payload inválido: ${parsed.error.message}`);
      const handler = this.handlers[type] as (payload: unknown) => Promise<void>;
      await handler(parsed.data);
      await this.db.job.update({
        where: { id: job.id },
        data: { completedAt: new Date(), lockedAt: null, lastError: null },
      });
      log.debug('trabajo completado');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const exhausted = error instanceof PermanentJobError || job.attempts >= job.maxAttempts;
      await this.db.job.update({
        where: { id: job.id },
        data: exhausted
          ? { failedAt: new Date(), lockedAt: null, lastError: message }
          : {
              runAt: new Date(Date.now() + retryDelayMs(job.attempts)),
              lockedAt: null,
              lastError: message,
            },
      });
      if (exhausted) {
        log.error({ err: error }, 'trabajo fallido definitivamente');
        captureException(error, { jobId: job.id.toString(), jobType: job.type });
      } else {
        log.warn({ err: error }, 'trabajo fallido, se reintentará');
      }
    }
  }

  start(): void {
    this.stopped = false;
    const tick = async () => {
      if (this.stopped) return;
      this.running = this.drain().catch((error: unknown) =>
        logger.error({ err: error }, 'error en el worker'),
      );
      await this.running;
      if (!this.stopped) this.timer = setTimeout(() => void tick(), this.pollIntervalMs);
    };
    void tick();
  }

  /** Procesa lotes mientras haya trabajo pendiente. */
  private async drain(): Promise<void> {
    while (!this.stopped && (await this.runOnce()) === this.batchSize) {
      // lote completo: probablemente quedan más
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running;
  }
}

/** Error que no tiene sentido reintentar (datos inválidos, tipo desconocido). */
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentJobError';
  }
}
