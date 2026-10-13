import { H1, Lead, H2, P, UL, Code, Pre, DocLink, Callout } from '../DocTypography';
import { DocsPager } from '../DocsPager';

export const metadata = { title: 'API & MCP server - Rune docs' };

const TOOLS: [string, string, 'read' | 'write' | 'destructive'][] = [
  ['rune_whoami', 'Account, timezone, and "today" in that timezone', 'read'],
  ['rune_get_schedule', 'Agenda for 1-14 days: time blocks + unscheduled tasks', 'read'],
  ['rune_list_tasks', 'Filter by status / date range / overdue / project / priority / text', 'read'],
  ['rune_create_task', 'New task, optionally with a booked time block', 'write'],
  ['rune_update_task', 'Edit any field, including status and blocked reason', 'write'],
  ['rune_complete_task', 'Mark done (linked calendar block too)', 'write'],
  ['rune_reschedule_task', 'Move to another day, recording the postponement', 'write'],
  ['rune_delete_task', 'Permanently delete', 'destructive'],
  ['rune_list_projects / rune_create_project', 'Projects and their ids', 'read'],
  ['rune_list_calendar_events', 'Time blocks in a date range', 'read'],
  ['rune_create_calendar_event / rune_update_calendar_event', 'Meetings, focus blocks', 'write'],
  ['rune_delete_calendar_event', 'Permanently delete', 'destructive'],
  ['rune_get_weekly_digest', "Last week's stats, this week's deadlines, blocked work", 'read'],
  ['rune_list_jobs', 'Long-running compute / instrument runs', 'read'],
];

const KIND_STYLE: Record<string, string> = {
  read: 'bg-info-soft text-info',
  write: 'bg-primary-soft text-primary',
  destructive: 'bg-danger-soft text-danger',
};

export default function ApiPage() {
  return (
    <div>
      <H1>API &amp; MCP server</H1>
      <Lead>
        Rune ships a companion <DocLink href="https://modelcontextprotocol.io">MCP</DocLink>{' '}
        server so chat bots, desktop assistants, code editors, and other MCP clients can read and edit your tasks,
        calendar, and projects on your behalf - through the same REST API and business rules the web app itself uses,
        not a separate code path.
      </Lead>

      <H2>Getting a token</H2>
      <P>
        In Settings &gt; Integrations and API tokens, create a token. It&rsquo;s a random 256-bit secret, shown
        exactly once - copy it immediately. Only a SHA-256 hash of it is ever stored, and you can revoke it any time
        from the same screen.
      </P>

      <H2>Tools</H2>
      <div className="border border-border rounded-lg overflow-hidden mb-8 max-w-2xl">
        {TOOLS.map(([name, desc, kind], i) => (
          <div key={name} className={`flex items-start justify-between gap-3 px-4 py-2.5 ${i > 0 ? 'border-t border-border' : ''}`}>
            <div className="min-w-0">
              <code className="font-mono text-[12px] text-foreground">{name}</code>
              <p className="text-[12px] text-ink-faint mt-0.5">{desc}</p>
            </div>
            <span className={`shrink-0 text-[9.5px] font-bold uppercase tracking-[0.06em] px-2 py-0.5 rounded-full ${KIND_STYLE[kind]}`}>{kind}</span>
          </div>
        ))}
      </div>
      <P>
        All dates and times are in the <strong className="text-foreground">user&rsquo;s own timezone</strong> (from
        their Rune settings - see <DocLink href="/docs/timezones">Timezone configuration</DocLink>). Times are
        24-hour <Code>HH:MM</Code>, dates <Code>YYYY-MM-DD</Code>. Read tools accept <Code>response_format:
        &quot;markdown&quot; | &quot;json&quot;</Code>.
      </P>

      <H2>Connecting a local MCP client</H2>
      <Pre>{`{
  "mcpServers": {
    "rune": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"],
      "env": {
        "RUNE_BASE_URL": "https://your-rune-instance.example.com",
        "RUNE_API_TOKEN": "rune_pat_..."
      }
    }
  }
}`}</Pre>

      <H2>Running it as a shared HTTP endpoint</H2>
      <P>For a bot serving many users, run the server in HTTP mode instead of stdio:</P>
      <Pre>{`RUNE_BASE_URL=https://your-rune-instance.example.com PORT=3333 node dist/index.js --http`}</Pre>
      <P>
        <Code>POST /mcp</Code> is stateless JSON - every request carries its own caller&rsquo;s token as{' '}
        <Code>Authorization: Bearer rune_pat_...</Code>, and the server keeps nothing between requests.{' '}
        <Code>GET /healthz</Code> is a liveness check. It binds to <Code>127.0.0.1</Code> by default; to expose it,
        set <Code>HOST=0.0.0.0</Code> and put it behind TLS - bearer tokens must never cross the network in clear
        text.
      </P>

      <H2>Security model</H2>
      <UL>
        <li>Tokens are random 256-bit secrets; only a SHA-256 hash is stored. Revoke any time from Settings.</li>
        <li>
          A token can only reach planning data - tasks, calendar, projects, jobs, digest, notifications, and search.
          It can <strong className="text-foreground">never</strong> change a password, export or restore data, delete
          the account, manage teams, change settings, use admin routes, or create/list/revoke tokens.
        </li>
        <li>Within that scope, a token can modify and delete tasks, events, and projects - treat a token like a password and revoke a leaked one immediately.</li>
        <li>Account suspension or deletion takes effect on the token&rsquo;s next request.</li>
      </UL>

      <Callout kind="warning">
        <strong>Not yet included:</strong> notebooks, team management, project collaborators, wall notes, and file
        uploads are intentionally outside a token&rsquo;s reach today. Rune&rsquo;s proxy rejects those calls with{' '}
        <Code>403</Code> even if made directly.
      </Callout>

      <H2>Building your own chat-bot integration</H2>
      <P>
        This server speaks MCP, not a specific chat platform - WhatsApp, Telegram, or anything else needs a small bot
        service in front of it that maps a sender to that user&rsquo;s Rune token, calls an LLM with this server
        attached as a remote MCP server, and relays the reply back. Always confirm destructive actions (the delete
        tools are annotated <Code>destructiveHint</Code>) before letting a model call them, and treat inbound chat
        text as untrusted - a message can try to instruct the model, so keep the bot&rsquo;s system prompt strict.
      </P>

      <DocsPager slug="api" />
    </div>
  );
}
