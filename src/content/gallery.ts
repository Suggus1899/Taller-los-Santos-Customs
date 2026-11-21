import type { ImageKey } from './images.js';

export type GalleryCategory = 'mantenimiento' | 'reparaciones' | 'neumaticos' | 'taller';

export interface GalleryItem {
  image: ImageKey;
  title: string;
  description: string;
  category: GalleryCategory;
}

export const galleryCategories: Record<GalleryCategory, string> = {
  mantenimiento: 'Mantenimiento',
  reparaciones: 'Reparaciones',
  neumaticos: 'Neumáticos',
  taller: 'Nuestro taller',
};

export const galleryItems: readonly GalleryItem[] = [
  {
    image: 'repairs',
    title: 'Reparación de motor',
    description: 'Diagnóstico y reparación de fallas complejas.',
    category: 'reparaciones',
  },
  {
    image: 'tires',
    title: 'Alineación y balanceo',
    description: 'Rodaje en óptimas condiciones.',
    category: 'neumaticos',
  },
  {
    image: 'maintenance',
    title: 'Mantenimiento preventivo',
    description: 'Aceites sintéticos y filtros OEM.',
    category: 'mantenimiento',
  },
  {
    image: 'workshop',
    title: 'Nuestras instalaciones',
    description: 'Bahías de trabajo equipadas en Cagua.',
    category: 'taller',
  },
  {
    image: 'client',
    title: 'Atención al cliente',
    description: 'Te explicamos cada paso del trabajo.',
    category: 'taller',
  },
];
