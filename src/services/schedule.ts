import { site } from '../config/site.js';

/** Turnos de atención (hora local de Caracas). Pausa de almuerzo de 12:00 a 14:00. */
export const timeSlots = ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00'] as const;
export type TimeSlot = (typeof timeSlots)[number];

/** Cuántos días hacia adelante se puede reservar. */
export const BOOKING_WINDOW_DAYS = 60;

/** Fecha de hoy (YYYY-MM-DD) en la zona horaria del taller, no en la del servidor. */
export function todayInShopTimezone(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: site.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

export function addDays(isoDate: string, days: number): string {
  const date = parseIsoDate(isoDate);
  if (!date) throw new Error(`Fecha inválida: ${isoDate}`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Devuelve un mensaje de error si la fecha no se puede reservar, o `null` si es válida. */
export function validateBookingDate(isoDate: string, today = todayInShopTimezone()): string | null {
  const date = parseIsoDate(isoDate);
  if (!date) return 'Selecciona una fecha válida.';
  if (isoDate <= today) return 'Elige una fecha a partir de mañana.';
  if (isoDate > addDays(today, BOOKING_WINDOW_DAYS)) {
    return `Solo aceptamos reservas con hasta ${BOOKING_WINDOW_DAYS} días de anticipación.`;
  }
  const weekday = date.getUTCDay();
  if (weekday === 0 || weekday === 6) return 'Atendemos de lunes a viernes.';
  return null;
}
