import { site } from '../config/site.js';
import type { Db } from '../db/client.js';
import { logger } from '../lib/logger.js';
import { addDays } from '../services/schedule.js';
import { enqueue } from './queue.js';

/** Fecha y hora local del taller (America/Caracas). */
export function shopClock(now: Date): { date: string; hour: number; minute: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: site.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

/**
 * Encola las tareas periódicas que ya tocan. Cada periodo tiene una `dedupeKey`
 * única, así que aunque haya varios workers (o se llame cada minuto) cada tarea
 * se encola una sola vez por periodo.
 */
export async function enqueueDueTasks(db: Db, options: { reminderHour: number; now?: Date }) {
  const { date, hour, minute } = shopClock(options.now ?? new Date());
  const half = minute < 30 ? '00' : '30';

  await enqueue(
    db,
    'exchange-rates.refresh',
    {},
    { dedupeKey: `rates:${date}T${String(hour).padStart(2, '0')}:${half}`, maxAttempts: 3 },
  );
  await enqueue(db, 'maintenance.prune', {}, { dedupeKey: `prune:${date}T${hour}` });
  if (hour >= 3) await enqueue(db, 'privacy.retention', {}, { dedupeKey: `retention:${date}` });
  if (hour >= options.reminderHour) {
    // Recordatorios de las citas de mañana, la tarde anterior.
    const tomorrow = addDays(date, 1);
    await enqueue(
      db,
      'appointments.send-reminders',
      { date: tomorrow },
      { dedupeKey: `reminders:${tomorrow}` },
    );
  }
}

export class Scheduler {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: Db,
    private readonly options: { reminderHour: number; intervalMs?: number },
  ) {}

  start(): void {
    const tick = () =>
      enqueueDueTasks(this.db, this.options).catch((error: unknown) =>
        logger.error({ err: error }, 'error al programar tareas'),
      );
    void tick();
    this.timer = setInterval(() => void tick(), this.options.intervalMs ?? 60_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
