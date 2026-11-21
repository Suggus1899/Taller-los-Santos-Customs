/**
 * Datos del negocio. Centralizados aquí para no repetirlos en cada vista.
 * Revisa que teléfono, correo y ubicación sean los reales antes de publicar.
 */
export const site = {
  name: 'Taller Los Santos',
  shortName: 'Los Santos',
  tagline: 'Mecánica automotriz de confianza en Cagua desde 1998',
  description:
    'Taller mecánico en Cagua, Aragua. Mantenimiento preventivo, reparaciones, diagnóstico computarizado, frenos, aire acondicionado y neumáticos.',
  foundedYear: 1998,
  timezone: 'America/Caracas',
  locale: 'es-VE',
  contact: {
    phoneDisplay: '+58 412 555 1234',
    phoneE164: '+584125551234',
    whatsapp: '584125551234',
    email: 'info@lossantos.com',
  },
  address: {
    locality: 'Cagua',
    region: 'Aragua',
    country: 'VE',
    display: 'Cagua, Estado Aragua, Venezuela',
    reference: 'Cerca de Repuestos Guerrero G & G',
    mapEmbedUrl:
      'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d7854.412534756171!2d-67.46163293335495!3d10.163882373953664!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x8e802134a340b479%3A0xab34ebdc09134549!2sRepuestos%20Guerrero%20G%20%26%20G%20C.A.!5e0!3m2!1ses!2sve!4v1737695796901!5m2!1ses!2sve',
    mapLinkUrl: 'https://maps.google.com/?q=10.163882,-67.461632',
  },
  hours: {
    display: 'Lunes a viernes, 8:00 a. m. – 5:00 p. m.',
    /** Formato schema.org */
    schema: 'Mo-Fr 08:00-17:00',
  },
} as const;

export type Site = typeof site;

export function whatsappUrl(message = 'Hola, quiero información sobre sus servicios'): string {
  return `https://wa.me/${site.contact.whatsapp}?text=${encodeURIComponent(message)}`;
}
