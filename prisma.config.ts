import path from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 moved the Migrate/Introspect connection URL out of schema.prisma
 * and into this file. It is ONLY used by the CLI (`prisma migrate`,
 * `prisma db`, `prisma studio`) - the running app connects through the
 * `PrismaPg` driver adapter in `src/lib/db.ts`, so a deploy that only runs
 * the built app never needs this file.
 *
 * `DATABASE_URL` must be a real PostgreSQL URL to run migrations. Locally,
 * spin one up with `docker compose up -d db` (see docker-compose.yml).
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
  },
  datasource: {
    // Empty string when unset so `prisma validate` / `prisma generate` work
    // in dev and CI without a database. Migrate/Studio need a real URL.
    // DIRECT_DATABASE_URL, when set, is a connection that bypasses the host's
    // connection pooler (e.g. Neon's "-pooler" endpoint), which migrations
    // need; the app itself keeps using the pooled DATABASE_URL.
    url: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '',
    // Only needed for `prisma migrate dev` (authoring new migrations locally).
    // `prisma migrate deploy` in production does not use it.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
