import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyRetention, createJobHandlers } from '../src/jobs/handlers.js';
import { enqueue, JobWorker, retryDelayMs } from '../src/jobs/queue.js';
import { enqueueDueTasks, shopClock } from '../src/jobs/scheduler.js';
import {
  createTestApp,
  csrfToken,
  fakeMailer,
  login,
  createUser,
  nextBusinessDay,
} from './helpers/app.js';
import { resetDatabase, testDb } from './helpers/db.js';

beforeEach(() => resetDatabase());

const email = { to: 'cliente@example.com', subject: 'Hola', text: 'Texto' };

describe('cola de trabajos (outbox)', () => {
  it('no deja trabajos huérfanos si la transacción se revierte', async () => {
    const db = testDb();
    await expect(
      db.$transaction(async (tx) => {
        await enqueue(tx, 'email.send', email);
        throw new Error('fallo de negocio');
      }),
    ).rejects.toThrow('fallo de negocio');
    expect(await db.job.count()).toBe(0);
  });

  it('no encola dos veces la misma clave de deduplicación', async () => {
    const db = testDb();
    await enqueue(db, 'maintenance.prune', {}, { dedupeKey: 'prune:hoy' });
    await enqueue(db, 'maintenance.prune', {}, { dedupeKey: 'prune:hoy' });
    expect(await db.job.count()).toBe(1);
  });

  it('valida el payload al encolar', async () => {
    await expect(enqueue(testDb(), 'email.send', { ...email, subject: '' })).rejects.toThrow();
  });

  it('procesa el trabajo y lo marca como completado', async () => {
    const db = testDb();
    const { mailer, sent } = fakeMailer();
    const { useCases, exchangeRates } = createTestApp();
    const worker = new JobWorker(
      db,
      createJobHandlers({ db, mailer, useCases, exchangeRates, retentionMonths: 12 }),
    );
    await enqueue(db, 'email.send', email);

    expect(await worker.runOnce()).toBe(1);
    expect(sent).toEqual([expect.objectContaining({ to: 'cliente@example.com' })]);
    const job = await db.job.findFirstOrThrow();
    expect(job.completedAt).not.toBeNull();
    expect(job.attempts).toBe(1);
  });

  it('reintenta con backoff y marca como fallido al agotar los intentos', async () => {
    const db = testDb();
    const { useCases, exchangeRates } = createTestApp();
    const failingMailer = {
      staffRecipients: null,
      send: vi.fn(async () => {
        throw new Error('SMTP caído');
      }),
    };
    const worker = new JobWorker(
      db,
      createJobHandlers({
        db,
        mailer: failingMailer,
        useCases,
        exchangeRates,
        retentionMonths: 12,
      }),
    );
    await enqueue(db, 'email.send', email, { maxAttempts: 2 });

    await worker.runOnce();
    let job = await db.job.findFirstOrThrow();
    expect(job.failedAt).toBeNull();
    expect(job.lastError).toBe('SMTP caído');
    expect(job.runAt.getTime()).toBeGreaterThan(Date.now() + 20_000); // backoff de ~30 s

    // Adelantamos el reloj del trabajo para el segundo intento.
    await db.job.update({ where: { id: job.id }, data: { runAt: new Date() } });
    await worker.runOnce();
    job = await db.job.findFirstOrThrow();
    expect(job.failedAt).not.toBeNull();
    expect(job.attempts).toBe(2);
    expect(failingMailer.send).toHaveBeenCalledTimes(2);
  });

  it('dos workers a la vez no procesan el mismo trabajo (SKIP LOCKED)', async () => {
    const db = testDb();
    const { mailer, sent } = fakeMailer();
    const { useCases, exchangeRates } = createTestApp();
    const handlers = createJobHandlers({
      db,
      mailer,
      useCases,
      exchangeRates,
      retentionMonths: 12,
    });
    for (let i = 0; i < 20; i++) await enqueue(db, 'email.send', { ...email, subject: `n${i}` });

    const a = new JobWorker(db, handlers, { batchSize: 5 });
    const b = new JobWorker(db, handlers, { batchSize: 5 });
    await Promise.all([a.runOnce(), b.runOnce(), a.runOnce(), b.runOnce()]);
    const subjects = sent.map((m) => m.subject);
    expect(new Set(subjects).size).toBe(subjects.length);
    expect(subjects).toHaveLength(20);
  });

  it('omite los avisos internos si no hay MAIL_TO', async () => {
    const db = testDb();
    const { mailer, sent } = fakeMailer(null);
    const { useCases, exchangeRates } = createTestApp();
    const worker = new JobWorker(
      db,
      createJobHandlers({ db, mailer, useCases, exchangeRates, retentionMonths: 12 }),
    );
    await enqueue(db, 'email.send', { ...email, to: 'staff' });
    await worker.runOnce();
    expect(sent).toHaveLength(0);
    expect((await db.job.findFirstOrThrow()).completedAt).not.toBeNull();
  });

  it('calcula el backoff exponencial con tope', () => {
    expect(retryDelayMs(1)).toBe(30_000);
    expect(retryDelayMs(3)).toBe(120_000);
    expect(retryDelayMs(20)).toBe(3_600_000);
  });
});

describe('correos de las citas', () => {
  it('encola confirmación al cliente y aviso al equipo al reservar', async () => {
    const { agent, db, runJobs, sent } = createTestApp();
    const _csrf = await csrfToken(agent, '/cita');
    await agent.post('/cita').type('form').send({
      _csrf,
      name: 'José',
      email: 'jose@example.com',
      phone: '+58 414 222 3344',
      service: 'frenos',
      date: nextBusinessDay(),
      time: '10:00',
    });
    expect(await db.job.count()).toBe(2);
    await runJobs();
    expect(sent.map((m) => m.to).sort()).toEqual(['equipo@taller.test', 'jose@example.com']);
    expect(sent.find((m) => m.to === 'jose@example.com')?.subject).toMatch(
      /Recibimos tu solicitud/,
    );
  });

  it('avisa al cliente cuando el taller confirma la cita', async () => {
    const { agent, db, runJobs, sent } = createTestApp();
    await createUser();
    const customer = await db.customer.create({ data: { email: 'c@example.com', name: 'Carla' } });
    const appointment = await db.appointment.create({
      data: {
        customerId: customer.id,
        serviceSlug: 'frenos',
        scheduledDate: new Date(`${nextBusinessDay()}T00:00:00Z`),
        timeSlot: '09:00',
      },
    });
    await login(agent);
    const _csrf = await csrfToken(agent, '/admin');
    await agent
      .post(`/admin/citas/${appointment.id}/estado`)
      .type('form')
      .send({ _csrf, status: 'CONFIRMED' });
    await runJobs();
    expect(sent).toEqual([
      expect.objectContaining({
        to: 'c@example.com',
        subject: expect.stringMatching(/Cita confirmada/),
      }),
    ]);
  });

  it('encola recordatorios una sola vez por cita', async () => {
    const { db, useCases } = createTestApp();
    const date = nextBusinessDay();
    const customer = await db.customer.create({ data: { email: 'r@example.com', name: 'Rosa' } });
    await db.appointment.createMany({
      data: [
        {
          customerId: customer.id,
          serviceSlug: 'frenos',
          scheduledDate: new Date(`${date}T00:00:00Z`),
          timeSlot: '08:00',
        },
        {
          customerId: customer.id,
          serviceSlug: 'frenos',
          scheduledDate: new Date(`${date}T00:00:00Z`),
          timeSlot: '09:00',
          status: 'CANCELLED',
        },
      ],
    });
    expect(await useCases.scheduleReminders(date)).toBe(1);
    expect(await useCases.scheduleReminders(date)).toBe(0);
    expect(await db.job.count({ where: { type: 'email.send' } })).toBe(1);
  });
});

describe('tareas programadas', () => {
  it('usa la hora local de Caracas', () => {
    expect(shopClock(new Date('2026-11-21T02:30:00Z'))).toEqual({
      date: '2026-11-20',
      hour: 22,
      minute: 30,
    });
  });

  it('encola cada tarea una vez por periodo aunque se llame varias veces', async () => {
    const db = testDb();
    const now = new Date('2026-11-20T23:10:00Z'); // 19:10 en Caracas
    await enqueueDueTasks(db, { reminderHour: 18, now });
    await enqueueDueTasks(db, { reminderHour: 18, now });
    const jobs = await db.job.findMany({ orderBy: { type: 'asc' } });
    expect(jobs.map((j) => j.type)).toEqual([
      'appointments.send-reminders',
      'exchange-rates.refresh',
      'maintenance.prune',
      'privacy.retention',
    ]);
    expect(jobs.find((j) => j.type === 'appointments.send-reminders')?.payload).toEqual({
      date: '2026-11-21',
    });
  });

  it('no envía recordatorios antes de la hora configurada', async () => {
    const db = testDb();
    await enqueueDueTasks(db, { reminderHour: 18, now: new Date('2026-11-20T14:00:00Z') }); // 10:00
    expect(await db.job.count({ where: { type: 'appointments.send-reminders' } })).toBe(0);
  });
});

describe('retención de datos', () => {
  it('borra datos antiguos y conserva los recientes y las citas futuras', async () => {
    const db = testDb();
    const old = new Date('2024-01-10T00:00:00Z');
    const now = new Date('2026-11-20T00:00:00Z');
    const oldCustomer = await db.customer.create({
      data: { email: 'old@example.com', name: 'Viejo', createdAt: old },
    });
    const recent = await db.customer.create({ data: { email: 'new@example.com', name: 'Nuevo' } });
    await db.contactMessage.create({
      data: { customerId: oldCustomer.id, message: 'antiguo', createdAt: old },
    });
    await db.contactMessage.create({ data: { customerId: recent.id, message: 'reciente' } });
    await db.appointment.create({
      data: {
        customerId: recent.id,
        serviceSlug: 'frenos',
        scheduledDate: new Date('2026-12-01T00:00:00Z'),
        timeSlot: '08:00',
      },
    });

    const result = await applyRetention(db, 12, now);
    expect(result).toMatchObject({ messages: 1, customers: 1 });
    expect(await db.customer.findMany({ select: { email: true } })).toEqual([
      { email: 'new@example.com' },
    ]);
    expect(await db.appointment.count()).toBe(1);
  });
});
