# Rune administrator guide

This guide covers environment configuration, database administration, the admin console, and user-account management. For deployment steps, see [DEPLOY.md](../DEPLOY.md). For using the app day to day, see the [user guide](USER_GUIDE.md).

---

## 1. Environment variables

**The easy way: `npm run setup`.** It asks where Rune will run (this computer, your own server or Docker, Vercel, Netlify, or another host), then writes the right values for you: the public URL or port, the database, a signing secret, who may sign up, and (only if you want it) outbound email for password resets. It can also create the database tables, your first administrator account, and download the local dictation model. Re-running it is safe: it keeps your existing `JWT_SECRET` and backs up the file before changing it. `npm run setup -- --help` lists the flags for scripted use.

Or do it by hand: copy `.env.example` to `.env` and fill in real values before running anywhere other than a personal machine.

| Variable | Required | Purpose |
| :--- | :--- | :--- |
| `DATABASE_URL` | **Always** | Postgres connection string. Postgres is Rune's only datastore. For local development, `npm run dev:db` starts a zero-install Postgres (pglite) and prints the URL to use. |
| `JWT_SECRET` | **Always** | Signs session cookies. There is no fallback: without it, signing in and verifying a session both fail. In production it must be at least 32 characters, and well-known placeholder values are rejected. Generate one with `openssl rand -base64 32`. |
| `RUNE_BASE_URL` | Recommended | The public address Rune is served from, e.g. `https://rune.example.com` or `http://localhost:3000`. Used for OAuth redirect URIs and post-login redirects, and to decide whether cookies are `Secure`. Unset, Rune uses the request's own host, which is right on Vercel, Netlify and plain localhost but wrong behind a reverse proxy or container. Setting it also means a spoofed `Host` header can't redirect a login. Production start-up warns if it's unset. |
| `PORT` | No | The port `next dev` / `next start` listen on (default 3000). `npm run setup` keeps this and `RUNE_BASE_URL` in step for a local install. |
| `RUNE_SIGNUP_MODE` | Recommended | Who may create an account: `open` (anyone who can reach the site; the default), `domains` (only `RUNE_ALLOWED_EMAIL_DOMAINS`) or `closed` (an administrator creates accounts). A typo fails **closed**. It only gates *new* accounts; existing ones always sign in. See §1a. |
| `RUNE_ALLOWED_EMAIL_DOMAINS` | With `domains` | Comma-separated, e.g. `lab.edu,company.com`. An empty list under `domains` means closed. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_FROM` / `SMTP_USER` / `SMTP_PASS` | No | Optional outbound email, offered as an alternative to the recovery question on the "Forgot password?" page (see §1b). Not needed for self-service recovery. |
| `RUNE_ADMIN_EMAILS` | No | Comma-separated addresses that get the admin console. An address listed here may also register **even when sign-ups are closed**, which is how a first admin gets in on a host with no shell (Docker, Vercel, Netlify). See §4. |
| `RUNE_DEVELOPER_PASSWORD` | No | Password for the built-in developer account, used only when that account is first created. **In production the account is created only if this is set to a strong password**; in development it defaults to a public convenience password. |
| `RUNE_TRUSTED_PROXY_HOPS` | No | Number of reverse proxies in front of Rune that append to `X-Forwarded-For` (default 1). Rate limiting uses the client address the nearest trusted proxy recorded. |
| `RUNE_WHISPER_MODEL` / `RUNE_WHISPER_CACHE_DIR` | No | The local speech-to-text model transformers.js loads for dictation, and where it's cached. Defaults to `Xenova/whisper-base.en` under `<RUNE_DATA_DIR>/models`. See §1d. |
| `POSTGRES_PASSWORD` | Docker Compose | Password for the bundled Postgres container. `docker-compose.yml` won't start without it. Not used if you point `DATABASE_URL` at your own Postgres. |
| `RUNE_DATA_DIR` | No | Where uploads, the audit log, and the Whisper model cache are written. Defaults to `./data`. It **must be a persistent disk**. |
| `RUNE_UPLOAD_DIR` | No | Overrides just the uploads folder (defaults to `<RUNE_DATA_DIR>/uploads`). |
| `PUPPETEER_EXECUTABLE_PATH` | No | Path to a Chromium or Chrome binary for notebook PDF export. Only needed to override auto-detection (see §3). |
| `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_ENDPOINT` / `S3_REGION` / `S3_PUBLIC_URL_BASE` | No | Store uploads in an S3-compatible bucket instead of local disk. Needed on hosts with an ephemeral or read-only filesystem (see §3). |
| `PUSHER_APP_ID` / `PUSHER_KEY` / `PUSHER_SECRET` / `PUSHER_CLUSTER` / `NEXT_PUBLIC_PUSHER_KEY` / `NEXT_PUBLIC_PUSHER_CLUSTER` | No | Real-time delivery for team chat (see §1e). If you leave them all unset, chat still works and refreshes every 5 seconds. |

`JWT_SECRET` has no hardcoded fallback. A default in a shared repository is a public default, so it fails closed.

### 1a. How people sign in

**Email and password is the default and needs nothing outside Rune.** On the login page anyone can create an account with an email address and a password (at least 10 characters; very common passwords are refused), subject to `RUNE_SIGNUP_MODE`:

* **`open`:** anyone who can reach the site. Fine on your own laptop or a private network. On a public site, anyone on the internet can register, so pick one of the others.
* **`domains`:** only addresses at the domains you list. Good for a lab or company (`lab.edu,company.com`).
* **`closed`:** nobody can self-register. Create accounts yourself (**Admin console > User management**, or `npm run create-user`). This is what `npm run setup` picks by default for anything that isn't your own computer.

The policy never affects people who already have an account.

**Forgot password.** Self-service recovery uses a **recovery question** chosen at sign-up (users can set or change it in Settings › Advanced, which asks for their current password). On **"Forgot password?"** a person enters their email and answers the question; a match issues a single-use reset token valid for 15 minutes, and saving the new password signs out every other session. Answers are normalised (case, accents, punctuation, spacing) and stored only as a PBKDF2 hash, like passwords, and never returned by any API. An unknown email is shown a stable decoy question, so the page can't be used to discover accounts, and guesses are rate-limited per address (5 per 15 minutes) and per client. Accounts without a question (created by an administrator, or before this existed) can't self-recover: reset them from the **Admin console** or with `npm run reset-password`. If `SMTP_HOST` is configured, the page also offers an emailed reset link (1 hour, single-use); without SMTP, a link requested that way is written to the server console. No reset path ever changes an account's role.

There is still **no email verification** for sign-up itself (a self-hosted install may have no mail server at all, even with SMTP configured only for resets), so a newly self-registered address is unverified. Password sign-in is rate limited per client and per account, and answers identically for "no such account" and "wrong password" so it doesn't reveal who has one.

**Public address.** Set `RUNE_BASE_URL` to where people reach Rune. Nothing in the code is tied to `localhost:3000`: redirects and password-reset links are built from that value (or, if it's unset, from the request). To move Rune to another host or port, change `RUNE_BASE_URL` (and `PORT` locally).

### 1b. Optional: outbound email for password resets

**Not required.** Password recovery works through recovery questions without any mail server; SMTP only adds an optional emailed link. To email it instead, set `SMTP_HOST`, `SMTP_PORT` (587 for STARTTLS, 465 for implicit TLS), `SMTP_FROM`, and `SMTP_USER`/`SMTP_PASS` if your provider requires auth. Any standard SMTP provider works (a transactional-email service, your own mail server, or a relay like your registrar's). `npm run setup` will ask for these.

### 1c. The built-in developer account

Rune has no separate "developer login" - the built-in developer account signs in through the exact same form as everyone else (`src/lib/devAccount.ts`). Its email is `developer_adiga@rune.io`.

* **Development:** created on first boot with the password `developer12345`. That value is public (it's in this repository), which is fine on your own machine only.
* **Production (`NODE_ENV=production`):** created **only** if `RUNE_DEVELOPER_PASSWORD` is set to a strong password (10+ characters, not a common one, not the default) before the first boot against a fresh database. Without it there is no built-in admin; name your admins in `RUNE_ADMIN_EMAILS` or use `npm run create-user -- --admin`.
* **Existing production databases** that already have the account with the default password: sign-in with it is refused, and the server logs a warning at start-up. Set a new password with "Forgot your password?" (without SMTP, the reset link for this account is written to the server log, never emailed, because the address is a placeholder at a domain you don't control) or `npm run reset-password`.

This account always has `role = DEVELOPER` (full admin console access). Because it's created before the server accepts any requests, nobody can self-register that exact email address out from under it, and a password reset never changes `role` - so normal sign-up and password reset can never grant admin rights.

### 1d. Optional: local dictation (speech-to-text)

Notebook entries can be dictated. The browser's own speech recognition is tried first where supported; if it isn't, Rune falls back to a local Whisper model that runs entirely on the server via [transformers.js](https://github.com/huggingface/transformers.js) (an ONNX Runtime port - no Python, no GPU, no system `ffmpeg` install required; audio decoding uses the `ffmpeg-static` npm package's bundled binary).

The model (`Xenova/whisper-base.en` by default, ~150MB) is not bundled - `npm run setup` can download it for you, or run `npm run download-whisper-model` any time. It's cached under `<RUNE_DATA_DIR>/models` so it survives restarts and, in Docker, the mounted data volume. Without it (and without browser support), the dictation button explains it isn't available rather than failing silently.

> [!NOTE]
> Browser speech recognition is not necessarily on-device: Chrome/Edge's implementation streams audio to the browser vendor's own cloud speech service, despite being a plain client-side API. Firefox and Safari currently ship no implementation at all. The local Whisper fallback is the only path where audio never leaves the server.

### 1e. Team chat real-time delivery

Team chat works with no configuration. Every message goes through the app's own database via `GET` and `POST /api/teams/[id]/chat`, and the client refreshes every 5 seconds while a conversation is open. The `PUSHER_*` and `NEXT_PUBLIC_PUSHER_*` variables are an optional upgrade to near-instant delivery through [Pusher Channels](https://pusher.com). A free-tier app is enough for a small team.

1. Create a Pusher Channels app and copy its **App ID**, **Key**, **Secret**, and **Cluster** into `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET`, and `PUSHER_CLUSTER`.
2. Set `NEXT_PUBLIC_PUSHER_KEY` and `NEXT_PUBLIC_PUSHER_CLUSTER` to the **same** key and cluster. Next.js exposes `NEXT_PUBLIC_` variables to the browser. That is expected here, because they aren't secrets. Only `PUSHER_SECRET` is secret, and it never leaves the server.
3. Restart the app. No channel or webhook setup is needed on the Pusher side. Rune authorizes each private channel subscription itself through `POST /api/pusher/auth`, using the same permission check as the chat API, so a user can only subscribe to conversations they are allowed to read.
4. If only some of the variables are set, chat falls back to refreshing every few seconds instead of failing. The server side needs all four server variables, and the browser checks for both `NEXT_PUBLIC_` variables before it tries to subscribe.

A small badge in the chat header shows users which mode is active: **Live** for real-time delivery, or **Auto-refresh** otherwise. You don't need to announce a Pusher rollout separately.

---

## 2. Database

Rune runs entirely on PostgreSQL through Prisma (`prisma/schema.prisma`, `PrismaPg` driver adapter). There is one code path in every environment, so a query error surfaces as a real error instead of silently degrading.

### Local development

There is no Postgres to install. In one terminal:

```bash
npm run dev:db          # pglite Postgres on 127.0.0.1:5432, data in prisma/pglite-data/ (git-ignored)
```

Set `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres` in `.env`. In another terminal:

```bash
npm run db:migrate      # apply migrations (first run, and after updates)
npm run dev
```

pglite is real PostgreSQL compiled to WASM and speaks the wire protocol, so transactions, cascades, and constraints behave as they do in production. It accepts one connection at a time internally, so it is for development only.

`npm run db:migrate:dev` creates new migrations. It needs a separate throwaway Postgres for its shadow database (set `SHADOW_DATABASE_URL`) and doesn't work against pglite.

### Production

1. Set `DATABASE_URL` to a real Postgres instance (Neon, Supabase, Railway, RDS, or your own).
2. Run `npm run db:migrate` (`prisma migrate deploy`) on every deploy, before the new server starts. `postinstall` already runs `prisma generate`.

### Data model overview

Primary models: `User`, `Project`, `Task`, `CalendarEvent`, `Notebook` (with one `NotebookPage` holding its document, plus `NotebookRevision`, `NotebookComment`, and `NotebookAttachment`), `Instrument`, `Job` (shown as Runs in the app), `Notification`, `AccomplishmentRecord`, `Setting`, `WallNote`, and `ApiToken` (personal access tokens, stored as hashes). Most records belong to a `User` and are deleted with them (see §5).

Team models. A user who never uses Teams has no rows in any of these:

* `Team` and `TeamMembership` (role: `OWNER`, `TEAM_LEADER`, or `MEMBER`).
* `TeamSubgroupMember`: a many-to-many link between team leaders and members. It is organizational only and never grants project visibility.
* `TeamInvite`.
* `ProjectCollaborator`: the only mechanism that gives a team member visibility into a specific project.
* `ChatMessage` (see §1c).

---

## 3. Deployment

Rune has no hosting lock-in. The same code runs as `npm run dev` on your laptop, as a `next start` process or Docker container on any server, and on Vercel or another serverless platform. What changes between them is which environment variables you set. Step-by-step instructions are in [DEPLOY.md](../DEPLOY.md). This section explains what each platform needs.

### Local (`npm run dev`)

Set `DATABASE_URL` to the URL that `npm run dev:db` prints, and leave `S3_*` and `PUPPETEER_EXECUTABLE_PATH` unset. Rune writes uploads to `<RUNE_DATA_DIR>/uploads` (`./data/uploads` by default) and detects a system Chrome or Chromium for PDF export. You need no external accounts at all.

### A traditional server (VPS, Docker, Railway or Render with a persistent disk)

Set `DATABASE_URL` to a real Postgres instance. Uploads and PDF export work as in local development, with a persistent writable filesystem and a system Chromium. `S3_*` and `PUPPETEER_EXECUTABLE_PATH` are optional here, and only needed if you prefer object storage or a specific Chromium.

### Vercel or another serverless platform

Serverless functions have an ephemeral, mostly read-only filesystem, so two things need external services:

* **Database:** set `DATABASE_URL` to a managed Postgres. Neon and Supabase both work well with Vercel.
* **File uploads:** set the `S3_*` variables to any S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2, DigitalOcean Spaces, Supabase Storage, or self-hosted MinIO). `src/lib/storage.ts` uses the S3 API, not a specific vendor.
* **PDF export:** no action needed. The export route detects a serverless runtime (Vercel, Lambda, or Netlify) and uses the bundled `@sparticuz/chromium` instead of looking for a system browser.

Everything else is plain Postgres reads and writes with no state kept in the process, so it needs no special handling on serverless.

---

## 4. Admin console

The admin console is at `/developer`. It is only available to admins. An account is an admin when **any** of these is true:

* Its `role` is `DEVELOPER` in the database - the built-in developer account (§1c) always qualifies, and an existing admin can grant this to any other account from **User management**.
* Its email is listed in `RUNE_ADMIN_EMAILS`.

To get in as an administrator: sign in as the built-in developer account (§1c) and change its password immediately, or create your own administrator directly (`npm run create-user -- --email you@example.com --admin`, or let `npm run setup` do it), or list your address in `RUNE_ADMIN_EMAILS`, open the site and register that address (allowed even when sign-ups are closed; do this right after deploying, before anyone else knows the site exists), then restart if you changed the variable.

The console has four tabs:

* **User management:** search and filter users, create or edit accounts, reset passwords, change roles and status (active, suspended, or disabled), and delete accounts. It also shows totals for users, projects, tasks, and sign-ins today.
* **System settings:** runtime details and a set of experiment switches. The switches are a preview only and don't change how the app behaves.
* **Database:** a read-only **inspector** that shows the signed-in admin's **own** tasks, projects, calendar events, and settings as JSON. It does not show other users' data or raw database rows.
* **Logs:** the audit and error log. It lists privileged admin actions (user create, role change, and delete) and uncaught server errors.

Every admin action is also appended to `${RUNE_DATA_DIR}/audit.log`. Suspending, disabling, or deleting a user, or resetting their password, signs out every session they have.

---

## 5. User account management

Users can delete their own account from **Settings > Danger zone** (they type their email to confirm), which calls `DELETE /api/user/account`. This is blocked with a 409 if the user is the only owner of a team that still has other members. They need to transfer ownership or remove the other members first, so deleting an account never leaves a team without an owner. The rest of this section covers admin and operations tooling, which is separate from that self-service path.

### CLI scripts

These scripts work directly on the database. Run them from the project root:

| Command | Action |
| :--- | :--- |
| `npm run create-user` | Create an account. Prompts for an email, an optional display name and a password (at least 10 characters, same rules as sign-up). Non-interactive: `npm run create-user -- --email a@b.co --name "Ada" --admin` (password from `RUNE_CREATE_USER_PASSWORD` or `--password`); `--admin` grants the admin console, `--if-missing` makes it a no-op if the address exists. |
| `npm run reset-password` | Reset a user's password. It prompts for the email and a new password. |
| `npm run setup` | The setup tool (see §1). |
| `npm run delete-user` | Permanently delete a user and everything they own. It prompts for the email and a `y` confirmation. |

> [!NOTE]
> Passwords are hashed with PBKDF2-SHA512 (210,000 iterations, stored as `iterations:salt:hash`, see `src/lib/crypto.ts`). Older hashes are upgraded the next time the user signs in.

> [!WARNING]
> `delete-user` is destructive and can't be undone. It deletes the user's projects, tasks, notebooks, accomplishments, calendar events, and settings along with the account.

---

## 6. Backup and restore

Each user can export and import their own workspace from **Settings > Data and export**. The export (`GET /api/user/backup`) includes settings, projects, notebooks (each with its document), tasks, accomplishments, calendar events, instruments, runs, and notifications. It also includes a read-only reference to the user's team memberships.

It does **not** include wall notes, notebook comments and version history, team data (membership, chat), or access tokens.

Restore (`POST /api/user/backup`) **replaces** the user's current data for those tables in a single transaction. Notebook IDs are remapped so each document attaches to the right notebook. `analyticsStartDate` is deliberately left alone by a restore. Analytics treat older restored activity and new activity as one continuous history, rather than starting again from the restore date. There is no server-side backup retention: if a user restores the wrong file, the previous state is gone unless they exported it first.

---

## 7. Known limitations

* **Tests:** the repository has several hundred unit and route tests (`npm test`) and a Playwright suite for the main flows and accessibility (`npm run test:e2e`). Run both before deploying changes. Coverage is uneven: file uploads and the Pusher auth route are not covered by unit tests.
* **Large components:** the Today page (`src/app/page.tsx`), the Runs page (`src/app/jobs/page.tsx`), and the notebook view (`src/app/notebook/NotebookView.tsx`) are large client components. Take extra care when changing them.
* **Rate limiting** is stored in each server process. A deployment with several instances needs a shared store in front of it to enforce limits across them.
* **Settings changes** don't always reach other open sessions in real time. Updates rely on browser events, not server push.
* **The local database (pglite)** is for development only. It handles a limited number of queries in quick succession and shouldn't be used for load testing.
* **Analytics caching:** `AnalyticsView.tsx` deliberately has no cache for its lifetime metrics. An earlier version cached them in `sessionStorage` under a key built from row counts alone. That ignored the analytics start date shifting, for example when a restore brings in older history without necessarily changing any row count, so two different date ranges could share a key and show a stale average. If you add caching for performance, key it on the actual computed date range, not just counts. `calculateWorkingDayMetrics` (`src/lib/analyticsUtils.ts`) groups tasks and events by date once (`groupByLocalDate`), so the loop over at most 366 days costs O(items + days) rather than O(days × items). That is what keeps it cheap enough to run on every render.
* **Task completion is tracked per calendar slot.** `CalendarEvent.completed` is the source of truth for each scheduled slot. `Task.status` is derived from how many of a task's slots are completed (none, some, or all gives PENDING, IN_PROGRESS, or COMPLETED). `Task.actualTime` (`recalculateTaskActualTime` in `src/lib/db.ts`) is the total duration of the completed slots only. Any new "mark done" path must go through the same route (`PUT /api/calendar` with `{ id, completed }`, then a status-only `PUT /api/tasks/[id]`) instead of writing `Task.status` directly. Otherwise actual-time tracking will drift from what was really done.
