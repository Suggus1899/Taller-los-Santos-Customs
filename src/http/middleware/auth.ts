import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { UserRole } from '../../generated/prisma/enums.js';
import type { UsersRepository } from '../../repositories/users.js';

declare module 'express-session' {
  interface SessionData {
    userId?: number;
  }
}

export interface CurrentUser {
  id: number;
  username: string;
  role: UserRole;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: CurrentUser;
  }
}

/**
 * Exige sesión en el panel. El usuario se vuelve a leer de la BD en cada
 * petición: si un administrador lo desactiva o le cambia el rol, el cambio
 * surte efecto de inmediato, no cuando caduque la sesión.
 */
export function requireAuth(users: UsersRepository): RequestHandler {
  return async (req, res, next) => {
    const userId = req.session.userId;
    const user = userId ? await users.findById(userId) : null;
    if (user?.isActive) {
      req.user = { id: user.id, username: user.username, role: user.role };
      res.locals.currentUser = req.user;
      next();
      return;
    }
    if (userId) await destroySession(req); // sesión de un usuario borrado o desactivado
    res.redirect(303, `/admin/login?next=${encodeURIComponent(req.originalUrl)}`);
  };
}

/** Restringe una ruta a ciertos roles (se usa después de requireAuth). */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.user && roles.includes(req.user.role)) {
      next();
      return;
    }
    next(Object.assign(new Error('No tienes permiso para esta sección.'), { status: 403 }));
  };
}

/** Usuario autenticado (las rutas que lo usan van después de requireAuth). */
export function currentUser(req: Request): CurrentUser {
  if (!req.user) throw Object.assign(new Error('Sesión requerida'), { status: 401 });
  return req.user;
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
