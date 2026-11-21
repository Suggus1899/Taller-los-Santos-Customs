import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, createUser, csrfToken, nextBusinessDay } from './helpers/app.js';
import { resetDatabase } from './helpers/db.js';

beforeEach(() => resetDatabase());

async function login(
  agent: ReturnType<typeof createTestApp>['agent'],
  password = 'una-clave-segura-123',
) {
  const _csrf = await csrfToken(agent, '/admin/login');
  return agent
    .post('/admin/login')
    .type('form')
    .send({ _csrf, username: 'Admin', password, next: '/admin' });
}

describe('panel de administración', () => {
  it('exige iniciar sesión', async () => {
    const { agent } = createTestApp();
    const res = await agent.get('/admin?tab=mensajes');
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/login?next=%2Fadmin%3Ftab%3Dmensajes');
  });

  it('rechaza credenciales incorrectas y lo registra en la auditoría', async () => {
    const { agent, db } = createTestApp();
    await createUser();
    const res = await login(agent, 'incorrecta');
    expect(res.status).toBe(401);
    expect(res.text).toContain('Usuario o contraseña incorrectos');
    expect(await db.auditLog.count({ where: { action: 'LOGIN_FAILED' } })).toBe(1);
  });

  it('no permite entrar a usuarios desactivados', async () => {
    const { agent, db } = createTestApp();
    const user = await createUser();
    await db.user.update({ where: { id: user.id }, data: { isActive: false } });
    expect((await login(agent)).status).toBe(401);
  });

  it('inicia sesión (sin distinguir mayúsculas en el usuario) y muestra el panel', async () => {
    const { agent, db } = createTestApp();
    await createUser();
    const res = await login(agent);
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin');
    expect(res.headers['set-cookie']?.toString()).toMatch(/lsc\.sid=.*HttpOnly/);

    const panel = await agent.get('/admin');
    expect(panel.status).toBe(200);
    expect(panel.headers['cache-control']).toBe('no-store');
    expect(panel.text).toContain('Panel de gestión');
    expect(await db.session.count()).toBe(1);
    expect((await db.user.findFirstOrThrow()).lastLoginAt).not.toBeNull();
  });

  it('no redirige fuera del panel tras el login', async () => {
    const { agent } = createTestApp();
    await createUser();
    const _csrf = await csrfToken(agent, '/admin/login');
    const res = await agent
      .post('/admin/login')
      .type('form')
      .send({ _csrf, username: 'admin', password: 'una-clave-segura-123', next: '//evil.com' });
    expect(res.headers.location).toBe('/admin');
  });

  it('cambia el estado de una cita y deja constancia en la auditoría', async () => {
    const { agent, db } = createTestApp();
    const user = await createUser();
    const customer = await db.customer.create({
      data: { email: 'c@example.com', name: 'Cliente' },
    });
    const appointment = await db.appointment.create({
      data: {
        customerId: customer.id,
        serviceSlug: 'frenos',
        scheduledDate: new Date(`${nextBusinessDay()}T00:00:00Z`),
        timeSlot: '10:00',
      },
    });
    await login(agent);

    const panel = await agent.get('/admin?tab=citas');
    expect(panel.text).toContain('Cliente');
    const _csrf = /name="_csrf" value="([^"]+)"/.exec(panel.text)?.[1];

    const res = await agent
      .post(`/admin/citas/${appointment.id}/estado`)
      .type('form')
      .send({ _csrf, status: 'CONFIRMED' });
    expect(res.status).toBe(303);
    expect((await db.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).status).toBe(
      'CONFIRMED',
    );

    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'STATUS_CHANGED' } });
    expect(audit).toMatchObject({
      userId: user.id,
      entityType: 'APPOINTMENT',
      entityId: appointment.id,
    });
    expect(audit.metadata).toEqual({ from: 'PENDING', to: 'CONFIRMED' });
  });

  it('rechaza estados no válidos', async () => {
    const { agent } = createTestApp();
    await createUser();
    await login(agent);
    const _csrf = await csrfToken(agent, '/admin');
    const res = await agent
      .post('/admin/citas/1/estado')
      .type('form')
      .send({ _csrf, status: 'HACKED' });
    expect(res.headers.location).toContain('Estado%20no%20v%C3%A1lido');
  });

  it('cierra sesión por POST y elimina la sesión', async () => {
    const { agent, db } = createTestApp();
    await createUser();
    await login(agent);
    const _csrf = await csrfToken(agent, '/admin');
    const res = await agent.post('/admin/logout').type('form').send({ _csrf });
    expect(res.headers.location).toBe('/admin/login');
    expect(await db.session.count()).toBe(0);
    expect((await agent.get('/admin')).status).toBe(303);
  });
});
