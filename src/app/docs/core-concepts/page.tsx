import { H1, Lead, H2, P, UL } from '../DocTypography';
import { DocsPager } from '../DocsPager';

export const metadata = { title: 'Core concepts - Rune docs' };

export default function CoreConceptsPage() {
  return (
    <div>
      <H1>Core concepts</H1>
      <Lead>The vocabulary Rune uses, and how its pieces relate to each other.</Lead>

      <H2>Project</H2>
      <P>
        A project groups related tasks and can hold one or more notebooks. It tracks status (Active, On hold,
        Completed, Archived), priority, and an objectives checklist - ticking objectives updates the project&rsquo;s
        progress automatically, rather than you setting a percentage by hand. Projects can be personal or, with Team
        mode on, shared with collaborators.
      </P>

      <H2>Task</H2>
      <P>
        A task is a single piece of work: a name, an optional project link, a priority (Low/Medium/High/Critical), a
        planned date, a session type, and an estimated time. Tasks move through four statuses - To do, In progress,
        Blocked, Done - and can carry one or more time slots that appear on the calendar.
      </P>
      <P>
        Rune never moves a task for you. An unfinished task does not silently roll over to tomorrow; you explicitly
        move it, and that move is recorded as a postponement (visible in Analytics as the postponement rate) rather
        than hidden.
      </P>

      <H2>Session type</H2>
      <P>
        Every task and calendar event has a session type: <strong className="text-foreground">Deep work</strong>,{' '}
        <strong className="text-foreground">Focus</strong>, or <strong className="text-foreground">Regular</strong>.
        This is what your daily score and the Analytics deep-versus-shallow breakdown are computed from - it&rsquo;s
        a label you choose, not something Rune infers.
      </P>

      <H2>Notebook</H2>
      <P>
        A notebook is <strong className="text-foreground">one continuous LaTeX document</strong>, not a folder of
        separate pages or daily entries. Sections are just headings (<code className="font-mono text-primary text-[12.5px]">\section</code>) inside that one document, listed
        in an outline on the left for navigation. You don&rsquo;t need to know LaTeX to use one - the toolbar inserts
        formatting, math, citations, and figures for you. A project can hold several notebooks; each is opened from
        the notebook library, organized as a folder per project.
      </P>

      <H2>Run</H2>
      <P>
        A run tracks anything with a start, a duration, and an outcome: a compute job, a lab instrument session, or
        any other long process. Runs can be linked directly to the notebook page that writes them up (
        <code className="font-mono text-primary text-[12.5px]">{'\\run{}'}</code> in the notebook editor), so the
        write-up sits next to the data that produced it instead of three tabs away.
      </P>

      <H2>How they fit together</H2>
      <UL>
        <li><strong className="text-foreground">Today</strong> is your hourly view of the current day - drag tasks onto it to schedule them as calendar events.</li>
        <li><strong className="text-foreground">Tasks</strong> is every task you have, regardless of date, grouped by status.</li>
        <li><strong className="text-foreground">Analytics</strong> is computed from your calendar (actual time) and task history (completion, postponement) - not from estimates alone.</li>
        <li><strong className="text-foreground">Team and Lab</strong> is entirely optional and additive: your personal projects and tasks work identically whether or not you ever create or join a team.</li>
      </UL>

      <DocsPager slug="core-concepts" />
    </div>
  );
}
