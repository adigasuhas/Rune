<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/rune-logo-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/assets/rune-logo-light.png">
  <img alt="Rune" src="docs/assets/rune-logo-light.png" width="320">
</picture>

**You, with a few extra hands.**

[![CI](https://github.com/adigasuhas/Rune/actions/workflows/ci.yml/badge.svg)](https://github.com/adigasuhas/Rune/actions/workflows/ci.yml)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-149eca?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7-2d3748?logo=prisma)
![Node.js](https://img.shields.io/badge/Node.js-22.12%2B-5fa04e?logo=nodedotjs&logoColor=white)

[![Buy me a coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-FFDD00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/adigasuhas)

[Quick start](#running-it-locally) · [Deploying](#deploying) · [User guide](docs/USER_GUIDE.md) · [Admin guide](docs/ADMINISTRATOR_GUIDE.md) · [Report a bug](https://github.com/adigasuhas/Rune/issues)

</div>

---

Rune is the app I use to keep track of everything I'm juggling: tasks, the day's schedule, projects, a LaTeX lab notebook, and the long-running experiments and compute jobs that never finish when you expect them to. It started as a small tool for myself and grew from there.

It's a single Next.js app backed by Postgres. You can run it on your laptop, a lab machine, a VPS, or in Docker. There's no telemetry and no third-party sign-in. People sign in with an email and a password.

![Today view](public/screenshots/today.png)

## What's in it

- **Today**: an hourly grid you drag tasks onto, plus what's next, what needs attention, and an end-of-day review.
- **Tasks and projects**: priorities, deep-work vs. regular sessions, effort and impact, blocked tasks, and a record of how often something got pushed back. A project's progress comes from its checklist of objectives.
- **Notebook**: one LaTeX document per notebook, with KaTeX math, citations, cross-references, version history, comments, and PDF export. Dictation runs on your own machine (in the browser, or with a local Whisper model). No audio leaves the server.
- **Runs**: keep track of simulations, instrument time, and jobs that take days, with attempts and check-in reminders.
- **Analytics**: where your hours actually went, deep vs. shallow work, completion and postponement rates.
- **Wall**: a sticky-note board for each project.
- **Teams and Lab** (optional): roles, shared projects, task assignment, and team chat.
- **Backups**: export everything as JSON from Settings and restore it later.
- **MCP server**: lets an AI assistant or any other MCP client read and edit your tasks and calendar. See [mcp-server/README.md](mcp-server/README.md).

<details>
<summary>More screenshots</summary>

| | |
|---|---|
| ![Tasks](public/screenshots/tasks.png) | ![Projects](public/screenshots/projects.png) |
| **Tasks** | **Projects** |
| ![Notebook](public/screenshots/notebook.png) | ![Runs](public/screenshots/runs.png) |
| **Notebook** | **Runs** |
| ![Analytics](public/screenshots/analytics.png) | ![Wall](public/screenshots/wall.png) |
| **Analytics** | **Wall** |
| ![Teams](public/screenshots/teams.png) | |
| **Teams** | |

</details>

## Running it locally

You need **Node.js 22.12 or newer**. 24 is what I use, and `.nvmrc` pins it, so `nvm use` works. You don't need Postgres installed: Rune starts its own for local development.

```bash
git clone https://github.com/adigasuhas/Rune.git
cd Rune
npm install
npm run setup
```

`npm run setup` asks a few questions (where Rune will run, the port, who's allowed to sign up), writes a `.env` file, creates the database tables and creates your first admin account. Run it again any time to change things. It keeps your existing secrets.

Then start it:

```bash
npm run dev
```

Open http://localhost:3000 and sign in with the account you just made.

`npm run dev` also starts the local database (and applies any new migrations) if it isn't already running, and stops it cleanly when you press Ctrl+C. If you'd rather keep the database running in its own terminal, `npm run dev:db` still works, and `npm run dev` will use it.

If port 5432 is already taken on your machine (say, by another project's Postgres), Rune would end up talking to the wrong database. Put a different port in `DATABASE_URL` instead, e.g. `postgresql://postgres:postgres@127.0.0.1:5433/postgres`.

### Setting it up by hand

If you'd rather not use the setup script:

1. `cp .env.example .env`
2. Fill in at least `DATABASE_URL`, `JWT_SECRET` (any long random string, e.g. `openssl rand -base64 48`) and `RUNE_BASE_URL`.
3. `npm run db:migrate`
4. `npm run create-user -- --admin`

Every variable is explained in `.env.example`, and in more detail in [docs/ADMINISTRATOR_GUIDE.md](docs/ADMINISTRATOR_GUIDE.md).

## Deploying

The short version with Docker:

```bash
npm run setup                    # choose "My own server or Docker"
docker compose up -d --build
```

This starts Postgres and Rune and applies migrations on boot. Put it behind a reverse proxy (Caddy, nginx, Traefik) that handles HTTPS.

There are a few things to know before you put it on the internet:

- `JWT_SECRET` must be set, and long. The app refuses to start in production without it.
- Rune has a built-in admin account. In production it's only created if you set `RUNE_DEVELOPER_PASSWORD` to a strong password. The default from development is rejected.
- If you run more than one proxy in front of Rune, set `RUNE_TRUSTED_PROXY_HOPS` so sign-in rate limiting sees real client addresses.
- Rate limits are kept in memory, so they assume a single app instance.

[DEPLOY.md](DEPLOY.md) covers Docker, Vercel, Netlify and plain `next start` in full, including PDF export (it needs Chromium) and email for password resets.

## Tests

```bash
npm test             # unit and API route tests (Vitest)
npm run typecheck
npm run lint
npm run test:e2e     # Playwright end-to-end + accessibility checks
```

The end-to-end tests reuse a dev server that's already up on port 3000, or start one (and its database) themselves. Point them somewhere else with `PLAYWRIGHT_BASE_URL`. They create their own throwaway accounts, but don't run them against a database you care about.

CI runs all of this on every push, plus `npm audit` on the production dependencies. See `.github/workflows/ci.yml`.

## Finding your way around the code

```
src/app/          pages and API routes (Next.js App Router)
src/app/api/      the REST API; everything the UI does goes through here
src/components/   shared UI
src/lib/          auth, database access, LaTeX rendering, dictation, team permissions
prisma/           database schema and migrations
scripts/          setup, local database, user management from the command line
tests/            Vitest tests
tests-e2e/        Playwright tests
mcp-server/       the MCP server (its own package)
docs/             user and administrator guides
```

`design-system/MASTER.md` explains the colours, type and spacing, and why they are the way they are. Read it before changing anything visual.

One thing that catches people out: this uses a recent Next.js (16) with some breaking changes from older versions. When in doubt, check the docs that ship in `node_modules/next/dist/docs/` rather than older guides online.

## Useful commands

| Command | What it does |
| --- | --- |
| `npm run create-user` | Add a user from the command line (`-- --admin` for an admin) |
| `npm run reset-password` | Reset someone's password, signing them out everywhere |
| `npm run delete-user` | Delete a user account |
| `npm run download-whisper-model` | Pre-fetch the dictation model, for offline servers |
| `npm run db:studio` | Browse the database in Prisma Studio |

## Docs

- [User guide](docs/USER_GUIDE.md): how to actually use the thing
- [Administrator guide](docs/ADMINISTRATOR_GUIDE.md): env vars, sign-up rules, password resets, the admin console
- [Deployment](DEPLOY.md)
- [Security](SECURITY.md): what's in place, known limits, and how to report a problem

## Tech stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Prisma 7 with PostgreSQL, KaTeX and Monaco for the notebook, Puppeteer for PDF export, transformers.js (Whisper) for local dictation, and Vitest and Playwright for tests.

## Reporting problems

Bugs and ideas go in [GitHub issues](https://github.com/adigasuhas/Rune/issues). If it's a security issue, please don't open a public issue. [SECURITY.md](SECURITY.md) says how to reach me privately.

## Support

Rune is free, and nothing is locked behind a paywall. If it saves you an afternoon, you can buy me the next coffee. If not, use it anyway. That was the point.

<a href="https://buymeacoffee.com/adigasuhas"><img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=%E2%98%95&slug=adigasuhas&button_colour=FFDD00&font_colour=000000&font_family=Inter&outline_colour=000000&coffee_colour=ffffff" alt="Buy me a coffee" height="44"></a>

Not a coffee person? A star on GitHub helps too.

## Licence

See [LICENSE](LICENSE).
