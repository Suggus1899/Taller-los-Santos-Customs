import type { Promotion, Service } from '../content/services.js';
import type { ContentRepository } from '../repositories/content.js';

interface Snapshot {
  services: Service[];
  promotions: Promotion[];
  loadedAt: number;
}

/**
 * Caché en memoria del catálogo público. El contenido cambia pocas veces al día y
 * se lee en cada página (menú, pie, catálogo), así que evita consultas repetidas.
 * - El panel llama a `invalidate()` al guardar: la instancia que edita lo ve al momento.
 * - El TTL corto hace que las demás instancias se actualicen en segundos.
 */
export class ContentCache {
  private snapshot: Snapshot | null = null;
  private loading: Promise<Snapshot> | null = null;

  constructor(
    private readonly repo: ContentRepository,
    private readonly ttlMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  private async load(): Promise<Snapshot> {
    const [services, promotions] = await Promise.all([
      this.repo.listServices(),
      this.repo.listVisiblePromotions(new Date(this.now())),
    ]);
    this.snapshot = { services, promotions, loadedAt: this.now() };
    return this.snapshot;
  }

  private async get(): Promise<Snapshot> {
    if (this.snapshot && this.now() - this.snapshot.loadedAt < this.ttlMs) return this.snapshot;
    this.loading ??= this.load().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  async services(): Promise<Service[]> {
    return (await this.get()).services;
  }

  async service(slug: string): Promise<Service | undefined> {
    return (await this.services()).find((s) => s.slug === slug);
  }

  async promotions(): Promise<Promotion[]> {
    return (await this.get()).promotions;
  }

  invalidate(): void {
    this.snapshot = null;
  }
}
