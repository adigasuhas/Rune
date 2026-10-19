'use client';

import React, { useState, useEffect } from 'react';
import { LoadError } from '@/components/LoadError';
import {
  TrendingUp,
  Brain,
  Clock,
  Flame,
  FolderGit2,
  Download,
  Percent,
  Calendar,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  getWorkingDaysBetween,
  getLastNWorkingDays,
  calculateWorkingDayMetrics,
  getActiveDays,
  getAnalyticsDays,
  shiftOffDaysWork,
  calculateOccupiedHoursFromItems,
  getIntervalUnionDuration,
  calculateProductivityScore,
  getPostponeCount
} from '@/lib/analyticsUtils';
import { getCurrentDateInTimezone, getLocalDateString, isDefaultWorking, parseDateTimeInTimezone } from '@/lib/dateUtils';
import { Button, PageHeader, SectionHeader } from '@/components/ui';
import { ActivityGraph } from '@/components/activity/ActivityGraph';
import { ReviewHistory } from './ReviewHistory';
import { useSpotlightCards } from '@/hooks/useSpotlightCards';
interface Goal {
  id: string;
  text: string;
  completed: boolean;
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
  const [selectedAnalyticsProjectId, setSelectedAnalyticsProjectId] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  // ?tab=reviews (linked from Today's first-focus card) opens Reflections.
  // Client-only view (page.tsx loads it with ssr: false), so window is there.
  const [activeTab, setActiveTab] = useState<'overview' | 'completion' | 'focus' | 'hours' | 'projects' | 'reviews'>(
    () => (new URLSearchParams(window.location.search).get('tab') === 'reviews' ? 'reviews' : 'overview')
  );

  // AI Insights States

  const [loadFailed, setLoadFailed] = useState(false);
  const fetchAllData = async () => {
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

      if (tasksRes.ok) setTasks(await tasksRes.json());
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
    window.addEventListener('rune-settings-updated', handleSettingsUpdated);
    return () => {
      window.removeEventListener('rune-settings-updated', handleSettingsUpdated);
    };
  }, []);

  // --- 1. DATA COMPUTATIONS ---
  const rawTasks = Array.isArray(tasks) ? tasks : [];
  const safeProjects = Array.isArray(projects) ? projects : [];
  const rawAccomplishments = Array.isArray(accomplishments) ? accomplishments : [];
  const rawCalendarEvents = Array.isArray(calendarEvents) ? calendarEvents : [];
  const safeNotebooks = Array.isArray(notebooks) ? notebooks : [];

  const userTimezone = settings?.timezone || 'UTC';
  const todayStr = getLocalDateString(new Date(), userTimezone);

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
    if (candidates.length === 0) return getLocalDateString(new Date(), userTimezone);
    return candidates.reduce((min, d) => (d < min ? d : min));
  }, [settings?.createdAt, earliestActivityDateStr, userTimezone]);

  // Base configured working days (lifetime)
  const baseAllWorkingDays = React.useMemo(() => {
    if (!accountCreationDateStr || !todayStr) return [];
    return getWorkingDaysBetween(accountCreationDateStr, todayStr, workingDaysConfig, accountCreationDateStr);
  }, [accountCreationDateStr, todayStr, workingDaysConfig]);

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
      return getAnalyticsDays(baseAllWorkingDays, activeDays, start, todayStr);
    }
    return baseAllWorkingDays;
  }, [baseAllWorkingDays, activeDays, accountCreationDateStr, todayStr, showOffDaysWork]);

  // Base configured working days lists for 7 and 30 days
  const baseLast7Days = React.useMemo(() => {
    if (!todayStr) return [];
    return getLastNWorkingDays(todayStr, 7, workingDaysConfig, accountCreationDateStr);
  }, [todayStr, workingDaysConfig, accountCreationDateStr]);

  const baseLast30Days = React.useMemo(() => {
    if (!todayStr) return [];
    return getLastNWorkingDays(todayStr, 30, workingDaysConfig, accountCreationDateStr);
  }, [todayStr, workingDaysConfig, accountCreationDateStr]);

  // Combined analytics days lists for 7 and 30 days (configured + active non-working days in those ranges)
  const last7Days = React.useMemo(() => {
    const start = baseLast7Days.length > 0 ? baseLast7Days[0] : accountCreationDateStr;
    if (showOffDaysWork) {
      return getAnalyticsDays(baseLast7Days, activeDays, start, todayStr);
    }
    return baseLast7Days;
  }, [baseLast7Days, activeDays, accountCreationDateStr, todayStr, showOffDaysWork]);

  const last30Days = React.useMemo(() => {
    const start = baseLast30Days.length > 0 ? baseLast30Days[0] : accountCreationDateStr;
    if (showOffDaysWork) {
      return getAnalyticsDays(baseLast30Days, activeDays, start, todayStr);
    }
    return baseLast30Days;
  }, [baseLast30Days, activeDays, accountCreationDateStr, todayStr, showOffDaysWork]);

  const todayTime = new Date(todayStr).getTime();
  const creationTime = new Date(accountCreationDateStr).getTime();
  const allCalendarDaysCount = (!isNaN(todayTime) && !isNaN(creationTime))
    ? Math.max(Math.ceil((todayTime - creationTime) / (1000 * 60 * 60 * 24)) + 1, 1)
    : 1;

  // Month-to-date active days breakdown
  const monthToDateStats = React.useMemo(() => {
    if (!todayStr) return { configured: 0, additional: 0, total: 0 };
    const parts = todayStr.split('-');
    if (parts.length < 2) return { configured: 0, additional: 0, total: 0 };
    const [year, month] = parts.map(Number);
    const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
    const baseMonthDays = getWorkingDaysBetween(startOfMonth, todayStr, workingDaysConfig, accountCreationDateStr);
    const monthDays = showOffDaysWork
      ? getAnalyticsDays(baseMonthDays, activeDays, startOfMonth, todayStr)
      : baseMonthDays;
    return {
      configured: baseMonthDays.length,
      additional: Math.max(monthDays.length - baseMonthDays.length, 0),
      total: monthDays.length
    };
  }, [workingDaysConfig, activeDays, todayStr, showOffDaysWork]);

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
    return calculateWorkingDayMetrics(allWorkingDays, safeTasks, safeAccomplishments, safeCalendarEvents, userTimezone);
  }, [allWorkingDays, safeTasks, safeAccomplishments, safeCalendarEvents, userTimezone]);

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
    return getAverageCompletionRate(last7Days);
  }, [getAverageCompletionRate, last7Days]);

  const avg30DaysCompletionRate = React.useMemo(() => {
    return getAverageCompletionRate(last30Days);
  }, [getAverageCompletionRate, last30Days]);

  // 2. Deep Work Hours Stats
  const getDeepWorkHoursForDate = React.useCallback((date: string) => {
    const dayTasks = getTasksForDate(date);
    const dayEvents = calendarEventsByDate.get(date) || [];
    return calculateOccupiedHoursFromItems(date, dayTasks, dayEvents, userTimezone, ['DEEP_WORK']);
  }, [getTasksForDate, calendarEventsByDate, userTimezone]);

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
    return calculateOccupiedHoursFromItems(date, dayTasks, dayEvents, userTimezone);
  }, [getTasksForDate, calendarEventsByDate, userTimezone]);

  const todayWorkingHours = React.useMemo(() => {
    return getWorkingHoursForDate(todayStr);
  }, [getWorkingHoursForDate, todayStr]);

  const avgWeeklyWorkingHours = React.useMemo(() => {
    return last7Days.length > 0
      ? Math.round((last7Days.reduce((sum, d) => sum + getWorkingHoursForDate(d), 0) / last7Days.length) * 10) / 10
      : 0;
  }, [last7Days, getWorkingHoursForDate]);

  const avgMonthlyWorkingHours = React.useMemo(() => {
    return last30Days.length > 0
      ? Math.round((last30Days.reduce((sum, d) => sum + getWorkingHoursForDate(d), 0) / last30Days.length) * 10) / 10
      : 0;
  }, [last30Days, getWorkingHoursForDate]);

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
    if (selectedWeekDates.length === 0) return 0;
    const scores = selectedWeekDates.map(d => getProductivityScoreForDate(d));
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }, [selectedWeekDates, getProductivityScoreForDate]);

  const selectedWeekHasActivity = React.useMemo(
    () => selectedWeekDates.some(getDayHasActivity),
    [selectedWeekDates, getDayHasActivity]
  );

  // Sparkline coordinates helper (for SVG line charts)
  const generateChartPoints = (dates: string[], getValue: (date: string) => number) => {
    if (!dates || dates.length === 0) return '';
    const values = dates.map(d => getValue(d));
    const max = Math.max(...values, 100);
    const width = 500;
    const height = 120;
    if (dates.length === 1) {
      const y = height - (values[0] / max) * (height - 10) - 5;
      return `0,${y} 500,${y}`;
    }
    const stepX = width / (dates.length - 1);
    
    return values.map((val, idx) => {
      const x = idx * stepX;
      const y = height - (val / max) * (height - 10) - 5;
      return `${x},${y}`;
    }).join(' ');
  };

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
        isWorking = config.type === 'working' || !['off', 'leave', 'other'].includes(config.type);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-10 h-10 border-4 border-primary/20 border-t-blue-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-10 max-w-6xl pb-16">
      <PageHeader
        className=""
        title="Analytics"
        subtitle="Where your time actually went: patterns to notice, not scores to chase."
        actions={
          <>
            <label
              className="flex h-9 items-center gap-2 cursor-pointer text-[13px] text-ink-secondary hover:text-foreground select-none"
              title={showOffDaysWork ? 'On: work logged on an off day counts toward that day.' : 'Off: work logged on an off day is merged into the nearest working day.'}
            >
              <input type="checkbox" checked={showOffDaysWork} onChange={(e) => handleToggleOffDaysWork(e.target.checked)} className="rounded-[3px] border-border-strong text-primary focus:ring-ring" />
              <span>Count off-day work on that day</span>
            </label>
            <Button variant="ghost" onClick={fetchAllData}><RefreshCw className="w-3.5 h-3.5 text-ink-faint" /> Refresh</Button>
          </>
        }
      />
      {loadFailed && <LoadError what="your analytics" onRetry={fetchAllData} />}

      <div className="space-y-6">
        {/* Section tabs */}
        <div className="flex gap-1 border-b border-border overflow-x-auto" role="tablist">
          {([
            ['overview', 'Overview'],
            ['completion', 'Completion'],
            ['focus', 'Deep work'],
            ['hours', 'Hours'],
            ['projects', 'Projects'],
            ['reviews', 'Reflections'],
          ] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setActiveTab(val)}
              role="tab"
              aria-selected={activeTab === val}
              className={`-mb-px border-b-2 px-2.5 pb-2 pt-1 text-[14px] whitespace-nowrap transition-colors ${
                activeTab === val ? 'border-foreground font-semibold text-foreground' : 'border-transparent text-ink-secondary hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>


      {activeTab === 'overview' && (
        <>
          {/* A year of work, one cell per day */}
          <section id="activity" className="scroll-mt-24">
            <SectionHeader title="A year of work" />
            <div className="pt-5">
              <ActivityGraph
                tasks={tasks}
                events={calendarEvents}
                timezone={settings?.timezone || 'UTC'}
                today={getCurrentDateInTimezone(settings?.timezone || 'UTC')}
              />
            </div>
          </section>

          <section>
            <SectionHeader title="Since you started" />
            <dl className="grid grid-cols-2 gap-x-8 gap-y-6 pt-5 md:grid-cols-4">
              {[
                [`${Number(lifetimeMetrics.totalWorkingHours || 0).toFixed(0)}h`, 'worked in total'],
                [`${Number(lifetimeMetrics.avgWorkingHours || 0).toFixed(1)}h`, 'on an average working day'],
                [`${Number(lifetimeMetrics.totalDeepWorkHours || 0).toFixed(0)}h`, 'of it deep work'],
                [`${Number(lifetimeMetrics.completionRate || 0).toFixed(0)}%`, 'of planned tasks completed'],
              ].map(([value, label]) => (
                <div key={label} className="flex flex-col-reverse">
                  <dt className="mt-1.5 text-[13px] text-ink-secondary">{label}</dt>
                  <dd className="font-serif text-[34px] font-medium leading-none tracking-[-0.02em] text-foreground tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 text-[12.5px] leading-relaxed text-ink-faint">
              Averages use your {baseAllWorkingDays.length} working days since you joined ({allWorkingDays.length} with something tracked, {allCalendarDaysCount} calendar days in all). Work logged on an off day still counts.{' '}
              <button type="button" onClick={() => setShowMethodology(v => !v)} className="font-medium text-ink-secondary underline decoration-border-strong underline-offset-4 hover:text-foreground">
                {showMethodology ? 'Hide' : 'How the daily score works'}
              </button>
              {showMethodology && (
                <span className="block pt-1">
                  Daily score = task completion rate (50%) + deep work time (30%) + total logged time (20%). Rescheduling a task isn’t penalized. A restored backup shows as one continuous timeline.
                </span>
              )}
            </p>
          </section>

          {/* Day inspector */}
          <div className="bg-surface border border-border rounded-[14px]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-[14px] font-semibold text-foreground">Look at one day</span>
              <button
                onClick={() => setSelectedDate(todayStr)}
                className="font-mono text-[11px] text-primary hover:text-primary-hover transition-colors"
              >
                Jump to today
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex gap-2 items-center">
                <button
                  type="button"
                  onClick={() => {
                    const prev = new Date(selectedDate + 'T12:00:00');
                    prev.setDate(prev.getDate() - 1);
                    setSelectedDate(prev.toISOString().split('T')[0]);
                  }}
                  aria-label="Previous day"
                  className="p-1.5 border border-border-strong text-ink-faint hover:text-foreground hover:bg-surface-sunken rounded-md transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <input
                  type="date"
                  aria-label="Day to look at"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="flex-1 bg-surface-raised border border-border rounded-md px-3 py-1.5 text-foreground text-xs focus:outline-none focus:border-border-strong font-mono text-center"
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = new Date(selectedDate + 'T12:00:00');
                    next.setDate(next.getDate() + 1);
                    setSelectedDate(next.toISOString().split('T')[0]);
                  }}
                  aria-label="Next day"
                  className="p-1.5 border border-border-strong text-ink-faint hover:text-foreground hover:bg-surface-sunken rounded-md transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {[
                  ['Day score', selectedDayHasActivity ? selectedDateProductivityScore : null, 'var(--primary)'],
                  ['Week average', selectedWeekHasActivity ? selectedWeekProductivityScore : null, 'var(--color-data-slate)'],
                ].map(([label, score, colour]) => (
                  <div key={label as string} className="border border-border rounded-md p-4 flex flex-col items-center text-center">
                    <span className="text-[11.5px] font-semibold text-ink-faint">{label}</span>
                    <div className="relative w-20 h-20 flex items-center justify-center mt-3">
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
                        <circle cx="40" cy="40" r="34" stroke="var(--border-c)" strokeWidth="5" fill="transparent" />
                        {score !== null && (
                          <circle
                            cx="40" cy="40" r="34"
                            stroke={colour as string}
                            strokeWidth="5"
                            fill="transparent"
                            strokeDasharray={`${2 * Math.PI * 34}`}
                            strokeDashoffset={`${2 * Math.PI * 34 * (1 - ((score as number) || 0) / 100)}`}
                          />
                        )}
                      </svg>
                      <span className={`absolute font-mono font-bold ${score === null ? 'text-ink-faint text-lg' : 'text-foreground text-sm'}`}>
                        {score === null ? '–' : score as number}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-ink-faint leading-relaxed">
                Score = task completion rate + deep work time + total logged time. Rescheduling a task isn’t penalized. A day with nothing tracked shows a dash.
              </p>
            </div>
          </div>
        </>
      )}
    </div>

      {activeTab === 'reviews' && <ReviewHistory timezone={settings?.timezone || 'UTC'} />}

      {/* 2. COMPLETION METRICS */}
      {activeTab === 'completion' && (
        <div className="space-y-6">
          <h2 className="font-display text-base font-bold tracking-tight text-foreground">Completion</h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Task Completion Rate Card */}
            <div className="mkt-card p-6 flex flex-col justify-between min-h-60 lg:col-span-1">
              <div>
                <span className="text-[11.5px] font-mono text-muted-foreground flex items-center gap-1.5">
                  <Percent className="w-3.5 h-3.5 text-ink-faint" /> Completion rate
                </span>
                <div className="grid grid-cols-3 gap-2 mt-5 text-center">
                  <div className="bg-surface-sunken/40 border border-border p-3 rounded-md">
                    <p className="text-muted-foreground text-[11.5px] font-mono">Today</p>
                    <p className="text-xl font-bold text-foreground mt-1">{todayCompletionRate}%</p>
                  </div>
                  <div className="bg-surface-sunken/40 border border-border p-3 rounded-md">
                    <p className="text-muted-foreground text-[11.5px] font-mono">7 days</p>
                    <p className="text-xl font-bold text-foreground mt-1">{avg7DaysCompletionRate}%</p>
                  </div>
                  <div className="bg-surface-sunken/40 border border-border p-3 rounded-md">
                    <p className="text-muted-foreground text-[11.5px] font-mono">30 days</p>
                    <p className="text-xl font-bold text-foreground mt-1">{avg30DaysCompletionRate}%</p>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed mt-4">
                Completion rate is the share of planned tasks marked done.
              </p>
            </div>

            {/* Daily Completion Rate Line Chart */}
            <div className="mkt-card p-6 space-y-4 lg:col-span-2">
              <div className="flex justify-between items-center">
                <span className="text-[11.5px] font-mono text-muted-foreground flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-ink-faint" /> Daily completion rate, last 7 days
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">Tasks done (%)</span>
              </div>

              <div className={`relative pt-4 bg-surface-sunken/40 rounded-md border border-border p-3 h-40 flex ${last7Days.length === 0 ? 'items-center justify-center' : 'items-end'}`}>
                {last7Days.length === 0 ? (
                  <span className="text-xs text-muted-foreground font-light">No data for this period.</span>
                ) : (
                  <>
                    <svg className="w-full h-28 overflow-visible" viewBox="0 0 500 120">
                      <line x1="0" y1="5" x2="500" y2="5" stroke="var(--border-c)" strokeWidth="1" strokeDasharray="4" />
                      <line x1="0" y1="60" x2="500" y2="60" stroke="var(--border-c)" strokeWidth="1" strokeDasharray="4" />
                      <line x1="0" y1="115" x2="500" y2="115" stroke="var(--border-strong)" strokeWidth="1" />
                      
                      <polyline
                        fill="none"
                        stroke="url(#gradient-green)"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={generateChartPoints(last7Days, getCompletionRateForDate)}
                      />
                      
                      <defs>
                        <linearGradient id="gradient-green" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="var(--primary)" />
                          <stop offset="100%" stopColor="var(--primary)" />
                        </linearGradient>
                      </defs>
                    </svg>

                    <div className="absolute bottom-2 left-3 right-3 flex justify-between text-[8px] font-mono text-ink-faint">
                      {last7Days.map((dateStr, idx) => (
                        <span key={idx}>
                          {new Date(dateStr).toLocaleDateString(undefined, { weekday: 'short' })}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. DEEP WORK METRICS */}
      {activeTab === 'focus' && (
        <div className="space-y-6">
          <h2 className="font-display text-base font-bold tracking-tight text-foreground">Deep work</h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-6">
              {/* Deep Work Summary Card */}
              <div className="mkt-card p-6 flex flex-col justify-between">
                <div>
                  <span className="text-[11.5px] font-mono text-muted-foreground flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-ink-faint" /> Deep work hours
                  </span>
                  <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                    <div className="bg-surface-sunken/40 border border-border p-2.5 rounded-md">
                      <p className="text-ink-faint text-[8px] font-mono">Today</p>
                      <p className="text-lg font-bold text-foreground mt-1">{Number(todayDeepWorkHours || 0).toFixed(1)}h</p>
                    </div>
                    <div className="bg-surface-sunken/40 border border-border p-2.5 rounded-md">
                      <p className="text-ink-faint text-[8px] font-mono">7 days</p>
                      <p className="text-lg font-bold text-foreground mt-1">{Number(weeklyDeepWorkHours || 0).toFixed(1)}h</p>
                    </div>
                    <div className="bg-surface-sunken/40 border border-border p-2.5 rounded-md">
                      <p className="text-ink-faint text-[8px] font-mono">30 days</p>
                      <p className="text-lg font-bold text-foreground mt-1">{Number(monthlyDeepWorkHours || 0).toFixed(1)}h</p>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-3 pt-5 border-t border-border/50 mt-5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Deep work sessions completed</span>
                    <span className="text-foreground font-bold font-mono">{deepWorkSessionCount}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Average session length</span>
                    <span className="text-foreground font-bold font-mono">{averageDeepWorkSessionDuration}h</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Longest session</span>
                    <span className="text-foreground font-bold font-mono">{longestDeepWorkSession}h</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Deep work this week</span>
                    <span className="text-foreground font-bold font-mono">{weeklyDeepWorkTime}h</span>
                  </div>
                </div>
              </div>

              {/* Deep Work Duration Distribution Histogram Card */}
              <div className="mkt-card p-6 space-y-4">
                <span className="text-[11.5px] font-mono text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-ink-faint" /> Deep work session lengths
                </span>

                <div className="space-y-3 pt-2">
                  {/* Under 1 hour */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-muted-foreground">Short sessions (under 1 h)</span>
                      <span className="text-muted-foreground font-mono">
                        {deepWorkSessionDurations.filter(d => d < 1).length} ({deepWorkSessionDurations.length > 0 ? Math.round((deepWorkSessionDurations.filter(d => d < 1).length / deepWorkSessionDurations.length) * 100) : 0}%)
                      </span>
                    </div>
                    <div className="bg-surface-sunken h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-primary h-full rounded-full"
                        style={{ width: `${deepWorkSessionDurations.length > 0 ? (deepWorkSessionDurations.filter(d => d < 1).length / deepWorkSessionDurations.length) * 100 : 0}%` }}
                      />
                    </div>
                  </div>

                  {/* 1 - 2 hours */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-muted-foreground">Standard sessions (1–2 h)</span>
                      <span className="text-muted-foreground font-mono">
                        {deepWorkSessionDurations.filter(d => d >= 1 && d <= 2).length} ({deepWorkSessionDurations.length > 0 ? Math.round((deepWorkSessionDurations.filter(d => d >= 1 && d <= 2).length / deepWorkSessionDurations.length) * 100) : 0}%)
                      </span>
                    </div>
                    <div className="bg-surface-sunken h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-primary h-full rounded-full"
                        style={{ width: `${deepWorkSessionDurations.length > 0 ? (deepWorkSessionDurations.filter(d => d >= 1 && d <= 2).length / deepWorkSessionDurations.length) * 100 : 0}%` }}
                      />
                    </div>
                  </div>

                  {/* Over 2 hours */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-muted-foreground">Long sessions (over 2 h)</span>
                      <span className="text-muted-foreground font-mono">
                        {deepWorkSessionDurations.filter(d => d > 2).length} ({deepWorkSessionDurations.length > 0 ? Math.round((deepWorkSessionDurations.filter(d => d > 2).length / deepWorkSessionDurations.length) * 100) : 0}%)
                      </span>
                    </div>
                    <div className="bg-surface-sunken h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-success h-full rounded-full"
                        style={{ width: `${deepWorkSessionDurations.length > 0 ? (deepWorkSessionDurations.filter(d => d > 2).length / deepWorkSessionDurations.length) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Daily Focus Hours Trends Line Chart */}
            <div className="mkt-card p-6 space-y-4 lg:col-span-2">
              <div className="flex justify-between items-center">
                <span className="text-[11.5px] font-mono text-muted-foreground flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-primary" /> Daily focus hours, last 7 days
                </span>
                <span className="text-[10px] text-ink-faint font-mono">Focus hours</span>
              </div>

              <div className={`relative pt-4 bg-surface-sunken/40 rounded-md border border-border p-3 h-96 flex ${last7Days.length === 0 ? 'items-center justify-center' : 'items-end'}`}>
                {last7Days.length === 0 ? (
                  <span className="text-xs text-muted-foreground font-light">No data for this period.</span>
                ) : (
                  <>
                    <svg className="w-full h-80 overflow-visible" viewBox="0 0 500 120">
                      <line x1="0" y1="5" x2="500" y2="5" stroke="var(--border-c)" strokeWidth="1" strokeDasharray="4" />
                      <line x1="0" y1="60" x2="500" y2="60" stroke="var(--border-c)" strokeWidth="1" strokeDasharray="4" />
                      <line x1="0" y1="115" x2="500" y2="115" stroke="var(--border-strong)" strokeWidth="1" />
                      
                      <polyline
                        fill="none"
                        stroke="url(#gradient-purple)"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={generateChartPoints(last7Days, getDeepWorkHoursForDate)}
                      />
                      
                      <defs>
                        <linearGradient id="gradient-purple" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="var(--color-data-slate)" />
                          <stop offset="100%" stopColor="var(--color-data-slate)" />
                        </linearGradient>
                      </defs>
                    </svg>

                    <div className="absolute bottom-2 left-3 right-3 flex justify-between text-[8px] font-mono text-ink-faint">
                      {last7Days.map((dateStr, idx) => (
                        <span key={idx}>
                          {new Date(dateStr).toLocaleDateString(undefined, { weekday: 'short' })}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. WORKING HOURS */}
      {activeTab === 'hours' && (
        <div className="space-y-6">
          <h2 className="font-display text-base font-bold tracking-tight text-foreground">Working hours</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Working Hours Metrics */}
            <div className="mkt-card p-6 space-y-4">
              <span className="text-[11.5px] font-mono text-muted-foreground flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-ink-faint" /> Hours per day
              </span>
              <div className="space-y-3 pt-2">
                <div className="flex justify-between py-2 border-b border-border/50">
                  <span className="text-muted-foreground text-xs">Today</span>
                  <span className="text-foreground text-xs font-bold font-mono">{Number(todayWorkingHours || 0).toFixed(1)}h</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border/50">
                  <span className="text-muted-foreground text-xs">Weekly average</span>
                  <span className="text-foreground text-xs font-bold font-mono">{Number(avgWeeklyWorkingHours || 0).toFixed(1)}h/day</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border/50">
                  <span className="text-muted-foreground text-xs">Monthly average</span>
                  <span className="text-foreground text-xs font-bold font-mono">{Number(avgMonthlyWorkingHours || 0).toFixed(1)}h/day</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-muted-foreground text-xs">Configured workday</span>
                  <span className="text-muted-foreground text-xs font-bold font-mono">{Number(targetWorkingHours || 0).toFixed(1)}h/day</span>
                </div>
              </div>
            </div>

            {/* Deep vs Shallow Split Chart */}
            <div className="mkt-card p-6 space-y-5 flex flex-col justify-between">
              <div>
                <span className="text-[11.5px] font-mono text-muted-foreground flex items-center gap-1.5">
                  <Brain className="w-3.5 h-3.5 text-primary" /> Deep versus shallow work
                </span>

                <div className="flex flex-col items-center justify-center py-4 space-y-4">
                  <div className="w-full bg-surface-sunken h-5 rounded-full overflow-hidden border border-border flex relative">
                    <div 
                      className="bg-surface-sunken h-full transition-[width] duration-[var(--duration-standard)]"
                      style={{ width: `${deepWorkPct}%` }}
                      title={`Deep work: ${deepWorkPct}%`}
                    />
                    <div 
                      className="bg-surface-sunken h-full flex-1 transition-[width] duration-[var(--duration-standard)]"
                      title={`Shallow work: ${100 - deepWorkPct}%`}
                    />
                  </div>

                  <div className="flex justify-between w-full text-[10px] font-mono">
                    <div className="flex items-center gap-1.5 text-primary">
                      <span className="w-2.5 h-2.5 bg-primary rounded-sm block" />
                      <span>Deep: {deepWorkPct}% ({Number(totalFocusedHours || 0).toFixed(1)}h)</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="w-2.5 h-2.5 bg-surface-sunken rounded-sm block border border-border-strong" />
                      <span>Shallow: {100 - deepWorkPct}% ({Number(totalShallowHours || 0).toFixed(1)}h)</span>
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-[10px] text-ink-faint leading-normal">
                Deep work is cognitively demanding. Shallow work is routine and administrative.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 5. PROJECT ANALYTICS */}
      {activeTab === 'projects' && (
        <>
          <div className="space-y-6">
            <h2 className="font-display text-base font-bold tracking-tight text-foreground">Projects and tasks</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Project Statistics */}
              <div className="mkt-card p-6 space-y-5">
                <h3 className="text-[12.5px] font-semibold text-muted-foreground">Project overview</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-surface-sunken/40 border border-border rounded-md text-center">
                    <span className="text-[11.5px] text-ink-faint">Active projects</span>
                    <p className="text-2xl font-bold text-foreground mt-1">{activeProjects.length}</p>
                  </div>
                  <div className="p-4 bg-surface-sunken/40 border border-border rounded-md text-center">
                    <span className="text-[11.5px] text-ink-faint">Average completion</span>
                    <p className="text-2xl font-bold text-foreground mt-1">{Number(avgProjectCompletion || 0).toFixed(1)}%</p>
                  </div>
                </div>

                <div className="space-y-3 border-t border-border/60 pt-4">
                  <h4 className="text-[11.5px] font-semibold text-muted-foreground mb-2">Project progress</h4>
                  
                  <div className="space-y-2.5">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
                        <span>Completed ({projectDistribution.completed})</span>
                        <span>{safeProjects.length > 0 ? Math.round(projectDistribution.completed / safeProjects.length * 100) : 0}%</span>
                      </div>
                      <div className="w-full bg-surface-sunken h-1.5 rounded-full overflow-hidden border border-border">
                        <div className="bg-success h-full" style={{ width: `${safeProjects.length > 0 ? (projectDistribution.completed / safeProjects.length * 100) : 0}%` }} />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
                        <span>Nearly done (80% or more) ({projectDistribution.nearCompletion})</span>
                        <span>{safeProjects.length > 0 ? Math.round(projectDistribution.nearCompletion / safeProjects.length * 100) : 0}%</span>
                      </div>
                      <div className="w-full bg-surface-sunken h-1.5 rounded-full overflow-hidden border border-border">
                        <div className="bg-primary h-full" style={{ width: `${safeProjects.length > 0 ? (projectDistribution.nearCompletion / safeProjects.length * 100) : 0}%` }} />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
                        <span>In progress (20–80%) ({projectDistribution.inProgress})</span>
                        <span>{safeProjects.length > 0 ? Math.round(projectDistribution.inProgress / safeProjects.length * 100) : 0}%</span>
                      </div>
                      <div className="w-full bg-surface-sunken h-1.5 rounded-full overflow-hidden border border-border">
                        <div className="bg-primary h-full" style={{ width: `${safeProjects.length > 0 ? (projectDistribution.inProgress / safeProjects.length * 100) : 0}%` }} />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
                        <span>At risk (under 20%) ({projectDistribution.atRisk})</span>
                        <span>{safeProjects.length > 0 ? Math.round(projectDistribution.atRisk / safeProjects.length * 100) : 0}%</span>
                      </div>
                      <div className="w-full bg-surface-sunken h-1.5 rounded-full overflow-hidden border border-border">
                        <div className="bg-danger h-full" style={{ width: `${safeProjects.length > 0 ? (projectDistribution.atRisk / safeProjects.length * 100) : 0}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Task Statistics */}
              <div className="mkt-card p-6 space-y-5">
                <h3 className="text-[12.5px] font-semibold text-muted-foreground">Task overview</h3>

                <div className="grid grid-cols-3 gap-2">
                  <div className="p-3 bg-surface-sunken/40 border border-border rounded-md text-center">
                    <span className="text-[11.5px] text-ink-faint">Created</span>
                    <p className="text-xl font-bold text-foreground mt-0.5">{totalTasksCount}</p>
                  </div>
                  <div className="p-3 bg-surface-sunken/40 border border-border rounded-md text-center">
                    <span className="text-[11.5px] text-ink-faint">Completed</span>
                    <p className="text-xl font-bold text-success mt-0.5">{completedTasksCount}</p>
                  </div>
                  <div className="p-3 bg-surface-sunken/40 border border-border rounded-md text-center">
                    <span className="text-[11.5px] text-ink-faint">Postponed</span>
                    <p className="text-xl font-bold text-foreground mt-0.5">{postponedCount}</p>
                  </div>
                </div>

                <div className="space-y-3 border-t border-border/60 pt-4">
                  <h4 className="text-[11.5px] font-semibold text-muted-foreground mb-2">Completion rate by priority</h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
                        <span>Critical</span>
                        <span>{priorityCompletionRates.CRITICAL}%</span>
                      </div>
                      <div className="w-full bg-surface-sunken h-1.5 rounded-full overflow-hidden border border-border">
                        <div className="bg-danger h-full" style={{ width: `${priorityCompletionRates.CRITICAL}%` }} />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
                        <span>High</span>
                        <span>{priorityCompletionRates.HIGH}%</span>
                      </div>
                      <div className="w-full bg-surface-sunken h-1.5 rounded-full overflow-hidden border border-border">
                        <div className="bg-warning h-full" style={{ width: `${priorityCompletionRates.HIGH}%` }} />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
                        <span>Medium</span>
                        <span>{priorityCompletionRates.MEDIUM}%</span>
                      </div>
                      <div className="w-full bg-surface-sunken h-1.5 rounded-full overflow-hidden border border-border">
                        <div className="bg-primary h-full" style={{ width: `${priorityCompletionRates.MEDIUM}%` }} />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
                        <span>Low</span>
                        <span>{priorityCompletionRates.LOW}%</span>
                      </div>
                      <div className="w-full bg-surface-sunken h-1.5 rounded-full overflow-hidden border border-border">
                        <div className="bg-ink-faint h-full" style={{ width: `${priorityCompletionRates.LOW}%` }} />
                      </div>
                    </div>
                  </div>
                  
                  <div className="pt-2 text-[10px] text-ink-faint flex justify-between font-mono">
                    <span>Average completion time</span>
                    <span className="text-ink-secondary">{Number(avgTaskCompletionTime || 0).toFixed(1)} hours</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 6. PROJECT GOALS TIME DISTRIBUTION */}
          <div className="mkt-card p-6 space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
              <div>
                <h2 className="text-base font-bold text-foreground tracking-tight flex items-center">
                  <FolderGit2 className="w-5 h-5 mr-2 text-primary" /> Time by objective
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Planned versus actual hours for each objective in a project.
                </p>
              </div>
              
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <select
                  aria-label="Project"
                  value={selectedAnalyticsProjectId}
                  onChange={(e) => setSelectedAnalyticsProjectId(e.target.value)}
                  className="min-w-0 max-w-full truncate sm:max-w-[20rem] bg-surface-raised border border-border rounded-md px-4 py-2 text-foreground text-xs focus:outline-none focus:border-border-strong"
                >
                  <option value="">Select a project…</option>
                  {safeProjects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                
                {selectedAnalyticsProjectId && (
                  <button
                    onClick={() => {
                      const proj = safeProjects.find(p => p.id === selectedAnalyticsProjectId);
                      if (proj) {
                        const metrics = getGoalsMetrics(proj);
                        handleExportGoalMetrics(proj, metrics);
                      }
                    }}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 bg-surface-raised border border-border-strong hover:bg-surface-sunken text-foreground text-xs font-semibold rounded-[9px] transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> Export CSV
                  </button>
                )}
              </div>
            </div>

            {selectedAnalyticsProjectId ? (
              (() => {
                const proj = safeProjects.find(p => p.id === selectedAnalyticsProjectId);
                if (!proj) return <p className="text-xs text-muted-foreground font-mono">Project not found.</p>;
                const metrics = getGoalsMetrics(proj);

                if (metrics.length === 0) {
                  return (
                    <div className="text-center py-10 bg-surface-raised/20 border border-dashed border-border rounded-md">
                      <p className="text-xs text-muted-foreground font-mono">No objectives or scheduled tasks in this project yet.</p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-6">
                    {/* Visual Cards Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Detailed Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-border/80 text-muted-foreground font-mono text-[11.5px]">
                              <th className="pb-3 font-semibold">Objective</th>
                              <th className="pb-3 text-right font-semibold">Planned</th>
                              <th className="pb-3 text-right font-semibold">Actual</th>
                              <th className="pb-3 text-right font-semibold">Difference</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/60 font-mono">
                            {metrics.map((m, idx) => {
                              const diff = m.actual - m.planned;
                              return (
                                <tr key={idx} className="hover:bg-surface-raised/20">
                                  <td className="py-3.5 pr-4 text-foreground font-sans font-medium">{m.text}</td>
                                  <td className="py-3.5 text-right text-muted-foreground">{m.planned.toFixed(1)}h</td>
                                  <td className="py-3.5 text-right text-success font-bold">{m.actual.toFixed(1)}h</td>
                                  <td className={`py-3.5 text-right font-bold ${diff > 0 ? 'text-danger' : diff < 0 ? 'text-success' : 'text-muted-foreground'}`}>
                                    {diff > 0 ? '+' : ''}{diff.toFixed(1)}h
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Horizontal Bar Chart representation */}
                      <div className="space-y-4 bg-surface-raised/30 border border-border rounded-md p-5">
                        <h4 className="text-[11.5px] font-semibold text-muted-foreground mb-1">Planned versus actual</h4>
                        <p className="text-[9px] text-ink-faint leading-relaxed mb-4">
                          PLN (gray) is planned time. ACT (green) is actual time.
                        </p>
                        
                        <div className="space-y-4">
                          {metrics.map((m, idx) => {
                            const maxVal = Math.max(...metrics.map(x => Math.max(x.planned, x.actual, 1)));
                            const plannedPct = (m.planned / maxVal) * 100;
                            const actualPct = (m.actual / maxVal) * 100;
                            
                            return (
                              <div key={idx} className="space-y-1">
                                <span className="text-[11px] font-medium text-foreground block truncate">{m.text}</span>
                                <div className="space-y-1 bg-surface-sunken/45 p-2 rounded-lg border border-border/40">
                                  {/* Planned Bar */}
                                  <div className="flex items-center gap-2">
                                    <span className="text-[8px] font-mono text-ink-faint w-8">PLN</span>
                                    <div className="flex-1 bg-surface-raised h-2.5 rounded-full overflow-hidden">
                                      <div className="bg-border-strong h-full rounded-full transition-[width] duration-[var(--duration-standard)]" style={{ width: `${plannedPct}%` }} />
                                    </div>
                                    <span className="text-[9px] font-mono text-muted-foreground w-8 text-right">{m.planned.toFixed(1)}h</span>
                                  </div>
                                  {/* Actual Bar */}
                                  <div className="flex items-center gap-2">
                                    <span className="text-[8px] font-mono text-success w-8">ACT</span>
                                    <div className="flex-1 bg-surface-raised h-2.5 rounded-full overflow-hidden">
                                      <div className="bg-success h-full rounded-full transition-[width] duration-[var(--duration-standard)]" style={{ width: `${actualPct}%` }} />
                                    </div>
                                    <span className="text-[9px] font-mono text-success w-8 text-right">{m.actual.toFixed(1)}h</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="text-center py-10 bg-surface-raised/20 border border-dashed border-border rounded-md">
                <p className="text-xs text-muted-foreground font-mono">Select a project above to compare planned and actual time by objective.</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* 7. ACTIVE WORK DAY CALENDAR */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-1">
            {renderWorkCalendarSnapshot()}
          </div>

          <div className="lg:col-span-2 bg-surface border border-border rounded-md">
            <div className="px-4 py-3 border-b border-border">
              <span className="text-[12.5px] font-semibold text-ink-secondary">This month</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
              <div className="p-4">
                <p className="text-[11.5px] font-semibold text-ink-faint">Configured working days</p>
                <p className="font-mono text-xl text-foreground tabular-nums mt-1">{currentMonthStats.configured}</p>
                <p className="text-[11px] text-ink-faint mt-0.5">days marked as working</p>
              </div>
              <div className="p-4">
                <p className="text-[11.5px] font-semibold text-ink-faint">Extra days worked</p>
                <p className="font-mono text-xl text-foreground tabular-nums mt-1">{currentMonthStats.additional}</p>
                <p className="text-[11px] text-ink-faint mt-0.5">rest days you logged work on</p>
              </div>
              <div className="p-4">
                <p className="text-[11.5px] font-semibold text-ink-faint">Productive days</p>
                <p className="font-mono text-xl text-foreground tabular-nums mt-1">{currentMonthStats.total}</p>
                <p className="text-[11px] text-ink-faint mt-0.5">used for this month’s averages</p>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export const dynamic = 'force-dynamic';
