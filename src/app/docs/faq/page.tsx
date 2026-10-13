import type { ReactNode } from 'react';
import { H1, Lead, H3, P, DocLink, Code } from '../DocTypography';
import { DocsPager } from '../DocsPager';

export const metadata = { title: 'FAQ - Rune docs' };

function QA({ q, children }: { q: string; children: ReactNode }) {
  return (
    <div className="mb-7">
      <H3>{q}</H3>
      {children}
    </div>
  );
}

export default function FaqPage() {
  return (
    <div>
      <H1>FAQ</H1>
      <Lead>Common questions, answered plainly. For error messages and their fixes, see <DocLink href="/docs/troubleshooting">Troubleshooting</DocLink>.</Lead>

      <QA q="Is Rune really free?">
        <P>
          Yes. Every feature is available to every account, with no subscription, no per-seat cost and no
          paywall, and you can run it on your own server. See <DocLink href="/pricing">Why it&rsquo;s free</DocLink> for
          the reasoning.
        </P>
      </QA>

      <QA q="Why can't I sign up?">
        <P>
          Who may create an account is a setting your administrator controls: open to anyone who can reach the site,
          restricted to specific email domains, or closed entirely (an administrator creates accounts for people).
          If you see &ldquo;Sign-ups are closed,&rdquo; ask whoever runs your Rune instance for an account.
        </P>
      </QA>

      <QA q="I forgot my password. What now?">
        <P>
          Choose <strong>Forgot password?</strong> on the sign-in page, enter your email, and answer the recovery
          question you picked when you signed up. Capitals, spaces and punctuation don&rsquo;t matter. If the answer
          matches, you choose a new password straight away; no email is needed, and every other signed-in device is
          signed out.
        </P>
        <P>
          No recovery question? Accounts created before they existed, or by an administrator, may not have one. Ask
          whoever runs your Rune server to reset the password (Admin console, or <Code>npm run reset-password</Code>),
          then set a question in <strong>Settings &rsaquo; Advanced</strong> so it doesn&rsquo;t happen again. If the
          server has email configured, the recovery page also offers to email you a reset link.
        </P>
      </QA>

      <QA q="Does an unfinished task roll over to tomorrow automatically?">
        <P>
          No, deliberately. Rune never moves a task for you - you explicitly move it (Move, choose a new date,
          optionally add a reason), and that move is recorded as a postponement rather than hidden. This is what the
          postponement rate in Analytics is built from.
        </P>
      </QA>

      <QA q="What happens if I restore a backup?">
        <P>
          It <strong className="text-foreground">replaces</strong> your current workspace with the file&rsquo;s
          contents, and this can&rsquo;t be undone - download a fresh backup of your current data first if you want
          to keep it. Wall notes and team data (membership, chat, notebook comments/history) aren&rsquo;t included in
          either export or restore.
        </P>
      </QA>

      <QA q="Can I delete my account?">
        <P>
          Yes, from Settings &gt; Danger zone (you confirm by typing your email). It&rsquo;s blocked if you&rsquo;re
          the only Owner of a team that still has other members - transfer ownership or remove them first, so a team
          is never left without an owner.
        </P>
      </QA>

      <QA q="Do I need to know LaTeX to use the notebook?">
        <P>
          No. The toolbar inserts formatting, math, citations, and figures for you. Knowing LaTeX syntax lets you type
          faster, but nothing about the notebook requires it up front.
        </P>
      </QA>

      <QA q="Does Team mode change how my personal projects work?">
        <P>
          No - Teams is entirely additive and opt-in. Your personal tasks and projects behave identically whether or
          not you ever create or join a team, and being in someone&rsquo;s reporting group never shows you their
          projects by itself; visibility is always granted per project.
        </P>
      </QA>

      <QA q="Where do I report a bug or ask for a feature?">
        <P>
          On GitHub - see <DocLink href="/docs/open-source">Open source</DocLink> for the link and what to include in
          a report.
        </P>
      </QA>

      <DocsPager slug="faq" />
    </div>
  );
}
