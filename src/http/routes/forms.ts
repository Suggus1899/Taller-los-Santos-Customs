import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  calculateEstimate,
  quoteExtras,
  quoteServices,
  vehicleTypes,
} from '../../content/quote.js';
import { SlotTakenError } from '../../repositories/appointments.js';
import {
  BOOKING_WINDOW_DAYS,
  addDays,
  timeSlots,
  todayInShopTimezone,
  validateBookingDate,
} from '../../services/schedule.js';
import { UnknownServiceError } from '../../use-cases/index.js';
import type { AppContext } from '../context.js';
import { renderPage } from '../render.js';
import {
  appointmentSchema,
  contactSchema,
  formValues,
  quoteSchema,
  toFieldErrors,
  type FieldErrors,
} from '../validation.js';

const publicIdSchema = z.uuid();

/** Un bot rellenó el campo trampa: fingimos éxito sin guardar nada. */
function isBot(req: Request): boolean {
  const value: unknown = (req.body as Record<string, unknown> | undefined)?.website;
  return typeof value === 'string' && value.length > 0;
}

const statusFor = (errors: FieldErrors) => (Object.keys(errors).length ? 422 : 200);

/**
 * Formularios públicos. Patrón PRG (Post/Redirect/Get): tras guardar se redirige
 * con 303 para que recargar la página no reenvíe el formulario.
 */
export function formsRouter(ctx: AppContext): Router {
  const router = Router();
  const { useCases, repos, content, limiters } = ctx;

  // ─────────────────────────────── Contacto ───────────────────────────────

  const renderContact = (res: Response, values = {}, errors: FieldErrors = {}) =>
    renderPage(
      res,
      'pages/contact',
      {
        title: 'Contacto',
        description: 'Escríbenos, llámanos o visítanos en Cagua, Aragua.',
        values,
        errors,
      },
      statusFor(errors),
    );

  router.get('/contacto', async (_req, res) => renderContact(res));

  router.post('/contacto', limiters.form, async (req, res) => {
    if (isBot(req)) return res.redirect(303, '/contacto/enviado');
    const parsed = contactSchema.safeParse(req.body);
    if (!parsed.success) {
      return renderContact(res, formValues(req.body), toFieldErrors(parsed.error));
    }
    const { name, email, phone, message } = parsed.data;
    await useCases.sendContactMessage({ customer: { name, email, phone }, message });
    res.redirect(303, '/contacto/enviado');
  });

  router.get('/contacto/enviado', async (_req, res) => {
    await renderPage(res, 'pages/success', {
      title: 'Mensaje enviado',
      heading: '¡Gracias por escribirnos!',
      message: 'Recibimos tu mensaje y te responderemos en horario laboral.',
      noindex: true,
    });
  });

  // ───────────────────────────────── Citas ─────────────────────────────────

  const renderAppointment = async (
    res: Response,
    values: Record<string, unknown> = {},
    errors: FieldErrors = {},
  ) => {
    const today = todayInShopTimezone();
    return renderPage(
      res,
      'pages/appointment',
      {
        title: 'Agendar cita',
        description: 'Reserva tu cita en línea en Taller Los Santos.',
        values,
        errors,
        timeSlots,
        bookingWindowDays: BOOKING_WINDOW_DAYS,
        minDate: addDays(today, 1),
        maxDate: addDays(today, BOOKING_WINDOW_DAYS),
      },
      statusFor(errors),
    );
  };

  router.get('/cita', async (req, res) => {
    const preselected = typeof req.query.servicio === 'string' ? req.query.servicio : '';
    const known = preselected && (await content.service(preselected));
    await renderAppointment(res, known ? { service: preselected } : {});
  });

  /** Turnos ocupados de un día, para que el navegador deshabilite esas horas. */
  router.get('/cita/disponibilidad', async (req, res) => {
    const date = typeof req.query.fecha === 'string' ? req.query.fecha : '';
    const error = validateBookingDate(date);
    if (error) {
      res.status(400).json({ error });
      return;
    }
    res
      .set('Cache-Control', 'no-store')
      .json({ date, taken: await repos.appointments.takenSlots(date) });
  });

  router.post('/cita', limiters.form, async (req, res) => {
    if (isBot(req)) return res.redirect(303, '/');
    const values = formValues(req.body);
    const parsed = appointmentSchema.safeParse(req.body);
    const errors = parsed.success ? {} : toFieldErrors(parsed.error);
    const dateError = validateBookingDate(values.date ?? '');
    if (dateError) errors.date ??= dateError;
    if (parsed.success && !(await content.service(parsed.data.service))) {
      errors.service = 'Elige un servicio.';
    }
    if (!parsed.success || Object.keys(errors).length) {
      return renderAppointment(res, values, errors);
    }

    const { name, email, phone, vehicle, service, date, time, notes } = parsed.data;
    try {
      const publicId = await useCases.bookAppointment({
        customer: { name, email, phone },
        vehicle,
        serviceSlug: service,
        date,
        timeSlot: time,
        notes,
      });
      res.redirect(303, `/cita/confirmada/${publicId}`);
    } catch (error) {
      if (error instanceof SlotTakenError) {
        return renderAppointment(res, values, {
          time: 'Ese horario acaba de ocuparse. Elige otro.',
        });
      }
      if (error instanceof UnknownServiceError) {
        return renderAppointment(res, values, { service: 'Ese servicio ya no está disponible.' });
      }
      throw error;
    }
  });

  router.get('/cita/confirmada/:publicId', async (req, res, next) => {
    const id = publicIdSchema.safeParse(req.params.publicId);
    const appointment = id.success ? await repos.appointments.findByPublicId(id.data) : null;
    if (!appointment) return next();
    await renderPage(res, 'pages/appointment-confirmed', {
      title: 'Cita registrada',
      appointment,
      noindex: true,
    });
  });

  // ────────────────────────────── Cotizaciones ─────────────────────────────

  const renderQuote = (
    res: Response,
    values: Record<string, unknown> = {},
    errors: FieldErrors = {},
  ) =>
    renderPage(
      res,
      'pages/quote',
      {
        title: 'Cotizador en línea',
        description: 'Calcula un precio estimado para tu vehículo en menos de un minuto.',
        values,
        errors,
        vehicleTypes,
        quoteServices,
        quoteExtras,
      },
      statusFor(errors),
    );

  router.get('/cotizar', async (_req, res) =>
    renderQuote(res, { vehicleType: 'sedan', extra: 'none' }),
  );

  router.post('/cotizar', limiters.form, async (req, res) => {
    if (isBot(req)) return res.redirect(303, '/');
    const parsed = quoteSchema.safeParse(req.body);
    if (!parsed.success) return renderQuote(res, formValues(req.body), toFieldErrors(parsed.error));

    const { name, email, phone, vehicleType, service, extra, notes } = parsed.data;
    const publicId = await useCases.requestQuote({
      customer: { name, email, phone },
      vehicleType,
      serviceCode: service,
      extraCode: extra,
      // El precio se calcula aquí, nunca se acepta del navegador.
      estimate: calculateEstimate({ vehicleType, service, extra }),
      notes,
    });
    res.redirect(303, `/cotizar/resultado/${publicId}`);
  });

  router.get('/cotizar/resultado/:publicId', async (req, res, next) => {
    const id = publicIdSchema.safeParse(req.params.publicId);
    const quote = id.success ? await repos.quotes.findByPublicId(id.data) : null;
    if (!quote) return next();
    await renderPage(res, 'pages/quote-result', { title: 'Tu cotización', quote, noindex: true });
  });

  return router;
}
