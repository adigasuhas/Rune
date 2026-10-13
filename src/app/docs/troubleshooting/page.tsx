import { H1, Lead, H2, H3, P, Code, DocLink } from '../DocTypography';
import { DocsPager } from '../DocsPager';
import { GITHUB_REPO_URL } from '@/lib/links';

export const metadata = { title: 'Troubleshooting - Rune docs' };

export default function TroubleshootingPage() {
  return (
    <div>
      <H1>Troubleshooting</H1>
      <Lead>Common errors, why they happen, and what to do about them - written for the person running a Rune instance, not just using one.</Lead>

      <H2>Sign-in fails immediately, even with the right password</H2>
      <P>
        <Code>JWT_SECRET</Code> is almost certainly unset. It has no hardcoded fallback (a default baked into a
        shared repository would be a public default), so without it, sign-in and session verification both fail.
        Generate one with <Code>openssl rand -base64 32</Code> and restart the server.
      </P>

      <H3>&ldquo;Sign-ups are closed&rdquo;</H3>
      <P>
        This is the <Code>RUNE_SIGNUP_MODE</Code> setting, not a bug - it&rsquo;s <Code>closed</Code> by default for
        anything that isn&rsquo;t your own laptop. An administrator creates accounts directly (the admin console, or{' '}
        <Code>npm run create-user</Code>), or set <Code>RUNE_SIGNUP_MODE=open</Code>/<Code>domains</Code> to allow
        self-registration.
      </P>

      <H2>Can&rsquo;t get back into an account</H2>
      <P>
        Self-service recovery uses the recovery question chosen at sign-up (<strong>Forgot password?</strong> on the
        sign-in page). If the person doesn&rsquo;t recognise the question shown, their account probably has none set;
        the page shows a question either way, so it never reveals which emails are registered. An administrator can
        reset the password from the Admin console or with <Code>npm run reset-password</Code>.
      </P>
      <P>
        If <Code>SMTP_HOST</Code> is configured, the recovery page also offers an emailed reset link. Without it,
        a link requested that way is written to the server&rsquo;s console output (e.g. <Code>docker compose logs
        app</Code>) instead.
      </P>

      <H2>Sign-up or sign-in says Rune can&rsquo;t reach its database</H2>
      <P>
        The database isn&rsquo;t running, isn&rsquo;t the one in <Code>DATABASE_URL</Code>, or is missing recent
        migrations. Check <Code>/api/health</Code>. Locally, <Code>npm run dev</Code> starts the bundled database
        when nothing is listening on the <Code>DATABASE_URL</Code> port, and applies pending migrations as it starts.
        If another program already holds that port, Rune connects to it instead, so give Rune a free port. On a server, run <Code>npm run db:migrate</Code> after every update.
      </P>

      <H2>Notebook PDF export fails</H2>
      <P>
        Export needs a Chromium binary. Locally and on a traditional server, Rune auto-detects a system Chrome/Chromium;
        set <Code>PUPPETEER_EXECUTABLE_PATH</Code> only if you need to override that detection. On serverless
        platforms (Vercel, Lambda, Netlify), Rune automatically uses a bundled Chromium instead - no action needed
        there.
      </P>

      <H2>File uploads disappear after a redeploy</H2>
      <P>
        On a serverless platform the filesystem is ephemeral - uploads written to local disk vanish on the next
        deploy. Set the <Code>S3_*</Code> variables to any S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2,
        DigitalOcean Spaces, Supabase Storage, or self-hosted MinIO). On a traditional server or Docker with a
        persistent disk, this isn&rsquo;t needed - just make sure <Code>RUNE_DATA_DIR</Code> points at storage that
        actually persists.
      </P>

      <H2>Team chat feels slow / only updates every few seconds</H2>
      <P>
        This is expected without the optional <Code>PUSHER_*</Code> variables configured - chat works fully without
        them, just via a 5-second refresh (&ldquo;Auto-refresh&rdquo; badge in the chat header) instead of instant
        delivery (&ldquo;Live&rdquo;). Setting up a free-tier Pusher Channels app upgrades this; no messages are ever
        lost either way.
      </P>

      <H2>Known limitations</H2>
      <P>Worth knowing about rather than reporting as bugs:</P>
      <ul className="list-disc pl-5 space-y-2 text-ink-secondary text-sm leading-relaxed max-w-[64ch] mb-5 marker:text-border-strong">
        <li>The local development database (pglite) accepts one connection at a time internally - it&rsquo;s for development only, not load testing.</li>
        <li>Rate limiting is stored per server process; a multi-instance deployment needs a shared store in front of it to enforce limits consistently across instances.</li>
        <li>Some settings changes don&rsquo;t propagate to other open sessions in real time - they rely on browser events, not server push.</li>
        <li>Task completion is tracked per calendar time slot, not by flipping a single status field directly - this is by design (see the administrator guide), and matters if you&rsquo;re scripting against the API.</li>
      </ul>

      <H2>Still stuck?</H2>
      <P>
        Open an issue on <DocLink href={`${GITHUB_REPO_URL}/issues`}>GitHub</DocLink> with
        what you expected, what happened, and how you&rsquo;re running Rune (local, Docker, Vercel, etc.) - see{' '}
        <DocLink href="/docs/open-source">Open source</DocLink> for what makes a report easy to act on.
      </P>

      <DocsPager slug="troubleshooting" />
    </div>
  );
}
