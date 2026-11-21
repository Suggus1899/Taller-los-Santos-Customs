import { beforeEach, describe, expect, it } from 'vitest';
import { parseServiceForm } from '../src/http/admin-forms.js';
import { createTestApp, createUser, csrfToken, login, nextBusinessDay } from './helpers/app.js';
import { resetDatabase } from './helpers/db.js';

beforeEach(() => resetDatabase());

describe('roles', () => {
  it('el personal (STAFF) gestiona operaciones pero no contenido, usuarios ni sistema', async () => {
    const { agent } = createTestApp();
    await createUser('ana', 'STAFF');
    await login(agent, 'ana');
    expect((await agent.get('/admin')).status).toBe(200);
    for (const path of ['/admin/contenido', '/admin/usuarios', '/admin/sistema']) {
      expect((await agent.get(path)).status).toBe(403);
    }
    const panel = await agent.get('/admin');
    expect(panel.text).not.toContain('href="/admin/usuarios"');
  });

  it('desactivar a un usuario corta su acceso de inmediato', async () => {
    const { agent, db } = createTestApp();
    const staff = await createUser('ana', 'STAFF');
    await createUser('jefe', 'ADMIN');
    await login(agent, 'ana');
    expect((await agent.get('/admin')).status).toBe(200);

    await db.user.update({ where: { id: staff.id }, data: { isActive: false } });
    const res = await agent.get('/admin');
    expect(res.status).toBe(303);
    expect(res.headers.location).toMatch(/^\/admin\/login/);
  });
});

describe('gestión de usuarios', () => {
  it('crea usuarios con contraseña robusta y lo audita', async () => {
    const { agent, db } = createTestApp();
    await createUser();
    await login(agent);
    const _csrf = await csrfToken(agent, '/admin/usuarios');

    const weak = await agent
      .post('/admin/usuarios')
      .type('form')
      .send({ _csrf, username: 'pedro', role: 'STAFF', password: 'corta' });
    expect(weak.status).toBe(422);
    expect(weak.text).toContain('al menos 12 caracteres');

    const ok = await agent
      .post('/admin/usuarios')
      .type('form')
      .send({ _csrf, username: 'Pedro', role: 'STAFF', password: 'otra-clave-segura-1' });
    expect(ok.status).toBe(303);
    expect((await db.user.findUniqueOrThrow({ where: { username: 'pedro' } })).role).toBe('STAFF');
    expect(await db.auditLog.count({ where: { action: 'CREATED', entityType: 'USER' } })).toBe(1);

    const duplicate = await agent
      .post('/admin/usuarios')
      .type('form')
      .send({ _csrf, username: 'pedro', role: 'STAFF', password: 'otra-clave-segura-1' });
    expect(duplicate.text).toContain('Ese usuario ya existe');
  });

  it('no permite quedarse sin administradores activos', async () => {
    const { agent, db } = createTestApp();
    const admin = await createUser();
    await login(agent);
    const _csrf = await csrfToken(agent, '/admin/usuarios');
    const res = await agent
      .post(`/admin/usuarios/${admin.id}`)
      .type('form')
      .send({ _csrf, role: 'STAFF', isActive: 'true' });
    expect(decodeURIComponent(res.headers.location as string)).toContain(
      'al menos un administrador',
    );
    expect((await db.user.findUniqueOrThrow({ where: { id: admin.id } })).role).toBe('ADMIN');
  });

  it('cada usuario cambia su propia contraseña verificando la actual', async () => {
    const { agent } = createTestApp();
    await createUser('ana', 'STAFF');
    await login(agent, 'ana');
    const _csrf = await csrfToken(agent, '/admin/cuenta');
    const wrong = await agent.post('/admin/cuenta').type('form').send({
      _csrf,
      current: 'mala',
      password: 'nueva-clave-segura-1',
      confirm: 'nueva-clave-segura-1',
    });
    expect(wrong.status).toBe(422);

    const ok = await agent.post('/admin/cuenta').type('form').send({
      _csrf,
      current: 'una-clave-segura-123',
      password: 'nueva-clave-segura-1',
      confirm: 'nueva-clave-segura-1',
    });
    expect(ok.headers.location).toBe('/admin/cuenta?ok=1');

    const { agent: other } = createTestApp();
    expect((await login(other, 'ana', 'nueva-clave-segura-1')).status).toBe(303);
  });
});

describe('contenido editable', () => {
  it('editar un servicio se refleja al instante en el sitio público', async () => {
    const { agent } = createTestApp();
    await createUser();
    await login(agent);
    const _csrf = await csrfToken(agent, '/admin/contenido/servicios/frenos');
    const res = await agent.post('/admin/contenido/servicios/frenos').type('form').send({
      _csrf,
      name: 'Frenos y ABS',
      icon: 'disc',
      summary: 'Pastillas, discos, líquido y diagnóstico de ABS.',
      intro: 'Revisamos el sistema de frenos completo.',
      sortOrder: '5',
      isActive: 'on',
      'plans[0][name]': 'Pastillas',
      'plans[0][price]': '65',
      'plans[0][features]': 'Pastillas OEM\nGarantía de 1 año',
      'plans[1][name]': '',
      'faqs[0][question]': '¿Cuánto tarda?',
      'faqs[0][answer]': 'Unas dos horas.',
    });
    expect(res.status).toBe(303);

    const page = await agent.get('/servicios/frenos');
    expect(page.text).toContain('Frenos y ABS');
    expect(page.text).toContain('Garantía de 1 año');
    expect(page.text).toContain('¿Cuánto tarda?');
  });

  it('valida los planes y muestra errores legibles', () => {
    const result = parseServiceForm(
      {
        name: 'Frenos',
        icon: 'disc',
        summary: 'Resumen suficientemente largo',
        intro: 'Introducción suficientemente larga',
        plans: [{ name: 'Plan', price: '-5', features: '' }],
      },
      'frenos',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/^Plan 1 · price/);
  });

  it('un servicio desactivado desaparece y no admite citas', async () => {
    const { agent, db } = createTestApp();
    await db.service.update({ where: { slug: 'frenos' }, data: { isActive: false } });
    expect((await agent.get('/servicios/frenos')).status).toBe(404);

    const _csrf = await csrfToken(agent, '/cita');
    const res = await agent.post('/cita').type('form').send({
      _csrf,
      name: 'José',
      email: 'jose@example.com',
      phone: '+58 414 222 3344',
      service: 'frenos',
      date: nextBusinessDay(),
      time: '09:00',
    });
    expect(res.status).toBe(422);
    expect(await db.appointment.count()).toBe(0);
  });

  it('crea promociones con vigencia y oculta las vencidas', async () => {
    const { agent, db } = createTestApp();
    await createUser();
    await login(agent);
    const _csrf = await csrfToken(agent, '/admin/contenido/promociones/nueva');
    const base = {
      _csrf,
      description: 'Descripción de la promoción',
      price: '$10',
      ctaLabel: 'Agendar',
      ctaHref: '/cita',
      isActive: 'on',
      sortOrder: '1',
    };
    await agent
      .post('/admin/contenido/promociones/nueva')
      .type('form')
      .send({ ...base, title: 'Vigente' });
    await agent
      .post('/admin/contenido/promociones/nueva')
      .type('form')
      .send({ ...base, title: 'Vencida', startsAt: '2020-01-01', endsAt: '2020-02-01' });

    const external = await agent
      .post('/admin/contenido/promociones/nueva')
      .type('form')
      .send({ ...base, title: 'Externa', ctaHref: 'https://evil.com' });
    expect(external.status).toBe(422);

    const page = await agent.get('/promociones');
    expect(page.text).toContain('Vigente');
    expect(page.text).not.toContain('Vencida');
    expect(await db.promotion.count({ where: { title: { in: ['Vigente', 'Vencida'] } } })).toBe(2);
  });
});
