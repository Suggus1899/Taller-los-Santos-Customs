import type { Response } from 'express';

export interface PageData {
  /** Título de la página (se añade el nombre del taller). */
  title: string;
  /** Meta description; si falta se usa la del sitio. */
  description?: string;
  /** Plantilla de layout: el público o el del panel. */
  layout?: 'layout' | 'admin/layout';
  /** Evita que los buscadores indexen la página (formularios, panel, confirmaciones). */
  noindex?: boolean;
  [key: string]: unknown;
}

function renderToString(res: Response, view: string, locals: object): Promise<string> {
  return new Promise((resolve, reject) => {
    res.render(view, locals, (error: Error | null, html?: string) =>
      error ? reject(error) : resolve(html ?? ''),
    );
  });
}

/**
 * Renderiza una vista dentro del layout. EJS no tiene layouts propios: primero se
 * genera el HTML de la vista y luego se inserta en la plantilla común como `body`.
 * Devuelve una promesa: Express 5 envía al manejador de errores cualquier rechazo.
 */
export async function renderPage(
  res: Response,
  view: string,
  data: PageData,
  status = 200,
): Promise<void> {
  const { layout = 'layout', ...rest } = data;
  const locals = { ...rest, status };
  const body = await renderToString(res, view, locals);
  const html = await renderToString(res, layout, { ...locals, body });
  res.status(status).type('html').send(html);
}
