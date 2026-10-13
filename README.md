<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/rune-logo-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/assets/rune-logo-light.png">
  <img alt="Rune" src="docs/assets/rune-logo-light.png" width="300">
</picture>

**You, with a few extra hands.**

A self-hosted workspace for researchers and engineers: the day's plan, tasks, projects,
a LaTeX lab notebook and long-running experiments, in one place.

[![CI](https://github.com/adigasuhas/Rune/actions/workflows/ci.yml/badge.svg)](https://github.com/adigasuhas/Rune/actions/workflows/ci.yml)

[Getting started](#getting-started) · [User guide](docs/USER_GUIDE.md) · [Admin guide](docs/ADMINISTRATOR_GUIDE.md) · [Deploying](DEPLOY.md)

</div>

![Rune's Today view: an hourly planner with a deep-work block, the lab meeting and a reviewer reply, next to the "Up next" list](docs/images/today.png)

## What Rune does

Research work rarely lives in one place. Tasks are in one app, the plan for the day in another, the lab notebook in a third, and the simulation that has been running since Tuesday lives in your head. Rune puts them together, so the things you're juggling know about each other: a task belongs to a project, the project has a notebook and a wall of loose ideas, and a run reminds you when it needs a look.

It's one Next.js app backed by PostgreSQL. Run it on a laptop, a lab machine, a VPS or in Docker. There's no telemetry and no third-party sign-in: people sign in with an email address and a password.

## Features

**Your day**
- **Today**: an hourly planner you drag tasks onto, deep-work windows, "Up next" and "Needs attention", and an end-of-day review.
- **Tasks**: priority, deep work / focus / regular sessions, effort and impact, blocked tasks, and a record of how often each one was postponed.
- **Analytics**: where the hours went, deep versus shallow work, completion and postponement rates. Only your working days count.

**Your work**
- **Projects**: status, priority and a checklist of objectives that drives the project's progress, with its tasks, notebooks and wall attached.
- **Notebook**: one continuous LaTeX document per notebook, with KaTeX maths, citations, cross-references, version history, comments, review requests and PDF export. Dictation runs on your own machine.
- **Runs**: compute jobs, experiments and instrument bookings, with every attempt kept and check-in reminders.
- **Wall**: a sticky-note board per project for ideas that aren't tasks yet.

**Your people** (optional)
- **Teams and Lab**: owner, team leader and member roles, shared projects, task assignment, team chat and a Lab overview.

Also included: a command palette (<kbd>Ctrl</kbd>+<kbd>K</kbd>), in-app notifications, JSON backup and restore, and an [MCP server](mcp-server/README.md) that lets AI assistants read and edit your tasks and calendar.

## Screenshots

| | |
|:---:|:---:|
| ![Tasks list with project, priority and estimate on each row](docs/images/tasks.png) | ![A project page with its objectives checklist, tasks and time summary](docs/images/project.png) |
| **Tasks** | **Projects** |
| ![The notebook editor, LaTeX source beside the rendered preview](docs/images/notebook.png) | ![Runs: two jobs running with progress bars, one waiting, one finished](docs/images/runs.png) |
| **Notebook** | **Runs** |
| ![Analytics: a year-of-work heatmap and totals since you started](docs/images/analytics.png) | ![A project's wall of sticky notes](docs/images/wall.png) |
| **Analytics** | **Wall** |

## Getting started

You need **Node.js 22.12 or newer** (`.nvmrc` pins 24). You don't need to install Postgres: Rune runs its own for local development.

```bash
git clone https://github.com/adigasuhas/Rune.git
cd Rune
npm install
npm run setup     # writes .env, creates the database tables and your admin account
npm run dev       # starts the app, and the local database if it isn't running
```

Open <http://localhost:3000> and sign in with the account `npm run setup` created. Run `npm run setup` again any time to change the port, URL or sign-up rules; it keeps your existing secrets.

> [!TIP]
> If port 5432 is taken by another Postgres, put a different port in `DATABASE_URL`, e.g. `postgresql://postgres:postgres@127.0.0.1:5433/postgres`. `npm run dev` starts the local database on whatever port that URL names.

## Configuration

`npm run setup` writes `.env` for you. To do it by hand, copy `.env.example` to `.env` and set at least:

| Variable | What it's for |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Signs sessions. Required, even in development. Use a long random string (`openssl rand -base64 48`). |
| `RUNE_BASE_URL` | Where Rune is served, e.g. `http://localhost:3000` |

Then run `npm run db:migrate` and `npm run create-user -- --admin`.

Everything else is optional: sign-up rules (`RUNE_SIGNUP_MODE`), SMTP for password-reset emails, Chromium for PDF export, Pusher for real-time chat, and the Whisper model for offline dictation. Each variable is explained in [`.env.example`](.env.example) and the [administrator guide](docs/ADMINISTRATOR_GUIDE.md).

## Deploying

With Docker:

```bash
npm run setup                 # choose "My own server or Docker"
docker compose up -d --build
```

This starts Postgres and Rune and applies migrations on boot. Put it behind a reverse proxy that handles HTTPS. Before going public, read [DEPLOY.md](DEPLOY.md): it covers Docker, Vercel, Netlify and plain `next start`, plus the production-only settings (`RUNE_DEVELOPER_PASSWORD`, `RUNE_TRUSTED_PROXY_HOPS`).

## Development

```bash
npm test              # unit and API route tests (Vitest)
npm run typecheck
npm run lint
npm run test:e2e      # Playwright end-to-end and accessibility checks
npm run build         # production build
```

The end-to-end tests reuse a dev server on port 3000 or start one themselves. They create throwaway accounts, so don't point them at a database you care about. CI runs all of the above on every push.

| Path | Contents |
| --- | --- |
| `src/app/` | pages and API routes (Next.js App Router) |
| `src/components/`, `src/lib/` | shared UI; auth, database access, LaTeX, dictation, permissions |
| `prisma/` | database schema and migrations |
| `scripts/` | setup, local database, user management |
| `tests/`, `tests-e2e/` | Vitest and Playwright tests |

Rune uses Next.js 16, which has breaking changes from older versions. Check the docs in `node_modules/next/dist/docs/` rather than older guides, and read `design-system/MASTER.md` before changing anything visual.

Stack: Next.js 16, React 19, TypeScript, Tailwind CSS 4, Prisma 7 with PostgreSQL, KaTeX and Monaco, Puppeteer, transformers.js (Whisper).

## Feedback

Bugs and ideas go in [GitHub issues](https://github.com/adigasuhas/Rune/issues). For security problems, please don't open a public issue. [SECURITY.md](SECURITY.md) explains how to report them privately.

If Rune saves you an afternoon, you can [buy me a coffee](https://buymeacoffee.com/adigasuhas).

## Licence

Proprietary. All rights reserved. See [LICENSE](LICENSE).
