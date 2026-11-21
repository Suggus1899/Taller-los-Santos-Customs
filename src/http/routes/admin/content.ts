import { Router, type Response } from 'express';
import { imageKeys, serviceIcons, type Service } from '../../../content/services.js';
import { isUniqueViolation } from '../../../db/client.js';
import { images } from '../../../content/images.js';
import { parsePromotionForm, parseServiceForm } from '../../admin-forms.js';
import type { AppContext } from '../../context.js';
import { currentUser } from '../../middleware/auth.js';
import { renderPage } from '../../render.js';
import { idParam, noticeFrom, withNotice } from './shared.js';

/** Filas en blanco que se añaden al formulario para poder agregar elementos. */
const BLANK_ROWS = { plans: 1, info: 1, faqs: 2 };

const emptyService = (): Omit<Service, 'id'> => ({
  slug: '',
  name: '',
  icon: 'wrench',
  summary: '',
  intro: '',
  plans: [],
  info: [],
  faqs: [],
  isActive: false,
  sortOrder: 100,
});

/** Contenido del sitio: servicios y promociones (solo ADMIN). */
export function contentRouter(ctx: AppContext): Router {
  const router = Router();
  const { repos, content } = ctx;
  const imageOptions = imageKeys.map((key) => ({ value: key, label: images[key].alt }));

  router.get('/', async (req, res) => {
    const [services, promotions] = await Promise.all([
      repos.content.listServices({ includeInactive: true }),
      repos.content.listPromotions(),
    ]);
    await renderPage(res, 'admin/content', {
      title: 'Contenido',
      layout: 'admin/layout',
      section: 'contenido',
      services,
      promotions,
      flash: noticeFrom(req.query),
      noindex: true,
    });
  });

  // ─────────────────────────────── Servicios ───────────────────────────────

  const renderServiceForm = (
    res: Response,
    service: Omit<Service, 'id'>,
    options: { isNew: boolean; errors?: string[] },
  ) =>
    renderPage(
      res,
      'admin/service-form',
      {
        title: options.isNew ? 'Nuevo servicio' : `Editar: ${service.name}`,
        layout: 'admin/layout',
        section: 'contenido',
        service,
        isNew: options.isNew,
        errors: options.errors ?? [],
        icons: serviceIcons,
        imageOptions,
        blankRows: BLANK_ROWS,
        noindex: true,
      },
      options.errors?.length ? 422 : 200,
    );

  router.get('/servicios/nuevo', (_req, res) =>
    renderServiceForm(res, emptyService(), { isNew: true }),
  );

  router.post('/servicios/nuevo', async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
    const parsed = parseServiceForm(body, slug);
    if (!parsed.ok)
      return renderServiceForm(res, parsed.draft, { isNew: true, errors: parsed.errors });
    try {
      await repos.content.createService(parsed.data);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return renderServiceForm(res, parsed.data, {
        isNew: true,
        errors: ['Ya existe un servicio con esa URL.'],
      });
    }
    await repos.audit.write({
      action: 'CREATED',
      entityType: 'SERVICE',
      userId: currentUser(req).id,
      metadata: { slug },
    });
    content.invalidate();
    res.redirect(303, withNotice('/admin/contenido', `Servicio "${parsed.data.name}" creado.`));
  });

  router.get('/servicios/:slug', async (req, res, next) => {
    const service = await repos.content.findService(req.params.slug);
    if (!service) return next();
    await renderServiceForm(res, service, { isNew: false });
  });

  router.post('/servicios/:slug', async (req, res, next) => {
    const existing = await repos.content.findService(req.params.slug);
    if (!existing) return next();
    const parsed = parseServiceForm(req.body as Record<string, unknown>, existing.slug);
    if (!parsed.ok)
      return renderServiceForm(res, parsed.draft, { isNew: false, errors: parsed.errors });
    await repos.content.updateService(existing.slug, parsed.data);
    await repos.audit.write({
      action: 'UPDATED',
      entityType: 'SERVICE',
      entityId: existing.id,
      userId: currentUser(req).id,
      metadata: { slug: existing.slug },
    });
    content.invalidate();
    res.redirect(303, withNotice('/admin/contenido', `Servicio "${parsed.data.name}" guardado.`));
  });

  // ────────────────────────────── Promociones ──────────────────────────────

  const renderPromotionForm = (
    res: Response,
    promotion: Record<string, unknown>,
    options: { id: number | null; errors?: string[] },
  ) =>
    renderPage(
      res,
      'admin/promotion-form',
      {
        title: options.id ? 'Editar promoción' : 'Nueva promoción',
        layout: 'admin/layout',
        section: 'contenido',
        promotion,
        promotionId: options.id,
        errors: options.errors ?? [],
        noindex: true,
      },
      options.errors?.length ? 422 : 200,
    );

  router.get('/promociones/nueva', (_req, res) =>
    renderPromotionForm(
      res,
      { isActive: true, sortOrder: 100, ctaLabel: 'Agendar cita', ctaHref: '/cita' },
      { id: null },
    ),
  );

  router.get('/promociones/:id', async (req, res, next) => {
    const id = idParam.safeParse(req.params.id);
    const promotion = id.success ? await repos.content.findPromotion(id.data) : null;
    if (!promotion || !id.success) return next();
    await renderPromotionForm(
      res,
      { ...promotion, ctaLabel: promotion.cta.label, ctaHref: promotion.cta.href },
      { id: id.data },
    );
  });

  router.post(['/promociones/nueva', '/promociones/:id'], async (req, res, next) => {
    const rawId = req.params.id;
    const id = rawId === undefined ? null : idParam.safeParse(rawId);
    if (id && !id.success) return next();
    const promotionId = id?.data ?? null;
    if (promotionId !== null && !(await repos.content.findPromotion(promotionId))) return next();

    const body = req.body as Record<string, unknown>;
    const parsed = parsePromotionForm(body);
    if (!parsed.ok)
      return renderPromotionForm(res, body, { id: promotionId, errors: parsed.errors });

    const savedId = await repos.content.savePromotion(promotionId, parsed.data);
    await repos.audit.write({
      action: promotionId === null ? 'CREATED' : 'UPDATED',
      entityType: 'PROMOTION',
      entityId: savedId,
      userId: currentUser(req).id,
    });
    content.invalidate();
    res.redirect(303, withNotice('/admin/contenido', 'Promoción guardada.'));
  });

  router.post('/promociones/:id/eliminar', async (req, res) => {
    const id = idParam.safeParse(req.params.id);
    const deleted = id.success && (await repos.content.deletePromotion(id.data));
    if (deleted && id.success) {
      await repos.audit.write({
        action: 'DELETED',
        entityType: 'PROMOTION',
        entityId: id.data,
        userId: currentUser(req).id,
      });
      content.invalidate();
    }
    res.redirect(
      303,
      withNotice('/admin/contenido', deleted ? 'Promoción eliminada.' : 'La promoción no existe.'),
    );
  });

  return router;
}
