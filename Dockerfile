# syntax=docker/dockerfile:1.7
# Etapas:
#   deps     → todas las dependencias (necesarias para compilar)
#   build    → genera el cliente de Prisma y compila CSS, cliente y servidor
#   migrate  → imagen con la CLI de Prisma para `prisma migrate deploy` (target aparte)
#   runtime  → solo dependencias de producción + artefactos compilados, usuario sin privilegios
# La imagen runtime sirve para la web (CMD por defecto) y para el worker (node dist/worker.js).

ARG NODE_VERSION=22.23.5-bookworm-slim

FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM deps AS build
COPY . .
RUN npx prisma generate && npm run build

# Migraciones: lleva la CLI de Prisma (devDependency), que no hace falta en runtime.
# El motor de migraciones es un binario nativo que necesita OpenSSL y se descarga en
# el build (no en ejecución, donde el usuario sin privilegios no puede escribir).
FROM deps AS migrate
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN DATABASE_URL=postgresql://build@localhost/build npx prisma version >/dev/null
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app

COPY package.json package-lock.json ./
# --omit=optional: la CLI de Prisma, typescript y sus dependencias figuran en el lockfile como
# "devOptional" (devDependencies y a la vez peers opcionales de @prisma/client), así que
# --omit=dev solo no las quita. No hacen falta: el cliente ya viene compilado en dist/generated.
RUN npm ci --omit=dev --omit=optional --ignore-scripts && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/views ./views

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
