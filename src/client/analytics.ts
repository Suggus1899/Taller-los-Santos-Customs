/**
 * Carga Google Analytics 4 solo si el servidor lo configuró (GA_MEASUREMENT_ID).
 * Va en un archivo propio porque la CSP no permite scripts inline.
 */
declare global {
  interface Window {
    dataLayer: unknown[];
  }
}

const id = document.querySelector<HTMLScriptElement>('script[data-ga-id]')?.dataset.gaId;

if (id && /^G-[A-Z0-9]+$/.test(id)) {
  window.dataLayer = window.dataLayer ?? [];
  // gtag espera el objeto `arguments`, no un array.
  const gtag = function (..._args: unknown[]) {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
  };
  gtag('js', new Date());
  gtag('config', id, { anonymize_ip: true });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.append(script);
}

export {};
