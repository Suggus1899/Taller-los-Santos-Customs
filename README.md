# Taller Los Santos

Sitio web y panel de gestión de un taller mecánico en Cagua (Aragua, Venezuela). Los clientes consultan servicios y precios, agendan citas, piden cotizaciones y escriben al taller. El equipo gestiona todo desde un panel privado con roles.

Proyecto iniciado en la asignatura Programación II (UNERG, sección 4) y reescrito en TypeScript con prácticas de producción.

## Stack

| Capa                      | Tecnología                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------- |
| Servidor                  | Node.js 22, Express 5, TypeScript estricto (ESM)                                      |
| Vistas                    | EJS renderizado en servidor + Tailwind CSS v4                                         |
| Datos                     | PostgreSQL 16 + Prisma 7 (adaptador `pg`, sin motor nativo en runtime)                |
| Trabajos en segundo plano | Cola propia sobre PostgreSQL (outbox transaccional) + proceso `worker`                |
| Validación                | Zod (formularios, entorno, JSONB y respuestas de APIs externas)                       |
| Seguridad                 | helmet (CSP estricta), CSRF, rate limiting compartido, scrypt, sesiones en BD, roles  |
| Observabilidad            | pino (logs JSON con request id), `/healthz` y `/readyz`, Sentry opcional              |
| Calidad                   | Vitest + supertest, Playwright (E2E), Lighthouse CI, ESLint, Prettier, GitHub Actions |
| Despliegue                | Dockerfile multi-stage (web, worker y migraciones), docker compose                    |

## Funcionalidades

- **Catálogo y promociones editables desde el panel**: precios en USD con su equivalente en bolívares (tasa BCV). Las promociones tienen fechas de vigencia.
- **Citas en línea**: muestran los turnos disponibles, y un índice único parcial en la BD bloquea las dobles reservas.
- **Correos automáticos**:
  - al cliente: confirmación al reservar, aviso cuando la cita se confirma o cancela, y recordatorio la tarde anterior;
  - al equipo: aviso de cada cita, cotización o mensaje nuevo.
- **Cotizador**: el precio se calcula siempre en el servidor.
- **API de la tasa del dólar** (`/api/tasa-dolar`): caché, respaldo en BD y actualización periódica desde el worker.
- **Panel `/admin` con roles**:
  - **Personal**: gestiona citas, cotizaciones y mensajes.
  - **Administrador**: además, el contenido, los usuarios y el estado de la cola.
  - Todo cambio queda en la auditoría.
- **Privacidad**:
  - Google Analytics solo se carga con consentimiento (el banner funciona sin JavaScript).
  - Página `/privacidad`.
  - Retención automática de datos: se borran pasados `DATA_RETENTION_MONTHS`.
- **Mejora progresiva**: todo funciona sin JavaScript; los scripts de cliente (TypeScript) solo mejoran la experiencia.
- **SEO**: URLs en español, `sitemap.xml`, `robots.txt`, datos estructurados `AutoRepair` y redirecciones 301 desde las URLs antiguas.

## Puesta en marcha

Requisitos: Node.js ≥ 22.9 y PostgreSQL 16 (o Docker).

```bash
cp .env.example .env          # y completa SESSION_SECRET
docker compose up -d db       # PostgreSQL en localhost:5432 (crea también taller_test)
npm install                   # genera el cliente de Prisma
npm run db:migrate            # aplica las migraciones (incluye el catálogo inicial)
npm run db:seed               # (opcional) citas y mensajes de demostración
npm run create-admin -- --username tu-usuario --role ADMIN
```

Desarrollo:

```bash
npm run dev          # web con recarga (tsx)
npm run dev:worker   # cola de trabajos: correos, recordatorios, tasa, retención
npm run dev:css      # Tailwind en modo watch
npm run dev:client   # TypeScript del navegador en modo watch
```

### Producción con Docker

```bash
docker compose --profile app up -d --build   # migraciones → web + worker
```

La imagen `runtime` (web y worker) solo lleva dependencias de producción y se ejecuta con un usuario sin privilegios, con `HEALTHCHECK` sobre `/healthz`. La imagen `migrate` lleva la CLI de Prisma y ejecuta `prisma migrate deploy` antes de que arranquen la web y el worker.

> La cookie de sesión es `Secure` en producción: sirve la app por HTTPS y define `TRUST_PROXY=1` si hay un proxy delante (Nginx, Render, Railway…).

## Scripts

| Script                                       | Qué hace                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| `dev`, `dev:worker`, `dev:css`, `dev:client` | Desarrollo con recarga                                                   |
| `build`                                      | Compila CSS (Tailwind), cliente y servidor a `public/` y `dist/`         |
| `start` / `worker`                           | Arranca la web / el worker compilados                                    |
| `db:migrate` / `db:deploy`                   | Migraciones en desarrollo / producción                                   |
| `db:seed` / `db:studio`                      | Datos de demostración / explorador de Prisma                             |
| `create-admin`                               | Crea o actualiza un usuario del panel (pide la contraseña sin mostrarla) |
| `test`                                       | Tests unitarios y de integración (PostgreSQL real)                       |
| `test:e2e`                                   | Tests en navegador con Playwright (requiere `npm run build`)             |
| `lint`, `typecheck`, `format`                | Calidad                                                                  |

## Arquitectura

```
src/
├── server.ts / worker.ts   # Procesos: web HTTP y cola de trabajos (se despliegan por separado)
├── bootstrap.ts            # Raíz de composición compartida: crea y conecta las dependencias
├── app.ts                  # createApp(deps): middlewares y routers, sin estado global
├── config/                 # env.ts (validado con Zod), site.ts, paths.ts
├── use-cases/              # Operaciones de negocio: transacción + correos encolados
├── repositories/           # Acceso a datos por agregado (citas, contenido, usuarios, cola…)
├── jobs/                   # Cola (outbox), manejadores, planificador de tareas periódicas
├── services/               # Agenda, contraseñas, correo, tasa del dólar, caché de contenido
├── http/
│   ├── routes/             # pages, forms, api, seo, privacy, health, admin/*
│   ├── middleware/         # seguridad, auth y roles, rate limit (store en PG), logs, errores
│   ├── validation.ts       # Formularios públicos
│   └── admin-forms.ts      # Formularios del panel
├── lib/                    # logger (pino) y Sentry
├── content/                # Contenido estático tipado y esquemas del catálogo
├── client/                 # TypeScript del navegador → public/js
└── styles/main.css         # Tailwind v4 → public/css
views/ · prisma/ · tests/ · e2e/
```

**Flujo de una reserva.** La ruta valida con Zod y llama a `useCases.bookAppointment()`. Este caso de uso abre una única transacción con cuatro pasos:

1. Crea o actualiza el cliente.
2. Crea o reutiliza el vehículo.
3. Crea la cita.
4. Encola en `jobs` el correo al cliente y el aviso al equipo.

El worker procesa la cola con `FOR UPDATE SKIP LOCKED`, de modo que admite varias réplicas. Reintenta con backoff exponencial, y los trabajos fallidos se ven y se reintentan desde **Panel → Sistema**.

### Decisiones

- **Cola sobre PostgreSQL en lugar de Redis o pg-boss.** El trabajo se encola en la _misma transacción_ que el dato de negocio. Así nunca hay una cita sin su correo ni un correo de una cita que no se guardó. Además, no hay infraestructura nueva que mantener.
- **Rate limit compartido en PostgreSQL** (tabla `UNLOGGED`). El límite es el mismo con una o con varias instancias. El incremento es una sola sentencia atómica (`INSERT … ON CONFLICT … RETURNING`).
- **Contenido en BD con documentos JSONB.** Los planes, bloques y preguntas frecuentes se leen y escriben junto al servicio, así que no necesitan tablas propias. Se validan con Zod al guardar _y_ al leer. Las citas referencian el servicio por clave foránea.
- **Caché de contenido en memoria con TTL corto.** Se invalida al editar desde el panel. Las demás instancias se actualizan en segundos.
- **Sesión revalidada en cada petición.** Desactivar o degradar a un usuario surte efecto al instante.

### Modelo de datos

- **Eje del modelo:** `Customer`. Citas, cotizaciones y mensajes se vinculan al cliente, identificado por correo.
- **Dinero:** en centavos; las tasas de cambio usan `Decimal(18,4)`. Los estados son enums de PostgreSQL.
- **Auditoría:** `AuditLog` registra los inicios de sesión, los cambios de estado, la edición de contenido, la gestión de usuarios y los reintentos de trabajos.
- **Restricciones en la BD:** índice único parcial de turnos, índice parcial de trabajos pendientes y `CHECK` sobre correos, horas, importes, slugs, ventanas de vigencia y tipos JSONB.

## API

```http
GET /api/tasa-dolar
GET /api/tasa-dolar/convertir?monto=69&fuente=oficial|paralelo
```

- **Fuente:** [DolarApi](https://ve.dolarapi.com).
- **Validación:** la respuesta del proveedor se valida con Zod.
- **Disponibilidad:** caché _stale-while-revalidate_; si el proveedor falla, se usa la última tasa guardada (`stale: true`).
- **Límite:** 60 peticiones por minuto por IP.
- **Errores:** siempre en JSON.

## Observabilidad

- **Logs**: JSON estructurado con pino (legibles con `pino-pretty` en desarrollo), sin cuerpos ni cookies. Cada petición lleva un `X-Request-Id`, que se respeta si lo envía el proxy y se devuelve en la respuesta.
- **Sondas**:
  - `/healthz` (liveness): no consulta dependencias.
  - `/readyz` (readiness): comprueba la BD.
- **Errores**: los 5xx y los trabajos fallidos se registran y, si hay `SENTRY_DSN`, se envían a Sentry.

## Seguridad

- **CSP estricta**: no hay scripts ni estilos inline; el indicador `js` se carga desde un archivo propio.
- **Protecciones**: CSRF en todos los formularios, campo trampa anti-spam y límites por IP compartidos.
- **Contraseñas**:
  - scrypt con salt;
  - tiempo de respuesta constante aunque el usuario no exista;
  - mínimo de 12 caracteres;
  - cada usuario puede cambiar la suya.
- **Sesión**:
  - se regenera al iniciar sesión;
  - logout por POST;
  - cookie `HttpOnly`/`SameSite`;
  - roles revalidados en cada petición;
  - siempre debe quedar al menos un administrador activo.
- **Redirecciones y enlaces**: solo internos (login, consentimiento y botones de las promociones).
- **Datos personales**: no se guardan IPs ni geolocalización, y se aplica retención automática.

## Tests

```bash
npm test                          # 94 tests (requiere PostgreSQL; TEST_DATABASE_URL termina en _test)
npm run build && npm run test:e2e # Playwright: escritorio y móvil (E2E_DATABASE_URL)
npx @lhci/cli@0.16.1 autorun      # Lighthouse con umbrales (tras npm run build)
```

Cubren:

- **Integración:** formularios, CSRF, roles, panel, auditoría, cola (rollback, reintentos, `SKIP LOCKED`, deduplicación), tareas programadas, retención, límite compartido entre instancias, consentimiento, sondas, API del dólar y cabeceras de seguridad.
- **E2E:** flujos completos en navegador.
- **Lighthouse:** falla el CI si la accesibilidad baja de 95 o las buenas prácticas o el SEO bajan de 90.

## Créditos

- **Fuentes**: Inter y Outfit (SIL OFL 1.1), alojadas en el propio servidor.
- **Iconos**: propios y derivados de [Lucide](https://lucide.dev) (ISC).
- **Fotografías**: de stock. Sustitúyelas por fotos reales del taller antes de publicar.
