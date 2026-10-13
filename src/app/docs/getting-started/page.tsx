import { QuickstartCard } from '@/components/QuickstartCard';
import { H1, Lead, H2, P, UL, OL, Code, Callout, DocLink } from '../DocTypography';
import { DocsPager } from '../DocsPager';

export const metadata = { title: 'Getting started - Rune docs' };

export default function GettingStartedPage() {
  return (
    <div>
      <H1>Getting started</H1>
      <Lead>Install Rune, run the setup tool, and sign in for the first time.</Lead>

      <H2>Requirements</H2>
      <UL>
        <li><DocLink href="https://nodejs.org">Node.js</DocLink> 20.9 or later.</li>
        <li>PostgreSQL - Rune&rsquo;s only datastore. For local development, a zero-install Postgres is started for you (below).</li>
      </UL>

      <H2>Install and run</H2>
      <P>The fastest path is the setup tool: it asks where Rune will run, writes your <Code>.env</Code>, and can create the database tables and your first administrator account for you.</P>
      <QuickstartCard className="max-w-xl mb-8" />
      <P>
        Then open the address the setup tool printed (by default <Code>http://localhost:3000</Code>) and sign in with
        the account you created.
      </P>

      <H2>Doing it by hand</H2>
      <P>If you&rsquo;d rather set things up yourself:</P>
      <OL>
        <li>Copy <Code>.env.example</Code> to <Code>.env</Code>.</li>
        <li>
          Set <Code>DATABASE_URL</Code> (a Postgres connection string - <Code>npm run dev:db</Code> starts a
          zero-install local one and prints the URL to use).
        </li>
        <li>
          Set <Code>JWT_SECRET</Code> - required even in development. Without it, sign-in fails. Generate one with{' '}
          <Code>openssl rand -base64 32</Code>.
        </li>
        <li>Set <Code>RUNE_BASE_URL</Code> to where Rune is served, e.g. <Code>http://localhost:3000</Code> (recommended, not strictly required locally).</li>
        <li>Run <Code>npm run db:migrate</Code>, then <Code>npm run create-user -- --admin</Code>.</li>
      </OL>

      <H2>Production build</H2>
      <P>
        <Code>npm run build</Code> then <Code>npm run start</Code>. For containers, see the Docker setup described in
        the repository&rsquo;s <Code>DEPLOY.md</Code>.
      </P>

      <Callout>
        <strong>Re-running the setup tool is safe.</strong> It keeps your existing <Code>JWT_SECRET</Code> and backs
        up your <Code>.env</Code> before changing it - useful if you want to move Rune to a new host or port later
        (Settings &gt; Advanced also offers &ldquo;run the setup steps again&rdquo; from inside the app).
      </Callout>

      <H2>First-time sign-in</H2>
      <P>
        You create an account with just an email address and a password (at least 10 characters) - no external
        accounts, no OAuth setup. Whether sign-ups are open on your deployment is an administrator setting; if you
        see &ldquo;Sign-ups are closed&rdquo;, ask whoever runs your instance for an account.
      </P>
      <P>The first time you sign in, a short four-step wizard takes you through:</P>
      <OL>
        <li><strong className="text-foreground">Welcome</strong> - enter your name.</li>
        <li><strong className="text-foreground">Work schedule</strong> - your working days and start/end times.</li>
        <li><strong className="text-foreground">Deep work preferences</strong> - your preferred deep work session length.</li>
        <li><strong className="text-foreground">Review</strong> - confirm your name, time zone (picked from the world map - see Timezone configuration), and theme, then finish.</li>
      </OL>
      <P>You can change all of this later in Settings, and re-run the wizard from Settings &gt; Advanced.</P>

      <DocsPager slug="getting-started" />
    </div>
  );
}
