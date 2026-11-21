export interface SiteImage {
  /** Prefijo del archivo en /public/images: `<base>-<ancho>.webp` */
  base: string;
  alt: string;
  widths: readonly [small: number, large: number];
  /** Proporción ancho/alto del archivo original. */
  ratio: number;
}

const card = [640, 1200] as const;

export const images = {
  hero: {
    base: 'hero',
    alt: 'Mecánico trabajando bajo un auto clásico',
    widths: [960, 1920],
    ratio: 1.5,
  },
  workshop: {
    base: 'workshop',
    alt: 'Interior del taller con un auto clásico rojo',
    widths: card,
    ratio: 1.5,
  },
  client: {
    base: 'client',
    alt: 'Mecánico explicando un presupuesto a un cliente',
    widths: card,
    ratio: 1.5,
  },
  maintenance: {
    base: 'maintenance',
    alt: 'Cambio de aceite en el motor de un vehículo',
    widths: card,
    ratio: 1.5,
  },
  repairs: {
    base: 'repairs',
    alt: 'Mecánico revisando el motor de un auto',
    widths: card,
    ratio: 1.5,
  },
  tires: {
    base: 'tires',
    alt: 'Vehículo elevado en el taller para revisar suspensión y neumáticos',
    widths: card,
    ratio: 1.5,
  },
} as const satisfies Record<string, SiteImage>;

export type ImageKey = keyof typeof images;
