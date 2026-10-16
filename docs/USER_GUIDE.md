# Rune user guide

This guide covers everyday use of Rune. It assumes the app is already running. For installation, see the main [README](../README.md). For accounts and administration, see the [Administrator Guide](ADMINISTRATOR_GUIDE.md).

The in-app **Help** page (in the sidebar) is a shorter, searchable version of this guide.

---

## 1. Signing in and first-time setup

1. Go to `/login`. New here? Choose **Create an account** and enter an email address and a password (at least 10 characters). If your administrator created your account in advance, sign in with the email and password they gave you. (If you see "Sign-ups are closed", ask your administrator for an account.)
2. Forgot your password? Choose **Forgot password?** on the sign-in page, enter your email and answer the recovery question you picked at sign-up (capitals and punctuation don't matter). If your account has no recovery question, ask your administrator to reset it, then set one in **Settings › Advanced**.
3. The first time you sign in, a short setup takes you through four steps:
   * **Welcome:** enter your name.
   * **Work schedule:** your working days and your start and end times.
   * **Deep work preferences:** your preferred deep work session length.
   * **Review:** confirm your name, time zone, and theme, then finish.

You can change all of this later in **Settings**, and run the setup again from **Settings > Advanced**.

---

## 2. Today

**Today** (`/`) is your view of the current day.

* **Schedule:** an hourly grid for the selected day. Select an empty spot, or **New event**, to add an event. Drag a task onto the grid to schedule it, and drag or resize an event to change it. Everything snaps to 15 minutes.
* **Up next:** the day's open tasks (To do and In progress). Drag one onto the grid to give it a time slot. Blocked tasks are listed separately.
* **Needs attention:** overdue tasks, with quick actions to move them to today or tomorrow, and tasks that a teammate is waiting on you to unblock.
* **Week ahead:** what you finished last week, what is due this week, and upcoming project deadlines. A short prompt at the start of each week offers to help you plan it.
* **Runs:** your active runs at a glance.
* **Review the day:** a short prompt at the end of the day. Note one thing that went well and, optionally, your first task for tomorrow. It becomes a high-priority deep work task.
* **Day status:** the label next to the date (Working day, Off day, or Leave) can be changed for that day. A reason is required for off days and leave. The change affects your analytics for the week.
* **Sync task status:** when on, marking a calendar event done also marks its linked task done. When off, Rune asks first.

Your daily score is not shown on Today. It is in **Analytics** (see §8).

---

## 3. Tasks

The **Tasks** page lists your tasks grouped by status, with a week strip for jumping between days, filters for project and priority, and a name filter.

**Task fields:** name (required), details, project, priority (Low, Medium, High, Critical), planned date, session type, estimated time, and optionally:

* Context, effort and impact (1 to 10), and a linked project objective.
* One or more time slots, which appear on the calendar.
* A team member to assign it to (team projects only, see §13).

When you edit a task you can also change its status and add notes.

**Statuses:**

| Status | Meaning |
|---|---|
| To do | Not started. New tasks start here. |
| In progress | Started but not finished. |
| Blocked | Waiting on something. Add a reason and, optionally, the teammate you are waiting on. They see it under Needs attention on Today. |
| Done | Finished. |

**Moving a task.** Rune never moves a task for you, and unfinished tasks do not carry forward automatically. To reschedule, select **Move**, choose a date, and optionally add a reason. Moved tasks show how many times they were postponed, and you can open the history. Moving a task does not lower your score. The postponement rate in Analytics comes from these moves.

**Finishing a task with several time slots.** Selecting the checkmark opens a list of that task's time slots. Check off the ones you completed. The task's status follows your selection: none checked is To do, some is In progress, all is Done. Its actual time is the total of the checked slots. A task with one time slot, or none, opens a short dialog to confirm the actual start and end times. Those times set its actual time.

**Other actions:** duplicate, delete (which also removes its time slots), and open a discussion about the task with your team. **Export** creates a PDF report of your tasks (see §14).

---

## 4. Projects

The **Projects** page lists your projects, sorted by priority and then deadline. Use the tabs to filter by status (Active, On hold, Completed, Archived) and the color chips to filter by color.

Open a project to:

* See its status, priority, dates, and description.
* Keep an **objectives** checklist. Ticking objectives updates the project's progress. When you create a project you can start from a template (paper, experiment campaign, literature review, method or tool build) to fill in objectives.
* See its tasks, time spent, and next deadline.
* Open its notebooks (see §6) and its Wall (see §5).
* Add collaborators, for team projects (see §13).

The project color appears on its tasks, notebooks, and calendar events.

---

## 5. Wall

Each project has a **Wall**, a freeform board of sticky notes. Open it from the sidebar (**Wall**) or from a project page (**Open wall**).

* Double-click empty space, or select **New note**, to add a note. Drag it anywhere on the board.
* Each note has a color (eight to choose from) and a size (S, M, or L).
* Notes are plain text. Deleting a note is immediate and cannot be undone.
* The board does not update live. Refresh to see changes from other people.

---

## 6. Notebooks

**Notebook** is where you write. The **My Notebooks** page shows a folder for each project and your personal notebooks. A project can have several notebooks. Select **New notebook** to add one.

Each notebook is **one continuous LaTeX document**. You don't need to know LaTeX: the toolbar inserts formatting for you.

* **Sections** are headings inside the document (`\section`). The outline on the left lists them. Use **+** to insert a section or a template.
* **View:** **Write** shows the source, **Preview** shows the rendered document, and **Split** shows both. Text color and highlight only appear in Split and Preview.
* **Math:** wrap math in `$...$` for inline, or use an equation environment. The **Equations** and **References** tabs list what is in the document, and a symbols panel inserts math symbols.
* **Figures:** paste a screenshot into the editor, or use **Insert image** to upload a file or use a URL. Add a caption and a label.
* **Cross-references and citations:** use `\label`, `\ref`, and `\cite`. They are numbered and linked automatically. Use `\run{}` to reference a run.
* **Details:** tags, attachments, and linked runs.
* **Dictation:** the microphone button in the toolbar transcribes speech into the document at your cursor. It uses your browser's built-in speech recognition where available, or a local, on-device fallback otherwise - either way, nothing to configure. If neither is available, the button explains why.
* **Saving:** changes autosave. **Save** (Ctrl+S, or Cmd+S on Mac) also stores a version. **History** lists saved versions, lets you preview one, and lets you restore it. Restoring saves the current content as a new version first.
* **Commands:** press Ctrl+Shift+K (Cmd+Shift+K) to switch notebooks, jump to a section, or insert content.
* **Export:** **Export** creates a PDF (see §14).

**Comments and review.** Notebooks that belong to a project have **Comments** and **Ask for review**. Comments attach to text you select in the preview. For a notebook in a team project, **Ask for review** opens a searchable list of the people who can review it: the team owner and the team leaders who can edit that project. Pick one and only they are notified; they can comment and mark the document reviewed. If they later lose access, Rune tells you and lets you choose someone else. Only the notebook's owner can request a review. Personal notebooks don't have comments or review.

---

## 7. Calendar and scheduling

Calendar events can stand alone or link to a task. A linked event keeps its session type in sync with the task.

**Completing a time slot.** Hover an event on the grid and select its status icon to mark exactly that slot done or not done. If the task has several time slots, its status follows how many are done: none is To do, some is In progress, all is Done. This works the same from the calendar and from the Tasks page.

---

## 8. Analytics

**Analytics** shows how your time went. It has tabs for Overview, Completion, Deep work, Hours, and Projects, plus a day inspector and a work calendar.

* **Daily score (0 to 100):** 50% task completion rate, 30% deep work time (four hours counts as full marks), and 20% total logged time (eight hours counts as full marks). Rescheduling a task is not penalized. A day with nothing tracked shows a dash.
* **Deep work and focus time:** time in deep work and focus slots. The deep versus shallow split compares deep work with everything else.
* **Completion rate:** the share of planned tasks marked done.
* **Postponement rate:** how often, on average, a task is moved off its original date.
* **Hours:** total hours, and the average per working day.
* **Time by objective:** planned versus actual hours for each objective in a project, with a CSV export.

Hours are actual time, recorded from time slots you checked off. A task with no recorded time contributes nothing rather than its estimate. Averages use your working days. Work on an off day still counts, and the **Show work on off days** switch controls whether it appears on that day or is merged into the nearest working day.

**After restoring a backup.** Restored data keeps its original dates. Lifetime averages and totals run from the earlier of your account's creation date and the earliest activity in your data, so an older account and your current one read as one continuous history.

---

## 9. Runs and instruments

**Runs** tracks anything with a start, a duration, and an outcome: a compute job, an experiment, an instrument run, or any other long process.

* **Create a run:** select **New run**, enter a name, and choose a category: General, HPC job, or bench or instrument. HPC and instrument runs add fields for the queue, script, sample, and protocol. You can attach an instrument, link a task or notebook, and set a projected start and end.
* **Views:** **Live** shows queued and running runs with elapsed time and progress. **History** lists every run, with filters and a PDF export. **Instruments** lists your instruments. **Timeline** shows the projected schedule.
* **Status:** a queued run moves to Running at its projected start time. You finish it yourself with **Complete**, or select **Report failure** if it didn't work. Reporting a failure can also resubmit the run as a new attempt. Every attempt is kept in the run's history.
* **Reminders:** while a run is in progress, Rune sends a first check-in after a set time, repeats it until the run ends, and alerts you when it is almost finished and when it is past its projected end. You also get a notification when a run is finished or ended. Defaults are in **Settings > Notifications and reminders**, and each run can turn reminders off.
* **Instruments** store specs (CPU, GPU, memory) and runtime limits you can reuse. You can share an instrument with your team so it appears in everyone's run form. Only you can edit it.

---

## 10. Notifications

The bell in the header shows your new notifications. **View all notifications** opens the full list, where you can filter by type.

Rune notifies you about:

* Tasks assigned to you, and accepted or declined by the person you assigned them to.
* A teammate marking a task as blocked on you.
* A to-do task reaching its scheduled start ("Time to get started", with **Start task** and **Dismiss**), while Rune is open. If Rune was closed at that moment, you see it when you come back, as long as the time slot is still running.
* Runs: check-ins, almost finished, past projected end, and finished or ended.
* Your weekly digest.
* Notebook review requests and comments.
* Mentions in team chat.

In **Settings > Notifications and reminders** you can turn task reminders on or off and choose which other types you receive.

---

## 11. Search and keyboard shortcuts

Press **Ctrl+K** (**Cmd+K** on Mac) to search your tasks, projects, notebooks, and runs, or to go to any page or create a task.

| Shortcut | Action |
|---|---|
| Alt + D | Today |
| Alt + P | Projects |
| Alt + T | Tasks |
| Alt + J | Runs |
| Alt + A | Analytics |
| Alt + S | Settings |
| ? | Show or hide the shortcut list (outside a text field) |
| Esc | Close a dialog |
| Ctrl + S (Cmd + S) | Save a notebook |
| Ctrl + Shift + K (Cmd + Shift + K) | Notebook commands |

---

## 12. Settings

**Settings** has these sections:

* **General:** display name, time zone, profile photo, theme (dark or light), and font size.
* **Task preferences:** sync task status, allow overlapping tasks, and show work on off days.
* **Notifications and reminders:** task reminders, run check-in timing, and which other notification types you receive.
* **Calendar and scheduling:** workday start and end, working days, and your preferred deep work window and session length. You can also mark individual dates as off days, leave, or other. The deep work window and session length are saved as preferences and do not restrict scheduling.
* **Integrations and API tokens:** create access tokens for the Rune MCP server and chat bots (see §15).
* **Data and export:** **Download backup** saves your projects, tasks, calendar events, notebooks, runs, and settings as one JSON file. **Restore backup** loads a file into your account. Wall notes and team data (membership, chat, notebook comments and history) are not included.
* **Advanced:** run the setup again, and change your password.
* **Danger zone:** permanently delete your account and everything you own.

> [!WARNING]
> Restoring a backup **replaces** your current workspace with the contents of the file. You can't undo this. Download a backup of your current data first if you want to keep it.

Deleting your account is blocked if you are the only Owner of a team that still has other members. Transfer ownership or remove them first.

---

## 13. Teams and Lab

**Team** (`/teams`) is optional. Your personal tasks and projects stay the same whether or not you use it.

* **Create or join.** Creating a team makes you its **Owner**. To join, open an invite link or paste an invite code. That is the whole opt-in step.
* **Roles.** Each team has one Owner, any number of **Team leaders**, and **Members**. Team leaders have their own group of members, and a member can be in more than one group.
  * The Owner manages the team, its members, roles, and invites, and sees every team project.
  * Team leaders can create invites for members. They can be given access to projects and assign tasks on projects they can edit.
  * Members work on the projects they have been added to.
* **Project visibility is per project.** Being in someone's group does not show you their projects. The Owner or a team leader with access adds you as a collaborator on a specific project. A project can also be made visible to team leaders whose group works on it (read-only).
* **Assigning tasks.** On a team project, the Owner or a team leader with access can assign a task to a member. The task appears in that person's own plan, and they accept or decline it.
* **Hierarchy.** The team page shows who reports to whom. Select a person to see the projects and progress you have access to.
* **Leaving or being removed** only affects team access. Your personal data is untouched.

**Team chat** has three kinds of conversation:

* **Direct:** a private conversation with another member.
* **Group:** one thread per team leader's group. The Owner can see and post in all of them, and a team leader always sees their own.
* **Whole team:** everyone on the team.

Tasks and projects also have their own discussion threads. A small badge in the chat header shows how messages arrive: **Live** appears instantly, and **Auto-refresh** checks every few seconds. Which one you get depends on whether your administrator has set up real-time delivery (see the Administrator Guide). Messages are never lost either way.

**Lab** (in the sidebar, once you are on a team) shows project health across your team: active projects, deadlines within a week, blocked tasks, notebook pages waiting on your review, and a standup summary of the last 7 days.

---

## 14. Exports

* **Tasks (PDF):** on **Tasks**, select **Export**. Choose a date range, projects, status, and priority.
* **Notebook (PDF):** in a notebook, select **Export**. Choose a profile (Research report, Full, or Minimal) and whether to include a cover page, header, footer, and summary page.
* **Runs (PDF):** on the **History** tab of **Runs**, select **Export PDF** to save the runs that match your filters.
* **Objectives (CSV):** on **Analytics**, under **Time by objective**, select **Export CSV**.

---

## 15. Access tokens and the MCP server

You can let other tools, such as chat bots, read and edit your tasks, calendar, and projects on your behalf.

1. In **Settings > Integrations and API tokens**, create a token. It is shown once, so copy it.
2. Use it with the Rune MCP server (see `mcp-server/README.md`).

A token can't change your password, export your data, or manage teams. You can revoke it at any time from the same screen.

---

## 16. Help

The **Help** page is a searchable reference covering the basics, shortcuts, exports, and common questions.
