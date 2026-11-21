import type { ClientRateLimitInfo, Options, Store } from 'express-rate-limit';
import type { Db } from '../../db/client.js';

/**
 * Almacén de express-rate-limit en PostgreSQL (tabla UNLOGGED `rate_limits`).
 * Con el almacén en memoria cada instancia lleva su propia cuenta y el límite
 * real se multiplica por el número de instancias; aquí todas comparten contador.
 *
 * El incremento es una única sentencia atómica (INSERT … ON CONFLICT … RETURNING),
 * sin condiciones de carrera entre instancias.
 */
export class PostgresRateLimitStore implements Store {
  private windowMs = 60_000;
  readonly localKeys = false;

  constructor(
    private readonly db: Db,
    /** Prefijo para separar limitadores (formularios, login, API…). */
    readonly prefix: string,
  ) {}

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private key(key: string): string {
    return `${this.prefix}:${key}`;
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const row = await this.db.rateLimit.findUnique({ where: { key: this.key(key) } });
    if (!row || row.resetAt <= new Date()) return undefined;
    return { totalHits: row.hits, resetTime: row.resetAt };
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const resetAt = new Date(Date.now() + this.windowMs);
    const [row] = await this.db.$queryRaw<{ hits: number; reset_at: Date }[]>`
      INSERT INTO rate_limits (key, hits, reset_at) VALUES (${this.key(key)}, 1, ${resetAt})
      ON CONFLICT (key) DO UPDATE SET
        hits     = CASE WHEN rate_limits.reset_at <= now() THEN 1 ELSE rate_limits.hits + 1 END,
        reset_at = CASE WHEN rate_limits.reset_at <= now() THEN EXCLUDED.reset_at ELSE rate_limits.reset_at END
      RETURNING hits, reset_at`;
    if (!row) throw new Error('No se pudo actualizar el contador de rate limit');
    return { totalHits: row.hits, resetTime: row.reset_at };
  }

  async decrement(key: string): Promise<void> {
    await this.db.$executeRaw`
      UPDATE rate_limits SET hits = GREATEST(hits - 1, 0) WHERE key = ${this.key(key)}`;
  }

  async resetKey(key: string): Promise<void> {
    await this.db.rateLimit.deleteMany({ where: { key: this.key(key) } });
  }
}
