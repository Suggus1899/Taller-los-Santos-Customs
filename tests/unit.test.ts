import { describe, expect, it } from 'vitest';
import { calculateEstimate } from '../src/content/quote.js';
import { calculateFuelSavings } from '../src/http/routes/pages.js';
import { safeRedirectTarget } from '../src/http/middleware/auth.js';
import { contactSchema } from '../src/http/validation.js';
import { usdToVes } from '../src/services/exchange-rate.js';
import { hashPassword, verifyPassword } from '../src/services/password.js';
import { todayInShopTimezone, validateBookingDate } from '../src/services/schedule.js';

describe('cotizador', () => {
  it('suma recargo del vehículo, servicio y extra', () => {
    expect(calculateEstimate({ vehicleType: 'suv', service: 'full', extra: 'ac' })).toBe(
      20 + 150 + 25,
    );
    expect(calculateEstimate({ vehicleType: 'sedan', service: 'oil', extra: 'none' })).toBe(50);
  });
});

describe('agenda', () => {
  const today = '2026-11-18'; // miércoles

  it('acepta un día laborable futuro', () => {
    expect(validateBookingDate('2026-11-19', today)).toBeNull();
  });

  it('rechaza hoy, fines de semana, fechas lejanas y formatos inválidos', () => {
    expect(validateBookingDate('2026-11-18', today)).toMatch(/mañana/);
    expect(validateBookingDate('2026-11-21', today)).toMatch(/lunes a viernes/);
    expect(validateBookingDate('2027-03-01', today)).toMatch(/60 días/);
    expect(validateBookingDate('2026-02-30', today)).toMatch(/válida/);
    expect(validateBookingDate('mañana', today)).toMatch(/válida/);
  });

  it('calcula "hoy" en la zona horaria del taller, no en la del servidor', () => {
    // 02:00 UTC del 21 de noviembre son las 22:00 del 20 en Caracas (UTC-4).
    expect(todayInShopTimezone(new Date('2026-11-21T02:00:00Z'))).toBe('2026-11-20');
  });
});

describe('contraseñas', () => {
  it('verifica la contraseña correcta y rechaza la incorrecta', async () => {
    const hash = await hashPassword('una-clave-segura-123');
    expect(hash).toMatch(/^scrypt\$/);
    await expect(verifyPassword('una-clave-segura-123', hash)).resolves.toBe(true);
    await expect(verifyPassword('otra-clave', hash)).resolves.toBe(false);
  });

  it('genera un hash distinto cada vez (salt aleatorio)', async () => {
    expect(await hashPassword('x')).not.toBe(await hashPassword('x'));
  });

  it('rechaza hashes con formato inválido sin lanzar', async () => {
    await expect(verifyPassword('x', 'bcrypt$abc')).resolves.toBe(false);
  });
});

describe('validación de formularios', () => {
  it('normaliza el correo y elimina espacios', () => {
    const result = contactSchema.parse({
      name: '  Ana ',
      email: ' ANA@Example.COM ',
      message: 'Necesito una revisión',
    });
    expect(result).toMatchObject({ name: 'Ana', email: 'ana@example.com' });
    expect(result.phone).toBeUndefined();
  });

  it('rechaza teléfonos y correos inválidos', () => {
    const result = contactSchema.safeParse({
      name: 'Ana',
      email: 'no-es-correo',
      phone: 'abc',
      message: 'Hola hola hola',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0])).toEqual(
      expect.arrayContaining(['email', 'phone']),
    );
  });
});

describe('utilidades', () => {
  it('convierte USD a VES redondeando a céntimos', () => {
    expect(usdToVes(69, 918.7662)).toBe(63394.87);
  });

  it('calcula el ahorro de combustible', () => {
    const { savings, yearlyCost } = calculateFuelSavings(100, 10, 1);
    expect(yearlyCost).toBeCloseTo(520);
    expect(savings).toBeCloseTo(520 - 520 / 1.15);
  });

  it('solo permite redirecciones internas del panel', () => {
    expect(safeRedirectTarget('/admin?tab=citas')).toBe('/admin?tab=citas');
    expect(safeRedirectTarget('//evil.com')).toBe('/admin');
    expect(safeRedirectTarget('https://evil.com')).toBe('/admin');
    expect(safeRedirectTarget(undefined)).toBe('/admin');
  });
});
