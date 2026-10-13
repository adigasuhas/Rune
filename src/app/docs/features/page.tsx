import { H1, Lead, H2, P, DocLink } from '../DocTypography';
import { DocsPager } from '../DocsPager';

export const metadata = { title: 'Features - Rune docs' };

export default function FeaturesDocPage() {
  return (
    <div>
      <H1>Features</H1>
      <Lead>
        What each part of Rune does. For a visual tour with screenshots, see the{' '}
        <DocLink href="/features">features showcase</DocLink> - this page is the reference version.
      </Lead>

      <H2>Today</H2>
      <P>
        An hourly calendar grid for the current day. Drag a task onto it to schedule it; drag or resize an event to
        change it - everything snaps to 15 minutes. Alongside the grid: Up next (your open tasks), Needs attention
        (overdue tasks and things a teammate is waiting on you to unblock), a week-ahead summary, and an end-of-day
        review prompt.
      </P>

      <H2>Tasks</H2>
      <P>
        Every task you have, grouped by status, with a week strip for jumping between days and filters for project,
        priority, and name. Fields include priority, session type, effort/impact scoring, a project link, one or more
        time slots, and postponement tracking whenever a task is moved off its original date.
      </P>

      <H2>Projects</H2>
      <P>
        Status and priority tracking with an interactive objectives checklist that drives a progress ring - progress
        comes from ticking real objectives, not a number you set by hand. Projects can start from a template (paper,
        experiment campaign, literature review, method or tool build) and hold notebooks, a Wall, and collaborators.
      </P>

      <H2>Wall</H2>
      <P>
        A freeform sticky-note board, one per project. Double-click empty space to drop a note, pick from eight
        colors and three sizes. Plain text, no formatting - it&rsquo;s for capturing a stray thought fast, not writing
        prose.
      </P>

      <H2>Notebook</H2>
      <P>
        One continuous LaTeX document per notebook - math via KaTeX, citations and cross-references, an in-document
        outline, version history, and PDF export via Puppeteer. Notebooks on a team project support comments and a
        lightweight review workflow. On-device dictation transcribes speech into the document at your cursor.
      </P>

      <H2>Calendar</H2>
      <P>
        Events linked to tasks stay in sync with that task&rsquo;s session type. Marking a time slot done from either
        the calendar or the Tasks page updates the task&rsquo;s status consistently either way.
      </P>

      <H2>Analytics</H2>
      <P>
        A daily score (task completion, deep-work time, and total logged time), deep-versus-shallow work, completion
        and postponement rates, hours per working day, and a per-objective time breakdown with CSV export. Averages
        respect your configured working days, not just the calendar week.
      </P>

      <H2>Runs and instruments</H2>
      <P>
        Track compute jobs, experiments, and instrument runs with a full attempt history, check-in reminders while a
        run is in progress, and reusable instrument specs (CPU, GPU, memory, runtime limits) you can share with a
        team.
      </P>

      <H2>Teams and Lab</H2>
      <P>
        Optional. An Owner, any number of Team leaders, and Members; project visibility is granted per project, never
        inherited automatically from being in someone&rsquo;s group. Lab gives a team-wide health view: active
        projects, deadlines within a week, blocked tasks, and notebook pages waiting on review.
      </P>

      <H2>Notifications</H2>
      <P>
        In-app notifications for task assignments and blocks, runs approaching or past their projected end, notebook
        review requests and comments, chat mentions, and a weekly digest - with per-type opt-outs in Settings.
      </P>

      <H2>Search and shortcuts</H2>
      <P>
        <code className="font-mono text-primary text-[12.5px]">Ctrl+K</code> (<code className="font-mono text-primary text-[12.5px]">Cmd+K</code> on Mac) searches tasks, projects, notebooks, and runs, or jumps to any page. Press{' '}
        <code className="font-mono text-primary text-[12.5px]">?</code> anywhere outside a text field for the full
        shortcut list.
      </P>

      <H2>Access tokens and the MCP server</H2>
      <P>
        Create a personal access token to let chat bots or MCP clients read and edit your tasks, calendar, and
        projects on your behalf - see <DocLink href="/docs/api">API &amp; MCP server</DocLink>.
      </P>

      <DocsPager slug="features" />
    </div>
  );
}
