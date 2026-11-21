import { site, whatsappUrl } from '../config/site.js';
import { images, type ImageKey } from '../content/images.js';
import { labelOf, quoteExtras, quoteServices, vehicleTypes } from '../content/quote.js';

const dateFormatter = new Intl.DateTimeFormat(site.locale, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC', // las fechas de cita son días sin hora; evita desfases por zona
});

const dateTimeFormatter = new Intl.DateTimeFormat(site.locale, {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: site.timezone,
});

const shortDateFormatter = new Intl.DateTimeFormat(site.locale, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: site.timezone,
});

const moneyFormatter = new Intl.NumberFormat(site.locale, { maximumFractionDigits: 2 });

export const navigation = [
  { href: '/', label: 'Inicio' },
  { href: '/servicios', label: 'Servicios' },
  { href: '/promociones', label: 'Promociones' },
  { href: '/nosotros', label: 'Nosotros' },
  { href: '/galeria', label: 'Galería' },
  { href: '/contacto', label: 'Contacto' },
] as const;

/** Funciones disponibles en todas las vistas EJS. */
export const viewHelpers = {
  site,
  navigation,
  whatsappUrl,

  /** "$69" o "$69,50" a partir de dólares. */
  money(amount: number): string {
    return `$${moneyFormatter.format(amount)}`;
  },
  moneyFromCents(cents: number): string {
    return `$${moneyFormatter.format(cents / 100)}`;
  },
  /** "Bs. 63.398,87" a partir de bolívares. */
  bolivares(amount: number): string {
    return `Bs. ${amount.toLocaleString(site.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  },
  /** "jueves, 26 de noviembre de 2026" a partir de 'YYYY-MM-DD'. */
  longDate(isoDate: string): string {
    return dateFormatter.format(new Date(`${isoDate}T00:00:00Z`));
  },
  shortDate(date: Date): string {
    return shortDateFormatter.format(date);
  },
  dateTime(date: Date): string {
    return dateTimeFormatter.format(date);
  },
  /** "8:00 a. m." a partir de "08:00". */
  timeLabel(slot: string): string {
    const [h = 0, m = 0] = slot.split(':').map(Number);
    const suffix = h < 12 ? 'a. m.' : 'p. m.';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`;
  },
  vehicleTypeLabel: (id: string) => labelOf(vehicleTypes, id.toLowerCase()),
  quoteServiceLabel: (id: string) => labelOf(quoteServices, id),
  quoteExtraLabel: (id: string) => labelOf(quoteExtras, id),

  /** Atributos de una imagen responsive (src, srcset, sizes, dimensiones y alt). */
  img(key: ImageKey, sizes = '(min-width: 960px) 50vw, 100vw') {
    const image = images[key];
    const [small, large] = image.widths;
    const url = (w: number) => `/images/${image.base}-${w}.webp`;
    return {
      src: url(large),
      srcset: `${url(small)} ${small}w, ${url(large)} ${large}w`,
      sizes,
      width: large,
      height: Math.round(large / image.ratio),
      alt: image.alt,
    };
  },

  /** SVG de un icono del sprite (views/partials/icons.ejs). Decorativo por defecto. */
  icon(name: string, className = ''): string {
    const safe = name.replace(/[^a-z0-9-]/g, '');
    const cls = ['icon', className.replace(/[^a-z0-9 .:-]/g, '')].filter(Boolean).join(' ');
    return `<svg class="${cls}" aria-hidden="true" focusable="false"><use href="#i-${safe}"></use></svg>`;
  },

  /** Iniciales para avatares sin foto. */
  initials(name: string): string {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  },
};

export type ViewHelpers = typeof viewHelpers;
