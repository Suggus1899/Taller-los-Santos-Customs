import { beforeEach, describe, expect, it } from 'vitest';
import { services } from '../src/content/services.js';
import { createTestApp, csrfToken, nextBusinessDay, nextSaturday } from './helpers/app.js';
import { resetDatabase } from './helpers/db.js';

beforeEach(() => resetDatabase());

describe('páginas públicas', () => {
  const paths = [
    '/',
    '/servicios',
    ...services.map((s) => `/servicios/${s.slug}`),
    '/nosotros',
    '/garantias',
    '/galeria',
    '/promociones',
    '/calculadora-combustible',
    '/contacto',
    '/cita',
    '/cotizar',
  ];

  it.each(paths)('%s responde 200 con HTML', async (path) => {
    const { agent } = createTestApp();
    const res = await agent.get(path);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('<main id="contenido"');
  });

  it('envía cabeceras de seguridad y no expone Express', async () => {
    const { agent } = createTestApp();
    const res = await agent.get('/');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('devuelve 404 para rutas y servicios inexistentes', async () => {
    const { agent } = createTestApp();
    expect((await agent.get('/no-existe')).status).toBe(404);
    expect((await agent.get('/servicios/no-existe')).status).toBe(404);
  });

  it('redirige con 301 las URLs del sitio anterior', async () => {
    const { agent } = createTestApp();
    const res = await agent.get('/brakes');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/servicios/frenos');
  });

  it('publica robots.txt y sitemap.xml con la URL del sitio', async () => {
    const { agent } = createTestApp();
    expect((await agent.get('/robots.txt')).text).toContain('Disallow: /admin');
    const sitemap = await agent.get('/sitemap.xml');
    expect(sitemap.text).toContain('<loc>https://taller.test/servicios/frenos</loc>');
  });

  it('calcula el ahorro de combustible en el servidor (sin JavaScript)', async () => {
    const { agent } = createTestApp();
    const res = await agent.get('/calculadora-combustible?km=100&rendimiento=10&precio=1');
    expect(res.text).toContain('Ahorro estimado al año');
  });
});

describe('formulario de contacto', () => {
  it('rechaza envíos sin token CSRF', async () => {
    const { agent } = createTestApp();
    const res = await agent
      .post('/contacto')
      .type('form')
      .send({ name: 'Ana', email: 'a@b.com', message: 'Hola mundo!' });
    expect(res.status).toBe(403);
  });

  it('muestra los errores y conserva lo escrito', async () => {
    const { agent } = createTestApp();
    const _csrf = await csrfToken(agent);
    const res = await agent
      .post('/contacto')
      .type('form')
      .send({ _csrf, name: 'Ana', email: 'mal', message: 'corto' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('aria-invalid="true"');
    expect(res.text).toContain('value="Ana"');
  });

  it('guarda el mensaje, vincula el cliente y notifica', async () => {
    const { agent, db, sent } = createTestApp();
    const _csrf = await csrfToken(agent);
    const res = await agent.post('/contacto').type('form').send({
      _csrf,
      name: 'Ana Pérez',
      email: 'ANA@example.com',
      message: '¿Trabajan con híbridos?',
    });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/contacto/enviado');

    const message = await db.contactMessage.findFirstOrThrow({ include: { customer: true } });
    expect(message.customer.email).toBe('ana@example.com');
    expect(message.status).toBe('NEW');
    expect(sent).toHaveLength(1);
  });

  it('descarta en silencio los envíos de bots (campo trampa)', async () => {
    const { agent, db } = createTestApp();
    const _csrf = await csrfToken(agent);
    const res = await agent.post('/contacto').type('form').send({
      _csrf,
      name: 'Bot',
      email: 'bot@spam.com',
      message: 'Compra ya!!!!!',
      website: 'http://spam',
    });
    expect(res.status).toBe(303);
    expect(await db.contactMessage.count()).toBe(0);
  });

  it('aplica límite de envíos por IP', async () => {
    const { agent } = createTestApp({ rateLimit: true });
    const _csrf = await csrfToken(agent);
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await agent
        .post('/contacto')
        .type('form')
        .send({ _csrf, name: 'A', email: 'x', message: 'y' });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 422)).toBe(true);
    expect(statuses[5]).toBe(429);
  });
});

describe('citas', () => {
  const valid = (date: string) => ({
    name: 'José Ramírez',
    email: 'jose@example.com',
    phone: '+58 414 222 3344',
    vehicle: 'Ford Fiesta 2012',
    service: 'frenos',
    date,
    time: '09:00',
  });

  it('agenda una cita y muestra la confirmación', async () => {
    const { agent, db } = createTestApp();
    const date = nextBusinessDay();
    const _csrf = await csrfToken(agent, '/cita');
    const res = await agent
      .post('/cita')
      .type('form')
      .send({ _csrf, ...valid(date) });
    expect(res.status).toBe(303);
    expect(res.headers.location).toMatch(/^\/cita\/confirmada\/[0-9a-f-]{36}$/);

    const confirmation = await agent.get(res.headers.location as string);
    expect(confirmation.status).toBe(200);
    expect(confirmation.text).toContain('Frenos');

    const appointment = await db.appointment.findFirstOrThrow({ include: { vehicle: true } });
    expect(appointment.timeSlot).toBe('09:00');
    expect(appointment.vehicle?.description).toBe('Ford Fiesta 2012');
  });

  it('impide reservar dos veces el mismo turno', async () => {
    const { agent } = createTestApp();
    const date = nextBusinessDay();
    const _csrf = await csrfToken(agent, '/cita');
    await agent
      .post('/cita')
      .type('form')
      .send({ _csrf, ...valid(date) });
    const second = await agent
      .post('/cita')
      .type('form')
      .send({ _csrf, ...valid(date), email: 'otra@example.com' });
    expect(second.status).toBe(422);
    expect(second.text).toContain('acaba de ocuparse');
  });

  it('informa los turnos ocupados de un día', async () => {
    const { agent } = createTestApp();
    const date = nextBusinessDay();
    const _csrf = await csrfToken(agent, '/cita');
    await agent
      .post('/cita')
      .type('form')
      .send({ _csrf, ...valid(date) });
    const res = await agent.get(`/cita/disponibilidad?fecha=${date}`);
    expect(res.body).toEqual({ date, taken: ['09:00'] });
  });

  it('rechaza fines de semana y servicios inexistentes', async () => {
    const { agent } = createTestApp();
    const _csrf = await csrfToken(agent, '/cita');
    const res = await agent
      .post('/cita')
      .type('form')
      .send({ _csrf, ...valid(nextSaturday()), service: 'inventado' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('lunes a viernes');
    expect(res.text).toContain('Elige un servicio');
  });

  it('devuelve 404 para confirmaciones inexistentes o con id inválido', async () => {
    const { agent } = createTestApp();
    expect((await agent.get('/cita/confirmada/no-es-uuid')).status).toBe(404);
    expect((await agent.get('/cita/confirmada/7b0d2c7e-0000-4000-8000-000000000000')).status).toBe(
      404,
    );
  });
});

describe('cotizador', () => {
  it('calcula el precio en el servidor e ignora cualquier precio enviado', async () => {
    const { agent, db } = createTestApp();
    const _csrf = await csrfToken(agent, '/cotizar');
    const res = await agent.post('/cotizar').type('form').send({
      _csrf,
      vehicleType: 'suv',
      service: 'full',
      extra: 'ac',
      name: 'Ana',
      email: 'ana@example.com',
      estimate: '1', // intento de manipulación
    });
    expect(res.status).toBe(303);
    const quote = await db.quoteRequest.findFirstOrThrow();
    expect(quote.estimateCents).toBe(19500);
    expect(quote.vehicleType).toBe('SUV');

    const result = await agent.get(res.headers.location as string);
    expect(result.text).toContain('$195');
    expect(result.text).toContain('a tasa oficial BCV');
  });
});
