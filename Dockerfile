# syntax=docker/dockerfile:1

# ---------- Base ----------
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---------- Dependencias (todas, para compilar) ----------
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

# ---------- Compilación ----------
FROM deps AS build
COPY apps ./apps
RUN npm run build -w apps/api && npm run build -w apps/web

# ---------- Dependencias de producción ----------
FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/api/prisma apps/api/prisma
RUN npm ci --omit=dev -w apps/api --include-workspace-root=false \
    && npx -w apps/api prisma generate \
    && npx -w apps/api prisma version \
    && npm cache clean --force

# ---------- Imagen final ----------
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    WEB_DIST=/app/apps/web/dist \
    UPLOADS_DIR=/app/uploads \
    NPM_CONFIG_UPDATE_NOTIFIER=false

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps /app/package.json ./package.json
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh

RUN chmod +x /usr/local/bin/entrypoint.sh \
    && mkdir -p /app/uploads && chown -R node:node /app/uploads

USER node
WORKDIR /app/apps/api
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "dist/src/main.js"]
