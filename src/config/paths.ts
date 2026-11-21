import path from 'node:path';

/**
 * Raíz del proyecto. Este archivo vive en `src/config` (desarrollo) o en
 * `dist/config` (producción), así que en ambos casos la raíz está dos niveles arriba.
 */
export const ROOT_DIR = path.resolve(import.meta.dirname, '..', '..');
export const VIEWS_DIR = path.join(ROOT_DIR, 'views');
export const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
