import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, csrfToken } from './helpers/app.js';
import { resetDatabase } from './helpers/db.js';

beforeEach(() => resetDatabase());

describe('salud y observabilidad', () => {
  it('expone /healthz y /readyz', async () => {
    const { agent } = createTestApp();
    expect((await agent.get('/healthz')).body).toEqual({ status: 'ok' });
    expect((await agent.get('/readyz')).body).toEqual({ status: 'ready' });
  });

  it('devuelve un X-Request-Id y respeta el que envía el proxy', async () => {
    const { agent } = createTestApp();
    const generated = await agent.get('/');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const forwarded = await agent.get('/').set('X-Request-Id', 'proxy-abc-12345');
    expect(forwarded.headers['x-request-id']).toBe('proxy-abc-12345');
    const invalid = await agent.get('/').set('X-Request-Id', 'x"><script>');
    expect(invalid.headers['x-request-id']).not.toContain('<');
  });
});

describe('rate limit compartido', () => {
  it('dos instancias de la app comparten el mismo contador', async () => {
    const a = createTestApp({ rateLimit: true });
    const b = createTestApp({ rateLimit: true });
    const tokenA = await csrfToken(a.agent);
    const tokenB = await csrfToken(b.agent);
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const [agent, _csrf] = i % 2 === 0 ? [a.agent, tokenA] : [b.agent, tokenB];
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

describe('privacidad', () => {
  const withGa = { env: { GA_MEASUREMENT_ID: 'G-TEST123' } };

  it('sin Analytics configurado no hay banner ni script', async () => {
    const { agent } = createTestApp();
    const res = await agent.get('/');
    expect(res.text).not.toContain('consent-title');
    expect(res.text).not.toContain('analytics.js');
  });

  it('con Analytics, no carga el script hasta que se acepta', async () => {
    const { agent } = createTestApp(withGa);
    const before = await agent.get('/servicios');
    expect(before.text).toContain('consent-title');
    expect(before.text).not.toContain('analytics.js');

    const _csrf = /name="_csrf" value="([^"]+)"/.exec(before.text)?.[1];
    const res = await agent
      .post('/privacidad/consentimiento')
      .type('form')
      .send({ _csrf, decision: 'granted', returnTo: '/servicios' });
    expect(res.headers.location).toBe('/servicios');

    const after = await agent.get('/servicios');
    expect(after.text).toContain('/js/analytics.js');
    expect(after.text).not.toContain('consent-title');
  });

  it('rechazar oculta el banner y no carga Analytics', async () => {
    const { agent } = createTestApp(withGa);
    const _csrf = await csrfToken(agent, '/');
    await agent.post('/privacidad/consentimiento').type('form').send({ _csrf, decision: 'denied' });
    const res = await agent.get('/');
    expect(res.text).not.toContain('consent-title');
    expect(res.text).not.toContain('analytics.js');
  });

  it('no redirige fuera del sitio tras el consentimiento', async () => {
    const { agent } = createTestApp(withGa);
    const _csrf = await csrfToken(agent, '/');
    const res = await agent
      .post('/privacidad/consentimiento')
      .type('form')
      .send({ _csrf, decision: 'denied', returnTo: '//evil.com' });
    expect(res.headers.location).toBe('/');
  });
});
