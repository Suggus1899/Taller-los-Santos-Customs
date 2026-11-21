export interface Promotion {
  title: string;
  description: string;
  price: string;
  previousPrice?: string;
  featured?: boolean;
  cta: { label: string; href: string };
}

export const promotions: readonly Promotion[] = [
  {
    title: 'Mantenimiento Premium',
    description: 'Cambio de aceite sintético, filtros y revisión de 25 puntos.',
    price: '$69',
    previousPrice: '$89',
    featured: true,
    cta: { label: 'Agendar cita', href: '/cita?servicio=mantenimiento' },
  },
  {
    title: '2x1 en alineación',
    description: 'Trae a un amigo y ambos pagan una sola alineación.',
    price: '$40',
    cta: { label: 'Agendar cita', href: '/cita?servicio=neumaticos' },
  },
  {
    title: 'Escaneo gratis',
    description: 'Diagnóstico computarizado sin costo con cualquier reparación mayor.',
    price: '$0',
    cta: { label: 'Ver diagnóstico', href: '/servicios/diagnostico' },
  },
  {
    title: '10 % en tu primer servicio',
    description: 'Descuento para clientes nuevos en su primera visita.',
    price: '-10 %',
    cta: { label: 'Solicitar cotización', href: '/cotizar' },
  },
];
