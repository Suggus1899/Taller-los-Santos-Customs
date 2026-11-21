import session from 'express-session';
import type { Db, Prisma } from '../db/client.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const PRUNE_INTERVAL_MS = 15 * 60 * 1000;

type Callback = (err?: unknown) => void;

/**
 * Almacén de sesiones en PostgreSQL (tabla `sessions`). Sustituye al MemoryStore por
 * defecto, que pierde las sesiones al reiniciar y acumula memoria sin límite.
 */
export class PrismaSessionStore extends session.Store {
  private readonly pruneTimer: NodeJS.Timeout;

  constructor(private readonly db: Db) {
    super();
    this.pruneTimer = setInterval(() => void this.prune(), PRUNE_INTERVAL_MS);
    this.pruneTimer.unref();
  }

  private static expiry(sess: session.SessionData): Date {
    const expires = sess.cookie.expires;
    return expires ? new Date(expires) : new Date(Date.now() + ONE_DAY_MS);
  }

  /** Borra sesiones caducadas. */
  async prune(): Promise<void> {
    await this.db.session.deleteMany({ where: { expiresAt: { lte: new Date() } } }).catch(() => {});
  }

  override get(
    sid: string,
    callback: (err: unknown, session?: session.SessionData | null) => void,
  ): void {
    this.db.session
      .findFirst({ where: { sid, expiresAt: { gt: new Date() } }, select: { data: true } })
      .then((row) => callback(null, row ? (row.data as unknown as session.SessionData) : null))
      .catch((error: unknown) => callback(error));
  }

  override set(sid: string, sess: session.SessionData, callback?: Callback): void {
    const data = JSON.parse(JSON.stringify(sess)) as Prisma.InputJsonValue;
    const expiresAt = PrismaSessionStore.expiry(sess);
    this.db.session
      .upsert({ where: { sid }, create: { sid, data, expiresAt }, update: { data, expiresAt } })
      .then(() => callback?.())
      .catch((error: unknown) => callback?.(error));
  }

  override destroy(sid: string, callback?: Callback): void {
    this.db.session
      .deleteMany({ where: { sid } })
      .then(() => callback?.())
      .catch((error: unknown) => callback?.(error));
  }

  override touch(sid: string, sess: session.SessionData, callback?: Callback): void {
    this.db.session
      .updateMany({ where: { sid }, data: { expiresAt: PrismaSessionStore.expiry(sess) } })
      .then(() => callback?.())
      .catch((error: unknown) => callback?.(error));
  }

  close(): void {
    clearInterval(this.pruneTimer);
  }
}
