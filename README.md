# Taller Los Santos

Sitio web y panel de gestión de un taller mecánico en Cagua (Aragua, Venezuela). Los clientes consultan servicios y precios, agendan citas, piden cotizaciones y escriben al taller. El equipo gestiona todo desde un panel privado.

Proyecto iniciado en la asignatura Programación II (UNERG, sección 4) y reescrito en TypeScript con prácticas de producción.

## Stack

| Capa       | Tecnología                                                               |
| ---------- | ------------------------------------------------------------------------ |
| Servidor   | Node.js 22, Express 5, TypeScript estricto (ESM)                         |
| Vistas     | EJS renderizado en servidor + Tailwind CSS v4                            |
| Datos      | PostgreSQL 16 + Prisma 7 (adaptador `pg`, sin motor nativo)              |
| Validación | Zod (formularios, variables de entorno y respuestas de APIs externas)    |
| Seguridad  | helmet (CSP estricta), CSRF, rate limiting, scrypt, sesiones en BD       |
| Calidad    | Vitest + supertest, ESLint (typescript-eslint), Prettier, GitHub Actions |

## Funcionalidades

- Catálogo de servicios con planes y precios en USD y su equivalente en bolívares (tasa oficial BCV).
- **Citas en línea**: turnos de lunes a viernes, consulta de disponibilidad y bloqueo de dobles reservas en la base de datos.
- **Cotizador**: el precio se calcula siempre en el servidor; el navegador solo muestra una vista previa.
- Formulario de contacto, calculadora de ahorro de combustible, galería y promociones.
- **API de la tasa del dólar** (`/api/tasa-dolar`) con caché y respaldo en BD.
- **Panel `/admin`**: citas, cotizaciones y mensajes con filtros, cambio de estado y registro de auditoría.
- Todo funciona sin JavaScript; los scripts de cliente (TypeScript) solo mejoran la experiencia.
- SEO: URLs en español, `sitemap.xml`, `robots.txt`, datos estructurados `AutoRepair` y redirecciones 301 desde las URLs antiguas.

## Puesta en marcha

Requisitos: Node.js ≥ 22.9 y PostgreSQL 16 (o Docker).

```bash
cp .env.example .env          # y completa SESSION_SECRET
docker compose up -d          # PostgreSQL en localhost:5432 (crea también taller_test)
npm install                   # genera el cliente de Prisma
npm run db:migrate            # aplica las migraciones
npm run db:seed               # (opcional) datos de demostración
npm run create-admin -- --username tu-usuario --role ADMIN
```

Desarrollo (tres terminales, o solo la primera si no tocas estilos ni scripts de cliente):

```bash
npm run dev          # servidor con recarga (tsx)
npm run dev:css      # Tailwind en modo watch
npm run dev:client   # TypeScript del navegador en modo watch
```

Producción:

```bash
npm ci && npm run build && npm run db:deploy && npm start
```

> En producción la cookie de sesión es `Secure`: la app debe servirse por HTTPS. Si hay un proxy delante (Nginx, Render, Railway…), define `TRUST_PROXY=1`.

## Scripts

| Script                                | Qué hace                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `dev`, `dev:css`, `dev:client`        | Desarrollo con recarga                                                   |
| `build`                               | Compila CSS (Tailwind), cliente y servidor a `public/` y `dist/`         |
| `start`                               | Arranca `dist/server.js`                                                 |
| `db:migrate` / `db:deploy`            | Migraciones en desarrollo / producción                                   |
| `db:seed` / `db:studio`               | Datos de demostración / explorador de Prisma                             |
| `create-admin`                        | Crea o actualiza un usuario del panel (pide la contraseña sin mostrarla) |
| `test`, `lint`, `typecheck`, `format` | Calidad                                                                  |

## Arquitectura

```
src/
├── server.ts            # Arranque y cierre ordenado (composition root)
├── app.ts               # createApp(deps): middlewares y routers; sin estado global
├── config/              # env.ts (validado con Zod), site.ts (datos del negocio), paths.ts
├── content/             # Catálogo, tarifas, promociones, galería: contenido tipado
├── db/client.ts         # PrismaClient + utilidades
├── repositories/        # Acceso a datos por agregado (citas, cotizaciones, mensajes…)
├── services/            # Lógica sin HTTP: agenda, contraseñas, correo, tasa del dólar, sesiones
├── http/
│   ├── routes/          # pages, forms, admin, api, seo
│   ├── middleware/      # seguridad, auth, rate limit, errores
│   ├── validation.ts    # Esquemas Zod de los formularios
│   └── render.ts        # Vista + layout
├── client/              # TypeScript del navegador → public/js
└── styles/main.css      # Tailwind v4 (@theme + componentes) → public/css
views/                   # EJS: layout, partials, pages, admin
prisma/                  # schema.prisma, migraciones y seed
tests/                   # Unitarios e integración (Postgres real)
```

Las dependencias (BD, repositorios, notificador, servicio de tasas) se inyectan en `createApp`. Así los tests sustituyen el correo y el proveedor externo sin mocks globales.

### Modelo de datos

`Customer` es el eje: citas, cotizaciones y mensajes se vinculan al mismo cliente, identificado por su correo. Otras decisiones:

- **Dinero**: en centavos (`Int`). Las tasas de cambio usan `Decimal(18,4)` y nunca `float`.
- **Estados**: enums de PostgreSQL. Cada cambio hecho desde el panel queda en `AuditLog` (quién, cuándo, de qué a qué).
- **Turnos**: un índice único parcial `(scheduled_date, time_slot) WHERE status <> 'CANCELLED'` impide dos reservas del mismo turno aun con peticiones simultáneas.
- **Restricciones `CHECK`**: correos en minúsculas, formato de hora, importes no negativos y tasas positivas.
- **Identificadores**: las URLs públicas de confirmación usan UUID, no ids secuenciales.

## API

```http
GET /api/tasa-dolar
GET /api/tasa-dolar/convertir?monto=69&fuente=oficial|paralelo
```

```json
{
  "amountUsd": 69,
  "amountVes": 63394.87,
  "rate": 918.7662,
  "source": "oficial",
  "publishedAt": "2026-11-20T04:00:00.000Z",
  "stale": false
}
```

- **Fuente**: [DolarApi](https://ve.dolarapi.com). La respuesta externa se valida con Zod.
- **Caché**: _stale-while-revalidate_. Las páginas nunca esperan a la API externa. Si esta falla, se sirve la última tasa guardada con `stale: true` y se reintenta como mucho una vez por minuto.
- **Límites**: 60 peticiones por minuto por IP; los errores se devuelven en JSON.

## Seguridad

- **CSP estricta**: no hay scripts ni estilos inline.
- **Protecciones**: CSRF en todos los formularios, campo trampa anti-spam y límites por IP en formularios, login y API.
- **Contraseñas**: scrypt con salt. Tiempo de respuesta constante aunque el usuario no exista, para no revelar qué usuarios son válidos.
- **Sesión**: se regenera al iniciar sesión, el logout es por POST, la cookie es `HttpOnly` y `SameSite`, y las sesiones se guardan en PostgreSQL.
- **Redirecciones**: solo internas tras el login (sin _open redirect_).
- **Datos personales**: no se guardan IPs ni datos de geolocalización de los visitantes, y los logs no incluyen datos personales.

## Tests

```bash
npm test   # requiere PostgreSQL; usa TEST_DATABASE_URL (el nombre debe terminar en _test)
```

62 tests: unitarios (agenda, cotizador, contraseñas, validación) e integración sobre PostgreSQL real (formularios, CSRF, rate limit, panel, auditoría, API del dólar y cabeceras de seguridad).

## Créditos

- **Fuentes**: Inter y Outfit (SIL OFL 1.1), alojadas en el propio servidor.
- **Iconos**: propios y derivados de [Lucide](https://lucide.dev) (ISC).
- **Fotografías**: de stock. Sustitúyelas por fotos reales del taller antes de publicar.
