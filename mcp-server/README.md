# Rune MCP server

Lets any [MCP](https://modelcontextprotocol.io) client read and manage a user’s Rune schedule, tasks, calendar, and
projects. That includes desktop AI assistants, code editors with MCP support, and chat bots you build for WhatsApp or Telegram.

It is a thin, stateless layer over Rune's own REST API, so every business rule (team permissions, calendar sync,
postponement tracking, analytics) is enforced by Rune itself, exactly as in the web app.

## Tools

| Tool | What it does | Kind |
|---|---|---|
| `rune_whoami` | Account, timezone, and "today" in that timezone | read |
| `rune_get_schedule` | Agenda for 1–14 days: time blocks + unscheduled tasks | read |
| `rune_list_tasks` | Filter by status / date range / overdue / project / priority / text | read |
| `rune_create_task` | New task, optionally with a booked time block | write |
| `rune_update_task` | Edit any field, including status and blocked reason | write |
| `rune_complete_task` | Mark done (linked calendar block too) | write |
| `rune_reschedule_task` | Move to another day, recording the postponement | write |
| `rune_delete_task` | Permanently delete | **destructive** |
| `rune_list_projects` / `rune_create_project` | Projects and their ids | read / write |
| `rune_list_calendar_events` | Time blocks in a date range | read |
| `rune_create_calendar_event` / `rune_update_calendar_event` | Meetings, focus blocks | write |
| `rune_delete_calendar_event` | Permanently delete | **destructive** |
| `rune_get_weekly_digest` | Last week's stats, this week's deadlines, blocked work | read |
| `rune_list_jobs` | Long-running compute / instrument runs | read |

All dates and times are in the **user's own timezone** (from their Rune settings). Times are 24-hour `HH:MM`, dates
`YYYY-MM-DD`. Read tools accept `response_format: "markdown" | "json"`.

## 1. Get a token

In Rune: **Settings > Integrations and API tokens > Create token**. The token (`rune_pat_…`) is shown once. Each user
creates their own; it acts as that user and nobody else.

## 2. Build

```bash
cd mcp-server
npm install
npm run build
npm test          # timezone-maths unit tests
```

## 3a. Local client (stdio)

```json
{
  "mcpServers": {
    "rune": {
      "command": "node",
      "args": ["/absolute/path/to/Rune/mcp-server/dist/index.js"],
      "env": {
        "RUNE_BASE_URL": "https://rune.example.com",
        "RUNE_API_TOKEN": "rune_pat_…"
      }
    }
  }
}
```

## 3b. Shared endpoint (HTTP): for chat bots serving many users

```bash
RUNE_BASE_URL=https://rune.example.com PORT=3333 node dist/index.js --http
```

`POST /mcp` (stateless JSON). **Every request carries its own user's token** as `Authorization: Bearer rune_pat_…`;
the server keeps nothing between requests and never stores or logs tokens. `GET /healthz` for liveness.

It binds to `127.0.0.1` by default. To expose it, set `HOST=0.0.0.0` **and put it behind TLS** (a reverse proxy).
Bearer tokens must never cross the network in clear text.

| Env var | Default | |
|---|---|---|
| `RUNE_BASE_URL` | `http://localhost:3000` | Where Rune is running |
| `RUNE_API_TOKEN` | none | stdio mode only |
| `PORT` / `HOST` | `3333` / `127.0.0.1` | HTTP mode only |

## Connecting WhatsApp / Telegram

This server speaks MCP, not WhatsApp. Chat apps need a small **bot service** in front of it:

```
WhatsApp / Telegram ──► your bot service ──► LLM (with this MCP server attached) ──► Rune
   user's message        1. map sender → that user's Rune token
                         2. run the model with the token sent as the MCP bearer
                         3. send the model's reply back to the chat
```

1. **Link once.** The user creates a token in Rune and gives it to the bot (e.g. a `/link rune_pat_…` command, then
   delete that chat message). Store it encrypted, keyed by the sender's Telegram id / WhatsApp number.
2. **Per message,** call an LLM with this server attached as a remote MCP server, passing that user's token. Most LLM
   APIs with an MCP connector take the server URL and an authorization token; see your provider's docs for the request
   shape. The server must be reachable over HTTPS from wherever the model runs.
3. **Confirm destructive actions.** The delete tools are annotated `destructiveHint`; have your bot ask "delete X?"
   before letting the model call them, and consider a per-user allow-list of tools.
4. Treat inbound chat text as untrusted: a message can try to instruct the model. The token's limited scope (below)
   bounds the damage, but keep the bot's system prompt strict.

## Security model

- Tokens are random 256-bit secrets; **only a SHA-256 hash is stored** in Rune. Revoke any time in Settings.
- Optional expiry (30 / 90 / 365 days), `last used` tracking, max 10 active tokens per user.
- **A token can only reach planning data**: tasks, calendar, projects, jobs, digest, notifications, and search. Rune
  enforces this allow-list in its proxy: a token can **never** change a password, export or restore data, delete the
  account, manage teams, change settings, use admin routes, or create/list/revoke tokens.
- Within that scope a token **can modify and delete** tasks, events, and projects. That is what makes it useful, so treat
  it like a password and revoke a leaked one immediately.
- Account suspension / deletion takes effect on the next request.
- If Rune's database is unavailable the API answers `500`, never "invalid token".

## Not included (yet)

Notebooks, team management, project sharing (collaborators), wall notes, and file uploads are intentionally outside the token’s reach in v1. Rune’s proxy rejects them with `403` even if called directly.
