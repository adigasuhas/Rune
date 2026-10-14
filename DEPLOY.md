# Deploying Rune

Rune is a standard Next.js 16 app. It needs two things in production:

1. **A PostgreSQL database** (`DATABASE_URL`). It is the only datastore, with no file-based fallback.
2. **A session signing key** (`JWT_SECRET`).

The server refuses to start if either is missing in `NODE_ENV=production`, and tells you exactly what is wrong (`src/lib/env.ts`).

**Two more settings you should set: `RUNE_BASE_URL` (the public address) and `RUNE_SIGNUP_MODE` (who may register).** Sign-in is email and password only, out of the box - nothing external to configure. Outbound email for password resets is an optional extra (§1).

---

## 0. The easy way: `npm run setup`

```bash
npm install
npm run setup
```

It asks where Rune will run (this computer, your own server/Docker, Vercel, Netlify, or another host) and writes the configuration for that place: the address or port, the database, a signing secret, the sign-up policy, and optionally outbound email. It can then create the database tables, your first administrator account, and download the local dictation model. Re-running it is safe: it keeps your existing secret and backs up the file first. For hosts configured through a dashboard (Vercel, Netlify, others) it writes `.env.<host>` for you to copy values from, so production credentials never mix into your laptop's `.env`. `npm run setup -- --help` lists the flags for scripted use.

The rest of this guide explains what it configures, if you'd rather do it by hand.

---

## 1. Sign-in: what to decide

**Who can sign up (`RUNE_SIGNUP_MODE`)**

| Value | Meaning |
|---|---|
| `open` | Anyone who can reach the site can create an account. The default. Fine on your own computer or a private network. |
| `domains` | Only emails at `RUNE_ALLOWED_EMAIL_DOMAINS` (e.g. `lab.edu,company.com`). For a lab or company. |
| `closed` | No self-registration; an administrator creates accounts. Safest for a public site, and what `npm run setup` picks for anything that isn't your own computer. |

A typo fails closed. Existing accounts are never affected. An address in `RUNE_ADMIN_EMAILS` may always register (that is how the first admin gets in on Docker, Vercel and Netlify, where there is no shell). Everything about accounts, passwords and pre-registration is in [docs/ADMINISTRATOR_GUIDE.md](docs/ADMINISTRATOR_GUIDE.md) §1a.

**The public address (`RUNE_BASE_URL`)**

Set it to where people reach Rune: `https://rune.example.com`, `https://my-rune.vercel.app`, or `http://localhost:3000`. Rune builds every redirect and password-reset link from it, so moving to a new domain or port is a one-variable change; nothing is hardcoded to `localhost:3000`. Unset, Rune falls back to the request's own host, which works on Vercel/Netlify/localhost but not behind a reverse proxy or in a container.

### Optional: outbound email for password resets

**Not required.** "Forgot your password?" on the sign-in page always works: without SMTP configured, the reset link is written to the server's console output instead of emailed, for an administrator to relay. To email it instead, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, and `SMTP_USER`/`SMTP_PASS` if your provider needs auth - any standard SMTP provider works. `npm run setup` will ask for these.

### The built-in developer account

There's no separate "developer login". In development a built-in developer account (`developer_adiga@rune.io`) is created on first boot with a public convenience password. **In production it is only created if you set `RUNE_DEVELOPER_PASSWORD` to a strong password** before first boot; otherwise make your first admin with `RUNE_ADMIN_EMAILS`. A production server also refuses sign-in with the public default password, so a database created before this rule needs a new password set ("Forgot your password?" - without SMTP the link is written to the server log). See [docs/ADMINISTRATOR_GUIDE.md](docs/ADMINISTRATOR_GUIDE.md) §1c.

---

## 2. Generate a signing key

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Set the output as `JWT_SECRET`. Keep it stable - rotating it signs everyone out.

---

## 3. Database + migrations

The schema lives in `prisma/schema.prisma`; migrations in `prisma/migrations/`.

```bash
# apply all migrations to the database in DATABASE_URL
npm run db:migrate            # = prisma migrate deploy
```

Run this on every deploy, **before** the new server starts. It is safe to run repeatedly.

**Local development** needs no Postgres install. Set
`DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres` and run
`npm run dev`: when nothing is listening on that port it starts a local one
(pglite, Postgres compiled to WASM) with data under `prisma/pglite-data/`, and
applies pending migrations on start. `npm run dev:db` runs it on its own.

To create a new migration after changing the schema, use `db:migrate:dev`. It needs a separate throwaway Postgres for its shadow database, and it doesn't work against `npm run dev:db`:

```bash
SHADOW_DATABASE_URL=postgresql://... npm run db:migrate:dev -- --name what_changed
```

### Upgrading an existing deployment (back up first)

`prisma migrate deploy` runs automatically before the app starts (the Docker image's own `CMD`, and the documented Vercel build command in §4a). If a migration fails against your database (most often because the schema has drifted from what the migration expects), the app **will not start**. That is the safe failure mode: it stops instead of serving traffic against a half-migrated schema.

Before every upgrade that includes new migrations (check `prisma/migrations/` in the release you're upgrading to):

```bash
# Postgres running in the docker-compose stack:
docker compose exec db pg_dump -U rune rune > backup-$(date +%Y%m%d).sql

# a managed/external Postgres:
pg_dump "$DATABASE_URL" > backup-$(date +%Y%m%d).sql
```

If a migration does fail on startup:

1. Read the error. The output of `prisma migrate deploy` names the failing migration and the SQL error.
2. Restore the pre-upgrade backup (`psql "$DATABASE_URL" < backup-*.sql` against a clean database) and retry after fixing whatever caused the drift, rather than trying to hand-edit a partially-applied migration.
3. If a migration was already applied by hand but Prisma doesn't know (rare, and usually only after manual schema changes), `npx prisma migrate resolve --applied <migration_name>` tells Prisma to treat it as done without running it again. Only do this after confirming the schema matches what that migration produces.

There is no automated rollback, because `prisma migrate deploy` only moves forward. Restoring the pre-upgrade backup is the supported way to roll back.

---

## 4a. Deploy on Vercel

1. Import the repo. Framework preset: **Next.js**. Root directory: this folder.
2. Add a Postgres database (Vercel Postgres, Neon, Supabase…) and set `DATABASE_URL`.
3. In Project > Settings > Environment Variables, add `JWT_SECRET`, `RUNE_BASE_URL` (your production URL), `RUNE_SIGNUP_MODE`, and `RUNE_ADMIN_EMAILS` (so you can register the first admin in the browser). `npm run setup` writes all of these to `.env.vercel` for you to copy. Add `SMTP_*` only if you want password-reset emails.
4. Set the **Build Command** to `prisma migrate deploy && next build`.
5. **Uploads and the audit log need a persistent disk, which Vercel doesn't provide.** Set the `S3_*` variables (any S3-compatible bucket, such as R2, B2, Supabase Storage, or MinIO) so uploads go to object storage. Without them, notebook image uploads fail on Vercel.
6. Deploy, then open the site and register the address you put in `RUNE_ADMIN_EMAILS` - or sign in as the built-in developer account and change its password (see "The built-in developer account" above).

### PDF export on Vercel

Vercel has no system Chromium, so the export route uses the browser bundled in `@sparticuz/chromium` (unpacked into `/tmp` on first use, about 2 to 3 seconds). Nothing needs configuring, but two things must stay true:

- `next.config.ts` lists `./node_modules/@sparticuz/chromium/bin/**` under `outputFileTracingIncludes` for the export route. The package finds its browser at run time, so without that line Vercel deploys it without the browser and every export fails with "The PDF renderer isn't available in this deployment".
- The function needs time and memory for a full browser: the route sets `maxDuration = 60`; keep the project's function memory at 1 GB or more.

Don't set `PUPPETEER_EXECUTABLE_PATH` on Vercel - it switches the route away from the bundled browser.

## 4b. Deploy with Docker (VPS, Fly, Render, Railway, a home server)

```bash
npm run setup             # choose "my own server or Docker"; it writes .env (JWT_SECRET, POSTGRES_PASSWORD, RUNE_BASE_URL, sign-up policy)
docker compose up -d --build
```

`docker-compose.yml` refuses to start until `JWT_SECRET` and `POSTGRES_PASSWORD` are set (SMTP is optional). To create the first admin with no shell in the container, put your address in `RUNE_ADMIN_EMAILS` and register it in the browser, or set `RUNE_DEVELOPER_PASSWORD` before first start to create the built-in developer account. It starts Postgres and the app, runs migrations on start, mounts a named volume at `/data` for uploads, the audit log and the local dictation model cache, and serves on port 3000. Postgres is not published to the host. Put a TLS-terminating reverse proxy (Caddy, nginx, or Traefik) in front and point `https://YOUR_DOMAIN` at it, and set `RUNE_BASE_URL=https://YOUR_DOMAIN` so redirects and password-reset links use the public address rather than the container's internal one. Don't expose port 3000 directly: rate limiting trusts the client address your proxy appends to `X-Forwarded-For` (`RUNE_TRUSTED_PROXY_HOPS`, default 1).

The image installs Chromium for PDF export and runs as a non-root user. `GET /api/health` is the container health check.

**Sizing for PDF export:** each notebook PDF export starts a full headless Chromium process. Budget roughly 300 to 500 MB of RAM per concurrent export, on top of the app's own baseline. On a small VPS (1 to 2 GB in total), a burst of exports from more than one or two users can exhaust memory. Exports are rate limited per user (6 per minute, see `src/app/api/notebooks/[id]/export-pdf/route.ts`), which limits one user but not concurrent exports from different users. If your lab uses PDF export heavily, size the server accordingly (2 GB or more) or watch container memory under load.

## 4b-2. Deploy on Netlify or another host with a dashboard

The same three things apply: a managed Postgres (`DATABASE_URL`), the settings from `npm run setup` (it writes `.env.netlify` / `.env.other` to copy from), and S3-compatible storage for uploads because these hosts have no persistent disk. Use the build command `prisma migrate deploy && next build`, set `RUNE_BASE_URL` to the site's public URL, and register your admin address as described above. Notebook PDF export starts a headless browser and may exceed the function size or time limits on free plans. Vercel and Docker are the paths this project documents and tests most; treat Netlify and other hosts as "should work, verify it", especially uploads and PDF export.

## 4c. Plain `next start` on a server with a disk

```bash
npm ci
npm run build
npm run db:migrate
NODE_ENV=production \
DATABASE_URL=... JWT_SECRET=... RUNE_BASE_URL=https://YOUR_DOMAIN \
RUNE_DATA_DIR=/var/lib/rune \
npm start
```

`npm start` prints a warning that the build uses standalone output. It still works, and the Docker image runs the standalone server directly.

Chromium: install `chromium` (or Chrome) and set `PUPPETEER_EXECUTABLE_PATH`, or let the app search the usual paths.

---

## 5. Environment variable reference

| Variable | Required | Notes |
|---|---|---|
| `JWT_SECRET` | always | 32+ random characters in production. Keep it stable. |
| `RUNE_BASE_URL` | recommended | Public address, e.g. `https://rune.example.com`. Drives redirects and password-reset links (§1). Warned about at start-up if unset in production. |
| `RUNE_SIGNUP_MODE` / `RUNE_ALLOWED_EMAIL_DOMAINS` | recommended | Who may register: `open` (default), `domains`, `closed` (§1). |
| `PORT` | none | Port for `next dev` / `next start`. Default 3000. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_FROM` / `SMTP_USER` / `SMTP_PASS` | optional | Outbound email for "forgot password" links (§1). Without `SMTP_HOST`, the link goes to the server console instead. |
| `RUNE_DEVELOPER_PASSWORD` | optional | Password for the built-in developer account, used only when it's first created. In production the account is created only when this is set to a strong password. |
| `RUNE_TRUSTED_PROXY_HOPS` | optional | Reverse proxies in front of Rune that append to `X-Forwarded-For` (default 1). Rate limits key on the address the nearest one recorded. |
| `RUNE_WHISPER_MODEL` / `RUNE_WHISPER_CACHE_DIR` | optional | Local dictation model and cache location (default `Xenova/whisper-base.en` under `<RUNE_DATA_DIR>/models`). |
| `DATABASE_URL` | always | PostgreSQL. In development, `npm run dev:db` provides one (pglite). |
| `POSTGRES_PASSWORD` | Docker Compose | Password for the bundled Postgres container (§4b). |
| `RUNE_ADMIN_EMAILS` | none | Comma-separated. Gives those addresses the admin console, and lets them register even when sign-ups are closed (first-admin bootstrap). |
| `RUNE_DATA_DIR` | none | Where uploads, `audit.log`, and the dictation model cache are written. Default `./data`. **Must be persistent.** |
| `RUNE_UPLOAD_DIR` | none | Overrides just the uploads folder (default `<RUNE_DATA_DIR>/uploads`). |
| `S3_BUCKET` / `S3_ENDPOINT` / `S3_REGION` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_PUBLIC_URL_BASE` | serverless | Object storage for uploads instead of local disk. |
| `PUPPETEER_EXECUTABLE_PATH` | none | Chromium binary for PDF export. |
| `PUSHER_APP_ID` / `PUSHER_KEY` / `PUSHER_SECRET` / `PUSHER_CLUSTER` / `NEXT_PUBLIC_PUSHER_KEY` / `NEXT_PUBLIC_PUSHER_CLUSTER` | none | Real-time team chat. Without them, chat still works and refreshes every few seconds. |

---

## 6. First admin + operations

- To get the admin console, either create the first administrator directly (`npm run create-user -- --email you@example.com --admin`, or let `npm run setup` do it), or add your address to `RUNE_ADMIN_EMAILS`, restart, and register it in the browser (allowed even when sign-ups are closed; do it right after deploying). You can also set a user's `role` to `DEVELOPER` in the database.
- People with no account: with `RUNE_SIGNUP_MODE=closed`, create accounts from **Admin console > User management** (you set a starting password and they change it in Settings).
- Forgotten passwords: there is no reset email (a self-hosted install may have no mail server). An administrator resets it (**Admin console**, or `npm run reset-password`).
- Every admin action (creating, changing, or deleting a user) is appended to `${RUNE_DATA_DIR}/audit.log`.
- Users can export and restore their own workspace from **Settings > Data and export**.
- Health: `GET /api/health` returns `200` when the database answers and `503` otherwise.

---

## 7. Security posture (already in place)

Security headers and a Content Security Policy (`next.config.ts`), a server-side auth gate (`src/proxy.ts`), rate limiting on sign-in, uploads, PDF export, and invite redemption, sanitized notebook content, size-capped uploads stored privately and served through an authenticated route, and PDF export with Chromium's network access blocked. See [SECURITY.md](SECURITY.md) for details.
