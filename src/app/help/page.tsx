'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { EmptyState, PageHeader, SectionHeader } from '@/components/ui';
import { Spot } from '@/components/brand/Spot';
import { NavIcon, type NavIconName } from '@/components/marketing/FeatureIcons';
import { GithubIcon } from '@/components/icons/GithubIcon';
import { GITHUB_REPO_URL } from '@/lib/links';
import {
  Search,
  BookOpen,
  PlayCircle,
  Calendar,
  CheckSquare,
  BarChart3,
  FileDown,
  Rocket,
  FolderGit2,
  Settings,
  Keyboard,
  Cpu,
  Users,
  KeyRound
} from 'lucide-react';

interface DocItem {
  title: string;
  description: string;
  details: string[];
}

interface DocSection {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  description: string;
  items: DocItem[];
  keywords: string[];
}

const DOCS_DATA: DocSection[] = [
  {
    id: 'welcome',
    title: 'Welcome to Rune',
    icon: Rocket,
    color: '#3b82f6', // blue
    description: 'A two-minute overview of what Rune does and where to start.',
    items: [
      {
        title: 'What Rune does',
        description: 'Rune helps you plan your day, track what you finish, keep research notes, and see how your time is spent.',
        details: [
          'Projects group related work, such as a thesis, a paper, or a course. Tasks are the individual things you do on a given day, and can belong to a project.',
          'Today shows your schedule and tasks for the current day. Analytics shows your daily score and trends over time.',
          'Notebooks are for writing: research notes, meeting minutes, and LaTeX documents. Each notebook belongs to a project or is personal.',
          'Runs track long-running work, such as compute jobs and instrument runs.',
          'Nothing is required. You can use only tasks and add the rest when you need it.'
        ]
      },
      {
        title: 'Your first five minutes',
        description: 'Create one real task, then check your settings.',
        details: [
          'On Today or Tasks, select New task and create one small, real task for today. Only the name is required.',
          'Open the task again and look at the fields you skipped: priority, session type, effort, and impact. You can set them later.',
          'In Settings, check your time zone under General and your working hours under Calendar and scheduling. Scheduling and analytics depend on both.'
        ]
      },
      {
        title: 'Moving from another account',
        description: 'Use a backup to move your data.',
        details: [
          'In Settings, under Data and export, download a backup of your projects, tasks, notebooks, and settings. Then restore it on the other account.',
          'Restoring replaces the data on the account you restore to. Download a backup of that account first if you want to keep anything on it.',
          'Restored data keeps its original dates. Analytics combine it with your new activity into one continuous history.'
        ]
      }
    ],
    keywords: ['welcome', 'introduction', 'overview', 'new user', 'getting started', 'what is rune', 'first steps']
  },
  {
    id: 'getting-started',
    title: 'Tasks and projects',
    icon: PlayCircle,
    color: '#3b82f6', // blue
    description: 'The basic loop: create a project, add tasks, and work through your day.',
    items: [
      {
        title: 'Create a project',
        description: 'A project groups related tasks, objectives, and notebooks.',
        details: [
          'Go to Projects and select New project.',
          'Enter a name. Description, deadline, priority, and status are optional and can be changed later.',
          'Choose a color. It appears on the project’s tasks, notebooks, and calendar events so you can recognize them at a glance.',
          'Add objectives if the project has clear milestones. Objectives are a checklist, and tasks can link to them. A template can fill them in for you.'
        ]
      },
      {
        title: 'Create a task',
        description: 'Tasks are the things you plan to do on a given day.',
        details: [
          'Select New task on Today or Tasks, or press Ctrl+K (Cmd+K on Mac) and choose Create task.',
          'Only the name is required. Project, priority, date, and session type have defaults.',
          'Select More options to set effort and impact, link an objective, or add time slots. When you edit a task you can also change its status and add notes.',
          'To give a task a specific time, add a time slot, or drag it from Up next onto the calendar on Today.'
        ]
      },
      {
        title: 'A typical day',
        description: 'How Rune fits into a working day.',
        details: [
          'Morning: open Today, check the schedule, and add anything new.',
          'During the day: mark tasks done as you finish them.',
          'If a task won’t get done today, use Move to pick a new date. Rune records each move so you can see which tasks keep slipping.',
          'End of day: Review the day is a short prompt to note what went well and set your first task for tomorrow.'
        ]
      }
    ],
    keywords: ['create project', 'create task', 'schedule work', 'getting started', 'setup', 'objectives', 'basics']
  },
  {
    id: 'calendar',
    title: 'Calendar and scheduling',
    icon: Calendar,
    color: '#10b981', // emerald
    description: 'The schedule on Today shows when things happen, not only what.',
    items: [
      {
        title: 'Create an event',
        description: 'Add a time block for a task or anything else.',
        details: [
          'Select an empty spot on the grid, or New event, to open the event form with that time filled in.',
          'Choose a session type (deep work, focus, or regular) so the time counts correctly in analytics.',
          'Set the start and end. The grid snaps to 15-minute steps.'
        ]
      },
      {
        title: 'Schedule a task by dragging it',
        description: 'The fastest way to turn a task into a time slot.',
        details: [
          'Unscheduled tasks appear under Up next on Today.',
          'Drag one onto the grid. Rune creates a time slot with the task’s estimated duration.',
          'With Sync task status on, marking a time slot done also marks its linked task done. With it off, Rune asks first.'
        ]
      },
      {
        title: 'Change a scheduled time slot',
        description: 'A time slot stays flexible once it’s on the calendar.',
        details: [
          'Drag the top or bottom edge to change the duration.',
          'Drag the middle of the block to move it to another time on the same day.',
          'Everything snaps to 15-minute steps.'
        ]
      },
      {
        title: 'Off days and leave',
        description: 'Change how a single day counts without changing your default week.',
        details: [
          'On Today, select the status next to the date (Working day, Off day, or Leave).',
          'A reason is required for off days and leave.',
          'The change affects your weekly analytics and is saved to your settings.'
        ]
      }
    ],
    keywords: ['calendar', 'events', 'linking tasks', 'rescheduling', 'snap', 'resize', 'drag and drop', 'timeline', 'off day', 'leave']
  },
  {
    id: 'daily-tasks',
    title: 'Task details',
    icon: CheckSquare,
    color: '#f97316', // orange
    description: 'Statuses, moving tasks, and session types.',
    items: [
      {
        title: 'Task statuses',
        description: 'A task is always in one of four states.',
        details: [
          'To do: not started. New tasks start here.',
          'In progress: started but not finished.',
          'Blocked: can’t move until something clears. Add a reason and, if it applies, the teammate you’re waiting on. They see it under Needs attention.',
          'Done: finished. If a task has several time slots, Rune asks which ones you completed, and the task stays In progress until all of them are done.',
          'There is no percent complete. Use the notes field or a notebook for more detail.'
        ]
      },
      {
        title: 'Moving a task',
        description: 'Rune never moves a task for you. You pick a new date, and Rune records it.',
        details: [
          'Select Move on a task and choose a new date. You can add a reason.',
          'A moved task shows how many times it has been postponed, and its history is available.',
          'This keeps tasks that repeatedly slip visible. It doesn’t lower your score.',
          'The postponement rate in Analytics is based on these moves.'
        ]
      },
      {
        title: 'Session types',
        description: 'Every task and time slot is deep work, focus, or regular work.',
        details: [
          'Deep work: your highest-concentration time. Uninterrupted and mentally demanding, such as writing or hard problem-solving.',
          'Focus: steady, engaged work that is less demanding than deep work.',
          'Regular work: routine and administrative tasks.',
          'Pick whichever fits. Analytics uses session types to show where your best hours go.'
        ]
      }
    ],
    keywords: ['tasks', 'status', 'postpone', 'move task', 'deep work', 'focus', 'session type', 'to do', 'done', 'blocked']
  },
  {
    id: 'notebooks',
    title: 'Notebooks',
    icon: BookOpen,
    color: '#a855f7', // purple
    description: 'A writing space for research notes and documents, separate from your task list.',
    items: [
      {
        title: 'How notebooks are organized',
        description: 'Each notebook is one continuous LaTeX document.',
        details: [
          'Open Notebook to see My Notebooks. Each project has a folder, and you can also keep personal notebooks that don’t belong to a project.',
          'A project can have several notebooks. Select New notebook inside a project folder to add one.',
          'Sections are headings inside the document (\\section). They are listed in the outline on the left.',
          'Use + in the outline to insert a section or a template.',
          'Press Ctrl+Shift+K (Cmd+Shift+K on Mac) to switch notebooks, jump to a section, or insert content from the keyboard.'
        ]
      },
      {
        title: 'Writing and formatting',
        description: 'You write in LaTeX, with a toolbar for common formatting.',
        details: [
          'You don’t need to know LaTeX. The toolbar adds headings, bold, italic, lists, tables, and links around the text you select.',
          'Write shows the source, Preview shows the rendered document, and Split shows both. Split is the easiest way to see what each toolbar button does.',
          'Text color and highlight only show in Split or Preview. In Write view they appear as markup.',
          'Changes autosave. Saving with Ctrl+S (Cmd+S on Mac) also stores a version you can restore from History.'
        ]
      },
      {
        title: 'Equations, figures, tables, and citations',
        description: 'Built for technical and research writing.',
        details: [
          'Equations: wrap math in $ for inline (such as $x^2$), or use an equation environment for a numbered block.',
          'Figures: paste a screenshot into the editor, or use Insert image to upload a file or use a URL. Add a caption and a label.',
          'Tables, labels, references, and citations: use the toolbar buttons. \\label, \\ref, and \\cite are numbered and linked for you.',
          'Runs: use \\run{} to reference a run from the document.',
          'The Equations and References tabs list everything in the document so you can reuse it.'
        ]
      },
      {
        title: 'History, comments, and review',
        description: 'Restore earlier versions and get feedback from your team.',
        details: [
          'History lists saved versions. Select one to preview it, then restore it. Restoring saves the current content as a new version first.',
          'For a notebook in a team project, Ask for review lets you pick one reviewer: the team owner or a team leader who can edit that project. Only they are notified, and they can comment and mark it reviewed.',
          'Comments and review are available on notebooks that belong to a project. Comments attach to text you select in the preview.'
        ]
      }
    ],
    keywords: ['notebook', 'formatting', 'latex', 'equations', 'images', 'figures', 'cross reference', 'sections', 'color', 'highlight', 'history', 'review', 'comments']
  },
  {
    id: 'runs',
    title: 'Runs',
    icon: Cpu,
    color: '#0ea5e9', // sky
    description: 'Track compute jobs, instrument runs, and other long processes.',
    items: [
      {
        title: 'Create a run',
        description: 'A run is anything that takes a while and might need a second attempt.',
        details: [
          'Go to Runs and select New run. Enter a name and choose a category: General, HPC job, or bench or instrument.',
          'HPC and instrument runs add fields for the queue, script, sample, and protocol.',
          'Optionally attach an instrument, link a task or notebook, and set the projected start and end.'
        ]
      },
      {
        title: 'Follow a run',
        description: 'See what’s running, what finished, and what failed.',
        details: [
          'Live shows queued and running runs with elapsed time and progress. History lists every run. Timeline shows the projected schedule.',
          'Select Complete when a run finishes, or Report failure if it doesn’t. When you report a failure you can also resubmit it as a new attempt.',
          'Every attempt is kept in the run’s history.'
        ]
      },
      {
        title: 'Reminders and instruments',
        description: 'Check in on runs and reuse your setups.',
        details: [
          'Rune can remind you to check on a run: a first reminder after a set time, repeat reminders until it finishes, and alerts as it nears and passes its projected end. Set the defaults in Settings under Notifications and reminders.',
          'Instruments store specs and runtime limits that you can reuse. Share an instrument with your team so it appears in everyone’s run form.'
        ]
      }
    ],
    keywords: ['runs', 'jobs', 'hpc', 'instruments', 'experiments', 'compute', 'attempts', 'reminders', 'failure']
  },
  {
    id: 'teams',
    title: 'Teams',
    icon: Users,
    color: '#8b5cf6', // violet
    description: 'Teams are optional. They let a lab or group share projects, tasks, and notebooks.',
    items: [
      {
        title: 'Create or join a team',
        description: 'Team features turn on when you create or join your first team.',
        details: [
          'Go to Team and create a team, or join one with an invite link.',
          'Your personal projects and tasks stay as they are.'
        ]
      },
      {
        title: 'Roles and sharing',
        description: 'What each role can do.',
        details: [
          'Owner: manages the team, its members, and its invites.',
          'Team leader: can be given access to projects and assign tasks on them.',
          'Member: works on the projects they’ve been added to.',
          'The Owner sees every team project. Everyone else sees a team project only if they’re added as a collaborator under People on the project page.'
        ]
      },
      {
        title: 'Lab overview and chat',
        description: 'See how the team is doing and talk about the work.',
        details: [
          'Lab shows project health across your team, plus a standup summary of the last 7 days.',
          'Team chat has direct messages, group threads, and a whole-team thread. Tasks and projects also have their own discussions.'
        ]
      }
    ],
    keywords: ['team', 'lab', 'invite', 'roles', 'owner', 'members', 'collaborators', 'chat']
  },
  {
    id: 'analytics',
    title: 'Analytics',
    icon: BarChart3,
    color: '#f59e0b', // amber
    description: 'Numbers that show how your time actually went.',
    items: [
      {
        title: 'Core metrics',
        description: 'What each number on the Analytics page measures.',
        details: [
          'Deep work hours: time in deep work slots. Focus time adds focus slots.',
          'Completion rate: the share of planned tasks marked done.',
          'Postponement rate: how often, on average, a task is moved off its original date. A high number means your plans and your days don’t match. It isn’t a failure.',
          'Averages use your working days. Work logged on an off day still counts.'
        ]
      },
      {
        title: 'The daily score',
        description: 'A 0 to 100 number that combines three signals. It’s most useful as a trend.',
        details: [
          '50% comes from your task completion rate for the day.',
          '30% comes from deep work time. Four hours counts as full marks.',
          '20% comes from total logged time. Eight hours counts as full marks.',
          'Moving a task isn’t penalized. A task you postpone and then finish still counts through the completion rate.',
          'A day with nothing tracked shows a dash instead of a score.'
        ]
      },
      {
        title: 'After restoring a backup',
        description: 'How the lifetime numbers are calculated.',
        details: [
          'Restored data keeps its original dates. Lifetime averages and totals run from the earlier of your account’s creation date and the earliest activity in your data.',
          'Nothing is treated as a separate period, so an older account and your current one read as one continuous history.'
        ]
      }
    ],
    keywords: ['analytics', 'metrics', 'productivity score', 'deep work analytics', 'score', 'charts', 'postponement rate', 'backup']
  },
  {
    id: 'settings',
    title: 'Settings',
    icon: Settings,
    color: '#06b6d4', // cyan
    description: 'Where to adjust Rune to how you work.',
    items: [
      {
        title: 'Theme and font size',
        description: 'In Settings, under General.',
        details: [
          'Switch between dark and light at any time. It applies immediately and is saved to your account.',
          'Font size (small, medium, or large) scales the whole interface.'
        ]
      },
      {
        title: 'Working hours and days',
        description: 'In Settings, under Calendar and scheduling. These affect your calendar grid, planning defaults, and analytics.',
        details: [
          'Set when your workday starts and ends.',
          'Change individual days to off day, leave, or other for holidays and travel, without changing your default week.',
          'Deep work window and session length record when and for how long you prefer to do deep work. They are saved with your profile and don’t restrict scheduling.'
        ]
      },
      {
        title: 'Backups',
        description: 'In Settings, under Data and export.',
        details: [
          'Download backup saves your projects, tasks, calendar events, notebooks, runs, and settings as one file. Do this before big changes, or now and then.',
          'Restore backup loads a file into this account and replaces what is there. You’ll be asked to confirm first.',
          'Wall notes and team data aren’t included in a backup.'
        ]
      },
      {
        title: 'Password',
        description: 'In Settings, under Advanced.',
        details: [
          'Change your password here at any time.',
          'Forgot it? Use "Forgot your password?" on the sign-in page.'
        ]
      }
    ],
    keywords: ['settings', 'theme', 'dark mode', 'light mode', 'font size', 'working hours', 'backup', 'export', 'restore', 'password']
  },
  {
    id: 'integrations',
    title: 'Access tokens and MCP',
    icon: KeyRound,
    color: '#64748b', // slate
    description: 'Let chat bots and other tools work with your tasks and schedule.',
    items: [
      {
        title: 'Create an access token',
        description: 'In Settings, under Integrations and API tokens.',
        details: [
          'Create a token and copy it. It is shown once.',
          'Use it with the Rune MCP server to read and edit your tasks, calendar, and projects from an MCP client or a chat bot.',
          'A token can’t change your password, export your data, or manage teams. Revoke it at any time from the same screen.'
        ]
      }
    ],
    keywords: ['api', 'token', 'mcp', 'bot', 'whatsapp', 'telegram', 'integration']
  },
  {
    id: 'shortcuts',
    title: 'Keyboard shortcuts',
    icon: Keyboard,
    color: '#3b82f6', // blue
    description: 'Press ? outside a text field to see the list at any time.',
    items: [
      {
        title: 'Navigation',
        description: 'Go to a page without touching the sidebar.',
        details: [
          'Alt + D: Today',
          'Alt + P: Projects',
          'Alt + T: Tasks',
          'Alt + J: Runs',
          'Alt + A: Analytics',
          'Alt + S: Settings',
          'Ctrl + K (Cmd + K on Mac): search, or go to any page'
        ]
      },
      {
        title: 'Forms and dialogs',
        description: 'Applies to the task form and most other forms.',
        details: [
          'Enter: submit the form (outside a multi-line text box).',
          'Escape: close the dialog without saving.',
          '?: show or hide the shortcuts list, outside a text field.'
        ]
      },
      {
        title: 'Notebooks',
        description: 'Available while a notebook is open.',
        details: [
          'Ctrl + S (Cmd + S on Mac): save.',
          'Ctrl + Shift + K (Cmd + Shift + K on Mac): notebook commands.'
        ]
      }
    ],
    keywords: ['keyboard shortcuts', 'hotkeys', 'alt', 'navigation', 'shortcuts', 'search']
  },
  {
    id: 'pdf-exports',
    title: 'Exports and reports',
    icon: FileDown,
    color: '#0891b2', // sky
    description: 'Turn your work into a document you can share or keep.',
    items: [
      {
        title: 'Task report (PDF)',
        description: 'A summary of your task activity over a date range.',
        details: [
          'On Tasks, select Export, choose the dates, projects, status, and priority, then select Export PDF.',
          'The report lists each task with its project, date, priority, status, and estimate, plus totals for done and not done tasks.'
        ]
      },
      {
        title: 'Notebook (PDF)',
        description: 'Export a notebook as a finished document.',
        details: [
          'Select Export in the notebook toolbar.',
          'Choose a profile (Research report, Full, or Minimal) and whether to include a cover page, header, footer, and summary page.',
          'Formatting, equations, figures, and references are kept.'
        ]
      },
      {
        title: 'Runs (PDF) and objectives (CSV)',
        description: 'Other reports you can export.',
        details: [
          'On the History tab of Runs, select Export PDF to save the runs that match your filters.',
          'On Analytics, under Time by objective, select Export CSV to save planned and actual hours for each objective in a project.'
        ]
      }
    ],
    keywords: ['pdf export', 'reports', 'task reports', 'notebook reports', 'print', 'pdf', 'csv']
  },
  {
    id: 'faq',
    title: 'Common questions',
    icon: FolderGit2,
    color: '#a855f7', // purple
    description: 'Quick answers to things people often ask.',
    items: [
      {
        title: '“I applied a color and nothing happened”',
        description: 'This is almost always the view mode.',
        details: [
          'Text color and highlight add markup that only renders in Split or Preview, not in Write view.',
          'Select the text first. With nothing selected, the color wraps the cursor position and looks like nothing changed.'
        ]
      },
      {
        title: '“Can I use a task without a project?”',
        description: 'Yes. Project is optional on every task.',
        details: []
      },
      {
        title: '“What’s the difference between a project, a notebook, and a section?”',
        description: 'A project groups tasks and can hold several notebooks. A notebook is one LaTeX document that belongs to a project or to you. A section is a heading inside a notebook.',
        details: []
      },
      {
        title: '“My analytics numbers look lower than I expected”',
        description: 'There are two common reasons.',
        details: [
          'Averages include every working day since your start date, including quiet ones. A long stretch with little activity lowers them.',
          'Postponed tasks and work on off days are counted as they happened, not smoothed over.'
        ]
      }
    ],
    keywords: ['faq', 'questions', 'common questions', 'troubleshooting', 'help']
  }
];

// Topic icons come from Rune's own set, in ink - no rainbow of colours.
const TOPIC_ICON: Record<string, NavIconName> = {
  welcome: 'help', 'getting-started': 'today', calendar: 'today', 'daily-tasks': 'tasks', notebooks: 'notebook', runs: 'runs',
  teams: 'teams', analytics: 'analytics', settings: 'settings', integrations: 'settings', shortcuts: 'help', 'pdf-exports': 'notebook', faq: 'help',
};

// The help home groups the guides by what you're trying to do, so the page
// is three short lists rather than ten described cards.
const TOPIC_GROUPS: { label: string; blurb: string; ids: string[] }[] = [
  { label: 'Plan your day', blurb: 'Tasks, the planner and where the time went.', ids: ['getting-started', 'calendar', 'daily-tasks', 'analytics'] },
  { label: 'Research tools', blurb: 'Notebooks, runs and what you can export.', ids: ['notebooks', 'runs', 'pdf-exports'] },
  { label: 'Account and setup', blurb: 'Settings, teams, tokens and shortcuts.', ids: ['settings', 'teams', 'integrations', 'shortcuts'] },
];

// What people most often search for, as one-tap searches.
const POPULAR_SEARCHES = ['working hours', 'equations', 'backup'];

const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const q = searchQuery.trim().toLowerCase();

  // Search runs over every article and passage; each hit links to its place.
  const results = useMemo(() => {
    if (!q) return [];
    const out: { section: DocSection; item: DocItem; snippet: string }[] = [];
    for (const section of DOCS_DATA) {
      for (const item of section.items) {
        const hay = [item.title, item.description, ...item.details];
        const hit = hay.find((t) => t.toLowerCase().includes(q)) || (section.keywords.some((k) => k.includes(q)) ? item.description : null);
        if (hit) out.push({ section, item, snippet: hit });
      }
    }
    return out;
  }, [q]);

  const open = (id: string, anchor?: string) => {
    setSelectedSection(id);
    setSearchQuery('');
    requestAnimationFrame(() => {
      if (anchor) document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      else document.querySelector('main')?.scrollTo({ top: 0 });
    });
  };

  const faq = DOCS_DATA.find((d) => d.id === 'faq');
  const topic = selectedSection ? DOCS_DATA.find((d) => d.id === selectedSection) : null;

  const searchBox = (big: boolean) => (
    <div className={`relative ${big ? 'max-w-xl' : 'max-w-sm'}`}>
      <Search className={`pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint ${big ? 'h-5 w-5' : 'h-4 w-4'}`} />
      <input
        type="search"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder={big ? 'Search for “equations”, “working hours”, “deep work”…' : 'Search help…'}
        aria-label="Search help"
        className={`w-full rounded-[12px] border border-border-strong bg-surface text-foreground placeholder-ink-faint focus:border-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/20 ${big ? 'h-12 pl-11 pr-4 text-[15.5px]' : 'h-9 pl-9 pr-3 text-[13.5px]'}`}
      />
    </div>
  );

  // ---------------------------------------------------------- search results
  if (q) {
    return (
      <div className="mx-auto max-w-4xl space-y-8">
        <PageHeader className="" title="Help" subtitle={`${results.length} ${results.length === 1 ? 'answer' : 'answers'} for “${searchQuery.trim()}”`} />
        {searchBox(true)}
        {results.length === 0 ? (
          <EmptyState spot="search" title="Nothing matches that" message="Try a shorter word, or ask on GitHub and we’ll add the answer here." action={<a href={`${GITHUB_REPO_URL}/issues`} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center rounded-[9px] border border-border-strong bg-surface px-3.5 text-[14px] font-semibold hover:bg-surface-raised">Ask a question</a>} />
        ) : (
          <ul className="divide-y divide-border border-t border-foreground/75">
            {results.map(({ section, item, snippet }) => (
              <li key={section.id + item.title}>
                <button onClick={() => open(section.id, slug(item.title))} className="group block w-full py-4 text-left">
                  <span className="text-[12.5px] text-ink-faint">{section.title}</span>
                  <span className="mt-0.5 block text-[16px] font-semibold text-foreground group-hover:text-primary">{item.title}</span>
                  <span className="mt-1 line-clamp-2 block text-[14px] leading-relaxed text-ink-secondary">{snippet}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------- one article
  if (topic) {
    return (
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Help topics" className="hidden lg:block lg:sticky lg:top-0 lg:self-start">
          <button onClick={() => setSelectedSection(null)} className="mb-4 text-[13.5px] text-ink-secondary hover:text-foreground">← Help home</button>
          <ul className="space-y-0.5">
            {DOCS_DATA.map((d) => (
              <li key={d.id}>
                <button
                  onClick={() => open(d.id)}
                  aria-current={d.id === topic.id ? 'page' : undefined}
                  className={`w-full rounded-[8px] px-2.5 py-[7px] text-left text-[14px] transition-colors ${d.id === topic.id ? 'bg-surface font-semibold text-foreground shadow-[0_0_0_1px_var(--border-c)]' : 'text-ink-secondary hover:bg-surface-sunken hover:text-foreground'}`}
                >
                  {d.title}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <article className="min-w-0 max-w-[70ch]">
          <button onClick={() => setSelectedSection(null)} className="mb-4 text-[13.5px] text-ink-secondary hover:text-foreground lg:hidden">← Help home</button>
          <p className="flex items-center gap-2 text-[13px] text-ink-faint"><NavIcon name={TOPIC_ICON[topic.id] ?? 'help'} size={16} /> Help</p>
          <h1 className="app-title mt-2">{topic.title}</h1>
          <p className="mt-3 text-[17px] leading-relaxed text-ink-secondary">{topic.description}</p>
          <div className="mt-10 space-y-10">
            {topic.items.map((item) => (
              <section key={item.title} id={slug(item.title)} className="scroll-mt-6">
                <h2 className="border-t border-border pt-6 font-serif text-[22px] font-medium tracking-[-0.01em] text-foreground">{item.title}</h2>
                <p className="mt-2 text-[16px] leading-[1.7] text-foreground/90">{item.description}</p>
                <ul className="mt-3 space-y-2 pl-5 text-[15.5px] leading-[1.7] text-ink-secondary marker:text-ink-faint list-disc">
                  {item.details.map((d) => <li key={d}>{d}</li>)}
                </ul>
              </section>
            ))}
          </div>
          <div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6 text-[14px] text-ink-secondary">
            <span>Still not sure? <a href={`${GITHUB_REPO_URL}/issues`} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground">Ask on GitHub</a>.</span>
            <button onClick={() => setSelectedSection(null)} className="font-medium text-foreground hover:text-primary">All help topics →</button>
          </div>
        </article>
      </div>
    );
  }

  // ---------------------------------------------------------- help home
  const byId = (id: string) => DOCS_DATA.find((d) => d.id === id)!;
  return (
    <div className="mx-auto max-w-5xl space-y-14 pb-10">
      {/* 1. Ask */}
      <section className="grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <h1 className="app-title">How can we help?</h1>
          <p className="mt-3 max-w-[52ch] text-[16px] leading-relaxed text-ink-secondary">Search for an answer, or browse the guides below.</p>
          <div className="mt-6">{searchBox(true)}</div>
          <p className="mt-3 text-[13.5px] text-ink-secondary">
            Often searched:{' '}
            {POPULAR_SEARCHES.map((term, i) => (
              <React.Fragment key={term}>
                {i > 0 && <span aria-hidden="true"> · </span>}
                <button type="button" onClick={() => setSearchQuery(term)} className="font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground">
                  {term}
                </button>
              </React.Fragment>
            ))}
          </p>
        </div>
        <Spot kind="help" size={180} className="hidden md:block" />
      </section>

      {/* 2. Self-service: start here, then the guides by purpose */}
      <section className="space-y-10">
        <button
          type="button"
          onClick={() => open('welcome')}
          className="group flex w-full items-center justify-between gap-4 rounded-[14px] border border-border bg-surface px-5 py-4 text-left transition-colors hover:border-border-strong"
        >
          <span>
            <span className="block text-[15.5px] font-semibold text-foreground">New to Rune? Start here</span>
            <span className="mt-0.5 block text-[14px] text-ink-secondary">What Rune does and your first five minutes, step by step.</span>
          </span>
          <span className="shrink-0 text-ink-faint transition-transform group-hover:translate-x-1 group-hover:text-foreground" aria-hidden="true">→</span>
        </button>

        <div className="grid gap-x-10 gap-y-8 sm:grid-cols-3">
          {TOPIC_GROUPS.map((g) => (
            <nav key={g.label} aria-label={g.label}>
              <h2 className="text-[15px] font-semibold text-foreground">{g.label}</h2>
              <p className="mt-0.5 text-[13.5px] text-ink-secondary">{g.blurb}</p>
              <ul className="mt-3 border-t border-border">
                {g.ids.map((id) => (
                  <li key={id} className="border-b border-border">
                    <button onClick={() => open(id)} className="group flex w-full items-center gap-3 py-3 text-left text-[14.5px] text-foreground hover:text-primary">
                      <NavIcon name={TOPIC_ICON[id] ?? 'help'} size={17} className="text-ink-faint group-hover:text-primary" />
                      {byId(id).title}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </section>

      {/* 3. Common questions, as links to their answers */}
      {faq && (
        <section>
          <SectionHeader title="Common questions" right={<button onClick={() => open('faq')} className="text-[12.5px] text-ink-secondary hover:text-foreground">All questions →</button>} />
          <ul className="mt-2 grid gap-x-10 sm:grid-cols-2">
            {faq.items.slice(0, 4).map((it) => (
              <li key={it.title} className="border-b border-border">
                <button onClick={() => open('faq', slug(it.title))} className="w-full py-3 text-left text-[14.5px] text-foreground hover:text-primary">
                  {it.title.replace(/[“”]/g, '')}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[13.5px] text-ink-secondary">
            Setting up a server or looking for the API?{' '}
            <Link href="/docs" className="font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground">Read the full documentation</Link>.
          </p>
        </section>
      )}

      {/* 4. A person - kept apart from the self-service help above */}
      <section className="flex flex-col gap-4 rounded-[16px] bg-surface-sunken/70 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div>
          <h2 className="font-serif text-[21px] font-medium">Talk to a person</h2>
          <p className="mt-1 text-[14px] leading-relaxed text-ink-secondary">Found a bug or can’t find an answer? Describe what you saw and what you expected; a real person reads every report.</p>
        </div>
        <a
          href={`${GITHUB_REPO_URL}/issues/new`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[10px] border border-border-strong bg-surface px-4 text-[14px] font-semibold hover:bg-surface-raised"
        >
          <GithubIcon className="h-4 w-4" /> Report a problem
          <span className="sr-only"> (opens GitHub in a new tab)</span>
        </a>
      </section>
    </div>
  );
}
