import { H1, Lead, H2, P, UL, DocLink, Code } from '../DocTypography';
import { DocsPager } from '../DocsPager';
import { GithubIcon } from '@/components/icons/GithubIcon';
import { GITHUB_REPO_URL } from '@/lib/links';

export const metadata = { title: 'Source & contributing - Rune docs' };

export default function OpenSourcePage() {
  return (
    <div>
      <H1>Source &amp; contributing</H1>
      <Lead>Rune&rsquo;s source lives on GitHub, along with the issue tracker. There&rsquo;s no separate edition with missing pieces: what&rsquo;s in the repository is the whole app.</Lead>

      <H2>Licence</H2>
      <P>
        Rune is free to use. The terms for copying, modifying and redistributing the code are in the
        repository&rsquo;s <Code>LICENSE</Code> file; read that rather than relying on a summary here.
      </P>

      <H2>The repository</H2>
      <a
        href={GITHUB_REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2.5 border border-border-strong rounded-lg px-4 py-3 mb-6 hover:bg-surface-sunken transition-colors max-w-fit"
      >
        <GithubIcon className="w-5 h-5" />
        <span className="text-sm font-semibold text-foreground">adigasuhas/Rune on GitHub</span>
      </a>
      <P>Everything lives there: the full source, the same documentation as this site, and the issue tracker.</P>

      <H2>Reporting a bug or requesting a feature</H2>
      <P>
        Open an issue on the repository&rsquo;s <DocLink href={`${GITHUB_REPO_URL}/issues`}>issue tracker</DocLink>. A
        useful bug report includes:
      </P>
      <UL>
        <li>What you expected to happen, and what happened instead.</li>
        <li>Steps to reproduce it.</li>
        <li>Whether you&rsquo;re running the latest code, and roughly how you deployed it (local, Docker, Vercel, etc.).</li>
      </UL>
      <P>See also <DocLink href="/docs/troubleshooting">Troubleshooting</DocLink> for known limitations that may already explain what you&rsquo;re seeing.</P>

      <H2>Contributing code</H2>
      <P>
        There&rsquo;s no separate contribution guide or template beyond the repository itself yet - the practical
        path is the standard GitHub one: fork the repository, make your change on a branch, and open a pull request
        describing what it does and why. Reading the existing code and the docs in this section first will save you a
        round-trip, since the project has fairly specific conventions (see the repository&rsquo;s own design-system
        notes and the administrator guide for the architecture).
      </P>

      <H2>Why self-hosted, why free</H2>
      <P>
        Self-hosting means your tasks, notebooks, and run history live on infrastructure you control, not a
        third-party account you have to trust indefinitely. Keeping it free means that control isn&rsquo;t
        conditional on paying for it - see <DocLink href="/pricing">Why it&rsquo;s free</DocLink> for the reasoning.
      </P>

      <DocsPager slug="open-source" />
    </div>
  );
}
