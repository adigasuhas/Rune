'use client';

import { withoutCancelled } from '@/lib/taskCancel';
import React, { useState, useEffect } from 'react';
import { LoadError } from '@/components/LoadError';
import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  getWorkingDaysBetween,
  getLastNWorkingDays,
  calculateWorkingDayMetrics,
  getActiveDays,
  getAnalyticsDays,
  shiftOffDaysWork,
  calculateOccupiedHoursFromItems,
  calculateProductivityScore,
  getPostponeCount,
  settledDays
} from '@/lib/analyticsUtils';
import { getCurrentDateInTimezone, getLocalDateString, isDefaultWorking } from '@/lib/dateUtils';
import { Button, PageHeader } from '@/components/ui';
import { ActivityGraph } from '@/components/activity/ActivityGraph';
import { ReviewHistory } from './ReviewHistory';
import { ActiveHours, ACTIVE_RANGES, last30, sumAccounts, useActiveAccounts, type ActiveRange } from './ActiveHours';
import { ProjectAnalyticsView, ProjectsAnalyticsList } from './ProjectsAnalytics';
import { ActivityInsights } from './ActivityInsights';
import { AnalyticsSection, DayBars, Fact, Facts, ShareRow, prefKey } from './parts';
import { setUiPreference, setUiPreferences } from '@/lib/useUiPreference';
import type { ProjectInvestment } from '@/components/projects/ProjectRow';
import { AwaySessionsDialog } from '@/components/time/AwaySessionsDialog';
import { AWAY_CHANGED } from '@/lib/useAwaySessions';
import { REFLECTION_SAVED } from '@/components/time/CompletionReflectionPrompt';
import { accountDays, sessionSpan, type ActivityLike } from '@/lib/activityTime';
import type { SheetReflection } from '@/lib/projectTimeSheet';
import { useSpotlightCards } from '@/hooks/useSpotlightCards';
interface Goal {
  id: string;
  text: string;
  completed: boolean;
}

type AnalyticsTab = 'overview' | 'projects' | 'activity' | 'reviews';

function shiftYmd(ymd: string, n: number) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function AnalyticsPage() {
  useSpotlightCards();
  const [loading, setLoading] = useState(true);
  const [showMethodology, setShowMethodology] = useState(false);
  const [tasks, setTasks] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [accomplishments, setAccomplishments] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [notebooks, setNotebooks] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  // Four places: Overview, Projects, Breaks and brain drain, Reflections.
  // The old ?tab= links still land in the right spot: completion, focus and
  // hours are Overview sections now, so they open (and scroll to) that section.
  const [legacySection] = useState<string | null>(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    // Today's "Full year" link (#activity) is the year of work, in "Since you started".
    if (window.location.hash === '#activity') return 'history';
    return t === 'completion' ? 'completion' : t === 'focus' ? 'deep' : t === 'hours' ? 'hours' : null;
  });
  const [activeTab, setActiveTab] = useState<AnalyticsTab>(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    return t === 'reviews' || t === 'projects' || t === 'activity' ? t : 'overview';
  });
  // ?project= opens that project's analytics (the Projects page links here).
  const [openProjectId, setOpenProjectId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('project'));
  const [hoursRange, setHoursRange] = useState<ActiveRange>('week');
  const [investment, setInvestment] = useState<{ days: string[]; projects: Record<string, ProjectInvestment> }>({ days: [], projects: {} });

  // AI Insights States

  // Breaks and brain drain, and the reflections written when tasks were finished.
  const [awaySessions, setAwaySessions] = useState<ActivityLike[]>([]);
  const [reflections, setReflections] = useState<SheetReflection[]>([]);
  const [editingAway, setEditingAway] = useState(false);
  // ?project=&date= open a project's time sheet on a given day.
  const [sheetTarget] = useState(() => {
    const q = new URLSearchParams(window.location.search);
    return { project: q.get('project'), date: q.get('date') };
  });

  const fetchTimeRecords = async () => {
    try {
      const [sessionsRes, reflectionsRes, investmentRes] = await Promise.all([fetch('/api/activity-sessions'), fetch('/api/reflections'), fetch('/api/projects/investment')]);
      if (sessionsRes.ok) setAwaySessions(await sessionsRes.json());
      if (reflectionsRes.ok) setReflections(await reflectionsRes.json());
      if (investmentRes.ok) setInvestment(await investmentRes.json());
    } catch {
      /* the rest of Analytics still works */
    }
  };

  const [loadFailed, setLoadFailed] = useState(false);
  const fetchAllData = async () => {
    void fetchTimeRecords();
    setLoading(true);
    try {
      const [tasksRes, projectsRes, accomplishmentsRes, settingsRes, calendarRes, notebooksRes] = await Promise.all([
        fetch('/api/tasks'),
        fetch('/api/projects'),
        fetch('/api/accomplishments'),
        fetch('/api/settings'),
        fetch('/api/calendar'),
        fetch('/api/notebooks')
      ]);
      setLoadFailed(![tasksRes, projectsRes, calendarRes].every((r) => r.ok));

      // A cancelled task is neither planned nor done: it counts nowhere here.
      if (tasksRes.ok) setTasks(withoutCancelled(await tasksRes.json()));
      if (projectsRes.ok) setProjects(await projectsRes.json());
      if (accomplishmentsRes.ok) setAccomplishments(await accomplishmentsRes.json());
      if (settingsRes.ok) setSettings(await settingsRes.json());
      if (calendarRes.ok) setCalendarEvents(await calendarRes.json());
      if (notebooksRes.ok) setNotebooks(await notebooksRes.json());
    } catch (err) {
      setLoadFailed(true);
      console.error('Failed to fetch analytics data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
    const handleSettingsUpdated = () => {
      fetchAllData();
    };
    const handleTimeRecords = () => { void fetchTimeRecords(); };
    window.addEventListener('rune-settings-updated', handleSettingsUpdated);
    window.addEventListener(AWAY_CHANGED, handleTimeRecords);
    window.addEventListener(REFLECTION_SAVED, handleTimeRecords);
    return () => {
      window.removeEventListener('rune-settings-updated', handleSettingsUpdated);
      window.removeEventListener(AWAY_CHANGED, handleTimeRecords);
      window.removeEventListener(REFLECTION_SAVED, handleTimeRecords);
    };
  }, []);

  // --- 1. DATA COMPUTATIONS ---
  const userTimezone = settings?.timezone || 'UTC';
  const todayStr = getLocalDateString(new Date(), userTimezone);

  // Settings -> "When you're available": every figure on this page counts
  // only those dates. Work outside them is left out, and the ranges below
  // start no earlier and end no later than them.
  const availFrom: string | null = settings?.availableFrom && settings.availableFrom <= todayStr ? settings.availableFrom : null;
  const availUntil: string | null = settings?.availableUntil && (!availFrom || settings.availableUntil >= availFrom) ? settings.availableUntil : null;
  // The last day any range runs to: today, or the last available day.
  const rangeEndStr = availUntil && availUntil < todayStr ? availUntil : todayStr;
  const { rawTasks, rawAccomplishments, rawCalendarEvents } = React.useMemo(() => {
    const t = Array.isArray(tasks) ? tasks : [];
    const a = Array.isArray(accomplishments) ? accomplishments : [];
    const e = Array.isArray(calendarEvents) ? calendarEvents : [];
    if (!availFrom && !availUntil) return { rawTasks: t, rawAccomplishments: a, rawCalendarEvents: e };
    const inWindow = (when: string | Date | null | undefined, local = true) => {
      if (!when) return false;
      let d: string;
      try { d = local ? getLocalDateString(when, userTimezone) : String(when).slice(0, 10); } catch { return false; }
      return (!availFrom || d >= availFrom) && (!availUntil || d <= availUntil);
    };
    return {
      rawTasks: t.filter((x: any) => inWindow(x?.date)),
      rawAccomplishments: a.filter((x: any) => inWindow(x?.date, false)),
      rawCalendarEvents: e.filter((x: any) => inWindow(x?.start)),
    };
  }, [tasks, accomplishments, calendarEvents, availFrom, availUntil, userTimezone]);
  const safeProjects = React.useMemo(() => (Array.isArray(projects) ? projects : []), [projects]);
  const safeNotebooks = React.useMemo(() => (Array.isArray(notebooks) ? notebooks : []), [notebooks]);
  // Cut out of every working-hours figure: a break isn't work, even inside a slot.
  const awaySpans = React.useMemo(
    () => awaySessions.map(s => sessionSpan(s)).filter((x): x is NonNullable<typeof x> => !!x),
    [awaySessions]
  );

  // Working, break and brain-drain time per day for the last 30 days: one
  // calculation shared by the Overview and the Breaks and brain drain tab.
  const activeAccounts = useActiveAccounts(tasks, calendarEvents, awaySessions, userTimezone, todayStr);
  const dayAccount = React.useMemo(
    () => accountDays([selectedDate || todayStr], tasks, calendarEvents, awaySessions, userTimezone).get(selectedDate || todayStr)!,
    [selectedDate, todayStr, tasks, calendarEvents, awaySessions, userTimezone]
  );

  // An old link to the Completion, Deep work or Hours tab: open that section and bring it into view.
  useEffect(() => {
    if (!legacySection || loading) return;
    setUiPreference(prefKey(legacySection), true);
    requestAnimationFrame(() => document.querySelector(`[data-section="${legacySection}"]`)?.scrollIntoView({ block: 'start' }));
  }, [legacySection, loading]);

  // Initialize selectedDate once todayStr is resolved
  useEffect(() => {
    if (todayStr && !selectedDate) {
      setSelectedDate(todayStr);
    }
  }, [todayStr, selectedDate]);

  // Calculate the week's dates (7 days) for the week of the selected date
  const getWeekDatesForDate = (dateStr: string) => {
    if (!dateStr) return [];
    try {
      const date = new Date(dateStr + 'T12:00:00'); // Use noon to avoid DST/timezone shift boundary issues
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday-start week
      const monday = new Date(date.setDate(diff));
      const dates = [];
      for (let i = 0; i < 7; i++) {
        const nextDay = new Date(monday);
        nextDay.setDate(monday.getDate() + i);
        dates.push(nextDay.toISOString().split('T')[0]);
      }
      return dates;
    } catch {
      return [];
    }
  };

  const selectedWeekDates = React.useMemo(() => {
    return getWeekDatesForDate(selectedDate);
  }, [selectedDate]);

  const workingDaysConfig = settings?.workingDays || '';

  // Earliest actual activity date across the raw (unshifted) data - a Backup
  // & Restore can bring in task/event/accomplishment history that predates
  // this account's own signup timestamp, so the epoch can't just be
  // settings.createdAt in that case.
  const earliestActivityDateStr = React.useMemo(() => {
    let earliest: string | null = null;
    const consider = (dateStr: string | null) => {
      if (dateStr && (!earliest || dateStr < earliest)) earliest = dateStr;
    };
    rawTasks.forEach(t => {
      if (!t?.date) return;
      try { consider(getLocalDateString(t.date, userTimezone)); } catch { /* ignore */ }
    });
    rawCalendarEvents.forEach(e => {
      if (!e?.start) return;
      try { consider(getLocalDateString(e.start, userTimezone)); } catch { /* ignore */ }
    });
    rawAccomplishments.forEach(a => consider(a?.date || null));
    return earliest;
  }, [rawTasks, rawCalendarEvents, rawAccomplishments, userTimezone]);

  // Every "lifetime" figure below is computed from whichever is earlier -
  // the account's true creation date, or the earliest real activity found in
  // the data (covers restored history older than the account itself). Old
  // and new-account activity are treated as one continuous timeline, not two
  // separate periods.
  const accountCreationDateStr = React.useMemo(() => {
    const createdAtStr = settings?.createdAt ? getLocalDateString(settings.createdAt, userTimezone) : null;
    const candidates = [createdAtStr, earliestActivityDateStr].filter((d): d is string => !!d);
    const first = candidates.length === 0 ? getLocalDateString(new Date(), userTimezone) : candidates.reduce((min, d) => (d < min ? d : min));
    // Never before the first available day.
    return availFrom && availFrom > first ? availFrom : first;
  }, [settings?.createdAt, earliestActivityDateStr, userTimezone, availFrom]);

  // Base configured working days (lifetime)
  const baseAllWorkingDays = React.useMemo(() => {
    if (!accountCreationDateStr || !rangeEndStr) return [];
    return getWorkingDaysBetween(accountCreationDateStr, rangeEndStr, workingDaysConfig, accountCreationDateStr);
  }, [accountCreationDateStr, rangeEndStr, workingDaysConfig]);

  // Off-days Work Toggle is server-backed (Setting.showOffDayWork) so it persists across reloads/relogins.
  const showOffDaysWork = settings?.showOffDayWork === true;

  const handleToggleOffDaysWork = async (checked: boolean) => {
    setSettings((prev: any) => (prev ? { ...prev, showOffDayWork: checked } : prev));
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, showOffDayWork: checked })
      });
    } catch (err) {
      console.error('Failed to save off-day work preference:', err);
    }
  };

  // Adjust/shift off-days work to the nearest working day if toggle is off
  const { safeTasks, safeAccomplishments, safeCalendarEvents } = React.useMemo(() => {
    if (showOffDaysWork || baseAllWorkingDays.length === 0) {
      return {
        safeTasks: rawTasks,
        safeAccomplishments: rawAccomplishments,
        safeCalendarEvents: rawCalendarEvents
      };
    }
    const shifted = shiftOffDaysWork(
      baseAllWorkingDays,
      rawTasks,
      rawAccomplishments,
      rawCalendarEvents,
      userTimezone
    );
    return {
      safeTasks: shifted.tasks,
      safeAccomplishments: shifted.accomplishments,
      safeCalendarEvents: shifted.calendarEvents
    };
  }, [showOffDaysWork, baseAllWorkingDays, rawTasks, rawAccomplishments, rawCalendarEvents, userTimezone]);

  const tasksByDate = React.useMemo(() => {
    const map = new Map<string, any[]>();
    safeTasks.forEach(t => {
      if (t && t.date) {
        const dateStr = getLocalDateString(t.date, userTimezone);
        if (!map.has(dateStr)) {
          map.set(dateStr, []);
        }
        map.get(dateStr)!.push(t);
      }
    });
    return map;
  }, [safeTasks, userTimezone]);

  const calendarEventsByDate = React.useMemo(() => {
    const map = new Map<string, any[]>();
    safeCalendarEvents.forEach(e => {
      if (e && e.start) {
        try {
          const dateStr = getLocalDateString(e.start, userTimezone);
          if (!map.has(dateStr)) {
            map.set(dateStr, []);
          }
          map.get(dateStr)!.push(e);
        } catch (err) {
          // ignore
        }
      }
    });
    return map;
  }, [safeCalendarEvents, userTimezone]);

  const getGoalsMetrics = (project: any) => {
    if (!project) return [];
    
    const parsedGoals: Goal[] = [];
    if (project.goals) {
      try {
        const parsed = JSON.parse(project.goals);
        if (Array.isArray(parsed)) {
          parsedGoals.push(...parsed);
        }
      } catch {
        const lines = project.goals.split('\n').filter(Boolean);
        lines.forEach((g: string, i: number) => parsedGoals.push({ id: String(i), text: g, completed: false }));
      }
    }

    const metricsList = parsedGoals.map(goal => {
      const goalTasks = safeTasks.filter((t: any) => t.projectId === project.id && t.linkedGoalId === goal.id);
      const planned = goalTasks.reduce((sum, t) => sum + (t.estimatedTime || 0), 0);
      const actual = goalTasks.reduce((sum, t) => sum + (t.actualTime || 0), 0);
      return {
        id: goal.id,
        text: goal.text,
        planned,
        actual
      };
    });

    const uncategorizedTasks = safeTasks.filter((t: any) => t.projectId === project.id && !t.linkedGoalId);
    if (uncategorizedTasks.length > 0) {
      const planned = uncategorizedTasks.reduce((sum, t) => sum + (t.estimatedTime || 0), 0);
      const actual = uncategorizedTasks.reduce((sum, t) => sum + (t.actualTime || 0), 0);
      metricsList.push({
        id: 'uncategorized',
        text: 'Not linked to an objective',
        planned,
        actual
      });
    }

    return metricsList;
  };

  const handleExportGoalMetrics = (project: any, metrics: any[]) => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Objective,Planned time (hrs),Actual time (hrs),Difference (hrs)\n";
    metrics.forEach(m => {
      const diff = m.actual - m.planned;
      const row = `"${m.text.replace(/"/g, '""')}",${m.planned.toFixed(1)},${m.actual.toFixed(1)},${diff.toFixed(1)}`;
      csvContent += row + "\n";
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${project.name.replace(/\s+/g, '_')}_objectives_time_report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Extract the single document from each notebook
  const allNotebookPages = React.useMemo(() => {
    return safeNotebooks.map(nb => nb?.page).filter(Boolean);
  }, [safeNotebooks]);

  // Compute active days (where user actually did work)
  const activeDays = React.useMemo(() => {
    return getActiveDays(safeTasks, safeAccomplishments, safeCalendarEvents, allNotebookPages, safeProjects, userTimezone);
  }, [safeTasks, safeAccomplishments, safeCalendarEvents, allNotebookPages, safeProjects, userTimezone]);

  // Combined analytics days (configured + active non-working days)
  const allWorkingDays = React.useMemo(() => {
    const start = accountCreationDateStr;
    if (showOffDaysWork) {
      return getAnalyticsDays(baseAllWorkingDays, activeDays, start, rangeEndStr);
    }
    return baseAllWorkingDays;
  }, [baseAllWorkingDays, activeDays, accountCreationDateStr, rangeEndStr, showOffDaysWork]);

  // Base configured working days lists for 7 and 30 days
  const baseLast7Days = React.useMemo(() => {
    if (!rangeEndStr) return [];
    return getLastNWorkingDays(rangeEndStr, 7, workingDaysConfig, accountCreationDateStr);
  }, [rangeEndStr, workingDaysConfig, accountCreationDateStr]);

  const baseLast30Days = React.useMemo(() => {
    if (!rangeEndStr) return [];
    return getLastNWorkingDays(rangeEndStr, 30, workingDaysConfig, accountCreationDateStr);
  }, [rangeEndStr, workingDaysConfig, accountCreationDateStr]);

  // Combined analytics days lists for 7 and 30 days (configured + active non-working days in those ranges)
  const last7Days = React.useMemo(() => {
    const start = baseLast7Days.length > 0 ? baseLast7Days[0] : accountCreationDateStr;
    if (showOffDaysWork) {
      return getAnalyticsDays(baseLast7Days, activeDays, start, rangeEndStr);
    }
    return baseLast7Days;
  }, [baseLast7Days, activeDays, accountCreationDateStr, rangeEndStr, showOffDaysWork]);

  const last30Days = React.useMemo(() => {
    const start = baseLast30Days.length > 0 ? baseLast30Days[0] : accountCreationDateStr;
    if (showOffDaysWork) {
      return getAnalyticsDays(baseLast30Days, activeDays, start, rangeEndStr);
    }
    return baseLast30Days;
  }, [baseLast30Days, activeDays, accountCreationDateStr, rangeEndStr, showOffDaysWork]);

  // Averages only count days that are over. Today joins them once you've
  // reviewed it (Review the day saves a record for it) or once it ends -
  // until then a half-done day would drag every average down (n days of
  // work divided by n + 1).
  const todayReviewed = React.useMemo(
    () => rawAccomplishments.some((a: any) => a?.date === todayStr && (a.reviewedAt || a.wentWell != null || a.firstFocus != null)),
    [rawAccomplishments, todayStr]
  );
  const isSettled = React.useCallback((d: string) => settledDays([d], todayStr, todayReviewed).length > 0, [todayStr, todayReviewed]);
  const settledAllWorkingDays = React.useMemo(() => settledDays(allWorkingDays, todayStr, todayReviewed), [allWorkingDays, todayStr, todayReviewed]);
  const settledLast7Days = React.useMemo(() => settledDays(last7Days, todayStr, todayReviewed), [last7Days, todayStr, todayReviewed]);
  const settledLast30Days = React.useMemo(() => settledDays(last30Days, todayStr, todayReviewed), [last30Days, todayStr, todayReviewed]);

  const todayTime = new Date(rangeEndStr).getTime();
  const creationTime = new Date(accountCreationDateStr).getTime();
  const allCalendarDaysCount = (!isNaN(todayTime) && !isNaN(creationTime))
    ? Math.max(Math.ceil((todayTime - creationTime) / (1000 * 60 * 60 * 24)) + 1, 1)
    : 1;

  // Month-to-date active days breakdown
  const monthToDateStats = React.useMemo(() => {
    if (!rangeEndStr) return { configured: 0, additional: 0, total: 0 };
    const parts = rangeEndStr.split('-');
    if (parts.length < 2) return { configured: 0, additional: 0, total: 0 };
    const [year, month] = parts.map(Number);
    const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
    const baseMonthDays = getWorkingDaysBetween(startOfMonth, rangeEndStr, workingDaysConfig, accountCreationDateStr);
    const monthDays = showOffDaysWork
      ? getAnalyticsDays(baseMonthDays, activeDays, startOfMonth, rangeEndStr)
      : baseMonthDays;
    return {
      configured: baseMonthDays.length,
      additional: Math.max(monthDays.length - baseMonthDays.length, 0),
      total: monthDays.length
    };
  }, [workingDaysConfig, activeDays, rangeEndStr, showOffDaysWork]);

  const lifetimeMetrics = React.useMemo(() => {
    if (safeTasks.length === 0 && safeAccomplishments.length === 0) {
      return {
        workingDaysCount: 0,
        totalTasksCount: 0,
        completedTasksCount: 0,
        completionRate: 0,
        totalWorkingHours: 0,
        avgWorkingHours: 0,
        totalDeepWorkHours: 0,
        avgDeepWorkHours: 0,
        totalFocusOnlyHours: 0,
        avgProductivityScore: 0,
        totalFocusTime: 0,
        totalPostponeCount: 0,
        postponementRate: 0
      };
    }

    // Deliberately no cross-render cache here: allWorkingDays already reflects
    // accountCreationDateStr, which shifts whenever the earliest activity
    // date changes (e.g. a Backup & Restore bringing in older history). A
    // coarse count-based cache key (tasks/accomplishments/days length) can
    // collide across two genuinely different date-ranges, silently serving a
    // stale lifetime average. The useMemo dependency array below is the
    // correct, always-fresh invalidation signal, and grouping by date once
    // (see groupByLocalDate in analyticsUtils.ts) keeps the underlying
    // computation cheap enough that no extra caching is needed.
    return calculateWorkingDayMetrics(settledAllWorkingDays, safeTasks, safeAccomplishments, safeCalendarEvents, userTimezone, awaySpans);
  }, [settledAllWorkingDays, safeTasks, safeAccomplishments, safeCalendarEvents, userTimezone, awaySpans]);

  // Entire current month statistics
  const currentMonthStats = React.useMemo(() => {
    if (!todayStr) return { configured: 0, additional: 0, total: 0 };
    const parts = todayStr.split('-');
    if (parts.length < 2) return { configured: 0, additional: 0, total: 0 };
    const [year, month] = parts.map(Number);
    const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const endOfMonth = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    
    const baseMonthDays = getWorkingDaysBetween(startOfMonth, endOfMonth, workingDaysConfig, accountCreationDateStr);
    const monthDays = showOffDaysWork
      ? getAnalyticsDays(baseMonthDays, activeDays, startOfMonth, endOfMonth)
      : baseMonthDays;
    
    return {
      configured: baseMonthDays.length,
      additional: Math.max(monthDays.length - baseMonthDays.length, 0),
      total: monthDays.length
    };
  }, [workingDaysConfig, activeDays, todayStr, showOffDaysWork]);

  // Helper: Get tasks scheduled on a specific date (uses pre-indexed Map for O(1) complexity)
  const getTasksForDate = React.useCallback((date: string) => {
    return tasksByDate.get(date) || [];
  }, [tasksByDate]);

  // Completion Rates
  const getCompletionRateForDate = React.useCallback((date: string) => {
    const dayTasks = getTasksForDate(date);
    if (dayTasks.length === 0) return 0;
    const completed = dayTasks.filter(t => t && t.status === 'COMPLETED').length;
    return Math.round((completed / dayTasks.length) * 100);
  }, [getTasksForDate]);

  // 1. Completion Rate Stats
  const todayCompletionRate = React.useMemo(() => {
    return getCompletionRateForDate(todayStr);
  }, [getCompletionRateForDate, todayStr]);

  const getAverageCompletionRate = React.useCallback((dates: string[]) => {
    if (!dates || dates.length === 0) return 0;
    const rates = dates.map(d => getCompletionRateForDate(d));
    const activeDates = dates.filter(d => getTasksForDate(d).length > 0);
    if (activeDates.length === 0) return 0;
    const total = rates.reduce((sum, r) => sum + r, 0);
    return Math.round(total / dates.length);
  }, [getCompletionRateForDate, getTasksForDate]);

  const avg7DaysCompletionRate = React.useMemo(() => {
    return getAverageCompletionRate(settledLast7Days);
  }, [getAverageCompletionRate, settledLast7Days]);

  const avg30DaysCompletionRate = React.useMemo(() => {
    return getAverageCompletionRate(settledLast30Days);
  }, [getAverageCompletionRate, settledLast30Days]);

  // 2. Deep Work Hours Stats
  const getDeepWorkHoursForDate = React.useCallback((date: string) => {
    const dayTasks = getTasksForDate(date);
    const dayEvents = calendarEventsByDate.get(date) || [];
    return calculateOccupiedHoursFromItems(date, dayTasks, dayEvents, userTimezone, ['DEEP_WORK'], undefined, awaySpans);
  }, [getTasksForDate, calendarEventsByDate, userTimezone, awaySpans]);

  const todayDeepWorkHours = React.useMemo(() => {
    return parseFloat(getDeepWorkHoursForDate(todayStr).toFixed(1));
  }, [getDeepWorkHoursForDate, todayStr]);

  const getSumDeepWorkHours = React.useCallback((dates: string[]) => {
    if (!dates || dates.length === 0) return 0;
    return dates.reduce((sum, d) => sum + getDeepWorkHoursForDate(d), 0);
  }, [getDeepWorkHoursForDate]);

  const weeklyDeepWorkHours = React.useMemo(() => {
    return getSumDeepWorkHours(last7Days);
  }, [getSumDeepWorkHours, last7Days]);

  const monthlyDeepWorkHours = React.useMemo(() => {
    return getSumDeepWorkHours(last30Days);
  }, [getSumDeepWorkHours, last30Days]);

  // 3. Deep Work Session Analytics
  const completedDeepEvents = React.useMemo(() => {
    return safeCalendarEvents.filter(e => e.completed && e.sessionType === 'DEEP_WORK');
  }, [safeCalendarEvents]);

  const deepWorkSessionCount = completedDeepEvents.length;

  const deepWorkSessionDurations = React.useMemo(() => {
    return completedDeepEvents.map(e => {
      const start = new Date(e.start).getTime();
      const end = new Date(e.end).getTime();
      return Math.max((end - start) / (1000 * 60 * 60), 0);
    });
  }, [completedDeepEvents]);

  const averageDeepWorkSessionDuration = React.useMemo(() => {
    return deepWorkSessionDurations.length > 0
      ? Math.round((deepWorkSessionDurations.reduce((sum, d) => sum + d, 0) / deepWorkSessionDurations.length) * 10) / 10
      : 0;
  }, [deepWorkSessionDurations]);

  const longestDeepWorkSession = React.useMemo(() => {
    return deepWorkSessionDurations.length > 0 ? Math.round(Math.max(...deepWorkSessionDurations) * 10) / 10 : 0;
  }, [deepWorkSessionDurations]);

  const weeklyDeepWorkTime = React.useMemo(() => {
    return parseFloat(weeklyDeepWorkHours.toFixed(1));
  }, [weeklyDeepWorkHours]);

  // 4. Working Hours Analytics
  const getWorkingHoursForDate = React.useCallback((date: string) => {
    const dayTasks = getTasksForDate(date);
    const dayEvents = calendarEventsByDate.get(date) || [];
    return calculateOccupiedHoursFromItems(date, dayTasks, dayEvents, userTimezone, undefined, undefined, awaySpans);
  }, [getTasksForDate, calendarEventsByDate, userTimezone, awaySpans]);

  const todayWorkingHours = React.useMemo(() => {
    return getWorkingHoursForDate(todayStr);
  }, [getWorkingHoursForDate, todayStr]);

  const avgWeeklyWorkingHours = React.useMemo(() => {
    return settledLast7Days.length > 0
      ? Math.round((settledLast7Days.reduce((sum, d) => sum + getWorkingHoursForDate(d), 0) / settledLast7Days.length) * 10) / 10
      : 0;
  }, [settledLast7Days, getWorkingHoursForDate]);

  const avgMonthlyWorkingHours = React.useMemo(() => {
    return settledLast30Days.length > 0
      ? Math.round((settledLast30Days.reduce((sum, d) => sum + getWorkingHoursForDate(d), 0) / settledLast30Days.length) * 10) / 10
      : 0;
  }, [settledLast30Days, getWorkingHoursForDate]);

  // Target configured hours
  const parseTime = (t: string) => {
    if (!t) return 8;
    const [h, m] = t.split(':').map(Number);
    return isNaN(h) || isNaN(m) ? 8 : h + m / 60;
  };
  const targetWorkingHours = settings ? parseTime(settings.workEnd) - parseTime(settings.workStart) : 10;

  // 5. Project Statistics
  const activeProjects = React.useMemo(() => {
    return safeProjects.filter(p => p && p.status === 'ACTIVE');
  }, [safeProjects]);

  const avgProjectCompletion = React.useMemo(() => {
    return activeProjects.length > 0
      ? Math.round(activeProjects.reduce((sum, p) => sum + (Number(p.progress) || 0), 0) / activeProjects.length)
      : 0;
  }, [activeProjects]);

  const projectDistribution = React.useMemo(() => {
    return {
      completed: safeProjects.filter(p => p && (p.status === 'COMPLETED' || p.progress === 100)).length,
      nearCompletion: safeProjects.filter(p => p && p.status === 'ACTIVE' && p.progress >= 80 && p.progress < 100).length,
      inProgress: safeProjects.filter(p => p && p.status === 'ACTIVE' && p.progress >= 20 && p.progress < 80).length,
      atRisk: safeProjects.filter(p => p && p.status === 'ACTIVE' && p.progress < 20).length
    };
  }, [safeProjects]);

  // 6. Task Statistics
  // Sourced from the full combined history (old + new account, if restored) -
  // accountCreationDateStr already spans back to the earliest real activity,
  // so there's nothing further to bound here.
  const totalTasksCount = safeTasks.length;
  const completedTasksCount = React.useMemo(() => {
    return safeTasks.filter(t => t && t.status === 'COMPLETED').length;
  }, [safeTasks]);

  const postponedCount = React.useMemo(() => {
    return safeTasks.reduce((sum, t) => sum + getPostponeCount(t), 0);
  }, [safeTasks]);

  const completedRegularTasks = React.useMemo(() => {
    return safeTasks.filter(t => t && t.status === 'COMPLETED');
  }, [safeTasks]);

  // Averages only over tasks with a recorded actual time - mixing in
  // estimatedTime guesses for untimed tasks would understate/overstate how
  // long completed work actually took.
  const avgTaskCompletionTime = React.useMemo(() => {
    const timedTasks = completedRegularTasks.filter(t => t.actualTime > 0);
    return timedTasks.length > 0
      ? Math.round((timedTasks.reduce((sum, t) => sum + t.actualTime, 0) / timedTasks.length) * 10) / 10
      : 0;
  }, [completedRegularTasks]);

  const getPriorityRate = React.useCallback((pri: string) => {
    const priTasks = safeTasks.filter(t => t && t.priority === pri);
    if (priTasks.length === 0) return 0;
    const comp = priTasks.filter(t => t.status === 'COMPLETED').length;
    return Math.round((comp / priTasks.length) * 100);
  }, [safeTasks]);

  const priorityCompletionRates = React.useMemo(() => {
    return {
      LOW: getPriorityRate('LOW'),
      MEDIUM: getPriorityRate('MEDIUM'),
      HIGH: getPriorityRate('HIGH'),
      CRITICAL: getPriorityRate('CRITICAL')
    };
  }, [getPriorityRate]);

  // 7. Deep vs Shallow split
  const totalFocusedHours = React.useMemo(() => {
    let sum = 0;
    activeDays.forEach(date => {
      sum += getDeepWorkHoursForDate(date);
    });
    return parseFloat(sum.toFixed(1));
  }, [activeDays, getDeepWorkHoursForDate]);

  const totalShallowHours = React.useMemo(() => {
    let sum = 0;
    activeDays.forEach(date => {
      const total = getWorkingHoursForDate(date);
      const deep = getDeepWorkHoursForDate(date);
      sum += Math.max(0, total - deep);
    });
    return parseFloat(sum.toFixed(1));
  }, [activeDays, getWorkingHoursForDate, getDeepWorkHoursForDate]);

  const totalWorkHoursSum = totalFocusedHours + totalShallowHours;
  const deepWorkPct = totalWorkHoursSum > 0 ? Math.round((totalFocusedHours / totalWorkHoursSum) * 100) : 50;

  // 8. Productivity Score (0-100)
  const getProductivityScoreForDate = React.useCallback((date: string) => {
    const record = safeAccomplishments.find(a => a && a.date === date);
    if (record) return record.productivityScore;

    const rate = getCompletionRateForDate(date);
    const deepHours = getDeepWorkHoursForDate(date);
    const dailyTasks = getTasksForDate(date);
    const dayPostponeCount = dailyTasks.reduce((sum, t) => sum + getPostponeCount(t), 0);
    const workHours = getWorkingHoursForDate(date);

    return calculateProductivityScore({
      completionRate: rate,
      deepWorkHours: deepHours,
      workHours,
      postponeCount: dayPostponeCount
    });
  }, [safeAccomplishments, getCompletionRateForDate, getDeepWorkHoursForDate, getTasksForDate, getWorkingHoursForDate]);

  const todayProductivityScore = React.useMemo(() => {
    return getProductivityScoreForDate(todayStr);
  }, [getProductivityScoreForDate, todayStr]);

  const selectedDateProductivityScore = React.useMemo(() => {
    return getProductivityScoreForDate(selectedDate);
  }, [selectedDate, getProductivityScoreForDate]);

  // A day with no record, no tasks and no logged hours has no score to show —
  // render a dash, not a zero (Ledger: no walls of zeros).
  const getDayHasActivity = React.useCallback((date: string) => {
    if (safeAccomplishments.some(a => a && a.date === date)) return true;
    if (getTasksForDate(date).length > 0) return true;
    return getWorkingHoursForDate(date) > 0;
  }, [safeAccomplishments, getTasksForDate, getWorkingHoursForDate]);

  const selectedDayHasActivity = React.useMemo(
    () => getDayHasActivity(selectedDate),
    [selectedDate, getDayHasActivity]
  );

  const selectedWeekProductivityScore = React.useMemo(() => {
    // Only the week's days that are over (and today once reviewed) - not
    // days still to come, which have no score yet.
    const days = selectedWeekDates.filter(isSettled);
    if (days.length === 0) return 0;
    const scores = days.map(d => getProductivityScoreForDate(d));
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }, [selectedWeekDates, getProductivityScoreForDate, isSettled]);

  const selectedWeekHasActivity = React.useMemo(
    () => selectedWeekDates.some(getDayHasActivity),
    [selectedWeekDates, getDayHasActivity]
  );

  // Calendar Snapshot Visualizer helper
  const renderWorkCalendarSnapshot = () => {
    if (!todayStr) return null;
    const [year, month] = todayStr.split('-').map(Number);
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthName = monthNames[month - 1];

    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const firstDayDate = new Date(Date.UTC(year, month - 1, 1));
    const firstDayOfWeek = firstDayDate.getUTCDay(); // 0 = Sunday, 1 = Monday
    const adjustedStartDay = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

    const cells: Array<{
      day: number | null;
      dateStr: string;
      status: 'empty' | 'working' | 'non-working' | 'active-non-working';
    }> = [];

    for (let i = 0; i < adjustedStartDay; i++) {
      cells.push({ day: null, dateStr: '', status: 'empty' });
    }

    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const marker = `cfg:${monthKey}`;
    const isMonthConfigured = (workingDaysConfig || '').includes(marker);

    const getDayConfig = (dateStr: string) => {
      const entry = (workingDaysConfig || '').split(',').map((d: string) => d.trim()).find((d: string) => d.startsWith(dateStr));
      if (!entry) return null;
      const parts = entry.split(':');
      return {
        dateStr: parts[0],
        type: parts[1] || 'working',
        comment: parts[2] || ''
      };
    };

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const config = getDayConfig(dateStr);
      let isWorking = false;
      
      if (config) {
        isWorking = config.type === 'working' || !['off', 'leave', 'sick', 'other'].includes(config.type);
      } else {
        isWorking = isDefaultWorking(dateStr, accountCreationDateStr);
      }

      const isActive = activeDays.has(dateStr);
      let status: 'working' | 'non-working' | 'active-non-working' = 'non-working';
      
      if (isWorking) {
        status = 'working';
      } else if (isActive) {
        status = 'active-non-working';
      }

      cells.push({
        day: d,
        dateStr,
        status
      });
    }

    return (
      <div className="bg-surface border border-border rounded-md">
        <div className="flex justify-between items-center px-4 py-3 border-b border-border">
          <span className="text-[12.5px] font-semibold text-ink-secondary">
            Work calendar
          </span>
          <span className="font-mono text-[10px] text-ink-faint">{monthName} {year}</span>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-7 gap-1 text-center">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, idx) => (
              <span key={idx} className="font-mono text-[10px] text-ink-faint">{day}</span>
            ))}

            {cells.map((cell, idx) => {
              if (cell.day === null) {
                return <div key={`empty-${idx}`} className="aspect-square" />;
              }
              const working = cell.status === 'working';
              const activeExtra = cell.status === 'active-non-working';
              return (
                <div
                  key={`day-${cell.day}`}
                  className={`aspect-square rounded-[3px] flex items-center justify-center font-mono text-[10px] tabular-nums relative border ${
                    working
                      ? 'bg-primary-soft border-primary text-primary font-medium'
                      : 'bg-surface-sunken border-border text-ink-faint'
                  }`}
                  title={`${cell.dateStr}: ${
                    working ? 'working day' : activeExtra ? 'worked on an off day' : 'off day'
                  }`}
                >
                  {cell.day}
                  {activeExtra && <span className="absolute top-0.5 right-0.5 w-1 h-1 rounded-full bg-primary" />}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-3 border-t border-border text-[10px] text-ink-faint font-mono">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-primary-soft border border-primary block" /> working day
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-surface-sunken border border-border block" /> off day
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-surface-sunken border border-border relative block">
                <span className="absolute top-0 right-0 w-1 h-1 rounded-full bg-primary" />
              </span> worked on an off day
            </span>
          </div>
        </div>
      </div>
    );
  };

  // ---------------------------------------------------------------------
  // Layout. Every figure below comes from the calculations above; nothing
  // here changes what a metric means.
  // ---------------------------------------------------------------------
  const goTab = (tab: AnalyticsTab, project: string | null = null) => {
    setActiveTab(tab);
    setOpenProjectId(project);
    try {
      const q = new URLSearchParams();
      if (tab !== 'overview') q.set('tab', tab);
      if (project) q.set('project', project);
      window.history.replaceState(null, '', `${window.location.pathname}${q.size ? `?${q}` : ''}`);
    } catch { /* fine without the URL */ }
  };

  if (loading) {
    return (
      <div className="max-w-6xl space-y-8 pb-16" aria-busy="true" aria-label="Loading analytics">
        <div className="h-10 w-48 animate-pulse rounded-[8px] bg-surface-sunken" />
        <div className="h-9 w-96 max-w-full animate-pulse rounded-[8px] bg-surface-sunken" />
        <div className="grid grid-cols-2 gap-6 border-y border-border py-5 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map(i => <div key={i} className="h-12 animate-pulse rounded-[6px] bg-surface-sunken" />)}
        </div>
        {[0, 1, 2].map(i => <div key={i} className="h-14 animate-pulse rounded-[8px] bg-surface-sunken" />)}
      </div>
    );
  }

  const hmh = (h: number) => {
    const total = Math.round(h * 60);
    const hh = Math.floor(total / 60);
    const mm = total % 60;
    return hh === 0 ? `${mm}m` : mm === 0 ? `${hh}h` : `${hh}h ${String(mm).padStart(2, '0')}m`;
  };
  const hmMs = (ms: number) => hmh(ms / 3_600_000);

  const dayTasks = getTasksForDate(selectedDate);
  const dayDone = dayTasks.filter(t => t && t.status === 'COMPLETED').length;
  const dayLabel = selectedDate === todayStr ? 'Today' : new Date(`${selectedDate}T12:00:00Z`).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const trendDays = last30Days.slice(-14);
  const deepSessions = {
    short: deepWorkSessionDurations.filter(d => d < 1).length,
    standard: deepWorkSessionDurations.filter(d => d >= 1 && d <= 2).length,
    long: deepWorkSessionDurations.filter(d => d > 2).length,
  };
  const deepShare = (n: number) => (deepWorkSessionDurations.length > 0 ? (n / deepWorkSessionDurations.length) * 100 : 0);
  const hoursTotal = sumAccounts(activeAccounts, last30(todayStr).slice(-(ACTIVE_RANGES.find(r => r.id === hoursRange)!.days)));
  const openProject = openProjectId ? safeProjects.find(p => p.id === openProjectId) : null;
  const overviewIds = ['day', 'hours', 'completion', 'deep', 'history'];

  return (
    <div className="max-w-6xl space-y-8 pb-16">
      <PageHeader
        className=""
        title="Analytics"
        subtitle="Where your time actually went: patterns to notice, not scores to chase."
        actions={
          <>
            <label
              className="flex h-9 cursor-pointer select-none items-center gap-2 text-[13px] text-ink-secondary hover:text-foreground"
              title={showOffDaysWork ? 'On: work logged on an off day counts toward that day.' : 'Off: work logged on an off day is merged into the nearest working day.'}
            >
              <input type="checkbox" checked={showOffDaysWork} onChange={(e) => handleToggleOffDaysWork(e.target.checked)} className="rounded-[3px] border-border-strong text-primary focus:ring-ring" />
              <span>Count off-day work on that day</span>
            </label>
            <Button variant="ghost" onClick={fetchAllData}><RefreshCw className="h-3.5 w-3.5 text-ink-faint" /> Refresh</Button>
          </>
        }
      />
      {loadFailed && <LoadError what="your analytics" onRetry={fetchAllData} />}
      {(availFrom || availUntil) && (
        <p className="-mt-3 flex flex-wrap items-center gap-x-2 text-[13px] text-ink-secondary">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
          Counting only your available dates:{' '}
          <span className="font-medium text-foreground tabular-nums">
            {availFrom ? formatAvailDate(availFrom) : 'from the start'} – {availUntil ? formatAvailDate(availUntil) : 'onward'}
          </span>
          <a href="/settings?section=calendar" className="underline decoration-border-strong underline-offset-4 hover:text-foreground">Change</a>
        </p>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border">
        <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Analytics">
          {([
            ['overview', 'Overview'],
            ['projects', 'Projects'],
            ['activity', 'Breaks and brain drain'],
            ['reviews', 'Reflections'],
          ] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => goTab(val)}
              role="tab"
              aria-selected={activeTab === val}
              className={`-mb-px whitespace-nowrap border-b-2 px-2.5 pb-2 pt-1 text-[14px] transition-colors ${activeTab === val ? 'border-foreground font-semibold text-foreground' : 'border-transparent text-ink-secondary hover:text-foreground'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {activeTab === 'overview' && (
          <div className="flex items-center gap-3 pb-2 text-[12.5px]">
            <button type="button" onClick={() => setUiPreferences(Object.fromEntries(overviewIds.map(id => [prefKey(id), true])))} className="font-medium text-ink-secondary hover:text-foreground">Expand all</button>
            <span className="text-ink-faint" aria-hidden="true">·</span>
            <button type="button" onClick={() => setUiPreferences(Object.fromEntries(overviewIds.map(id => [prefKey(id), false])))} className="font-medium text-ink-secondary hover:text-foreground">Collapse all</button>
          </div>
        )}
      </div>

      {activeTab === 'overview' && (
        <div>
          {/* The day: the one place to read a day whole */}
          <AnalyticsSection
            id="day"
            title={selectedDate === todayStr ? 'Your day' : 'One day'}
            summary={`${dayLabel} · ${dayDone} of ${dayTasks.length} tasks done · ${hmMs(dayAccount.workingMs)} worked`}
            actions={
              <div className="flex items-center">
                <button type="button" onClick={() => setSelectedDate(shiftYmd(selectedDate, -1))} aria-label="Previous day" className="grid h-8 w-8 place-items-center rounded-[8px] text-ink-faint hover:bg-surface-sunken hover:text-foreground">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <input type="date" aria-label="Day to look at" value={selectedDate} onChange={(e) => e.target.value && setSelectedDate(e.target.value)} className="h-8 rounded-[8px] border border-border bg-surface px-2 text-[13px] text-foreground tabular-nums focus:border-border-strong focus:outline-none" />
                <button type="button" onClick={() => setSelectedDate(shiftYmd(selectedDate, 1))} aria-label="Next day" className="grid h-8 w-8 place-items-center rounded-[8px] text-ink-faint hover:bg-surface-sunken hover:text-foreground">
                  <ChevronRight className="h-4 w-4" />
                </button>
                {selectedDate !== todayStr && (
                  <button type="button" onClick={() => setSelectedDate(todayStr)} className="h-8 rounded-[8px] px-2 text-[13px] font-medium text-ink-secondary hover:bg-surface-sunken hover:text-foreground">Today</button>
                )}
              </div>
            }
          >
            <Facts cols="lg:grid-cols-6" label={`${dayLabel} at a glance`}>
              <Fact label="Tasks done" sub={dayTasks.length ? `${getCompletionRateForDate(selectedDate)}% of planned` : 'nothing planned'} testId="day-done">
                {dayDone}<span className="text-[16px] text-ink-secondary"> of {dayTasks.length}</span>
              </Fact>
              <Fact label="Working hours" testId="day-working">{hmMs(dayAccount.workingMs)}</Fact>
              <Fact label="Active hours" sub={dayAccount.activeMs > dayAccount.workingMs ? `${hmMs(dayAccount.breakMs)} break · ${hmMs(dayAccount.drainMs)} drain` : undefined} testId="day-active">{hmMs(dayAccount.activeMs)}</Fact>
              <Fact label="Deep work" testId="day-deep">{hmh(getDeepWorkHoursForDate(selectedDate))}</Fact>
              <Fact label="Day score" sub="out of 100">{selectedDayHasActivity ? selectedDateProductivityScore : '–'}</Fact>
              <Fact label="Week average" sub="days that are over">{selectedWeekHasActivity ? selectedWeekProductivityScore : '–'}</Fact>
            </Facts>
            <p className="mt-3 text-[12px] leading-relaxed text-ink-secondary">
              Day score = task completion (50%) + deep work time (30%) + total logged time (20%). Rescheduling a task isn’t penalised, and a day with nothing tracked shows a dash.
            </p>
          </AnalyticsSection>

          <AnalyticsSection
            id="hours"
            title="Working and active hours"
            summary={`${ACTIVE_RANGES.find(r => r.id === hoursRange)!.label}: ${hmMs(hoursTotal.workingMs)} working of ${hmMs(hoursTotal.activeMs)} active`}
          >
            <ActiveHours accounts={activeAccounts} today={todayStr} range={hoursRange} onRange={setHoursRange} onEditTimes={() => setEditingAway(true)} />
            <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-3 border-t border-border pt-4 text-[13px]">
              {[
                ['Weekly average', `${Number(avgWeeklyWorkingHours || 0).toFixed(1)}h a day`],
                ['Monthly average', `${Number(avgMonthlyWorkingHours || 0).toFixed(1)}h a day`],
                ['Your configured workday', `${Number(targetWorkingHours || 0).toFixed(1)}h`],
              ].map(([l, v]) => (
                <div key={l} className="flex items-baseline gap-2">
                  <dt className="text-ink-secondary">{l}</dt>
                  <dd className="font-medium text-foreground tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[12px] text-ink-secondary">Averages are working hours over your working days that are over; today joins once you’ve reviewed it.</p>
          </AnalyticsSection>

          <AnalyticsSection
            id="completion"
            title="Task completion"
            summary={`${avg7DaysCompletionRate}% over 7 days · ${completedTasksCount} of ${totalTasksCount} tasks done in all`}
          >
            <Facts cols="lg:grid-cols-6" label="Completion">
              <Fact label="Today" testId="completion-today">{todayCompletionRate}%</Fact>
              <Fact label="7-day average">{avg7DaysCompletionRate}%</Fact>
              <Fact label="30-day average">{avg30DaysCompletionRate}%</Fact>
              <Fact label="Done, all time" sub={`of ${totalTasksCount} planned`}>{completedTasksCount}</Fact>
              <Fact label="Postponed" sub="moves to a later day">{postponedCount}</Fact>
              <Fact label="Average task" sub="recorded time">{avgTaskCompletionTime}h</Fact>
            </Facts>
            <div className="mt-6 grid grid-cols-1 gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <div>
                <h3 className="mb-3 text-[12.5px] font-semibold text-ink-secondary">Share of planned tasks done, by working day</h3>
                <DayBars
                  days={trendDays}
                  values={trendDays.map(getCompletionRateForDate)}
                  max={100}
                  format={(v) => `${v}% of planned tasks done`}
                  label="Completion rate by working day"
                  emptyDays={new Set(trendDays.filter(d => getTasksForDate(d).length === 0))}
                />
              </div>
              <div>
                <h3 className="mb-1 text-[12.5px] font-semibold text-ink-secondary">Completion by priority</h3>
                {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map(p => (
                  <ShareRow key={p} label={p.charAt(0) + p.slice(1).toLowerCase()} pct={priorityCompletionRates[p]} />
                ))}
                <p className="mt-2 text-[12px] text-ink-secondary">Completion is the share of planned tasks marked done. Blocked and cancelled tasks don’t count against you.</p>
              </div>
            </div>
          </AnalyticsSection>

          <AnalyticsSection
            id="deep"
            title="Deep work"
            summary={`${hmh(weeklyDeepWorkHours)} in 7 days · ${deepWorkSessionCount} sessions in all`}
            defaultOpen={false}
          >
            <Facts cols="lg:grid-cols-6" label="Deep work">
              <Fact label="Today">{hmh(todayDeepWorkHours)}</Fact>
              <Fact label="Last 7 days">{hmh(weeklyDeepWorkHours)}</Fact>
              <Fact label="Last 30 days">{hmh(monthlyDeepWorkHours)}</Fact>
              <Fact label="Sessions done">{deepWorkSessionCount}</Fact>
              <Fact label="Average session">{averageDeepWorkSessionDuration}h</Fact>
              <Fact label="Longest session">{longestDeepWorkSession}h</Fact>
            </Facts>
            <div className="mt-6 grid grid-cols-1 gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <div>
                <h3 className="mb-3 text-[12.5px] font-semibold text-ink-secondary">Deep work by working day</h3>
                <DayBars days={trendDays} values={trendDays.map(getDeepWorkHoursForDate)} color="var(--color-data-slate)" format={(v) => `${hmh(v)} of deep work`} label="Deep work hours by working day" />
              </div>
              <div className="space-y-6">
                <div>
                  <h3 className="mb-1 text-[12.5px] font-semibold text-ink-secondary">Session lengths</h3>
                  <ShareRow label="Under 1 hour" pct={deepShare(deepSessions.short)} count={`${deepSessions.short}`} color="var(--color-data-slate)" />
                  <ShareRow label="1 to 2 hours" pct={deepShare(deepSessions.standard)} count={`${deepSessions.standard}`} color="var(--color-data-slate)" />
                  <ShareRow label="Over 2 hours" pct={deepShare(deepSessions.long)} count={`${deepSessions.long}`} color="var(--color-data-slate)" />
                </div>
                <div>
                  <h3 className="mb-2 text-[12.5px] font-semibold text-ink-secondary">Deep and shallow work, all time</h3>
                  <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label={`Deep ${deepWorkPct}%, shallow ${100 - deepWorkPct}%`}>
                    <div className="h-full rounded-l-[4px]" style={{ width: `${deepWorkPct}%`, backgroundColor: 'var(--color-data-slate)' }} />
                    <div className="h-full flex-1 rounded-r-[4px] bg-border-strong" />
                  </div>
                  <p className="mt-2 flex justify-between text-[12.5px] text-ink-secondary tabular-nums">
                    <span>Deep {deepWorkPct}% · {Number(totalFocusedHours || 0).toFixed(1)}h</span>
                    <span>Shallow {100 - deepWorkPct}% · {Number(totalShallowHours || 0).toFixed(1)}h</span>
                  </p>
                </div>
              </div>
            </div>
          </AnalyticsSection>

          <AnalyticsSection
            id="history"
            title="Since you started"
            summary={`${Number(lifetimeMetrics.totalWorkingHours || 0).toFixed(0)}h worked · ${Number(lifetimeMetrics.completionRate || 0).toFixed(0)}% of planned tasks done`}
            defaultOpen={false}
          >
            <Facts cols="lg:grid-cols-4" label="Since you started">
              <Fact label="Worked in total">{Number(lifetimeMetrics.totalWorkingHours || 0).toFixed(0)}h</Fact>
              <Fact label="On an average working day">{Number(lifetimeMetrics.avgWorkingHours || 0).toFixed(1)}h</Fact>
              <Fact label="Of it deep work">{Number(lifetimeMetrics.totalDeepWorkHours || 0).toFixed(0)}h</Fact>
              <Fact label="Planned tasks completed">{Number(lifetimeMetrics.completionRate || 0).toFixed(0)}%</Fact>
            </Facts>
            <div className="mt-6">
              <ActivityGraph
                tasks={tasks}
                events={calendarEvents}
                timezone={userTimezone}
                today={getCurrentDateInTimezone(userTimezone)}
                availability={{ from: settings?.availableFrom, until: settings?.availableUntil }}
              />
            </div>
            <div className="mt-8 grid grid-cols-1 items-start gap-x-12 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
              {renderWorkCalendarSnapshot()}
              <div>
                <h3 className="mb-1 text-[12.5px] font-semibold text-ink-secondary">This month</h3>
                <dl className="divide-y divide-border">
                  {[
                    [currentMonthStats.configured, 'Configured working days', 'days marked as working'],
                    [currentMonthStats.additional, 'Extra days worked', 'rest days you logged work on'],
                    [currentMonthStats.total, 'Productive days', 'used for this month’s averages'],
                  ].map(([v, l, d]) => (
                    <div key={l as string} className="flex items-baseline justify-between gap-4 py-2.5">
                      <dt className="text-[13.5px] text-foreground">{l}<span className="block text-[12px] text-ink-secondary">{d}</span></dt>
                      <dd className="font-serif text-[22px] font-medium tabular-nums text-foreground">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-[12px] leading-relaxed text-ink-secondary">
                  Averages use your {baseAllWorkingDays.length} working days since you joined ({allWorkingDays.length} with something tracked, {allCalendarDaysCount} calendar days in all). Work logged on an off day still counts.{' '}
                  <button type="button" onClick={() => setShowMethodology(v => !v)} className="font-medium text-ink-secondary underline decoration-border-strong underline-offset-4 hover:text-foreground">
                    {showMethodology ? 'Hide' : 'How the daily score works'}
                  </button>
                  {showMethodology && (
                    <span className="block pt-1">Daily score = task completion rate (50%) + deep work time (30%) + total logged time (20%). Rescheduling a task isn’t penalized. A restored backup shows as one continuous timeline.</span>
                  )}
                </p>
              </div>
            </div>
          </AnalyticsSection>
        </div>
      )}

      {activeTab === 'projects' && (
        openProject ? (
          <ProjectAnalyticsView
            key={openProject.id}
            project={openProject}
            tasks={tasks}
            events={calendarEvents}
            sessions={awaySessions}
            reflections={reflections}
            investment={investment.projects[openProject.id]}
            timezone={userTimezone}
            today={todayStr}
            initialDate={sheetTarget.project === openProject.id ? sheetTarget.date : null}
            objectives={getGoalsMetrics(openProject)}
            onExportObjectives={() => handleExportGoalMetrics(openProject, getGoalsMetrics(openProject))}
            onBack={() => goTab('projects')}
          />
        ) : (
          <ProjectsAnalyticsList
            projects={safeProjects}
            tasks={tasks}
            investment={investment}
            today={todayStr}
            onOpen={(id) => { goTab('projects', id); window.scrollTo?.({ top: 0 }); document.querySelector('main')?.scrollTo({ top: 0 }); }}
            portfolio={{ active: activeProjects.length, avgCompletion: avgProjectCompletion, distribution: projectDistribution }}
          />
        )
      )}

      {activeTab === 'activity' && (
        <ActivityInsights
          accounts={activeAccounts}
          sessions={awaySessions}
          timezone={userTimezone}
          today={todayStr}
        />
      )}

      {activeTab === 'reviews' && <ReviewHistory timezone={settings?.timezone || 'UTC'} />}
      {editingAway && <AwaySessionsDialog timezone={userTimezone} onClose={() => setEditingAway(false)} />}
    </div>
  );
}

export const dynamic = 'force-dynamic';

/** "1 Jan 2026". */
function formatAvailDate(key: string): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
