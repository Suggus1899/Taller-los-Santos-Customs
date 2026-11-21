import { expect, test, type Page } from '@playwright/test';
import { E2E_ADMIN } from './global-setup.js';

/** Falla el test si la página tiene errores de JavaScript o violaciones de CSP. */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/google\.com\/maps|ERR_/.test(m.text())) errors.push(m.text());
  });
  // El mapa de Google no es parte de lo que se prueba: se bloquea para no depender de la red.
  void page.route(/google\.com/, (route) => route.abort());
  return errors;
}

/** Próximo día laborable a partir de mañana, en formato YYYY-MM-DD. */
function nextBusinessDay(offset = 1): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

test('la página de inicio carga sin errores y es navegable', async ({ page, isMobile }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Mecánica de precisión');

  if (isMobile) {
    const toggle = page.locator('[data-nav-toggle]');
    await expect(toggle).toHaveAccessibleName('Abrir menú');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle).toHaveAccessibleName('Cerrar menú');
  }
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Servicios' })
    .click();
  await expect(page).toHaveURL(/\/servicios$/);
  await page
    .getByRole('link', { name: /Frenos/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Frenos');
  expect(errors).toEqual([]);
});

test('el enlace "Saltar al contenido" funciona con teclado', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Navegación por teclado solo en escritorio');
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Saltar al contenido' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#contenido')).toBeFocused();
});

test('el cotizador muestra la vista previa y guarda la cotización', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/cotizar');
  await page.getByLabel(/SUV/).check({ force: true });
  await page.getByLabel(/Servicio completo/).check({ force: true });
  await page.getByLabel(/Revisión de A\/C/).check({ force: true });
  await expect(page.locator('[data-quote-total]')).toHaveText('$195');

  await page.getByLabel('Nombre', { exact: true }).fill('Ana Pérez');
  await page.getByLabel('Correo electrónico').fill('ana.e2e@example.com');
  await page.getByRole('button', { name: 'Obtener cotización' }).click();
  await expect(page.getByRole('heading', { name: 'Tu cotización' })).toBeVisible();
  await expect(page.getByText('$195', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('reserva de cita y confirmación desde el panel', async ({ page, browser, isMobile }) => {
  test.skip(isMobile, 'El flujo completo se cubre una vez (escritorio)');
  const errors = trackErrors(page);
  const date = nextBusinessDay(2);

  await page.goto('/cita?servicio=frenos');
  await expect(page.getByLabel('Servicio', { exact: true })).toHaveValue('frenos');
  await page.getByLabel('Fecha', { exact: true }).fill(date);
  await page.getByLabel('Fecha', { exact: true }).dispatchEvent('change');
  await expect(page.locator('[data-slots-status]')).toContainText('horarios disponibles');
  await page.getByLabel('10:00 a. m.').check({ force: true });
  await page.getByLabel('Nombre completo').fill('José Ramírez');
  await page.getByLabel('Teléfono', { exact: true }).fill('+58 414 222 3344');
  await page.getByLabel('Correo electrónico').fill('jose.e2e@example.com');
  await page.getByRole('button', { name: 'Confirmar cita' }).click();

  await expect(page.getByRole('heading', { name: '¡Cita registrada!' })).toBeVisible();
  await expect(page.getByRole('main').getByText('Frenos', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);

  // El turno ya no está disponible para otra persona.
  const other = await browser.newPage();
  await other.goto('/cita');
  await other.getByLabel('Fecha', { exact: true }).fill(date);
  await other.getByLabel('Fecha', { exact: true }).dispatchEvent('change');
  await expect(other.getByLabel('10:00 a. m.')).toBeDisabled();
  await other.close();

  // El personal confirma la cita en el panel.
  await page.goto('/admin');
  await page.getByLabel('Usuario').fill(E2E_ADMIN.username);
  await page.getByLabel('Contraseña').fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Panel de gestión' })).toBeVisible();

  const row = page.getByRole('row').filter({ hasText: 'José Ramírez' });
  await row.getByRole('combobox').selectOption('CONFIRMED');
  await row.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('status')).toContainText('Cita actualizada');
  await expect(page.getByRole('row').filter({ hasText: 'José Ramírez' })).toContainText(
    'Confirmada',
  );
});

test('el panel exige iniciar sesión', async ({ page }) => {
  await page.goto('/admin/sistema');
  await expect(page).toHaveURL(/\/admin\/login\?next=/);
});
