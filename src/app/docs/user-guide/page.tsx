import { H1, Lead, H2, H3, P, UL, Code, ShortcutTable, Kbd, DocLink, Callout } from '../DocTypography';
import { DocsPager } from '../DocsPager';

export const metadata = { title: 'User guide - Rune docs' };

export default function UserGuidePage() {
  return (
    <div>
      <H1>User guide</H1>
      <Lead>
        Step-by-step workflows for everyday use. For what each feature is, see <DocLink href="/docs/features">Features</DocLink>;
        this page is about doing things with them. The in-app <strong className="text-foreground">Help</strong>{' '}
        page is a shorter, searchable version of this guide.
      </Lead>

      <H2>Planning your day</H2>
      <P>
        On Today, drag a task from Up next onto the hourly grid to give it a time slot - it snaps to 15 minutes.
        Drag an existing event to move it, or drag its edge to resize it. Selecting an empty spot, or New event,
        creates a standalone calendar event.
      </P>
      <P>
        The <strong className="text-foreground">Sync task status</strong> toggle controls what happens when you mark
        a calendar event done: on, its linked task is marked done automatically; off, Rune asks first.
      </P>

      <H2>Creating and finishing tasks</H2>
      <P>
        A task needs only a name. Everything else - project, priority, session type, effort/impact, time slots - is
        optional and can be added later by editing it.
      </P>
      <H3>Finishing a task with several time slots</H3>
      <P>
        Selecting the checkmark opens a list of that task&rsquo;s time slots. Check off the ones you completed - the
        task&rsquo;s status follows your selection: none checked is To do, some is In progress, all is Done. Its
        actual time is the total of the checked slots. A task with one slot, or none, opens a short dialog to confirm
        the actual start and end times instead.
      </P>
      <H3>Moving a task</H3>
      <P>
        Rune never moves a task for you, and unfinished tasks do not carry forward automatically. Select{' '}
        <strong className="text-foreground">Move</strong>, choose a date, and optionally add a reason. Moving a task
        does not lower your score, but it is recorded - moved tasks show how many times they were postponed, and the
        postponement rate in Analytics comes from these moves.
      </P>

      <H2>Writing in the notebook</H2>
      <UL>
        <li>Wrap math in <Code>$...$</Code> for inline, or use an equation environment for display math.</li>
        <li>Use <Code>{'\\label'}</Code>, <Code>{'\\ref'}</Code>, and <Code>{'\\cite'}</Code> for cross-references and citations - they&rsquo;re numbered and linked automatically.</li>
        <li>Use <Code>{'\\run{}'}</Code> to reference a run directly from the notebook.</li>
        <li>Paste a screenshot straight into the editor, or use Insert image to upload a file or link a URL.</li>
        <li>The microphone button transcribes speech at your cursor - your browser&rsquo;s built-in speech recognition where available, a local on-device fallback otherwise. Nothing to configure either way.</li>
      </UL>
      <P>
        Changes autosave. <Kbd>Ctrl+S</Kbd> (<Kbd>Cmd+S</Kbd> on Mac) also stores a version you can preview or restore
        from <strong className="text-foreground">History</strong>. <Kbd>Ctrl+Shift+K</Kbd> opens a notebook-scoped
        command palette to switch notebooks, jump to a section, or insert content.
      </P>

      <H2>Search and keyboard shortcuts</H2>
      <P><Kbd>Ctrl+K</Kbd> (<Kbd>Cmd+K</Kbd> on Mac) searches your tasks, projects, notebooks, and runs, or jumps to any page or creates a task.</P>
      <ShortcutTable
        rows={[
          [<Kbd key="d">Alt + D</Kbd>, 'Today'],
          [<Kbd key="p">Alt + P</Kbd>, 'Projects'],
          [<Kbd key="t">Alt + T</Kbd>, 'Tasks'],
          [<Kbd key="j">Alt + J</Kbd>, 'Runs'],
          [<Kbd key="a">Alt + A</Kbd>, 'Analytics'],
          [<Kbd key="s">Alt + S</Kbd>, 'Settings'],
          [<Kbd key="q">?</Kbd>, 'Show or hide the shortcut list'],
          [<Kbd key="esc">Esc</Kbd>, 'Close a dialog'],
        ]}
      />

      <H2>Exporting your work</H2>
      <UL>
        <li><strong className="text-foreground">Tasks (PDF):</strong> on Tasks, select Export, then choose a date range, projects, status, and priority.</li>
        <li><strong className="text-foreground">Notebook (PDF):</strong> in a notebook, select Export, then choose a profile (Research report, Full, or Minimal).</li>
        <li><strong className="text-foreground">Runs (PDF):</strong> on the Runs History tab, select Export PDF to save the runs matching your filters.</li>
        <li><strong className="text-foreground">Objectives (CSV):</strong> on Analytics, under Time by objective, select Export CSV.</li>
      </UL>

      <H2>Settings, backup, and restore</H2>
      <P>
        Settings covers your profile and time zone, task preferences, notification opt-outs, your working
        hours/days and deep-work window, access tokens (see <DocLink href="/docs/api">API &amp; MCP server</DocLink>),
        and full JSON backup/restore of your workspace.
      </P>
      <Callout kind="warning">
        <strong>Restoring a backup replaces your current workspace</strong> with the contents of the file, and this
        cannot be undone. Download a backup of your current data first if you want to keep it. Wall notes and team
        data (membership, chat, notebook comments/history) are not included in either direction.
      </Callout>

      <H2>Teams and Lab</H2>
      <P>
        Creating a team makes you its Owner; joining one is opening an invite link or entering an invite code - that
        is the entire opt-in step, and your personal tasks and projects are unaffected either way. Project visibility
        is granted per project by the Owner or a Team leader with access - being in someone&rsquo;s reporting group
        does not, by itself, show you their projects.
      </P>
      <P>
        <strong className="text-foreground">Lab</strong> (visible once you&rsquo;re on a team) shows project health
        across the team: active projects, deadlines within a week, blocked tasks, and a standup summary of the last 7
        days.
      </P>

      <DocsPager slug="user-guide" />
    </div>
  );
}
