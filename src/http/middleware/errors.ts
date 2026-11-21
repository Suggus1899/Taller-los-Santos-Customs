import type { ErrorRequestHandler, RequestHandler } from 'express';
import { logger } from '../../lib/logger.js';
import { captureException } from '../../lib/sentry.js';
import { renderPage } from '../render.js';

export const notFoundHandler: RequestHandler = async (_req, res) => {
  await renderPage(
    res,
    'pages/error',
    {
      title: 'Página no encontrada',
      heading: 'Página no encontrada',
      message: 'La página que buscas no existe o cambió de dirección.',
      noindex: true,
    },
    404,
  );
};

function hasStatus(error: unknown): error is { status: number; code?: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { status?: unknown }).status === 'number'
  );
}

export function errorHandler(isProduction: boolean): ErrorRequestHandler {
  return async (error: unknown, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    if (hasStatus(error) && error.code === 'EBADCSRFTOKEN') {
      await renderPage(
        res,
        'pages/error',
        {
          title: 'Formulario caducado',
          heading: 'El formulario caducó',
          message: 'Por seguridad, vuelve a cargar la página y envía el formulario de nuevo.',
          noindex: true,
        },
        403,
      );
      return;
    }

    const status =
      hasStatus(error) && error.status >= 400 && error.status < 600 ? error.status : 500;
    if (status >= 500) {
      (req.log ?? logger).error({ err: error }, 'error no controlado');
      captureException(error, { requestId: String(req.id ?? '') });
    }

    await renderPage(
      res,
      'pages/error',
      {
        title: status >= 500 ? 'Error del servidor' : 'Solicitud no válida',
        heading: status >= 500 ? 'Algo salió mal' : 'Solicitud no válida',
        message:
          status >= 500
            ? 'Tuvimos un problema al procesar tu solicitud. Inténtalo de nuevo en unos minutos.'
            : 'No pudimos procesar tu solicitud.',
        // Nunca mostramos detalles internos en producción.
        detail: !isProduction && error instanceof Error ? error.stack : undefined,
        noindex: true,
      },
      status,
    ).catch(() => res.status(status).type('text').send('Error'));
  };
}
