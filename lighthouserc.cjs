/**
 * Lighthouse CI: audita páginas clave del build de producción y falla si la
 * accesibilidad, las buenas prácticas o el SEO bajan de los umbrales.
 * El rendimiento solo avisa: en CI compartido varía según la carga de la máquina.
 * Uso: npm run build && npx @lhci/cli@0.16.1 autorun
 */
const port = process.env.LHCI_PORT ?? '3600';
const base = `http://127.0.0.1:${port}`;

module.exports = {
  ci: {
    collect: {
      startServerCommand: 'node dist/server.js',
      startServerReadyPattern: 'escuchando',
      startServerReadyTimeout: 30000,
      url: [`${base}/`, `${base}/servicios/frenos`, `${base}/cita`, `${base}/cotizar`],
      numberOfRuns: 1,
      settings: {
        chromeFlags: '--no-sandbox --headless=new',
        // El mapa embebido es de un tercero: no se audita.
        blockedUrlPatterns: ['*google.com/maps*'],
      },
    },
    assert: {
      assertions: {
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['error', { minScore: 0.9 }],
        'categories:seo': ['error', { minScore: 0.9 }],
        'categories:performance': ['warn', { minScore: 0.9 }],
      },
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci' },
  },
};
