import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '../../generated/prisma/enums.js';

declare module 'express-session' {
  interface SessionData {
    user?: { id: number; username: string; role: UserRole };
  }
}

/** Exige sesión iniciada en el panel; si no, redirige al login conservando el destino. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session.user) {
    res.locals.currentUser = req.session.user;
    next();
    return;
  }
  const target = encodeURIComponent(req.originalUrl);
  res.redirect(303, `/admin/login?next=${target}`);
}

/** Solo permite redirecciones internas tras el login (evita "open redirects"). */
export function safeRedirectTarget(value: unknown, fallback = '/admin'): string {
  if (typeof value !== 'string') return fallback;
  return value.startsWith('/admin') && !value.startsWith('//') ? value : fallback;
}

/** Promisifica operaciones de express-session para usarlas con async/await. */
export function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) =>
    req.session.regenerate((e) => (e ? reject(e) : resolve())),
  );
}

export function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));
}

export function destroySession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => req.session.destroy((e) => (e ? reject(e) : resolve())));
}
