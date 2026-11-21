import { z } from 'zod';

export const idParam = z.coerce.number().int().positive();

/** URL de vuelta con un aviso que el panel muestra arriba. */
export const withNotice = (path: string, notice: string) =>
  `${path}${path.includes('?') ? '&' : '?'}aviso=${encodeURIComponent(notice)}`;

export const noticeFrom = (query: Record<string, unknown>) =>
  typeof query.aviso === 'string' ? query.aviso.slice(0, 200) : null;
