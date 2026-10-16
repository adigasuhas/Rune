'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LoadError } from '@/components/LoadError';
import Link from 'next/link';
import { useSession } from '@/context/SessionContext';
import { useNotifications } from '@/context/NotificationContext';
import { useConfirm } from '@/components/ConfirmDialog';
import {
  Plus,
  Calendar,
  CheckCircle2,
  CheckCircle,
  CheckSquare,
  Circle,
  Trophy,
  Flame,
  Brain,
  Ban,
  AlertTriangle,
  X,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Edit,
  CalendarDays,
} from 'lucide-react';
import { Button, SectionHeader, StatusPill } from '@/components/ui';
import { ActivityGraph } from '@/components/activity/ActivityGraph';
import { formatHours } from '@/lib/activity';
import { calculateOccupiedHoursForDay, getPostponeCount } from '@/lib/analyticsUtils';
import { getTaskElapsed, formatElapsedMinutes, initialScheduleSlots, validateScheduleSlots } from '@/lib/taskElapsed';
import { compareManualOrder } from '@/lib/taskOrder';
import { InProgressLabel, InProgressStrip } from '@/components/tasks/InProgressIndicator';
import { getLocalDateString, getCurrentDateInTimezone, parseDateInTimezone, getStartOfDayInTimezone, formatRelativeDeadline, daysUntil } from '@/lib/dateUtils';
import { PROJECT_COLORS } from '@/lib/colors';
import { ClockTimePicker } from '@/components/ClockTimePicker';
import { SessionTypeSelector } from '@/components/SessionTypeSelector';
import { TaskFormModal } from '@/components/TaskFormModal';
import { ReviewDayModal } from '@/components/ReviewDayModal';
import { MarketingLanding } from '@/components/MarketingLanding';
import { TodayHeader } from '@/components/today/TodayHeader';

type TaskStatusValue = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
import { SessionType, normalizeSessionType, durationLabel, sessionTypeLabel, SESSION_TYPE_META } from '@/lib/sessionType';

interface Goal {
  id: string;
  text: string;
  completed: boolean;
}

interface Project {
  id: string;
  name: string;
  progress: number;
  status: string;
  color: string;
  goals?: string;
  deadline?: string | null;
}

interface Task {
  id: string;
  name: string;
  detail?: string;
  projectId?: string;
  linkedGoalId?: string;
  priority: string;
  date: string;
  sessionType: string;
  estimatedTime: number;
  actualTime?: number;
  timeDifference?: number;
  context: string;
  effort: number;
  impact: number;
  status: string;
  blockedReason?: string | null;
  blockedOnName?: string | null;
  postponeHistory?: string;
}

interface BlockingMeTask {
  id: string;
  name: string;
  blockedReason: string | null;
  ownerName: string;
  projectName: string | null;
  projectId: string | null;
  since: string;
}

interface WeeklyDigest {
  weekOf: string;
  weekKey: string;
  lastWeek: { completedTasks: number; deepWorkHours: number };
  weekAhead: { tasksDue: number; projectDeadlines: Array<{ id: string; name: string; deadline: string }> };
  blocked: { mine: number; onMe: number };
}

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  description?: string;
  sessionType?: string;
  taskId?: string | null;
  completed?: boolean;
}

interface Job {
  id: string;
  name: string;
  status: string;
  category: string;
  submitTime: string;
  projectedCompletionTime?: string | null;
  computeTime: number;
  instrument?: { name: string } | null;
}

/**
 * `/` is the dashboard when signed in and the marketing landing page when
 * not. The choice is made here, before the dashboard mounts, so a signed-out
 * visitor never triggers the dashboard's data requests (they used to fire -
 * and fail with 401 - behind the landing page). `null` while the session
 * resolves avoids flashing the landing page at a signed-in user.
 */
export default function HomePage() {
  const { user, loading } = useSession();
  if (loading) return null;
  if (!user) return <MarketingLanding />;
  return <DashboardPage />;
}

function DashboardPage() {
  const { user } = useSession();
  const { toast } = useNotifications();
  const confirm = useConfirm();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [blockingMe, setBlockingMe] = useState<BlockingMeTask[]>([]);
  const [digest, setDigest] = useState<WeeklyDigest | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [allowConcurrentTasks, setAllowConcurrentTasks] = useState(false);
  const [taskNotificationsEnabled, setTaskNotificationsEnabled] = useState(true);
  const [conflictModal, setConflictModal] = useState<{
    isOpen: boolean;
    conflictingEvents: Array<{ title: string; startStr: string; endStr: string }>;
    onConfirm: () => void;
  }>({
    isOpen: false,
    conflictingEvents: [],
    onConfirm: () => {}
  });
  const [workStart, setWorkStart] = useState('08:00');
  const [workEnd, setWorkEnd] = useState('18:00');
  const [workingDays, setWorkingDays] = useState('Monday,Tuesday,Wednesday,Thursday,Friday');
  const [accountCreatedAt, setAccountCreatedAt] = useState('');
  const [userTimezone, setUserTimezone] = useState<string>(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch (e) {
      return 'UTC';
    }
  });

  // Date Navigation State
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    try {
      return getLocalDateString(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    } catch (e) {
      return new Date().toLocaleDateString('en-CA');
    }
  });

  // Modals States
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [viewingTask, setViewingTask] = useState<Task | null>(null);
  const [fullSettings, setFullSettings] = useState<any>(null);
  const [dayStatusModal, setDayStatusModal] = useState<{
    isOpen: boolean;
    date: string;
    type: 'working' | 'off' | 'leave';
    comment: string;
  }>({
    isOpen: false,
    date: '',
    type: 'working',
    comment: ''
  });
  const [currentTimeMins, setCurrentTimeMins] = useState<number>(540);
  const [dataLoading, setDataLoading] = useState(true);
  const lastScrolledDateRef = useRef<string | null>(null);
  const initialScrollDoneRef = useRef(false);
  
  // Form States
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskDetail, setNewTaskDetail] = useState('');
  const [newTaskProject, setNewTaskProject] = useState('');
  const [newTaskGoalId, setNewTaskGoalId] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState('MEDIUM');
  const [newTaskDate, setNewTaskDate] = useState(selectedDate);
  const [newTaskSessionType, setNewTaskSessionType] = useState<SessionType>('REGULAR');
  const [newTaskEst, setNewTaskEst] = useState('1');
  const [newTaskContext, setNewTaskContext] = useState('COMPUTER');
  const [isCustomNewTaskContext, setIsCustomNewTaskContext] = useState(false);
  const [customNewTaskContext, setCustomNewTaskContext] = useState('');
  const [newTaskEffort, setNewTaskEffort] = useState('5');
  const [newTaskImpact, setNewTaskImpact] = useState('5');
  const [newTaskSlots, setNewTaskSlots] = useState<Array<{ startTime: string; endTime: string }>>([
    { startTime: '', endTime: '' }
  ]);

  const [eventSlots, setEventSlots] = useState<Array<{ startTime: string; endTime: string }>>([
    { startTime: '', endTime: '' }
  ]);

  const [completeTaskModal, setCompleteTaskModal] = useState<{
    isOpen: boolean;
    task: Task | null;
    slots: Array<{ startTime: string; endTime: string }>;
  }>({
    isOpen: false,
    task: null,
    slots: [{ startTime: '', endTime: '' }]
  });

  const [newProjName, setNewProjName] = useState('');
  const [newProjDesc, setNewProjDesc] = useState('');
  const [newProjGoals, setNewProjGoals] = useState('');
  const [newProjDeadline, setNewProjDeadline] = useState('');
  const [newProjPriority, setNewProjPriority] = useState('MEDIUM');
  const [newProjColor, setNewProjColor] = useState('#71717A');

  // Event Form State
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState(selectedDate);
  const [eventStart, setEventStart] = useState('09:00');
  const [eventEnd, setEventEnd] = useState('10:00');
  const [eventDesc, setEventDesc] = useState('');
  const [eventSessionType, setEventSessionType] = useState<SessionType>('REGULAR');
  const [eventTaskId, setEventTaskId] = useState('');
  const [eventCompleted, setEventCompleted] = useState(false);

  // Daily Review Trigger State
  const [reviewSuccess, setReviewSuccess] = useState(false);
  const [showReviewDay, setShowReviewDay] = useState(false);
  const [freshStart, setFreshStart] = useState(false);

  // Calendar drag-and-drop, high-resolution resize, auto-scroll, and auto-sync states
  const [autoSyncTaskStatus, setAutoSyncTaskStatus] = useState(true);
  const [draggingTask, setDraggingTask] = useState<Task | null>(null);
  
  const [dragOverPreview, setDragOverPreview] = useState<{
    top: number;
    height: number;
    startStr: string;
    endStr: string;
    title: string;
    color: string;
  } | null>(null);

  const [activeEventOperation, setActiveEventOperation] = useState<{
    eventId: string;
    type: 'drag' | 'resize-top' | 'resize-bottom';
    initialY: number;
    initialStartMins: number;
    initialEndMins: number;
  } | null>(null);

  const [eventOverrides, setEventOverrides] = useState<Record<string, { start: string; end: string }>>({});
  const eventOverridesRef = useRef(eventOverrides);
  useEffect(() => {
    eventOverridesRef.current = eventOverrides;
  }, [eventOverrides]);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isInitialLoadRef = useRef(true);
  const HOUR_HEIGHT = 64;

  // Sync newTaskDate with selectedDate when dashboard selection changes
  useEffect(() => {
    setNewTaskDate(selectedDate);
    setEventDate(selectedDate);
  }, [selectedDate]);

  // Load autoSyncTaskStatus from localStorage
  useEffect(() => {
    const val = localStorage.getItem('rune_auto_sync_task_status');
    if (val !== null) {
      setAutoSyncTaskStatus(val === 'true');
    }
  }, []);

  // Center the calendar scroll container to the current time (if today) or the start of work hours on selectedDate or workStart changes
  useEffect(() => {
    if (!scrollContainerRef.current || !fullSettings) return;

    const todayStr = getCurrentDateInTimezone(userTimezone);
    const isToday = selectedDate === todayStr;

    // 1. Initial scroll once settings are loaded
    if (!initialScrollDoneRef.current) {
      initialScrollDoneRef.current = true;
      lastScrolledDateRef.current = selectedDate;
      if (isToday) {
        const y = (currentTimeMins / 60) * HOUR_HEIGHT;
        scrollContainerRef.current.scrollTop = Math.max(0, y - scrollContainerRef.current.clientHeight / 3);
      } else {
        const [hours] = workStart.split(':').map(Number);
        const scrollHour = hours || 8;
        scrollContainerRef.current.scrollTop = scrollHour * HOUR_HEIGHT - 20;
      }
      return;
    }

    // 2. Scroll on date change
    if (lastScrolledDateRef.current !== selectedDate) {
      lastScrolledDateRef.current = selectedDate;
      if (isToday) {
        const y = (currentTimeMins / 60) * HOUR_HEIGHT;
        scrollContainerRef.current.scrollTop = Math.max(0, y - scrollContainerRef.current.clientHeight / 3);
      } else {
        const [hours] = workStart.split(':').map(Number);
        const scrollHour = hours || 8;
        scrollContainerRef.current.scrollTop = scrollHour * HOUR_HEIGHT - 20;
      }
    }
    // dataLoading: the planner (and so the ref) only mounts once data has
    // loaded - without it the first scroll never happened and Today opened
    // at midnight.
  }, [selectedDate, workStart, userTimezone, currentTimeMins, fullSettings, dataLoading]);

  // Global mouse handlers for custom high-precision calendar resizing and dragging
  useEffect(() => {
    if (!activeEventOperation) return;
    
    const handleGlobalMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - activeEventOperation.initialY;
      const deltaMins = Math.round(((deltaY / HOUR_HEIGHT) * 60) / 15) * 15;
      
      let newStartMins = activeEventOperation.initialStartMins;
      let newEndMins = activeEventOperation.initialEndMins;
      
      if (activeEventOperation.type === 'drag') {
        newStartMins += deltaMins;
        newEndMins += deltaMins;
        
        if (newStartMins < 0) {
          const diff = -newStartMins;
          newStartMins = 0;
          newEndMins += diff;
        }
        if (newEndMins > 28 * 60) {
          const diff = newEndMins - 28 * 60;
          newEndMins = 28 * 60;
          newStartMins -= diff;
        }
      } else if (activeEventOperation.type === 'resize-top') {
        newStartMins += deltaMins;
        newStartMins = Math.max(0, Math.min(newEndMins - 15, newStartMins));
      } else if (activeEventOperation.type === 'resize-bottom') {
        newEndMins += deltaMins;
        newEndMins = Math.min(28 * 60, Math.max(newStartMins + 15, newEndMins));
      }
      
      const makeISODate = (totalMins: number) => {
        const baseDate = parseDateInTimezone(selectedDate, userTimezone);
        const localDate = new Date(baseDate.getTime() + totalMins * 60 * 1000);
        return localDate.toISOString();
      };
      
      const nextStart = makeISODate(newStartMins);
      const nextEnd = makeISODate(newEndMins);

      setEventOverrides(prev => {
        const curr = prev[activeEventOperation.eventId];
        if (curr && curr.start === nextStart && curr.end === nextEnd) {
          return prev;
        }
        return {
          ...prev,
          [activeEventOperation.eventId]: {
            start: nextStart,
            end: nextEnd
          }
        };
      });
    };
    
    const handleGlobalMouseUp = async () => {
      const override = eventOverridesRef.current[activeEventOperation.eventId];
      const op = activeEventOperation;
      setActiveEventOperation(null);
      setEventOverrides({});
      
      if (override) {
        if (!allowConcurrentTasks) {
          const startHHMM = getTimeInTimezone(override.start);
          const endHHMM = getTimeInTimezone(override.end);
          const eventToUpdate = events.find(e => e.id === op.eventId);
          const taskId = eventToUpdate?.taskId;
          
          const proposedSlots = [{ startTime: startHHMM, endTime: endHHMM }];
          const overlaps = getOverlaps(proposedSlots, selectedDate, taskId, op.eventId);
          
          if (overlaps.length > 0) {
            const errorMsg = `These time slots overlap with existing events or tasks:\n` + overlaps.map(o => `• ${o.title} (${o.startStr}–${o.endStr})`).join('\n');
            toast('Time conflict', errorMsg, 'error');
            return;
          }
        }

        try {
          const res = await fetch('/api/calendar', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: op.eventId,
              start: override.start,
              end: override.end
            })
          });
          if (res.ok) {
            setRefreshTrigger(prev => prev + 1);
          }
        } catch (err) {
          console.error('Failed to update event times on drag/resize:', err);
        }
      }
    };
    
    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [activeEventOperation, selectedDate]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          setFullSettings(data);
          setAllowConcurrentTasks(data.allowConcurrentTasks === true);
          setTaskNotificationsEnabled(data.taskNotificationsEnabled !== false);
          setWorkStart(data.workStart || '08:00');
          setWorkEnd(data.workEnd || '18:00');
          setWorkingDays(data.workingDays || 'Monday,Tuesday,Wednesday,Thursday,Friday');
          setAccountCreatedAt(data.createdAt || new Date().toISOString());
          if (data.timezone) {
            setUserTimezone(data.timezone);
          }
          
          const userTZ = data.timezone || userTimezone;
          const todayDateStr = getCurrentDateInTimezone(userTZ);
          
          if (isInitialLoadRef.current) {
            isInitialLoadRef.current = false;
            // Always open on today. A rest day is surfaced with an inline
            // banner + a one-click "jump to next working day" - the dashboard
            // never silently shows a date that isn't today (readiness review F1).
            setSelectedDate(todayDateStr);
          }
        }
      } catch (err) {
        console.error('Error fetching settings on dashboard:', err);
      }
    };
    fetchSettings();

    const handleSettingsUpdated = () => {
      fetchSettings();
    };
    window.addEventListener('rune-settings-updated', handleSettingsUpdated);
    return () => {
      window.removeEventListener('rune-settings-updated', handleSettingsUpdated);
    };
  }, []);


  // Update current time indicator position every minute
  useEffect(() => {
    const updateTime = () => {
      try {
        const d = new Date();
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: userTimezone,
          hour12: false,
          hour: 'numeric',
          minute: 'numeric'
        });
        const parts = formatter.formatToParts(d);
        const hour = Number(parts.find(p => p.type === 'hour')?.value);
        const minute = Number(parts.find(p => p.type === 'minute')?.value);
        setCurrentTimeMins(hour * 60 + minute);
      } catch (e) {
        const now = new Date();
        setCurrentTimeMins(now.getHours() * 60 + now.getMinutes());
      }
    };
    
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, [userTimezone]);


  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [tasksRes, projectsRes, eventsRes, jobsRes, blockingRes, digestRes] = await Promise.all([
          fetch('/api/tasks'),
          fetch('/api/projects'),
          fetch('/api/calendar'),
          fetch('/api/jobs'),
          fetch('/api/tasks/blocking-me'),
          fetch('/api/digest/weekly')
        ]);
        setLoadFailed(![tasksRes, projectsRes, eventsRes].every((r) => r.ok));

        if (tasksRes.ok) setTasks(await tasksRes.json());
        if (projectsRes.ok) setProjects(await projectsRes.json());
        if (eventsRes.ok) setEvents(await eventsRes.json());
        if (jobsRes.ok) setJobs(await jobsRes.json());
        if (blockingRes.ok) setBlockingMe(await blockingRes.json());
        if (digestRes.ok) setDigest(await digestRes.json());
      } catch (err) {
        setLoadFailed(true);
        console.error('Error fetching dashboard data:', err);
      } finally {
        setDataLoading(false);
      }
    };
    fetchData();
  }, [refreshTrigger]);

  // Show the fresh-start prompt once per ISO week (per browser).
  useEffect(() => {
    if (!digest?.weekKey) return;
    try {
      if (localStorage.getItem('rune-fresh-start-seen') !== digest.weekKey) setFreshStart(true);
    } catch { /* private mode / storage blocked - just don't show it */ }
  }, [digest?.weekKey]);

  const dismissFreshStart = () => {
    setFreshStart(false);
    try {
      if (digest?.weekKey) localStorage.setItem('rune-fresh-start-seen', digest.weekKey);
    } catch { /* ignore */ }
  };

  const getMinutesFromStartOfDay = (dateIsoStr: string) => {
    try {
      const d = new Date(dateIsoStr);
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: userTimezone,
        hour12: false,
        hour: 'numeric',
        minute: 'numeric'
      });
      const parts = formatter.formatToParts(d);
      const hour = Number(parts.find(p => p.type === 'hour')?.value);
      const minute = Number(parts.find(p => p.type === 'minute')?.value);
      return hour * 60 + minute;
    } catch (err) {
      try {
        const d = new Date(dateIsoStr);
        return d.getHours() * 60 + d.getMinutes();
      } catch {
        return 0;
      }
    }
  };

  const getHourInTimezone = (dateIsoStr: string, fallbackVal: number = 0) => {
    try {
      const d = new Date(dateIsoStr);
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: userTimezone,
        hour12: false,
        hour: 'numeric'
      });
      const parts = formatter.formatToParts(d);
      return Number(parts.find(p => p.type === 'hour')?.value);
    } catch {
      try {
        return new Date(dateIsoStr).getHours();
      } catch {
        return fallbackVal;
      }
    }
  };

  const getTimeInTimezone = (dateIsoStr: string) => {
    try {
      const d = new Date(dateIsoStr);
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: userTimezone,
        hour12: false,
        hour: 'numeric',
        minute: 'numeric'
      });
      const parts = formatter.formatToParts(d);
      const hrs = String(parts.find(p => p.type === 'hour')?.value).padStart(2, '0');
      const mins = String(parts.find(p => p.type === 'minute')?.value).padStart(2, '0');
      return `${hrs}:${mins}`;
    } catch {
      try {
        const d = new Date(dateIsoStr);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      } catch {
        return '09:00';
      }
    }
  };

  const validateInternalSlots = (
    slots: Array<{ startTime: string; endTime: string }>
  ): string | null => {
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (!s.startTime || !s.endTime) {
        return `Time slot ${i + 1} needs a start and end time.`;
      }
      if (s.startTime === s.endTime) {
        return `Time slot ${i + 1} has the same start and end time.`;
      }
    }

    const toMinutes = (timeStr: string) => {
      const [h, m] = timeStr.split(':').map(Number);
      return h * 60 + m;
    };

    for (let i = 0; i < slots.length; i++) {
      const s1 = slots[i];
      const start1 = toMinutes(s1.startTime);
      let end1 = toMinutes(s1.endTime);
      if (end1 <= start1) end1 += 24 * 60;

      for (let j = i + 1; j < slots.length; j++) {
        const s2 = slots[j];
        const start2 = toMinutes(s2.startTime);
        let end2 = toMinutes(s2.endTime);
        if (end2 <= start2) end2 += 24 * 60;

        if (start1 < end2 && start2 < end1) {
          return `Time slots overlap: ${s1.startTime}–${s1.endTime} and ${s2.startTime}–${s2.endTime}.`;
        }
      }
    }
    return null;
  };

  const formatTime12Hour = (timeStr: string): string => {
    if (!timeStr) return '';
    const [hStr, mStr] = timeStr.split(':');
    let h = parseInt(hStr);
    const m = parseInt(mStr);
    if (isNaN(h) || isNaN(m)) return timeStr;
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12;
    const mFormatted = String(m).padStart(2, '0');
    return `${h}:${mFormatted} ${ampm}`;
  };

  const getOverlaps = (
    slots: Array<{ startTime: string; endTime: string }>,
    dateStr: string,
    excludeTaskId?: string | null,
    excludeEventId?: string | null
  ): Array<{ title: string; startStr: string; endStr: string }> => {
    const toMinutes = (timeStr: string) => {
      const [h, m] = timeStr.split(':').map(Number);
      return h * 60 + m;
    };

    const bookedEvents = events.filter(e => {
      if (excludeTaskId && e.taskId === excludeTaskId) return false;
      if (excludeEventId && e.id === excludeEventId) return false;
      
      const eventDate = getLocalDateString(e.start, userTimezone);
      return eventDate === dateStr;
    });

    const conflictingEvents: Array<{ title: string; startStr: string; endStr: string }> = [];

    for (const slot of slots) {
      if (!slot.startTime || !slot.endTime) continue;
      const startMins = toMinutes(slot.startTime);
      let endMins = toMinutes(slot.endTime);
      if (endMins <= startMins) endMins += 24 * 60;

      for (const evt of bookedEvents) {
        const evtStartStr = getTimeInTimezone(evt.start);
        const evtEndStr = getTimeInTimezone(evt.end);

        const evtStartMins = toMinutes(evtStartStr);
        let evtEndMins = toMinutes(evtEndStr);

        const evtStartDate = getLocalDateString(evt.start, userTimezone);
        const evtEndDate = getLocalDateString(evt.end, userTimezone);
        if (evtStartDate !== evtEndDate) {
          evtEndMins += 24 * 60;
        }

        if (startMins < evtEndMins && evtStartMins < endMins) {
          if (!conflictingEvents.some(item => item.title === evt.title && item.startStr === evtStartStr && item.endStr === evtEndStr)) {
            conflictingEvents.push({
              title: evt.title,
              startStr: evtStartStr,
              endStr: evtEndStr
            });
          }
        }
      }
    }
    return conflictingEvents;
  };

  const validateSlots = (
    slots: Array<{ startTime: string; endTime: string }>,
    dateStr: string,
    excludeTaskId?: string | null,
    excludeEventId?: string | null
  ): string | null => {
    // 1. Check for invalid or empty times
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (!s.startTime || !s.endTime) {
        return `Time slot ${i + 1} needs a start and end time.`;
      }
      if (s.startTime === s.endTime) {
        return `Time slot ${i + 1} has the same start and end time.`;
      }
    }

    // Helper to convert time "HH:MM" to minutes from start of day
    const toMinutes = (timeStr: string) => {
      const [h, m] = timeStr.split(':').map(Number);
      return h * 60 + m;
    };

    // 2. Check for internal overlaps within the proposed slots list
    for (let i = 0; i < slots.length; i++) {
      const s1 = slots[i];
      const start1 = toMinutes(s1.startTime);
      let end1 = toMinutes(s1.endTime);
      if (end1 <= start1) end1 += 24 * 60; // handle cross-midnight

      for (let j = i + 1; j < slots.length; j++) {
        const s2 = slots[j];
        const start2 = toMinutes(s2.startTime);
        let end2 = toMinutes(s2.endTime);
        if (end2 <= start2) end2 += 24 * 60;

        // Overlap check
        if (start1 < end2 && start2 < end1) {
          return `Time slots overlap: ${s1.startTime}–${s1.endTime} and ${s2.startTime}–${s2.endTime}.`;
        }
      }
    }

    // 3. Check for overlaps with already booked calendar events
    const bookedEvents = events.filter(e => {
      if (excludeTaskId && e.taskId === excludeTaskId) return false;
      if (excludeEventId && e.id === excludeEventId) return false;
      
      const eventDate = getLocalDateString(e.start, userTimezone);
      return eventDate === dateStr;
    });

    for (const slot of slots) {
      const startMins = toMinutes(slot.startTime);
      let endMins = toMinutes(slot.endTime);
      if (endMins <= startMins) endMins += 24 * 60;

      for (const evt of bookedEvents) {
        const evtStartStr = getTimeInTimezone(evt.start);
        const evtEndStr = getTimeInTimezone(evt.end);

        const evtStartMins = toMinutes(evtStartStr);
        let evtEndMins = toMinutes(evtEndStr);

        // If the event spans across midnight, adjust end minutes
        const evtStartDate = getLocalDateString(evt.start, userTimezone);
        const evtEndDate = getLocalDateString(evt.end, userTimezone);
        if (evtStartDate !== evtEndDate) {
          evtEndMins += 24 * 60;
        }

        // Overlap check
        if (startMins < evtEndMins && evtStartMins < endMins) {
          return `Time slot ${slot.startTime}–${slot.endTime} overlaps with “${evt.title}” (${evtStartStr}–${evtEndStr}).`;
        }
      }
    }

    return null;
  };

  const handleStartEventOperation = (
    e: React.MouseEvent,
    eventId: string,
    type: 'drag' | 'resize-top' | 'resize-bottom'
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const event = events.find(evt => evt.id === eventId);
    if (!event) return;

    const startMins = getMinutesFromStartOfDay(event.start);
    const endMins = getMinutesFromStartOfDay(event.end);

    setActiveEventOperation({
      eventId,
      type,
      initialY: e.clientY,
      initialStartMins: startMins,
      initialEndMins: endMins
    });
  };

  interface PositionedEvent {
    event: CalendarEvent;
    top: number;
    height: number;
    left: string;
    width: string;
    startMins: number;
    endMins: number;
  }

  const getEventTimes = (e: CalendarEvent) => {
    const override = eventOverrides[e.id];
    return {
      start: override ? override.start : e.start,
      end: override ? override.end : e.end
    };
  };

  const getPositionedEvents = (dayEvents: CalendarEvent[]): PositionedEvent[] => {
    const sorted = [...dayEvents].map(evt => {
      const times = getEventTimes(evt);
      const startDayStr = getLocalDateString(times.start, userTimezone);
      const endDayStr = getLocalDateString(times.end, userTimezone);
      
      let startMins = 0;
      let endMins = 0;
      
      if (startDayStr < selectedDate) {
        startMins = 0;
        if (endDayStr > selectedDate) {
          endMins = 24 * 60;
        } else {
          endMins = getMinutesFromStartOfDay(times.end);
        }
      } else {
        startMins = getMinutesFromStartOfDay(times.start);
        const diffMins = Math.round((new Date(times.end).getTime() - new Date(times.start).getTime()) / (1000 * 60));
        endMins = startMins + (diffMins > 0 ? diffMins : 15);
      }
      
      return {
        event: evt,
        startMins,
        endMins
      };
    }).sort((a, b) => a.startMins - b.startMins || (b.endMins - b.startMins) - (a.endMins - a.startMins));

    const clusters: (typeof sorted)[] = [];
    let currentCluster: typeof sorted = [];
    let clusterEnd = 0;

    sorted.forEach(item => {
      if (item.startMins >= clusterEnd) {
        if (currentCluster.length > 0) {
          clusters.push(currentCluster);
        }
        currentCluster = [item];
        clusterEnd = item.endMins;
      } else {
        currentCluster.push(item);
        clusterEnd = Math.max(clusterEnd, item.endMins);
      }
    });
    if (currentCluster.length > 0) {
      clusters.push(currentCluster);
    }

    const positioned: PositionedEvent[] = [];

    clusters.forEach(cluster => {
      const columns: (typeof sorted)[] = [];
      const itemCols = new Map<string, number>();

      cluster.forEach(item => {
        let colIndex = 0;
        while (true) {
          if (!columns[colIndex]) {
            columns[colIndex] = [];
          }
          const hasOverlap = columns[colIndex].some(colItem => {
            return item.startMins < colItem.endMins && item.endMins > colItem.startMins;
          });
          if (!hasOverlap) {
            columns[colIndex].push(item);
            itemCols.set(item.event.id, colIndex);
            break;
          }
          colIndex++;
        }
      });

      const numCols = columns.length;
      cluster.forEach(item => {
        const colIndex = itemCols.get(item.event.id) ?? 0;
        const top = (item.startMins / 60) * HOUR_HEIGHT;
        const height = ((item.endMins - item.startMins) / 60) * HOUR_HEIGHT;
        const width = `${100 / numCols}%`;
        const left = `${(colIndex * 100) / numCols}%`;

        positioned.push({
          event: item.event,
          top,
          height,
          left,
          width,
          startMins: item.startMins,
          endMins: item.endMins
        });
      });
    });

    return positioned;
  };

  const handleTimelineDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggingTask || !scrollContainerRef.current) return;

    const container = scrollContainerRef.current;
    const rect = container.getBoundingClientRect();
    const cursorY = e.clientY - rect.top;

    const scrollSpeed = 12;
    const threshold = 50;
    if (cursorY < threshold) {
      container.scrollTop = Math.max(0, container.scrollTop - scrollSpeed);
    } else if (cursorY > rect.height - threshold) {
      container.scrollTop = Math.min(container.scrollHeight - rect.height, container.scrollTop + scrollSpeed);
    }

    const timelineRect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - timelineRect.top + e.currentTarget.scrollTop;
    const minutes = (y / HOUR_HEIGHT) * 60;
    const snappedMinutes = Math.max(0, Math.min(24 * 60 - 15, Math.round(minutes / 15) * 15));

    const taskDurationMins = Math.max(15, Math.round((draggingTask.estimatedTime * 60) / 15) * 15);
    const endMinutes = snappedMinutes + taskDurationMins;

    const formatMinutes = (totalMins: number) => {
      const h = Math.floor(totalMins / 60);
      const m = totalMins % 60;
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    const top = (snappedMinutes / 60) * HOUR_HEIGHT;
    const height = (taskDurationMins / 60) * HOUR_HEIGHT;

    const taskProj = draggingTask.projectId ? projects.find(p => p.id === draggingTask.projectId) : null;
    const color = taskProj?.color || '#312e81';

    const startStr = formatMinutes(snappedMinutes);
    const endStr = formatMinutes(Math.min(24 * 60, endMinutes));

    setDragOverPreview(prev => {
      if (
        prev &&
        prev.top === top &&
        prev.height === height &&
        prev.startStr === startStr &&
        prev.endStr === endStr &&
        prev.title === draggingTask.name &&
        prev.color === color
      ) {
        return prev;
      }
      return {
        top,
        height,
        startStr,
        endStr,
        title: draggingTask.name,
        color
      };
    });
  };

  const handleTimelineDragLeave = () => {
    setDragOverPreview(null);
  };

  // Handle task status toggle
  const toggleTaskStatus = async (task: Task) => {
    const nextStatus = task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    if (nextStatus === 'COMPLETED') {
      // Find all events linked to this task
      const linkedEvents = events.filter(e => e.taskId === task.id);
      const initialSlots: Array<{ startTime: string; endTime: string }> = [];
      
      if (linkedEvents.length > 0) {
        linkedEvents.forEach(evt => {
          const startTime = getTimeInTimezone(evt.start);
          const endTime = getTimeInTimezone(evt.end);
          initialSlots.push({ startTime, endTime });
        });
      } else {
        const defaultStart = (task as any).startTime || '09:00';
        const defaultEnd = (task as any).endTime || '10:00';
        initialSlots.push({ startTime: defaultStart, endTime: defaultEnd });
      }
      
      setCompleteTaskModal({
        isOpen: true,
        task,
        slots: initialSlots
      });
    } else {
      try {
        const res = await fetch(`/api/tasks/${task.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'PENDING' })
        });
        if (res.ok) {
          setRefreshTrigger(prev => prev + 1);
        }
      } catch (e) {
        console.error(e);
      }
    }
  };
  // Move a task to a new date (used by the "Needs attention" quick actions to
  // rescue an overdue task onto today or tomorrow without opening the editor).
  const rescheduleTask = async (task: Task, target: 'today' | 'tomorrow') => {
    const base = getCurrentDateInTimezone(userTimezone);
    let dateStr = base;
    if (target === 'tomorrow') {
      const d = parseDateInTimezone(base, userTimezone);
      d.setDate(d.getDate() + 1);
      dateStr = getLocalDateString(d, userTimezone);
    }
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        // Moving an overdue task forward is a postponement off its old day;
        // the server logs it (and only when the move is to a later day).
        body: JSON.stringify({ date: dateStr, postpone: {} }),
      });
      if (res.ok) {
        toast('Task moved', `“${task.name}” moved to ${target}.`, 'success');
        setRefreshTrigger(prev => prev + 1);
      } else {
        toast('Couldn’t move the task', 'Try again.', 'error');
      }
    } catch (e) {
      console.error(e);
      toast('Couldn’t move the task', 'Try again.', 'error');
    }
  };

  const updateTaskSessionType = async (task: Task, sessionType: SessionType) => {
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionType })
      });
      if (res.ok) {
        setRefreshTrigger(prev => prev + 1);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCompleteTaskConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completeTaskModal.task) return;
    const task = completeTaskModal.task;
    const validSlots = completeTaskModal.slots.filter(s => s.startTime && s.endTime);

    const saveComplete = async () => {
      try {
        const res = await fetch(`/api/tasks/${task.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'COMPLETED',
            slots: validSlots
          })
        });
        if (res.ok) {
          setCompleteTaskModal({ isOpen: false, task: null, slots: [{ startTime: '', endTime: '' }] });
          setRefreshTrigger(prev => prev + 1);
          setTimeout(() => {
            toast('Task done', `“${task.name}” is marked done.`, 'success');
          }, 50);
        }
      } catch (e) {
        console.error(e);
      }
    };

    if (validSlots.length > 0) {
      const internalValidationError = validateInternalSlots(validSlots);
      if (internalValidationError) {
        toast('Check the form', internalValidationError, 'warning');
        return;
      }
      const taskDateStr = getLocalDateString(task.date, userTimezone);
      const overlaps = getOverlaps(validSlots, taskDateStr, task.id);
      if (overlaps.length > 0) {
        if (allowConcurrentTasks) {
          setConflictModal({
            isOpen: true,
            conflictingEvents: overlaps,
            onConfirm: saveComplete
          });
          return;
        } else {
          const errorMsg = `These time slots overlap with existing events or tasks:\n` + overlaps.map(o => `• ${o.title} (${o.startStr}–${o.endStr})`).join('\n');
          toast('Time conflict', errorMsg, 'error');
          return;
        }
      }
    }

    await saveComplete();
  };

  // Clicking a calendar block's checkbox marks exactly that block/slot
  // complete or incomplete - never a menu asking which slot, since the block
  // itself already answers that. If the block is linked to a task, the
  // task's overall status is then derived from how many of its scheduled
  // slots are now done (none -> PENDING, some -> IN_PROGRESS, all ->
  // COMPLETED); a task with only one slot behaves exactly like a plain
  // complete/incomplete toggle since that's the only way its one slot can go.
  const toggleEventCompletion = async (event: CalendarEvent) => {
    const nextCompleted = !event.completed;
    try {
      const res = await fetch('/api/calendar', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: event.id, completed: nextCompleted })
      });
      if (res.ok) {
        if (event.taskId) {
          const siblingSlots = events.filter(e => e.taskId === event.taskId);
          const completedCount = siblingSlots.reduce(
            (n, e) => n + ((e.id === event.id ? nextCompleted : e.completed) ? 1 : 0),
            0
          );
          const status: TaskStatusValue =
            completedCount === 0 ? 'PENDING' : completedCount === siblingSlots.length ? 'COMPLETED' : 'IN_PROGRESS';
          // Status-only update - deliberately omits startTime/endTime/slots so
          // the API doesn't touch (or collapse) the task's other scheduled slots.
          await fetch(`/api/tasks/${event.taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
          });
          setTasks(prev => prev.map(t => (t.id === event.taskId ? { ...t, status } : t)));
        }
        // Applied locally instead of setRefreshTrigger: we already know the
        // exact new state, and refetching all tasks/events/projects/settings
        // after every single click made this feel slow.
        setEvents(prev => prev.map(e => (e.id === event.id ? { ...e, completed: nextCompleted } : e)));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Submit Task Form
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [taskFormError, setTaskFormError] = useState<string | null>(null);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskName) return;
    setTaskFormError(null);

    // A schedule is optional here, but a half-filled slot is an error rather
    // than silently dropped.
    if (newTaskSlots.some(s => s.startTime || s.endTime)) {
      const slotError = validateScheduleSlots(newTaskSlots.filter(s => s.startTime || s.endTime));
      if (slotError) {
        setTaskFormError(slotError);
        return;
      }
    }
    const validSlots = newTaskSlots.filter(s => s.startTime && s.endTime);

    const saveTask = async () => {
      setIsCreatingTask(true);
      try {
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newTaskName,
            detail: newTaskDetail,
            projectId: newTaskProject || undefined,
            linkedGoalId: newTaskGoalId || undefined,
            priority: newTaskPriority,
            date: newTaskDate,
            sessionType: newTaskSessionType,
            estimatedTime: Number(newTaskEst),
            context: isCustomNewTaskContext ? (customNewTaskContext.trim().toUpperCase() || 'ANALYSIS') : newTaskContext,
            effort: Number(newTaskEffort),
            impact: Number(newTaskImpact),
            status: 'PENDING',
            slots: validSlots
          })
        });

        if (res.ok) {
          setIsTaskModalOpen(false);
          setNewTaskName('');
          setNewTaskDetail('');
          setNewTaskProject('');
          setNewTaskGoalId('');
          setNewTaskPriority('MEDIUM');
          setNewTaskSessionType('REGULAR');
          setNewTaskEst('1');
          setNewTaskContext('COMPUTER');
          setIsCustomNewTaskContext(false);
          setCustomNewTaskContext('');
          setNewTaskEffort('5');
          setNewTaskImpact('5');
          setNewTaskSlots([{ startTime: '', endTime: '' }]);
          setRefreshTrigger(prev => prev + 1);
          setTimeout(() => {
            toast('Task created', `“${newTaskName}” was added.`, 'success');
          }, 50);
        } else {
          const data = await res.json().catch(() => ({}));
          setTaskFormError(data.error || 'Couldn’t create the task. Try again.');
        }
      } catch (e) {
        console.error(e);
        setTaskFormError('Network error. Check your connection and try again.');
      } finally {
        setIsCreatingTask(false);
      }
    };

    if (validSlots.length > 0) {
      const internalValidationError = validateInternalSlots(validSlots);
      if (internalValidationError) {
        setTaskFormError(internalValidationError);
        return;
      }
      const overlaps = getOverlaps(validSlots, newTaskDate);
      if (overlaps.length > 0) {
        if (allowConcurrentTasks) {
          setConflictModal({
            isOpen: true,
            conflictingEvents: overlaps,
            onConfirm: saveTask
          });
          return;
        } else {
          setTaskFormError(
            `These time slots overlap with existing events or tasks: ` +
            overlaps.map(o => `${o.title} (${o.startStr}–${o.endStr})`).join(', ')
          );
          return;
        }
      }
    }

    await saveTask();
  };

  // Submit Project Form
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjName) return;

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProjName,
          description: newProjDesc,
          goals: JSON.stringify(newProjGoals.split('\n').filter(Boolean).map(g => ({
            id: Math.random().toString(36).substring(2, 9),
            text: g.trim(),
            completed: false
          }))),
          deadline: newProjDeadline ? new Date(newProjDeadline).toISOString() : undefined,
          priority: newProjPriority,
          status: 'ACTIVE',
          color: newProjColor
        })
      });

      if (res.ok) {
        setIsProjectModalOpen(false);
        setNewProjName('');
        setNewProjDesc('');
        setNewProjGoals('');
        setNewProjDeadline('');
        setNewProjPriority('MEDIUM');
        setNewProjColor('#71717A');
        setRefreshTrigger(prev => prev + 1);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Open Event Modal for Create
  const openCreateEventModal = (timeSlot?: string) => {
    setEditingEvent(null);
    setEventTitle('');
    setEventDate(selectedDate);
    setEventStart(timeSlot || '09:00');
    let defaultEnd = '10:00';
    // Default end time to 1 hour after start
    if (timeSlot) {
      const [h, m] = timeSlot.split(':').map(Number);
      const endH = String(h + 1).padStart(2, '0');
      defaultEnd = `${endH}:${String(m).padStart(2, '0')}`;
      setEventEnd(defaultEnd);
    } else {
      setEventEnd('10:00');
    }
    setEventDesc('');
    setEventSessionType('REGULAR');
    setEventTaskId('');
    setEventCompleted(false);
    setEventSlots([{ startTime: timeSlot || '09:00', endTime: defaultEnd }]);
    setIsEventModalOpen(true);
  };

  // Open Event Modal for Edit
  const openEditEventModal = (event: CalendarEvent) => {
    setEditingEvent(event);
    setEventTitle(event.title);
    
    const startStr = getTimeInTimezone(event.start);
    const endStr = getTimeInTimezone(event.end);
    const dateStr = getLocalDateString(event.start, userTimezone);
    
    setEventDate(dateStr);
    setEventStart(startStr);
    setEventEnd(endStr);
    setEventDesc(event.description || '');
    setEventSessionType(normalizeSessionType(event.sessionType));
    setEventTaskId(event.taskId || '');
    setEventCompleted(event.completed || false);
    
    if (event.taskId) {
      const linkedEvents = events.filter(e => e.taskId === event.taskId);
      const initialSlots = linkedEvents.map(evt => {
        const startTime = getTimeInTimezone(evt.start);
        const endTime = getTimeInTimezone(evt.end);
        return { startTime, endTime };
      });
      setEventSlots(initialSlots.length > 0 ? initialSlots : [{ startTime: startStr, endTime: endStr }]);
    } else {
      setEventSlots([{ startTime: startStr, endTime: endStr }]);
    }
    
    setIsEventModalOpen(true);
  };

  // Schedule a task from Up next. Every field is reset from THIS task alone:
  // the modal's state is shared with the planner's event editor, so anything
  // left from the last event or task opened (its slots, done-tick, even the
  // event being edited - which saving would then delete) must not carry over.
  // A task with its own saved schedule opens on that; otherwise it starts
  // empty and the user has to pick a time.
  const openScheduleTaskModal = (task: Task) => {
    setEditingEvent(null);
    setEventTitle(`[${sessionTypeLabel(task.sessionType)}] ${task.name}`);
    setEventDate(getLocalDateString(task.date, userTimezone) || selectedDate);
    setEventStart('');
    setEventEnd('');
    setEventDesc(task.detail || `Work session for ${task.name}`);
    setEventSessionType(normalizeSessionType(task.sessionType));
    setEventTaskId(task.id);
    setEventCompleted(false);
    setEventSlots(initialScheduleSlots(task, events, (d) => getTimeInTimezone(String(d))));
    setIsEventModalOpen(true);
  };

  // Populate form fields on task select in event modal
  const handleEventTaskLinkChange = (taskId: string) => {
    setEventTaskId(taskId);
    if (!taskId) {
      setEventCompleted(false);
      setEventSlots([{ startTime: eventStart, endTime: eventEnd }]);
      return;
    }

    const task = tasks.find(t => t.id === taskId);
    if (task) {
      setEventTitle(task.name);
      setEventDesc(task.detail || '');
      setEventSessionType(normalizeSessionType(task.sessionType));
      if (task.status === 'COMPLETED') {
        setEventCompleted(true);
      } else {
        setEventCompleted(false);
      }
      
      // The task's own schedule if it has one; otherwise the time the user
      // clicked on the planner (eventStart/End - empty when scheduling from
      // Up next), never another task's slots.
      const own = initialScheduleSlots(task, events, (d) => getTimeInTimezone(String(d)));
      setEventSlots(own[0].startTime || own[0].endTime ? own : [{ startTime: eventStart, endTime: eventEnd }]);
    }
  };

  // Create or Update Event Form Submission
  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle) return;

    const parseDateTime = (dateStr: string, timeStr: string) => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      const baseDate = parseDateInTimezone(dateStr, userTimezone);
      const localDate = new Date(baseDate.getTime() + (hours * 60 + minutes) * 60 * 1000);
      return localDate.toISOString();
    };

    const saveEvent = async () => {
      try {
        if (editingEvent && editingEvent.taskId !== eventTaskId) {
          // Delete old event if task changed or was unlinked
          await fetch(`/api/calendar?id=${editingEvent.id}`, { method: 'DELETE' });
        }

        let res;
        if (eventTaskId) {
          // Update the task which will automatically recreate/sync all its calendar event slots!
          const validSlots = eventSlots.filter(s => s.startTime && s.endTime);
          res = await fetch(`/api/tasks/${eventTaskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: eventTitle,
              detail: eventDesc,
              sessionType: eventSessionType,
              // Only touch status when the done-tick changes it - saving a
              // schedule mustn't knock an in-progress task back to pending.
              ...(eventCompleted
                ? { status: 'COMPLETED' }
                : tasks.find(t => t.id === eventTaskId)?.status === 'COMPLETED' ? { status: 'PENDING' } : {}),
              slots: validSlots
            })
          });
        } else {
          const body = {
            id: editingEvent?.id,
            title: eventTitle,
            start: parseDateTime(eventDate, eventStart),
            end: parseDateTime(eventDate, eventEnd),
            description: eventDesc,
            sessionType: eventSessionType,
            taskId: null,
            completed: eventCompleted
          };

          if (editingEvent) {
            res = await fetch('/api/calendar', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body)
            });
          } else {
            res = await fetch('/api/calendar', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body)
            });
          }
        }

        if (res.ok) {
          if (eventCompleted && (!editingEvent || !editingEvent.completed) && eventTaskId) {
            const linkedTask = tasks.find(t => t.id === eventTaskId);
            if (linkedTask && linkedTask.status !== 'COMPLETED') {
              let shouldSync = autoSyncTaskStatus;
              if (!shouldSync) {
                shouldSync = await confirm({ title: 'Mark the linked task done too?', confirmLabel: 'Mark done' });
              }
              if (shouldSync) {
                const validSlots = eventSlots.filter(s => s.startTime && s.endTime);
                await fetch(`/api/tasks/${linkedTask.id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    status: 'COMPLETED',
                    slots: validSlots.length > 0 ? validSlots : [{ startTime: eventStart, endTime: eventEnd }]
                  })
                });
              }
            }
          }
          setIsEventModalOpen(false);
          setRefreshTrigger(prev => prev + 1);
        }
      } catch (err) {
        console.error(err);
      }
    };

    if (eventTaskId) {
      const scheduleError = validateScheduleSlots(eventSlots);
      if (scheduleError) {
        toast('Pick a time', scheduleError, 'warning');
        return;
      }
      const validSlots = eventSlots.filter(s => s.startTime && s.endTime);
      const internalValidationError = validateInternalSlots(validSlots);
      if (internalValidationError) {
        toast('Check the form', internalValidationError, 'warning');
        return;
      }
      const overlaps = getOverlaps(validSlots, eventDate, eventTaskId, editingEvent?.id);
      if (overlaps.length > 0) {
        if (allowConcurrentTasks) {
          setConflictModal({
            isOpen: true,
            conflictingEvents: overlaps,
            onConfirm: saveEvent
          });
          return;
        } else {
          const errorMsg = `These time slots overlap with existing events or tasks:\n` + overlaps.map(o => `• ${o.title} (${o.startStr}–${o.endStr})`).join('\n');
          toast('Time conflict', errorMsg, 'error');
          return;
        }
      }
    } else {
      const proposedSlots = [{ startTime: eventStart, endTime: eventEnd }];
      const internalValidationError = validateInternalSlots(proposedSlots);
      if (internalValidationError) {
        toast('Check the form', internalValidationError, 'warning');
        return;
      }
      const overlaps = getOverlaps(proposedSlots, eventDate, null, editingEvent?.id);
      if (overlaps.length > 0) {
        if (allowConcurrentTasks) {
          setConflictModal({
            isOpen: true,
            conflictingEvents: overlaps,
            onConfirm: saveEvent
          });
          return;
        } else {
          const errorMsg = `These time slots overlap with existing events or tasks:\n` + overlaps.map(o => `• ${o.title} (${o.startStr}–${o.endStr})`).join('\n');
          toast('Time conflict', errorMsg, 'error');
          return;
        }
      }
    }

    await saveEvent();
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!(await confirm({ title: 'Delete this event?', confirmLabel: 'Delete event', danger: true }))) return;
    try {
      const res = await fetch(`/api/calendar?id=${eventId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setRefreshTrigger(prev => prev + 1);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Drag & Drop Calendar Linking Handlers
  const handleDropTaskOnSlot = async (e: React.DragEvent, snappedMins: number) => {
    e.preventDefault();
    setDragOverPreview(null);
    setDraggingTask(null);
    
    const taskId = e.dataTransfer.getData('taskId');
    if (!taskId) return;

    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const startHours = Math.floor(snappedMins / 60);
    const startMins = snappedMins % 60;
    const startStr = `${String(startHours).padStart(2, '0')}:${String(startMins).padStart(2, '0')}`;
    
    const baseDate = parseDateInTimezone(selectedDate, userTimezone);
    const start = new Date(baseDate.getTime() + snappedMins * 60 * 1000);

    const durationMins = Math.max(15, Math.round((task.estimatedTime * 60) / 15) * 15);
    const end = new Date(start.getTime() + durationMins * 60 * 1000);

    const endHours = Math.floor((snappedMins + durationMins) / 60);
    const endMins = (snappedMins + durationMins) % 60;
    const endStr = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;

    const saveDroppedTask = async () => {
      try {
        const res = await fetch('/api/calendar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `[${sessionTypeLabel(task.sessionType)}] ${task.name}`,
            start: start.toISOString(),
            end: end.toISOString(),
            description: task.detail || `Work session for ${task.name}`,
            sessionType: task.sessionType,
            taskId: task.id
          })
        });

        if (res.ok) {
          setRefreshTrigger(prev => prev + 1);
        }
      } catch (err) {
        console.error('Error scheduling drag-dropped task:', err);
      }
    };

    const proposedSlots = [{ startTime: startStr, endTime: endStr }];
    const internalValidationError = validateInternalSlots(proposedSlots);
    if (internalValidationError) {
      toast('Check the form', internalValidationError, 'warning');
      return;
    }
    const overlaps = getOverlaps(proposedSlots, selectedDate, task.id);
    if (overlaps.length > 0) {
      if (allowConcurrentTasks) {
        setConflictModal({
          isOpen: true,
          conflictingEvents: overlaps,
          onConfirm: saveDroppedTask
        });
        return;
      } else {
        const errorMsg = `These time slots overlap with existing events or tasks:\n` + overlaps.map(o => `• ${o.title} (${o.startStr}–${o.endStr})`).join('\n');
        toast('Time conflict', errorMsg, 'error');
        return;
      }
    }

    await saveDroppedTask();
  };

  const handleDropOnTimeline = (e: React.DragEvent) => {
    e.preventDefault();
    if (!scrollContainerRef.current) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top + e.currentTarget.scrollTop;
    const minutes = (y / HOUR_HEIGHT) * 60;
    const snappedMinutes = Math.max(0, Math.min(24 * 60 - 15, Math.round(minutes / 15) * 15));
    
    handleDropTaskOnSlot(e, snappedMinutes);
  };

  const handleReviewDaySaved = () => {
    setReviewSuccess(true);
    setTimeout(() => setReviewSuccess(false), 8000);
    setRefreshTrigger(prev => prev + 1);
  };

  const getDayConfigOnDashboard = (dateStr: string) => {
    const list = (workingDays || '').split(',').map(d => d.trim()).filter(Boolean);
    const entry = list.find(d => d.startsWith(dateStr));
    if (entry) {
      const parts = entry.split(':');
      return {
        dateStr: parts[0],
        type: parts[1] || 'working', // 'working', 'off', 'leave'
        comment: parts[2] || ''
      };
    }
    try {
      const dateObj = new Date(dateStr + 'T00:00:00Z');
      const day = dateObj.getUTCDay();
      const isMonToFri = day >= 1 && day <= 5;
      return {
        dateStr,
        type: isMonToFri ? 'working' : 'off',
        comment: isMonToFri ? '' : 'Weekend'
      };
    } catch (e) {
      return {
        dateStr,
        type: 'working',
        comment: ''
      };
    }
  };

  const handleSaveDashboardDayStatus = async (type: 'working' | 'off' | 'leave', comment: string) => {
    if (!selectedDate || !fullSettings) return;

    const parts = selectedDate.split('-');
    const monthKey = `${parts[0]}-${parts[1]}`;
    const marker = `cfg:${monthKey}`;

    const currentList = (workingDays || '').split(',').map(d => d.trim()).filter(Boolean);
    const newList = currentList.filter(d => !d.startsWith(selectedDate) && d !== marker);

    let suffix = '';
    if (type !== 'working' || comment) {
      suffix = `:${type}${comment ? `:${comment}` : ''}`;
    }

    newList.push(`${selectedDate}${suffix}`);
    newList.push(marker);

    const updatedWorkingDaysStr = newList.join(',');
    setWorkingDays(updatedWorkingDaysStr);

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workStart: fullSettings.workStart || '08:00',
          workEnd: fullSettings.workEnd || '18:00',
          workingDays: updatedWorkingDaysStr,
          deepWorkStart: fullSettings.deepWorkStart || '09:00',
          deepWorkEnd: fullSettings.deepWorkEnd || '17:00',
          deepWorkMaxSession: fullSettings.deepWorkMaxSession || 90,
          allowConcurrentTasks: fullSettings.allowConcurrentTasks,
          taskNotificationsEnabled: fullSettings.taskNotificationsEnabled,
          name: fullSettings.name || '',
          timezone: fullSettings.timezone || 'UTC',
          theme: fullSettings.theme || 'dark'
        })
      });

      if (res.ok) {
        const updatedRes = await fetch('/api/settings');
        if (updatedRes.ok) {
          setFullSettings(await updatedRes.json());
        }
        toast('Day updated', `Status saved for ${selectedDate}.`, 'success');
        window.dispatchEvent(new CustomEvent('rune-settings-updated'));
        setRefreshTrigger(prev => prev + 1);
      }
    } catch (e) {
      console.error(e);
      toast('Not saved', 'Couldn’t update the day status. Try again.', 'error');
    }
  };

  // Date Navigation Helpers
  const shiftSelectedDate = (offsetDays: number) => {
    const baseDate = parseDateInTimezone(selectedDate, userTimezone);
    const shifted = new Date(baseDate.getTime() + offsetDays * 24 * 60 * 60 * 1000);
    setSelectedDate(getLocalDateString(shifted, userTimezone));
  };

  // The planner's date: short, and relative where that's clearer.
  const formattedHeaderDate = () => {
    const baseDate = parseDateInTimezone(selectedDate, userTimezone);
    const today = getCurrentDateInTimezone(userTimezone);
    const shift = (n: number) => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const short = new Intl.DateTimeFormat(undefined, { timeZone: userTimezone, day: 'numeric', month: 'short', ...(selectedDate.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}) }).format(baseDate);
    if (selectedDate === today) return `Today, ${short}`;
    if (selectedDate === shift(1)) return `Tomorrow, ${short}`;
    if (selectedDate === shift(-1)) return `Yesterday, ${short}`;
    return new Intl.DateTimeFormat(undefined, { timeZone: userTimezone, weekday: 'short' }).format(baseDate) + `, ${short}`;
  };

  // Get calendar events for a specific hour slot
  const getEventsForHourSlot = (hourStr: string) => {
    return events.filter(e => {
      // event start/end date comparison
      const eventDateStr = getLocalDateString(e.start, userTimezone);
      if (eventDateStr !== selectedDate) return false;

      const eventStartHour = getHourInTimezone(e.start);
      const eventEndHour = getHourInTimezone(e.end, 24);
      const slotHour = parseInt(hourStr.split(':')[0]);

      return slotHour >= eventStartHour && slotHour < eventEndHour;
    });
  };

  // Metric variables
  const filteredTasksForDay = useMemo(() => {
    return tasks.filter(t => getLocalDateString(t.date, userTimezone) === selectedDate);
  }, [tasks, selectedDate, userTimezone]);

  const completedToday = useMemo(() => {
    return filteredTasksForDay.filter(t => t.status === 'COMPLETED');
  }, [filteredTasksForDay]);

  // Tasks that have slipped: dated before today and still open. Surfaced in the
  // right rail's "Needs attention" so they get rescheduled before they rot.
  const overdueTasks = useMemo(() => {
    const today = getCurrentDateInTimezone(userTimezone);
    return tasks
      // A BLOCKED task isn't "slipping" - the person can't act on it, so
      // nagging them to reschedule it is noise.
      .filter(t => t.status !== 'COMPLETED' && t.status !== 'BLOCKED' && getLocalDateString(t.date, userTimezone) < today)
      .sort((a, b) => getLocalDateString(a.date, userTimezone).localeCompare(getLocalDateString(b.date, userTimezone)));
  }, [tasks, userTimezone]);

  // Tasks the user has scheduled today but which are blocked - shown as a
  // muted strip so they know why the work isn't in "Up next".
  const blockedToday = useMemo(() => {
    return filteredTasksForDay.filter(t => t.status === 'BLOCKED');
  }, [filteredTasksForDay]);

  // Today's open work, in the order it should be picked up.
  const upNextTasks = useMemo(() => {
    const rank: Record<string, number> = { IN_PROGRESS: 0, PENDING: 1 };
    // In progress first, then To do in the user's own arrangement (the
    // order set by dragging on the Tasks page).
    return filteredTasksForDay
      .filter(t => t.status !== 'COMPLETED' && t.status !== 'BLOCKED')
      .sort((a, b) => (rank[a.status] ?? 2) - (rank[b.status] ?? 2) || compareManualOrder(a, b));
  }, [filteredTasksForDay]);

  // Active projects whose deadline is within a week or already past, and that
  // aren't finished yet - the review's "deadline framing" recommendation:
  // don't wait for the PI to open the projects list to notice a slip.
  const atRiskProjects = useMemo(() => {
    return projects
      .filter(p => {
        if (p.status !== 'ACTIVE' || !p.deadline || p.progress >= 100) return false;
        const n = daysUntil(p.deadline);
        return !isNaN(n) && n <= 7;
      })
      .sort((a, b) => daysUntil(a.deadline!) - daysUntil(b.deadline!));
  }, [projects]);

  const activeJobs = useMemo(() => {
    // Job.status is a free-text string ("Running", "running", "RUNNING" have
    // all shown up in imported data) - match case-insensitively so a run in
    // flight never silently drops off the dashboard.
    const rank: Record<string, number> = { running: 0, queued: 1 };
    return jobs
      .filter(j => {
        const s = (j.status || '').toLowerCase();
        return s === 'running' || s === 'queued';
      })
      .sort((a, b) => (rank[(a.status || '').toLowerCase()] ?? 2) - (rank[(b.status || '').toLowerCase()] ?? 2));
  }, [jobs]);

  // Compute hourSlots dynamically based on user configurations and scheduled events
  const hourSlots = useMemo(() => {
    const defaultStart = parseInt(workStart.split(':')[0]) || 8;
    const defaultEnd = parseInt(workEnd.split(':')[0]) || 18;

    let minHour = defaultStart;
    let maxHour = defaultEnd;

    const dayEvents = events.filter(e => {
      try {
        const startDayStr = getLocalDateString(e.start, userTimezone);
        const endDayStr = getLocalDateString(e.end, userTimezone);
        if (startDayStr === selectedDate) return true;
        if (startDayStr < selectedDate && endDayStr >= selectedDate) {
          const endLocalStart = getStartOfDayInTimezone(selectedDate, userTimezone);
          return new Date(e.end).getTime() > endLocalStart.getTime();
        }
        return false;
      } catch {
        return false;
      }
    });

    dayEvents.forEach(e => {
      try {
        const startHour = getHourInTimezone(e.start);
        const endHour = getHourInTimezone(e.end, 24);
        const lastNeededSlot = endHour > startHour ? endHour - 1 : startHour;
        
        if (startHour < minHour) {
          minHour = startHour;
        }
        if (lastNeededSlot > maxHour) {
          maxHour = lastNeededSlot;
        }
      } catch (err) {
        console.error('Error computing dynamic hour slots:', err);
      }
    });

    const slots: string[] = [];
    for (let h = minHour; h <= maxHour; h++) {
      slots.push(`${h.toString().padStart(2, '0')}:00`);
    }
    return slots;
  }, [events, selectedDate, workStart, workEnd, userTimezone]);

  const dayEvents = useMemo(() => {
    return events.filter(e => {
      try {
        const startDayStr = getLocalDateString(e.start, userTimezone);
        const endDayStr = getLocalDateString(e.end, userTimezone);
        if (startDayStr === selectedDate) return true;
        if (startDayStr < selectedDate && endDayStr >= selectedDate) {
          const endLocalStart = getStartOfDayInTimezone(selectedDate, userTimezone);
          return new Date(e.end).getTime() > endLocalStart.getTime();
        }
        return false;
      } catch {
        return false;
      }
    });
  }, [events, selectedDate, userTimezone]);

  const deepWorkHoursToday = useMemo(() => {
    return parseFloat(calculateOccupiedHoursForDay(selectedDate, tasks, events, userTimezone, ['DEEP_WORK']).toFixed(1));
  }, [selectedDate, tasks, events, userTimezone]);

  const plannedDeepWorkToday = useMemo(() => {
    return filteredTasksForDay
      .filter(t => t.sessionType === 'DEEP_WORK')
      .reduce((sum, t) => sum + (t.estimatedTime || 0), 0);
  }, [filteredTasksForDay]);

  const selectedProj = projects.find(p => p.id === newTaskProject);
  const selectedProjGoals: Goal[] = [];
  if (selectedProj && selectedProj.goals) {
    try {
      const parsed = JSON.parse(selectedProj.goals);
      if (Array.isArray(parsed)) {
        selectedProjGoals.push(...parsed);
      }
    } catch {
      const lines = selectedProj.goals.split('\n').filter(Boolean);
      lines.forEach((g, i) => selectedProjGoals.push({ id: String(i), text: g, completed: false }));
    }
  }

  const renderTaskCard = (task: Task) => {
    const proj = task.projectId ? projects.find(p => p.id === task.projectId) : null;
    const linkedEvents = events.filter(e => e.taskId === task.id);
    const postponeCount = getPostponeCount(task);
    const elapsed = getTaskElapsed(task, events, userTimezone);
    // Only priorities that should change what you do next get a word.
    const priority =
      task.priority === 'CRITICAL' ? { label: 'Critical', cls: 'text-danger' } :
      task.priority === 'HIGH' ? { label: 'High', cls: 'text-warning' } : null;

    return (
      <div
        key={task.id}
        draggable={true}
        onDragStart={(e) => {
          setDraggingTask(task);
          e.dataTransfer.setData('taskId', task.id);
        }}
        onDragEnd={() => {
          setDraggingTask(null);
          setDragOverPreview(null);
        }}
        className="group relative -mx-2 flex items-start gap-2.5 rounded-[10px] px-2 py-2 cursor-grab active:cursor-grabbing transition-colors duration-[var(--duration-micro)] hover:bg-surface"
      >
        <button
          onClick={() => toggleTaskStatus(task)}
          className="mt-[1px] shrink-0 text-ink-faint hover:text-primary transition-colors cursor-pointer"
          title="Mark done"
          aria-label={`Mark ${task.name} done`}
        >
          <Circle className="w-[18px] h-[18px]" strokeWidth={1.6} />
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-foreground" title={task.name}>{task.name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-ink-faint">
            {proj && (
              <span className="inline-flex min-w-0 max-w-[11rem] items-center gap-1.5" title={proj.name}>
                <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: proj.color }} aria-hidden="true" />
                <span className="truncate text-ink-secondary">{proj.name}</span>
              </span>
            )}
            <span className="tabular-nums" title={durationLabel(task.sessionType)}>{task.estimatedTime}h</span>
            {priority && <span className={`font-medium ${priority.cls}`}>{priority.label}</span>}
            {postponeCount > 0 && <span>moved {postponeCount}×</span>}
            {task.status === 'IN_PROGRESS' && <InProgressLabel task={task} events={events} timezone={userTimezone} />}
            {task.status !== 'IN_PROGRESS' && elapsed.minutes > 0 && (
              <span
                className={`tabular-nums ${elapsed.state === 'ongoing' ? 'font-medium text-primary' : ''}`}
                title="Time elapsed since the scheduled start (counted until it's marked done)"
              >
                {formatElapsedMinutes(elapsed.minutes)} {elapsed.state === 'ongoing' ? 'so far' : 'elapsed'}
              </span>
            )}
            {linkedEvents.map((evt) => {
              const evtStart = new Date(evt.start);
              return (
                <button
                  key={evt.id}
                  type="button"
                  onClick={() => openEditEventModal(evt)}
                  className="inline-flex items-center gap-1 text-ink-secondary hover:text-foreground"
                  title={`Open event: ${evt.title}`}
                >
                  <CalendarDays className="w-3 h-3" />
                  {evtStart.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: userTimezone })}{evt.completed ? ' ✓' : ''}
                </button>
              );
            })}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <SessionTypeSelector
            size="sm"
            iconOnly
            value={task.sessionType}
            onChange={(sessionType) => updateTaskSessionType(task, sessionType)}
          />
          <button
            type="button"
            onClick={() => openScheduleTaskModal(task)}
            className="grid h-7 w-7 place-items-center rounded-[7px] text-ink-faint hover:bg-surface-sunken hover:text-foreground cursor-pointer"
            title="Give it a time on the planner"
            aria-label={`Schedule ${task.name}`}
          >
            <Calendar className="w-3.5 h-3.5" />
          </button>
        </div>
        {task.status === 'IN_PROGRESS' && <InProgressStrip task={task} events={events} timezone={userTimezone} />}
      </div>
    );
  };

  if (!user) return null; // HomePage only mounts this when signed in

  if (dataLoading) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="flex justify-between items-center gap-6">
          <div className="h-9 w-64 bg-surface-raised rounded-[var(--radius-md)]" />
          <div className="flex gap-3">
            <div className="h-10 w-32 bg-surface-raised rounded-[var(--radius-md)]" />
            <div className="h-10 w-32 bg-surface-raised rounded-[var(--radius-md)]" />
          </div>
        </div>
        <div className="h-24 bg-surface-raised rounded-[var(--radius-lg)]" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-28 bg-surface-raised rounded-[var(--radius-lg)]" />
          <div className="h-28 bg-surface-raised rounded-[var(--radius-lg)]" />
          <div className="h-28 bg-surface-raised rounded-[var(--radius-lg)]" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-96 bg-surface-raised rounded-[var(--radius-lg)]" />
          <div className="h-96 bg-surface-raised rounded-[var(--radius-lg)]" />
        </div>
      </div>
    );
  }

  // Hours worked Monday-today, for the "Recent weeks" line.
  const weekWorkedHours = (() => {
    const todayStr = getCurrentDateInTimezone(userTimezone);
    const dow = (new Date(`${todayStr}T12:00:00Z`).getUTCDay() + 6) % 7;
    let h = 0;
    for (let i = 0; i <= dow; i++) {
      const d = new Date(`${todayStr}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - i);
      h += calculateOccupiedHoursForDay(d.toISOString().slice(0, 10), tasks, events, userTimezone, undefined, new Date());
    }
    return h;
  })();

  // On desktop the page is exactly one screen: header on top, then the
  // planner and the right rail each fill the rest and scroll inside
  // themselves (the main area's 36px top/bottom padding; no app bar on desktop).
  return (
    <div className="flex flex-col gap-5 lg:h-[calc(100dvh-72px)] lg:min-h-[600px]">
      {/* Header — greeting, the clock in the user's time zone, a line that
          reads the day, then the status summary and the day's two actions. */}
      <TodayHeader
        name={user.name}
        timezone={userTimezone}
        open={filteredTasksForDay.length - completedToday.length}
        done={completedToday.length}
        overdue={overdueTasks.length}
        offDay={getDayConfigOnDashboard(getCurrentDateInTimezone(userTimezone)).type !== 'working'}
        note={freshStart && digest ? (
          <p className="text-[13.5px] text-ink-secondary">
            <span className="font-medium text-foreground">New week.</span>{' '}
            {digest.weekAhead.tasksDue > 0 || digest.weekAhead.projectDeadlines.length > 0
              ? `${digest.weekAhead.tasksDue} task${digest.weekAhead.tasksDue === 1 ? '' : 's'} due${digest.weekAhead.projectDeadlines.length > 0 ? `, ${digest.weekAhead.projectDeadlines.length} project deadline${digest.weekAhead.projectDeadlines.length === 1 ? '' : 's'}` : ''}.`
              : 'A clean slate.'}{' '}
            <Link href="/tasks" className="font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground">Plan the week</Link>
            <button onClick={dismissFreshStart} className="ml-3 text-ink-faint hover:text-foreground" aria-label="Dismiss the new-week note">Dismiss</button>
          </p>
        ) : null}
        worked={formatHours(calculateOccupiedHoursForDay(selectedDate, tasks, events, userTimezone, undefined, new Date()))}
        dayLabel={selectedDate === getCurrentDateInTimezone(userTimezone) ? null : new Date(`${selectedDate}T12:00:00Z`).toLocaleDateString([], { day: 'numeric', month: 'short', timeZone: 'UTC' })}
        actions={
          <>
            <Button variant="ghost" onClick={() => setShowReviewDay(true)}>
              {reviewSuccess ? 'Reviewed' : 'Review the day'}
            </Button>
            <Button onClick={() => setIsTaskModalOpen(true)}>
              <Plus className="w-4 h-4" /> New task
            </Button>
          </>
        }
      />
      {loadFailed && <LoadError what="today’s plan" onRetry={() => setRefreshTrigger((n) => n + 1)} />}

      {/* Main Grid: Daily Planner (2/3) and Sidebar Tasks (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px] gap-6 lg:gap-8 lg:flex-1 lg:min-h-0">

        {/* Left Column: Daily Planner Schedule View */}
        <div className="lg:min-h-0 flex flex-col">
          <div className="bg-surface border border-border rounded-[14px] p-3 sm:p-4 flex flex-col lg:flex-1 lg:min-h-0">

            {/* Toolbar: which day, its status, and the planner's few controls */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-3">
              <div className="flex items-center">
                <button
                  onClick={() => shiftSelectedDate(-1)}
                  className="grid h-8 w-8 place-items-center rounded-[8px] text-ink-faint hover:text-foreground hover:bg-surface-sunken transition-colors"
                  title="Previous day"
                  aria-label="Previous day"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <label className="relative px-1.5 text-[14px] font-semibold text-foreground min-w-[8rem] text-center rounded-[7px] hover:bg-surface-sunken cursor-pointer" title="Go to a date">
                  {formattedHeaderDate()}
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                    onClick={(e) => { try { (e.currentTarget as HTMLInputElement).showPicker?.(); } catch {} }}
                    aria-label="Go to date"
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </label>
                <button
                  onClick={() => shiftSelectedDate(1)}
                  className="grid h-8 w-8 place-items-center rounded-[8px] text-ink-faint hover:text-foreground hover:bg-surface-sunken transition-colors"
                  title="Next day"
                  aria-label="Next day"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Day status */}
              {(() => {
                const dayConf = getDayConfigOnDashboard(selectedDate);
                let cls = 'text-ink-secondary hover:bg-surface-sunken';
                let label = 'Working day';
                let dot = 'bg-primary';
                if (dayConf.type === 'off') {
                  cls = 'text-ink-faint hover:bg-surface-sunken';
                  label = `Off day${dayConf.comment ? ` · ${dayConf.comment}` : ''}`;
                  dot = 'bg-ink-faint';
                } else if (dayConf.type === 'leave') {
                  cls = 'text-danger bg-danger-soft';
                  label = `Leave${dayConf.comment ? ` · ${dayConf.comment}` : ''}`;
                  dot = 'bg-danger';
                }
                return (
                  <button
                    type="button"
                    onClick={() => setDayStatusModal({
                      isOpen: true,
                      date: selectedDate,
                      type: dayConf.type as any || 'working',
                      comment: dayConf.comment || ''
                    })}
                    title="Change the status of this day"
                    className={`h-7 px-2 text-[12.5px] font-medium rounded-[7px] transition-colors flex items-center gap-1.5 ${cls}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                    <span>{label}</span>
                  </button>
                );
              })()}
              <span className="hidden xl:inline text-[12.5px] text-ink-faint tabular-nums" title="Your working hours">{workStart}–{workEnd}</span>

              <div className="flex items-center gap-2 ml-auto">
                <label className="flex items-center gap-1.5 text-[12.5px] text-ink-secondary cursor-pointer hover:text-foreground select-none" title="Completing an event completes its task, and the other way round">
                  <input
                    type="checkbox"
                    checked={autoSyncTaskStatus}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setAutoSyncTaskStatus(val);
                      localStorage.setItem('rune_auto_sync_task_status', String(val));
                    }}
                    className="rounded-[3px] border-border-strong text-primary focus:ring-ring"
                  />
                  <span>Sync tasks</span>
                </label>
                <Button variant="ghost" size="sm" onClick={() => openCreateEventModal()} title="New event">
                  <Plus className="w-3.5 h-3.5" /> Event
                </Button>
              </div>
            </div>

            {/* Now / next - what this moment is for, in one line */}
            {selectedDate === getCurrentDateInTimezone(userTimezone) && (() => {
              const nowMs = Date.now();
              const current = dayEvents.find((e) => !e.completed && new Date(e.start).getTime() <= nowMs && new Date(e.end).getTime() > nowMs);
              const next = dayEvents
                .filter((e) => new Date(e.start).getTime() > nowMs)
                .sort((x, y) => new Date(x.start).getTime() - new Date(y.start).getTime())[0];
              const inProgress = tasks.find((t) => t.status === 'IN_PROGRESS');
              const fmt = (d: string | Date) => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: userTimezone });
              const minsLeft = current ? Math.max(1, Math.round((new Date(current.end).getTime() - nowMs) / 60000)) : 0;
              return (
                <div className="mb-3 grid gap-x-6 gap-y-1 rounded-[10px] bg-surface-sunken/70 px-3.5 py-2.5 text-[13.5px] sm:grid-cols-[minmax(0,1fr)_auto]">
                  <p className="min-w-0 truncate">
                    <span className="mr-2 inline-flex items-center gap-1.5 font-semibold text-primary">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary motion-safe:animate-pulse" aria-hidden="true" />Now
                    </span>
                    {current ? (
                      <><span className="font-medium text-foreground">{current.title}</span><span className="text-ink-secondary"> · until {fmt(current.end)}, {minsLeft >= 60 ? formatHours(minsLeft / 60) : `${minsLeft} min`} left</span></>
                    ) : inProgress ? (
                      <><span className="font-medium text-foreground">{inProgress.name}</span><span className="text-ink-secondary"> · in progress</span></>
                    ) : (
                      <span className="text-ink-secondary">Nothing scheduled right now.</span>
                    )}
                  </p>
                  {next && (
                    <p className="min-w-0 truncate text-ink-secondary">
                      Next <span className="font-medium text-foreground">{next.title}</span> at {fmt(next.start)}
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Time Slot Scheduler (00:00 - 23:59 High Resolution Grid) */}
            <div 
              ref={scrollContainerRef}
              tabIndex={0}
              role="region"
              aria-label="Day planner"
              className="relative h-[600px] lg:h-auto lg:flex-1 lg:min-h-0 overflow-y-auto border border-border rounded-[10px] bg-background"
              onDragOver={handleTimelineDragOver}
              onDragLeave={handleTimelineDragLeave}
              onDrop={handleDropOnTimeline}
            >
              {/* Grid Background */}
              <div className="w-full relative select-none" style={{ height: `${24 * HOUR_HEIGHT + 120}px` }}>
                {Array.from({ length: 24 }, (_, hour) => {
                  const [workStartH] = workStart.split(':').map(Number);
                  const [workEndH] = workEnd.split(':').map(Number);
                  const isOffHour = hour < (workStartH ?? 8) || hour >= (workEndH ?? 18);
                  return (
                    <div 
                      key={hour}
                      className="relative flex border-b border-border/40"
                      style={{ height: `${HOUR_HEIGHT}px` }}
                    >
                      {/* Hour Label */}
                      <div className="w-14 shrink-0 text-[11.5px] text-ink-faint tabular-nums pr-2.5 text-right pt-1 border-r border-border/40">
                        {`${hour.toString().padStart(2, '0')}:00`}
                      </div>
                      
                      {/* Slot Area */}
                      <div 
                        className={`flex-1 relative cursor-pointer transition-colors ${isOffHour ? 'bg-surface-sunken/40 hover:bg-surface-raised/10' : 'bg-transparent hover:bg-surface-raised/5'}`}
                        onClick={(e) => {
                          if (e.target !== e.currentTarget) return;
                          const rect = e.currentTarget.getBoundingClientRect();
                          const clickY = e.clientY - rect.top;
                          const slotMins = Math.floor((clickY / HOUR_HEIGHT) * 60);
                          const snappedMins = Math.round(slotMins / 15) * 15;
                          const totalMins = hour * 60 + snappedMins;
                          const h = Math.floor(totalMins / 60) % 24;
                          const m = totalMins % 60;
                          openCreateEventModal(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
                        }}
                      >
                        {/* 15-min sub-lines */}
                        <div className="absolute top-[16px] left-0 right-0 border-t border-dashed border-border/10 pointer-events-none h-px" />
                        <div className="absolute top-[32px] left-0 right-0 border-t border-dashed border-border/20 pointer-events-none h-px" />
                        <div className="absolute top-[48px] left-0 right-0 border-t border-dashed border-border/10 pointer-events-none h-px" />
                      </div>
                    </div>
                  );
                })}

                {/* Absolute Event Blocks Overlay */}
                <div className="absolute top-0 bottom-0 left-14 right-0 pointer-events-none">
                  {/* Current Time Indicator Bar */}
                  {selectedDate === getCurrentDateInTimezone(userTimezone) && (
                    <div 
                      className="absolute left-0 right-0 z-45 pointer-events-none flex items-center"
                      style={{ top: `${(currentTimeMins / 60) * HOUR_HEIGHT}px` }}
                    >
                      <div className="w-2 h-2 rounded-full bg-danger border border-card -ml-[4px] shadow-sm shrink-0" />
                      <div className="flex-1 border-t border-danger/80 shadow-sm" />
                    </div>
                  )}

                  {getPositionedEvents(dayEvents).map(({ event, top, height, left, width, startMins, endMins }) => {
                    const sessionMeta = SESSION_TYPE_META[normalizeSessionType(event.sessionType)];
                    const isFocus = event.sessionType !== 'REGULAR';
                    const SessionIcon = event.sessionType === 'DEEP_WORK' ? Flame : event.sessionType === 'FOCUS' ? Brain : null;
                    const eventTask = event.taskId ? tasks.find(t => t.id === event.taskId) : null;
                    const eventProj = eventTask?.projectId ? projects.find(p => p.id === eventTask.projectId) : null;
                    const isOverlapping = width !== '100%';
                    const borderStyle = eventProj
                      ? { borderLeft: `3px solid ${eventProj.color}` }
                      : (isOverlapping ? { borderLeft: `3px solid var(--warning)` } : undefined);

                    const formatTimeStr = (totalMins: number) => {
                      const h = Math.floor(totalMins / 60) % 24;
                      const m = totalMins % 60;
                      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                    };

                    const renderHeight = Math.max(height - 4, 32);

                    // FOCUS uses the data-viz slate, not warning-amber - a
                    // focus block is a normal planned session, not something
                    // wrong (matches SESSION_TYPE_META in src/lib/sessionType.ts).
                    const sessionBgClass = event.sessionType === 'DEEP_WORK'
                      ? 'bg-primary-soft border-primary hover:border-primary'
                      : event.sessionType === 'FOCUS'
                        ? 'bg-surface-sunken border-[var(--color-data-slate)] hover:border-[var(--color-data-slate)]'
                        : 'bg-surface-sunken border-border-strong hover:border-border-strong';

                    return (
                      <div
                        key={event.id}
                        className={`absolute rounded-lg border flex flex-col justify-between overflow-hidden group select-none pointer-events-auto transition-colors duration-[var(--duration-micro)]
                          ${renderHeight < 40 ? 'p-1' : 'p-2'}
                          ${event.completed
                            ? 'bg-surface-sunken/75 border-border/80 opacity-60'
                            : sessionBgClass}`}
                        style={{
                          top: `${top}px`,
                          height: `${renderHeight}px`,
                          left: left,
                          width: width,
                          zIndex: activeEventOperation?.eventId === event.id ? 20 : 10,
                          cursor: activeEventOperation ? 'grabbing' : 'grab',
                          ...borderStyle
                        }}
                        onMouseDown={(e) => {
                          if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('.resize-handle')) {
                            return;
                          }
                          handleStartEventOperation(e, event.id, 'drag');
                        }}
                      >
                        {/* Top Resize Handle */}
                        <div 
                          className="resize-handle absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-primary/50 z-30"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            handleStartEventOperation(e, event.id, 'resize-top');
                          }}
                        />

                        {/* Event Content */}
                        <div className="min-w-0 flex-1 flex flex-col justify-center h-full">
                          {renderHeight < 40 ? (
                            <div className="flex items-center gap-1.5 leading-none w-full overflow-hidden pr-12">
                              <span className="text-[11.5px] text-ink-secondary font-medium tabular-nums shrink-0">
                                {formatTimeStr(startMins)} - {formatTimeStr(endMins)}
                              </span>
                              {SessionIcon && !event.completed && <SessionIcon className={`w-3 h-3 shrink-0 ${sessionMeta.colorClass}`} />}
                              <h4 className={`text-[10px] md:text-[11px] font-bold tracking-tight truncate flex-1 ${event.completed ? 'line-through text-muted-foreground font-medium' : isFocus ? 'text-foreground' : 'text-foreground'}`}>
                                {event.title}
                              </h4>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 flex-wrap leading-none">
                                <span className="text-[12px] text-ink-secondary font-medium tabular-nums shrink-0">
                                  {formatTimeStr(startMins)} - {formatTimeStr(endMins)}
                                </span>
                                {SessionIcon && !event.completed && <SessionIcon className={`w-3 h-3 shrink-0 ${sessionMeta.colorClass}`} />}
                              </div>
                              <h4 className={`text-[13px] md:text-[14px] font-bold tracking-tight leading-snug break-words line-clamp-2 ${event.completed ? 'line-through text-muted-foreground font-medium' : isFocus ? 'text-foreground' : 'text-foreground'}`}>
                                {event.title}
                              </h4>
                            </div>
                          )}
                        </div>

                        {/* Action buttons */}
                        {renderHeight >= 30 && (
                          <div className="absolute bottom-0.5 right-0.5 flex items-center gap-0.5 bg-surface-sunken/80 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity z-20">
                            <button
                              type="button"
                              onClick={() => toggleEventCompletion(event)}
                              className={`p-0.5 rounded hover:bg-surface-raised ${event.completed ? 'text-success' : 'text-muted-foreground hover:text-success'}`}
                              title={event.completed ? "Mark as not done" : "Mark as done"} aria-label="Mark done">
                              <CheckCircle className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditEventModal(event)}
                              className="p-0.5 rounded hover:bg-surface-raised text-muted-foreground hover:text-foreground"
                              title="Edit event" aria-label="Edit event">
                              <Edit className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteEvent(event.id)}
                              className="p-0.5 rounded hover:bg-danger/10 text-muted-foreground hover:text-danger"
                              title="Delete event" aria-label="Delete event">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}

                        {/* Bottom Resize Handle */}
                        <div 
                          className="resize-handle absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-primary/50 z-30"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            handleStartEventOperation(e, event.id, 'resize-bottom');
                          }}
                        />
                      </div>
                    );
                  })}

                  {/* dragOverPreview block */}
                  {dragOverPreview && (
                    <div 
                      className="absolute left-1 right-1 rounded-lg border border-dashed border-primary bg-primary-soft pointer-events-none z-30 p-2 flex flex-col justify-between"
                      style={{
                        top: `${dragOverPreview.top}px`,
                        height: `${dragOverPreview.height}px`
                      }}
                    >
                      <div className="text-[12px] font-medium text-primary tabular-nums">
                        {dragOverPreview.startStr} - {dragOverPreview.endStr} (preview)
                      </div>
                      <div className="text-xs text-foreground font-semibold truncate">
                        {dragOverPreview.title}
                      </div>
                      <div className="text-[9px] text-muted-foreground font-light">
                        Release to schedule
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right rail — what needs a decision, what's next, and what's running.
            Scrolls on its own on desktop so the page itself never has to. */}
        <div className="space-y-8 lg:min-h-0 lg:overflow-y-auto lg:pr-2 lg:-mr-2">

          {/* Needs attention — teammates you're blocking + overdue / slipping tasks + at-risk project deadlines, with one-tap rescue */}
          {(blockingMe.length > 0 || overdueTasks.length > 0 || atRiskProjects.length > 0) && (
            <div>
              <SectionHeader title={<span className="text-danger">Needs attention</span>} meta={blockingMe.length + overdueTasks.length + atRiskProjects.length} />
              <div className="divide-y divide-border">
                {blockingMe.slice(0, 4).map((bt) => (
                  <div key={bt.id} className="flex gap-2.5 py-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-data-slate)] mt-1.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-foreground">
                        {bt.ownerName} is waiting on you
                      </p>
                      <p className="text-[11px] text-ink-secondary mt-0.5 truncate" title={bt.blockedReason || bt.name}>
                        {bt.name}{bt.blockedReason ? `: ${bt.blockedReason}` : ''}
                        {bt.projectName ? ` · ${bt.projectName}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
                {overdueTasks.slice(0, 4).map((task) => {
                  const daysOver = Math.max(
                    1,
                    Math.round(
                      (parseDateInTimezone(getCurrentDateInTimezone(userTimezone), userTimezone).getTime() -
                        parseDateInTimezone(getLocalDateString(task.date, userTimezone), userTimezone).getTime()) /
                        86400000
                    )
                  );
                  const scheduled = events.some(e => e.taskId === task.id);
                  return (
                    <div key={task.id} className="flex gap-2.5 py-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-danger mt-1.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <button
                          onClick={() => setViewingTask(task)}
                          className="text-[13px] font-semibold text-foreground text-left hover:text-primary transition-colors truncate block w-full"
                          title={task.name}
                        >
                          {task.name}
                        </button>
                        <p className="text-[11px] text-ink-secondary mt-0.5">
                          Overdue {daysOver} {daysOver === 1 ? 'day' : 'days'}{scheduled ? '' : ' · not scheduled'}
                        </p>
                        <div className="flex gap-4 mt-1.5">
                          <button
                            onClick={() => rescheduleTask(task, 'today')}
                            className="text-[12.5px] font-medium text-ink-secondary underline decoration-border-strong underline-offset-4 hover:text-foreground hover:decoration-foreground transition-colors"
                          >
                            Move to today
                          </button>
                          <button
                            onClick={() => rescheduleTask(task, 'tomorrow')}
                            className="text-[12.5px] font-medium text-ink-secondary underline decoration-border-strong underline-offset-4 hover:text-foreground hover:decoration-foreground transition-colors"
                          >
                            Tomorrow
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {overdueTasks.length > 4 && (
                  <div className="py-2 text-[12.5px] text-ink-faint">
                    +{overdueTasks.length - 4} more in <Link href="/tasks" className="text-primary underline underline-offset-2 hover:text-primary-hover">Tasks</Link>
                  </div>
                )}
                {atRiskProjects.slice(0, 3).map((proj) => {
                  const rel = formatRelativeDeadline(proj.deadline);
                  const overdue = daysUntil(proj.deadline!) < 0;
                  return (
                    <div key={proj.id} className="flex gap-2.5 py-3">
                      <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: proj.color || 'var(--warning)' }} />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/projects/${proj.id}`}
                          className="text-[13px] font-semibold text-foreground text-left hover:text-primary transition-colors truncate block w-full"
                          title={proj.name}
                        >
                          {proj.name}
                        </Link>
                        <p className={`text-[11px] mt-0.5 ${overdue ? 'text-danger' : 'text-ink-secondary'}`}>
                          Deadline {rel} · {proj.progress}% done
                        </p>
                      </div>
                    </div>
                  );
                })}
                {atRiskProjects.length > 3 && (
                  <div className="py-2 text-[12.5px] text-ink-faint">
                    +{atRiskProjects.length - 3} more in <Link href="/projects" className="text-primary underline underline-offset-2 hover:text-primary-hover">Projects</Link>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Up next — today's open work; drag a row onto the planner to schedule it */}
          <div>
            <SectionHeader
              title="Up next"
              meta={upNextTasks.length}
              right={
                <button
                  onClick={() => setIsTaskModalOpen(true)}
                  className="grid h-7 w-7 place-items-center text-ink-faint hover:text-foreground hover:bg-surface-sunken rounded-[7px] transition-colors"
                  title="New task"
                  aria-label="New task"
                >
                  <Plus className="w-4 h-4" />
                </button>
              }
            />
            <div className="pt-3">
              {upNextTasks.length === 0 ? (
                <p className="py-5 text-[14px] text-ink-secondary">
                  Nothing left for today. <button onClick={() => setIsTaskModalOpen(true)} className="font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground">Add a task</button> to plan ahead.
                </p>
              ) : (
                <>
                  <p className="text-[12.5px] text-ink-faint mb-2.5">Drag a task onto the planner to give it a time.</p>
                  <div className="space-y-0.5">
                    {upNextTasks.map((task) => renderTaskCard(task))}
                  </div>
                </>
              )}
              {blockedToday.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border space-y-1.5">
                  <p className="text-[11.5px] font-semibold text-ink-faint px-1">Blocked · {blockedToday.length}</p>
                  {blockedToday.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 text-[12.5px] text-ink-secondary">
                      <Ban className="w-3 h-3 shrink-0" />
                      <span className="truncate" title={t.blockedReason || undefined}>
                        {t.name}{t.blockedOnName ? ` · waiting on ${t.blockedOnName}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent weeks - how much you've worked, at a glance; the full year is in Analytics */}
          <div>
            <SectionHeader
              title="Recent weeks"
              meta={`${formatHours(weekWorkedHours)} this week`}
              right={<Link href="/analytics#activity" className="text-[12.5px] text-ink-secondary hover:text-foreground">Full year →</Link>}
            />
            <div className="pt-3">
              <ActivityGraph compact tasks={tasks as any} events={events as any} timezone={userTimezone} today={getCurrentDateInTimezone(userTimezone)} memberSince={user?.memberSince} footer={<span />} />
            </div>
          </div>

          {/* Week ahead — the once-a-week orienting glance (also in the bell as a WEEKLY_DIGEST) */}
          {digest && (
            <div>
              <SectionHeader title="Week ahead" meta={`from ${new Date(digest.weekOf + 'T00:00:00').toLocaleDateString([], { day: 'numeric', month: 'short' })}`} />
              <div className="pt-3 space-y-3">
                <div className="flex gap-8">
                  <div>
                    <p className="font-serif text-[22px] font-medium leading-none text-foreground tabular-nums">{digest.weekAhead.tasksDue}</p>
                    <p className="mt-1 text-[12.5px] text-ink-faint">tasks due</p>
                  </div>
                  <div>
                    <p className="font-serif text-[22px] font-medium leading-none text-foreground tabular-nums">{digest.lastWeek.completedTasks}</p>
                    <p className="mt-1 text-[12.5px] text-ink-faint">done last week</p>
                  </div>
                </div>
                {digest.weekAhead.projectDeadlines.length > 0 && (
                  <div className="border-t border-border pt-2.5 space-y-1.5">
                    <p className="text-[11.5px] font-semibold text-ink-faint">Project deadlines</p>
                    {digest.weekAhead.projectDeadlines.slice(0, 4).map((pd) => {
                      const rel = formatRelativeDeadline(pd.deadline);
                      const over = daysUntil(pd.deadline) < 0;
                      return (
                        <Link key={pd.id} href={`/projects/${pd.id}`} className="flex items-center justify-between gap-2 text-[12px] group">
                          <span className="text-ink-secondary group-hover:text-foreground transition-colors truncate">{pd.name}</span>
                          <span className={`font-mono text-[11px] shrink-0 ${over ? 'text-danger' : 'text-ink-faint'}`}>{rel}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
                {digest.blocked.onMe > 0 && (
                  <p className="border-t border-border pt-2.5 text-[12px] text-[var(--color-data-slate)]">
                    {digest.blocked.onMe} task{digest.blocked.onMe === 1 ? '' : 's'} waiting on you
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Runs — anything currently computing */}
          {activeJobs.length > 0 && (
            <div>
              <SectionHeader title="Runs" meta={activeJobs.length} right={<Link href="/jobs" className="text-[12.5px] text-ink-secondary hover:text-foreground">All runs →</Link>} />
              <div className="pt-3 flex flex-col gap-3">
                {activeJobs.slice(0, 4).map((job) => {
                  const running = (job.status || '').toLowerCase() === 'running';
                  const elapsedMin = running
                    ? Math.max(0, Math.round((Date.now() - new Date(job.submitTime).getTime()) / 60000))
                    : 0;
                  const elapsed = elapsedMin >= 60 ? `${Math.floor(elapsedMin / 60)}h${(elapsedMin % 60).toString().padStart(2, '0')}m` : `${elapsedMin}m`;
                  let pct = 0;
                  if (running && job.projectedCompletionTime) {
                    const total = new Date(job.projectedCompletionTime).getTime() - new Date(job.submitTime).getTime();
                    if (total > 0) pct = Math.min(99, Math.max(2, Math.round(((Date.now() - new Date(job.submitTime).getTime()) / total) * 100)));
                  }
                  return (
                    <div key={job.id}>
                      <div className="flex items-center gap-2">
                        <StatusPill status={running ? 'running' : 'queued'}>{running ? 'running' : 'queued'}</StatusPill>
                        <Link href="/jobs" className="flex-1 min-w-0 text-[13px] text-foreground hover:text-primary transition-colors truncate" title={job.name}>
                          {job.name}
                        </Link>
                        <span className="font-mono text-[10px] text-ink-faint tabular-nums shrink-0">{running ? elapsed : '–'}</span>
                      </div>
                      {running && pct > 0 && (
                        <div className="h-[3px] bg-surface-sunken rounded-full overflow-hidden mt-1.5">
                          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </div>

      {showReviewDay && (
        <ReviewDayModal
          date={selectedDate}
          completedTaskNames={completedToday.map(t => t.name)}
          deepWorkHours={Math.round(deepWorkHoursToday * 10) / 10}
          plannedCount={filteredTasksForDay.length}
          onClose={() => setShowReviewDay(false)}
          onSaved={handleReviewDaySaved}
        />
      )}

      {/* Task Modal */}
      {isTaskModalOpen && (
        <TaskFormModal
          title="New task"
          submitLabel="Create task"
          submittingLabel="Creating…"
          onClose={() => { setIsTaskModalOpen(false); setTaskFormError(null); }}
          onSubmit={handleCreateTask}
          isSubmitting={isCreatingTask}
          errorMessage={taskFormError}
          projects={projects}
          selectedProjGoals={selectedProjGoals}
          name={newTaskName} onNameChange={setNewTaskName}
          detail={newTaskDetail} onDetailChange={setNewTaskDetail}
          projectId={newTaskProject} onProjectChange={setNewTaskProject}
          goalId={newTaskGoalId} onGoalChange={setNewTaskGoalId}
          context={newTaskContext} onContextChange={(v) => { setNewTaskContext(v); setIsCustomNewTaskContext(v === 'CUSTOM'); }}
          isCustomContext={isCustomNewTaskContext}
          customContext={customNewTaskContext} onCustomContextChange={setCustomNewTaskContext}
          priority={newTaskPriority} onPriorityChange={setNewTaskPriority}
          estimatedTime={newTaskEst} onEstimatedTimeChange={setNewTaskEst}
          effort={newTaskEffort} onEffortChange={setNewTaskEffort}
          impact={newTaskImpact} onImpactChange={setNewTaskImpact}
          slots={newTaskSlots} onSlotsChange={setNewTaskSlots}
          date={newTaskDate} onDateChange={setNewTaskDate}
          sessionType={newTaskSessionType} onSessionTypeChange={setNewTaskSessionType}
        />
      )}

      {/* Project Modal */}
      {isProjectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-lg bg-card border border-border rounded-lg p-6 shadow-[var(--shadow-modal)] overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-foreground">New project</h3>
              <button 
                onClick={() => setIsProjectModalOpen(false)}
                className="p-1 rounded-lg hover:bg-surface-sunken text-muted-foreground" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label htmlFor="page-project-name" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Project name *</label>
                <input id="page-project-name" 
                  type="text" 
                  value={newProjName} 
                  onChange={(e) => setNewProjName(e.target.value)} 
                  required
                  placeholder="e.g. Perovskite stability study"
                  className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label htmlFor="page-description" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Description</label>
                <textarea id="page-description" 
                  value={newProjDesc} 
                  onChange={(e) => setNewProjDesc(e.target.value)} 
                  placeholder="What this project is for"
                  rows={2}
                  className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label htmlFor="page-objectives-one-per-line" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Objectives (one per line)</label>
                <textarea id="page-objectives-one-per-line" 
                  value={newProjGoals} 
                  onChange={(e) => setNewProjGoals(e.target.value)} 
                  placeholder="One per line, e.g.&#10;Assemble the figures&#10;Draft the methods"
                  rows={2}
                  className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="page-priority" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Priority</label>
                  <select id="page-priority" 
                    value={newProjPriority} 
                    onChange={(e) => setNewProjPriority(e.target.value)} 
                    className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground text-sm focus:outline-none focus:border-primary"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="page-deadline" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Deadline</label>
                  <input id="page-deadline" 
                    type="date" 
                    value={newProjDeadline} 
                    onChange={(e) => setNewProjDeadline(e.target.value)} 
                                       className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground text-sm focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Color</label>
                <div className="flex flex-wrap gap-2 p-3.5 bg-surface-raised border border-border rounded-md max-h-36 overflow-y-auto">
                  {PROJECT_COLORS.map((col) => (
                    <button
                      key={col.value}
                      type="button"
                      onClick={() => setNewProjColor(col.value)}
                      className={`w-6 h-6 rounded-full border transition-colors shrink-0 cursor-pointer ${newProjColor === col.value ? 'scale-110 border-white ring-2 ring-border-strong' : 'border-transparent'}`}
                      style={{ backgroundColor: col.value }}
                      title={col.name}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-border mt-8">
                <button 
                  type="button"
                  onClick={() => setIsProjectModalOpen(false)}
                  className="px-4 py-2 bg-surface-raised border border-border text-muted-foreground hover:text-foreground text-sm font-semibold rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-primary-foreground text-sm font-bold rounded-full transition-colors"
                >
                  Create project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Event Modal (Supports Create & Edit) */}
      {isEventModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md bg-card border border-border rounded-lg p-6 shadow-[var(--shadow-modal)] overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-foreground">
                {editingEvent ? 'Edit event' : eventTaskId ? 'Schedule task' : 'New event'}
              </h3>
              <button 
                onClick={() => setIsEventModalOpen(false)}
                className="p-1 rounded-lg hover:bg-surface-sunken text-muted-foreground" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEvent} className="space-y-4">
              <div>
                <label htmlFor="page-event-title" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Event title *</label>
                <input id="page-event-title" 
                  type="text" 
                  value={eventTitle} 
                  onChange={(e) => setEventTitle(e.target.value)} 
                  required
                  placeholder="e.g. Write the methods section"
                  className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-border-strong"
                />
              </div>

              {/* task links */}
              <div>
                <label htmlFor="page-linked-task" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Linked task</label>
                <select id="page-linked-task" 
                  value={eventTaskId} 
                  onChange={(e) => handleEventTaskLinkChange(e.target.value)}
                  className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground text-sm focus:outline-none focus:border-border-strong"
                >
                  <option value="">No linked task</option>
                  {[...tasks]
                    .filter(t => getLocalDateString(t.date, userTimezone) === eventDate)
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} {t.status === 'COMPLETED' ? ' (Completed)' : t.status === 'IN_PROGRESS' ? ' (In Progress)' : ' (Pending)'}
                      </option>
                    ))}
                </select>
              </div>

              <div className="space-y-4">
                <div>
                  <label htmlFor="page-date" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Date *</label>
                  <input id="page-date" 
                    type="date" 
                    value={eventDate} 
                    onChange={(e) => setEventDate(e.target.value)} 
                    required
                                       className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground text-sm focus:outline-none focus:border-border-strong font-mono"
                  />
                </div>
                {eventTaskId ? (
                  <div className="space-y-3 bg-surface-raised/55 border border-border/60 p-4 rounded-md">
                    <label className="block text-[12.5px] font-semibold text-muted-foreground mb-1">
                      Time slots
                    </label>
                    {!eventSlots.some(s => s.startTime && s.endTime) && (
                      <p className="text-[12.5px] text-ink-secondary" role="status">
                        Not scheduled yet. Pick a start and end time to put it on the planner.
                      </p>
                    )}
                    {eventSlots.map((slot, index) => (
                      <div key={index} className="flex gap-2 items-center">
                        <div className="flex-1">
                          <span className="text-[11.5px] text-muted-foreground font-semibold block mb-1">Start</span>
                          <ClockTimePicker
                            value={slot.startTime}
                            onChange={(val) => {
                              const updated = eventSlots.map((s, i) =>
                                i === index ? { ...s, startTime: val } : s
                              );
                              setEventSlots(updated);
                            }}
                            placeholder="Start"
                          />
                        </div>
                        <div className="flex-1">
                          <span className="text-[11.5px] text-muted-foreground font-semibold block mb-1">End</span>
                          <ClockTimePicker
                            value={slot.endTime}
                            onChange={(val) => {
                              const updated = eventSlots.map((s, i) =>
                                i === index ? { ...s, endTime: val } : s
                              );
                              setEventSlots(updated);
                            }}
                            placeholder="End"
                            align="right"
                          />
                        </div>
                        {eventSlots.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setEventSlots(eventSlots.filter((_, idx) => idx !== index));
                            }}
                            className="mt-5 p-2.5 bg-surface-raised border border-border-strong hover:border-border/30 hover:text-danger rounded-md transition-colors cursor-pointer"
                            title="Remove time slot" aria-label="Remove time slot">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setEventSlots([...eventSlots, { startTime: '', endTime: '' }])}
                      className="mt-2 text-xs font-bold text-foreground hover:text-foreground flex items-center gap-1.5 px-3 py-1.5 bg-surface-raised border border-border-strong rounded-md cursor-pointer hover:bg-surface-sunken transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add time slot
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Start *</label>
                      <ClockTimePicker
                        value={eventStart}
                        onChange={(val) => setEventStart(val)}
                      />
                    </div>
                    <div>
                      <label className="block text-[12.5px] font-semibold text-muted-foreground mb-2">End *</label>
                      <ClockTimePicker
                        value={eventEnd}
                        onChange={(val) => setEventEnd(val)}
                        align="right"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="page-description-2" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Description</label>
                <textarea id="page-description-2" 
                  value={eventDesc} 
                  onChange={(e) => setEventDesc(e.target.value)} 
                  placeholder="Notes for this event (optional)"
                  rows={2}
                  className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-border-strong"
                />
              </div>

              <div className="flex items-center pt-2">
                <SessionTypeSelector value={eventSessionType} onChange={setEventSessionType} />
              </div>

              <div className="flex items-center space-x-3 pt-2">
                <input 
                  type="checkbox" 
                  id="eventCompletedCheckbox"
                  checked={eventCompleted} 
                  onChange={(e) => setEventCompleted(e.target.checked)} 
                  className="w-4.5 h-4.5 accent-emerald-500 rounded border-border-strong bg-surface-raised"
                />
                <label htmlFor="eventCompletedCheckbox" className="text-sm text-foreground select-none flex items-center font-medium">
                  <CheckCircle className="w-4 h-4 mr-1 text-success" /> Mark as done
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-border mt-8">
                <button 
                  type="button"
                  onClick={() => setIsEventModalOpen(false)}
                  className="px-4 py-2 bg-surface-raised border border-border text-muted-foreground hover:text-foreground text-sm font-semibold rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-primary-foreground text-sm font-bold rounded-full transition-colors"
                >
                  {editingEvent ? 'Save changes' : eventTaskId ? 'Schedule' : 'Create event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task Details Modal (Bidirectional Linking View) */}
      {viewingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md bg-card border border-border rounded-lg p-6 shadow-[var(--shadow-modal)] space-y-5">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-muted-foreground" /> Task details
              </h3>
              <button 
                onClick={() => setViewingTask(null)}
                className="p-1 rounded-lg hover:bg-surface-sunken text-muted-foreground" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <span className="text-[11.5px] font-mono text-muted-foreground block">Task</span>
                <p className="text-foreground font-semibold text-base mt-0.5">{viewingTask.name}</p>
              </div>

              {viewingTask.detail && (
                <div>
                  <span className="text-[11.5px] font-mono text-muted-foreground block">Description</span>
                  <p className="text-foreground font-light mt-1 whitespace-pre-wrap leading-relaxed bg-surface-sunken/40 p-3 rounded-md border border-border">{viewingTask.detail}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[11.5px] font-mono text-muted-foreground block">Priority</span>
                  <span className="inline-block mt-1 px-2.5 py-0.5 bg-surface-raised border border-border-strong rounded-lg text-[12.5px] font-semibold text-ink-secondary">
                    {viewingTask.priority}
                  </span>
                </div>
                <div>
                  <span className="text-[11.5px] font-mono text-muted-foreground block">Estimated time</span>
                  <span className="inline-block mt-1 px-2.5 py-0.5 bg-surface-raised border border-border-strong rounded-lg text-xs font-semibold font-mono text-ink-secondary">
                    {viewingTask.estimatedTime} hrs
                  </span>
                </div>
              </div>

              {viewingTask.status !== 'COMPLETED' && (() => {
                const el = getTaskElapsed(viewingTask, events, userTimezone);
                const label =
                  el.state === 'unscheduled' ? 'Not scheduled' :
                  el.state === 'not-started' ? 'Not started' :
                  `${formatElapsedMinutes(el.minutes)}${el.state === 'ongoing' ? ' so far' : ''}`;
                return (
                  <div>
                    <span className="text-[11.5px] font-mono text-muted-foreground block">Elapsed since scheduled start</span>
                    <span className="inline-block mt-1 px-2.5 py-0.5 bg-surface-raised border border-border-strong rounded-lg text-xs font-semibold font-mono text-ink-secondary tabular-nums">
                      {label}
                    </span>
                  </div>
                );
              })()}

              {viewingTask.status === 'COMPLETED' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[11.5px] font-mono text-muted-foreground block">Actual time</span>
                    <span className="inline-block mt-1 px-2.5 py-0.5 bg-surface-raised border border-border-strong rounded-lg text-xs font-semibold font-mono text-ink-secondary">
                      {(viewingTask.actualTime || 0).toFixed(1)} hrs
                    </span>
                  </div>
                  <div>
                    <span className="text-[11.5px] font-mono text-muted-foreground block">Difference</span>
                    <span className={`inline-block mt-1 px-2.5 py-0.5 border rounded-lg text-xs font-semibold font-mono ${(viewingTask.timeDifference || 0) >= 0 ? 'bg-warning/10 text-warning border-warning/20' : 'bg-success/10 text-success border-success/20'}`}>
                      {(viewingTask.timeDifference || 0) >= 0 ? '+' : ''}{(viewingTask.timeDifference || 0).toFixed(1)} hrs
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[11.5px] font-mono text-muted-foreground block">Postponements</span>
                  <span className="inline-block mt-1 text-xs text-muted-foreground font-medium">
                    {getPostponeCount(viewingTask) > 0
                      ? `Postponed ${getPostponeCount(viewingTask)}×`
                      : 'Not postponed'}
                  </span>
                </div>
                <div>
                  <span className="text-[11.5px] font-mono text-muted-foreground block">Status</span>
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded-lg text-[11.5px] font-semibold ${viewingTask.status === 'COMPLETED' ? 'bg-success/10 text-success border border-success/20' : 'bg-warning/10 text-warning border border-warning/20'}`}>
                    {viewingTask.status}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-border mt-6">
              <button 
                onClick={() => setViewingTask(null)}
                className="px-5 py-2 bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold rounded-[9px] transition-colors cursor-pointer font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Task Completion Confirmation Modal */}
      {completeTaskModal.isOpen && completeTaskModal.task && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md bg-card border border-border rounded-lg p-6 shadow-[var(--shadow-modal)] space-y-5">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-success" /> Mark task done
              </h3>
              <button 
                onClick={() => setCompleteTaskModal({ isOpen: false, task: null, slots: [{ startTime: '', endTime: '' }] })}
                className="p-1 rounded-lg hover:bg-surface-sunken text-muted-foreground" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCompleteTaskConfirm} className="space-y-4">
              <div>
                <span className="text-[11.5px] font-mono text-muted-foreground block font-light">Task</span>
                <p className="text-foreground font-semibold text-sm mt-0.5">{completeTaskModal.task.name}</p>
              </div>

              <div className="space-y-4 overflow-visible pr-1">
                {completeTaskModal.slots.map((slot, index) => (
                  <div key={index} className="space-y-2 border-b border-border/60 pb-3 last:border-b-0 last:pb-0">
                    <span className="text-[10px] text-muted-foreground font-semibold font-mono block">Slot {index + 1}</span>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11.5px] font-semibold text-muted-foreground mb-1.5">Actual start</label>
                        <ClockTimePicker
                          value={slot.startTime}
                          onChange={(val) => {
                            const updated = completeTaskModal.slots.map((s, i) =>
                              i === index ? { ...s, startTime: val } : s
                            );
                            setCompleteTaskModal(prev => ({ ...prev, slots: updated }));
                          }}
                          placeholder="Start"
                        />
                      </div>
                      <div>
                        <label className="block text-[11.5px] font-semibold text-muted-foreground mb-1.5">Actual end</label>
                        <ClockTimePicker
                          value={slot.endTime}
                          onChange={(val) => {
                            const updated = completeTaskModal.slots.map((s, i) =>
                              i === index ? { ...s, endTime: val } : s
                            );
                            setCompleteTaskModal(prev => ({ ...prev, slots: updated }));
                          }}
                          placeholder="End"
                          align="right"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border mt-6">
                <button 
                  type="button"
                  onClick={() => setCompleteTaskModal({ isOpen: false, task: null, slots: [{ startTime: '', endTime: '' }] })}
                  className="px-4 py-2 bg-surface-raised border border-border text-muted-foreground hover:text-foreground text-sm font-semibold rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-5 py-2.5 bg-success hover:bg-success text-primary-foreground text-sm font-bold rounded-md transition-colors cursor-pointer font-bold"
                >
                  Mark done
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Day Status Modal */}
      {dayStatusModal.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md bg-card border border-border-strong rounded-lg p-6 shadow-[var(--shadow-modal)] space-y-5">
            <div className="flex items-center gap-3 border-b border-border pb-3">
              <div className="p-2 bg-primary/10 rounded-lg text-primary shrink-0">
                <CalendarDays className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground leading-tight">
                  Day status
                </h3>
                <p className="text-ink-faint text-xs mt-0.5 leading-snug">
                  Set the status for <span className="font-mono text-ink-secondary">{dayStatusModal.date}</span>.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="page-status" className="block text-[11.5px] text-muted-foreground mb-1.5 font-semibold font-mono">
                  Status
                </label>
                <select id="page-status"
                  value={dayStatusModal.type}
                  onChange={(e) => setDayStatusModal(prev => ({ ...prev, type: e.target.value as any }))}
                  className="w-full bg-surface-raised border border-border rounded-md px-3 py-2 text-foreground text-xs focus:outline-none"
                >
                  <option value="working">Working day</option>
                  <option value="off">Off day</option>
                  <option value="leave">Leave</option>
                </select>
              </div>

              {dayStatusModal.type !== 'working' && (
                <div>
                  <label htmlFor="page-reason-required" className="block text-[11.5px] text-muted-foreground mb-1.5 font-semibold font-mono">
                    Reason (required)
                  </label>
                  <input id="page-reason-required"
                    type="text"
                    value={dayStatusModal.comment}
                    placeholder="e.g. sick leave, vacation, holiday"
                    onChange={(e) => setDayStatusModal(prev => ({ ...prev, comment: e.target.value }))}
                    className="w-full bg-surface-raised border border-border rounded-md px-3 py-2 text-foreground text-xs placeholder-muted-foreground focus:outline-none focus:border-border-strong"
                  />
                </div>
              )}

              <p className="text-xs text-muted-foreground leading-relaxed bg-surface-raised/50 border border-border/60 rounded-md p-3">
                This changes your weekly analytics and is saved to your settings.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-border">
              <button 
                type="button"
                onClick={() => setDayStatusModal(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 bg-surface-raised border border-border text-muted-foreground hover:text-foreground text-xs font-bold rounded-md transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={() => {
                  if (dayStatusModal.type !== 'working' && !dayStatusModal.comment.trim()) {
                    toast('Reason required', 'Enter a reason for this status.', 'warning');
                    return;
                  }
                  setDayStatusModal(prev => ({ ...prev, isOpen: false }));
                  handleSaveDashboardDayStatus(dayStatusModal.type, dayStatusModal.comment);
                }}
                className="px-5 py-2 bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold rounded-full transition-colors cursor-pointer"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Task Time Conflict Warning Modal */}
      {conflictModal.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md bg-card border border-warning/20 rounded-lg p-6 shadow-[var(--shadow-modal)] space-y-5">
            <div className="flex items-center gap-3 border-b border-border pb-3">
              <div className="p-2 bg-warning/10 rounded-lg text-warning shrink-0">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground leading-tight">
                  Time conflict
                </h3>
                <p className="text-muted-foreground text-xs mt-0.5 leading-snug">
                  This time slot overlaps with existing tasks.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <span className="text-[11.5px] font-mono text-muted-foreground font-semibold block">
                Already scheduled
              </span>
              <ul className="space-y-2 bg-surface-sunken/40 border border-border rounded-md p-3 max-h-48 overflow-y-auto">
                {conflictModal.conflictingEvents.map((evt, index) => (
                  <li key={index} className="text-xs text-ink-secondary flex items-start gap-2 leading-relaxed">
                    <span className="text-warning font-bold">•</span>
                    <div>
                      <span className="font-semibold text-foreground">{evt.title}</span>
                      <span className="text-[10px] font-mono text-muted-foreground block">
                        ({formatTime12Hour(evt.startStr)} – {formatTime12Hour(evt.endStr)})
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground leading-normal pt-1.5 border-t border-border">
                Schedule it anyway?
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-border">
              <button 
                type="button"
                onClick={() => setConflictModal(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 bg-surface-raised border border-border text-muted-foreground hover:text-foreground text-xs font-bold rounded-md transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={() => {
                  setConflictModal(prev => ({ ...prev, isOpen: false }));
                  conflictModal.onConfirm();
                }}
                className="px-5 py-2 bg-warning hover:bg-warning text-primary-foreground text-xs font-bold rounded-md transition-colors cursor-pointer"
              >
                Schedule anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const dynamic = 'force-dynamic';
