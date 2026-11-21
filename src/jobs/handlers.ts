import type { Db } from '../db/client.js';
import { logger } from '../lib/logger.js';
import type { ExchangeRateService } from '../services/exchange-rate.js';
import type { Mailer } from '../services/mailer.js';
import type { UseCases } from '../use-cases/index.js';
import { PermanentJobError, STAFF_RECIPIENT, type JobHandlers } from './queue.js';

export interface HandlerDeps {
  db: Db;
  mailer: Mailer;
  useCases: UseCases;
  exchangeRates: ExchangeRateService;
  retentionMonths: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Borra datos personales que ya no se necesitan (minimización de datos):
 * mensajes, cotizaciones y citas cerradas más antiguos que el periodo de
 * retención, los clientes que quedan sin registros y la auditoría muy antigua.
 */
export async function applyRetention(db: Db, months: number, now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);

  return db.$transaction(async (tx) => {
    const messages = await tx.contactMessage.deleteMany({ where: { createdAt: { lt: cutoff } } });
    const quotes = await tx.quoteRequest.deleteMany({ where: { createdAt: { lt: cutoff } } });
    const appointments = await tx.appointment.deleteMany({
      where: {
        scheduledDate: { lt: cutoff },
        status: { in: ['COMPLETED', 'CANCELLED', 'NO_SHOW'] },
      },
    });
    // Clientes sin citas, cotizaciones ni mensajes (sus vehículos se borran en cascada).
    const customers = await tx.customer.deleteMany({
      where: {
        createdAt: { lt: cutoff },
        appointments: { none: {} },
        quoteRequests: { none: {} },
        contactMessages: { none: {} },
      },
    });
    const auditCutoff = new Date(now);
    auditCutoff.setUTCMonth(auditCutoff.getUTCMonth() - months * 2);
    const audit = await tx.auditLog.deleteMany({ where: { createdAt: { lt: auditCutoff } } });

    return {
      messages: messages.count,
      quotes: quotes.count,
      appointments: appointments.count,
      customers: customers.count,
      audit: audit.count,
    };
  });
}

/** Limpieza técnica: contadores de rate limit, sesiones y trabajos antiguos. */
export async function prune(db: Db, now = new Date()) {
  const [rateLimits, sessions, jobs] = await Promise.all([
    db.rateLimit.deleteMany({ where: { resetAt: { lt: now } } }),
    db.session.deleteMany({ where: { expiresAt: { lte: now } } }),
    db.job.deleteMany({
      where: {
        OR: [
          { completedAt: { lt: new Date(now.getTime() - 30 * DAY_MS) } },
          { failedAt: { lt: new Date(now.getTime() - 90 * DAY_MS) } },
        ],
      },
    }),
  ]);
  return { rateLimits: rateLimits.count, sessions: sessions.count, jobs: jobs.count };
}

export function createJobHandlers(deps: HandlerDeps): JobHandlers {
  return {
    async 'email.send'(email) {
      let to = email.to;
      if (to === STAFF_RECIPIENT) {
        if (!deps.mailer.staffRecipients) {
          logger.info({ subject: email.subject }, 'aviso interno omitido: MAIL_TO no configurado');
          return;
        }
        to = deps.mailer.staffRecipients;
      }
      await deps.mailer.send({ ...email, to });
    },

    async 'appointments.send-reminders'({ date }) {
      const count = await deps.useCases.scheduleReminders(date);
      logger.info({ date, count }, 'recordatorios de citas encolados');
    },

    async 'exchange-rates.refresh'() {
      if (!deps.exchangeRates.hasProvider) return;
      const rates = await deps.exchangeRates.refresh();
      // Si no hay tasa vigente, se reintenta con backoff.
      if (!rates || rates.stale) throw new Error('No se pudo actualizar la tasa del dólar');
    },

    async 'privacy.retention'() {
      if (deps.retentionMonths < 1) throw new PermanentJobError('Periodo de retención inválido');
      const result = await applyRetention(deps.db, deps.retentionMonths);
      logger.info(result, 'política de retención aplicada');
    },

    async 'maintenance.prune'() {
      const result = await prune(deps.db);
      logger.debug(result, 'limpieza técnica');
    },
  };
}
