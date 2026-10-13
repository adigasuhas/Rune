# syntax=docker/dockerfile:1

# ---------- deps ----------
FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# postinstall runs `prisma generate`
RUN npm ci

# ---------- build ----------
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# JWT_SECRET is only read at request time; a placeholder is fine for `next build`.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------- runtime ----------
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Chromium for the notebook PDF export (puppeteer-core needs a browser binary).
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium fonts-liberation ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Non-root user + a persistent data dir (uploads + audit log).
RUN groupadd -r rune && useradd -r -g rune rune \
  && mkdir -p /data && chown -R rune:rune /data
ENV RUNE_DATA_DIR=/data

# Standalone output: server + minimal node_modules + static assets.
COPY --from=build --chown=rune:rune /app/.next/standalone ./
COPY --from=build --chown=rune:rune /app/.next/static ./.next/static
COPY --from=build --chown=rune:rune /app/public ./public
# Prisma migrations + engine, so `npm run db:migrate` works in the container.
COPY --from=build --chown=rune:rune /app/prisma ./prisma
COPY --from=build --chown=rune:rune /app/prisma.config.ts ./prisma.config.ts
COPY --from=build --chown=rune:rune /app/node_modules/prisma ./node_modules/prisma
COPY --from=build --chown=rune:rune /app/node_modules/@prisma ./node_modules/@prisma

USER rune
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Apply migrations, then start the server.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node server.js"]
