'use client';

import React, { useState, useEffect, useRef } from 'react';
import { LoadError } from '@/components/LoadError';
import { getLocalDateString, getCurrentDateInTimezone } from '@/lib/dateUtils';
import { useSession } from '@/context/SessionContext';
import { useNotifications } from '@/context/NotificationContext';
import { ObjectChat } from '@/components/ObjectChat';
import { useConfirm, usePrompt } from '@/components/ConfirmDialog';
import { ClockTimePicker } from '@/components/ClockTimePicker';
import { TaskFormModal } from '@/components/TaskFormModal';
import { SessionType, normalizeSessionType } from '@/lib/sessionType';
import { getPostponeCount } from '@/lib/analyticsUtils';
import { generateTaskPdfReport } from '@/lib/taskReport';
import { parsePostponeHistory, formatPostponeDay, tasksPostponedFrom } from '@/lib/postpone';
import { sortByManualOrder, planReorder } from '@/lib/taskOrder';
import { ReorderableTaskList } from '@/components/tasks/ReorderableTaskList';
import { InProgressLabel, InProgressStrip } from '@/components/tasks/InProgressIndicator';
import {
  CheckSquare,
  Plus,
  Search,
  Trash2,
  Copy,
  Edit3,
  CheckCircle2,
  Circle,
  CircleDot,
  Calendar as CalendarIcon,
  Flame,
  Brain,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Ban,
  Check,
  MessageSquare,
} from 'lucide-react';
import { Button, EmptyState, PageHeader, SectionHeader } from '@/components/ui';
import { BlockTaskDialog } from '@/components/BlockTaskDialog';
import type { Goal, Project, AssignableMember, Task } from './types';
import { getTaskElapsed, formatElapsedMinutes } from '@/lib/taskElapsed';
import { anchorForToday, getHourInTimezone, getTimeInTimezone, validateInternalSlots, getOverlaps, tasksOnDate, countByStatusTab } from './taskHelpers';

export default function TasksPage() {
  const { user } = useSession();
  const { toast } = useNotifications();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [discussingTask, setDiscussingTask] = useState<Task | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [allowConcurrentTasks, setAllowConcurrentTasks] = useState(false);
  const [taskNotificationsEnabled, setTaskNotificationsEnabled] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [userTimezone, setUserTimezone] = useState<string>(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch (e) {
      return 'UTC';
    }
  });

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED' | 'POSTPONED'>('ALL');
  const [blockingTask, setBlockingTask] = useState<Task | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [contextFilter] = useState<string>('ALL');
  const [projectFilter, setProjectFilter] = useState<string>('ALL');
  const sortBy: 'date' | 'priority' | 'estimatedTime' | 'impact' | 'effort' = 'date';
  const [expandedPostponeTaskIds, setExpandedPostponeTaskIds] = useState<Record<string, boolean>>({});

  // Mini Calendar States
  const [selectedDate, setSelectedDate] = useState<string | null>(() => {
    try {
      return getLocalDateString(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    } catch (e) {
      return new Date().toLocaleDateString('en-CA');
    }
  });
  const [calendarCenter, setCalendarCenter] = useState<Date>(() =>
    anchorForToday(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
  );

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Form States
  const [taskName, setTaskName] = useState('');
  const [taskDetail, setTaskDetail] = useState('');
  const [taskProject, setTaskProject] = useState('');
  const [taskAssigneeId, setTaskAssigneeId] = useState('');
  const [assignableMembers, setAssignableMembers] = useState<AssignableMember[]>([]);
  const [taskGoalId, setTaskGoalId] = useState('');
  const [taskPriority, setTaskPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM');
  const [taskDate, setTaskDate] = useState(() => {
    try {
      return getLocalDateString(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    } catch (e) {
      return new Date().toISOString().split('T')[0];
    }
  });
  const [taskSessionType, setTaskSessionType] = useState<SessionType>('REGULAR');
  const [taskEst, setTaskEst] = useState('1');
  const [taskContext, setTaskContext] = useState<string>('COMPUTER');
  const [isCustomContext, setIsCustomContext] = useState(false);
  const [customContext, setCustomContext] = useState('');
  const [taskEffort, setTaskEffort] = useState('5');
  const [taskImpact, setTaskImpact] = useState('5');
  const [taskStatus, setTaskStatus] = useState<'PENDING' | 'IN_PROGRESS' | 'COMPLETED'>('PENDING');
  const [taskNotes, setTaskNotes] = useState('');
  const [taskStartTime, setTaskStartTime] = useState('');
  const [taskEndTime, setTaskEndTime] = useState('');
  const [taskSlots, setTaskSlots] = useState<Array<{ startTime: string; endTime: string }>>([{ startTime: '', endTime: '' }]);

  const [completeTaskModal, setCompleteTaskModal] = useState<{
    isOpen: boolean;
    task: Task | null;
    slots: Array<{ startTime: string; endTime: string }>;
  }>({
    isOpen: false,
    task: null,
    slots: [{ startTime: '', endTime: '' }]
  });

  // For tasks scheduled across multiple calendar time slots: lets the user
  // check off which specific slot(s) were actually done instead of only
  // being able to complete/reopen the task as a single all-or-nothing unit.
  const [slotPickerModal, setSlotPickerModal] = useState<{ isOpen: boolean; task: Task | null }>({
    isOpen: false,
    task: null
  });

  // Export Modal States
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportStartDate, setExportStartDate] = useState(() => {
    try {
      return getLocalDateString(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    } catch (e) {
      return new Date().toISOString().split('T')[0];
    }
  });
  const [exportEndDate, setExportEndDate] = useState(() => {
    try {
      return getLocalDateString(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    } catch (e) {
      return new Date().toISOString().split('T')[0];
    }
  });
  const [exportProjectIds, setExportProjectIds] = useState<Record<string, boolean>>({});
  const [exportStatus, setExportStatus] = useState<'ALL' | 'COMPLETED' | 'UNFINISHED' | 'POSTPONED'>('ALL');
  const [exportPriority, setExportPriority] = useState<string>('ALL');

  // Move Modal States
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [movingTask, setMovingTask] = useState<Task | null>(null);
  const [moveDate, setMoveDate] = useState('');
  const [moveReason, setMoveReason] = useState('');
  // The same date dialog serves "Move" and "Duplicate": a copy always asks
  // for its date (starting empty), never inheriting or deriving one.
  const [moveMode, setMoveMode] = useState<'move' | 'copy'>('move');

  const [dataLoading, setDataLoading] = useState(true);

  const [loadFailed, setLoadFailed] = useState(false);
  // The account's timezone re-anchors "today" once, on first load. Later
  // refreshes (after a move, edit, delete...) must keep the day the user is
  // looking at - re-anchoring then threw them back to today mid-task.
  const tzAnchoredRef = useRef(false);
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [tasksRes, projectsRes, settingsRes, calendarRes] = await Promise.all([
          fetch('/api/tasks'),
          fetch('/api/projects'),
          fetch('/api/settings'),
          fetch('/api/calendar')
        ]);
        setLoadFailed(![tasksRes, projectsRes].every((r) => r.ok));
        if (tasksRes.ok) setTasks(await tasksRes.json());
        if (projectsRes.ok) setProjects(await projectsRes.json());
        if (calendarRes.ok) setEvents(await calendarRes.json());
        if (settingsRes.ok) {
          const s = await settingsRes.json();
          if (s.timezone) {
            setUserTimezone(s.timezone);
            if (!tzAnchoredRef.current) {
              tzAnchoredRef.current = true;
              setSelectedDate(prev => prev ? getCurrentDateInTimezone(s.timezone) : null);
              setCalendarCenter(anchorForToday(s.timezone));
            }
          }
          setAllowConcurrentTasks(s.allowConcurrentTasks === true);
          setTaskNotificationsEnabled(s.taskNotificationsEnabled !== false);
        }
      } catch (err) {
        setLoadFailed(true);
        console.error(err);
      } finally {
        setDataLoading(false);
      }
    };
    fetchData();
  }, [refreshTrigger]);

  // "Create task" from the command palette (Cmd/Ctrl+K), which can fire from
  // any page. Already on /tasks: a direct window event opens the modal with
  // no navigation. From elsewhere: CommandPalette stashes a flag here and
  // navigates, and this effect (once data has loaded) picks it up - same
  // handoff shape as the notification deep-link below.
  useEffect(() => {
    const handler = () => openCreateModal();
    window.addEventListener('rune-open-new-task', handler);
    return () => window.removeEventListener('rune-open-new-task', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (dataLoading) return;
    let shouldOpen = false;
    try { shouldOpen = sessionStorage.getItem('rune-deep-link-open-new-task') === 'true'; } catch { /* private mode */ }
    if (!shouldOpen) return;
    try { sessionStorage.removeItem('rune-deep-link-open-new-task'); } catch { /* ignore */ }
    openCreateModal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataLoading]);

  // Deep-link from a notification bell click ("assigned you a task", etc.) —
  // NotificationBell stashes the target id here (no query-param/Suspense
  // wiring needed) rather than a URL param.
  useEffect(() => {
    if (dataLoading) return;
    let deepLinkId: string | null = null;
    try { deepLinkId = sessionStorage.getItem('rune-deep-link-task-id'); } catch { /* private mode */ }
    if (!deepLinkId) return;
    try { sessionStorage.removeItem('rune-deep-link-task-id'); } catch { /* ignore */ }
    if (!tasks.some(t => t.id === deepLinkId)) return;
    const id = deepLinkId;
    setExpandedPostponeTaskIds(p => ({ ...p, [id]: true }));
    requestAnimationFrame(() => {
      document.getElementById(`task-row-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [dataLoading, tasks]);

  const openMoveModal = (task: Task) => {
    setMoveMode('move');
    setMovingTask(task);
    setMoveDate(task.date ? getLocalDateString(task.date, userTimezone) : getCurrentDateInTimezone(userTimezone));
    setMoveReason('');
    setIsMoveModalOpen(true);
  };

  const handleMoveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!movingTask || !moveDate) return;
    if (moveMode === 'copy') {
      await createCopy(movingTask, moveDate);
      return;
    }

    // The server logs the postponement (against the day the task is moved
    // FROM, read from its stored date) - see /api/tasks/[id] `postpone`.
    try {
      const res = await fetch(`/api/tasks/${movingTask.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: moveDate,
          postpone: { reason: moveReason || null }
        })
      });

      if (res.ok) {
        setIsMoveModalOpen(false);
        setRefreshTrigger(prev => prev + 1);
      }
    } catch (err) {
      console.error('Failed to move task:', err);
    }
  };

  // Assignment only ever applies to a team project the current user can
  // edit (Owner, or a Team Leader who's a collaborator on it) - matches the
  // /api/tasks POST permission check exactly, so the picker never offers a
  // choice the server would reject.
  const handleTaskProjectChange = async (projectId: string) => {
    setTaskProject(projectId);
    setTaskGoalId('');
    setTaskAssigneeId('');
    const project = projects.find(p => p.id === projectId);
    if (project?.teamId && project.canEdit) {
      try {
        const res = await fetch(`/api/teams/${project.teamId}`);
        if (res.ok) {
          const data = await res.json();
          setAssignableMembers(data.members || []);
        } else {
          setAssignableMembers([]);
        }
      } catch (err) {
        console.error('Error fetching team members for assignment:', err);
        setAssignableMembers([]);
      }
    } else {
      setAssignableMembers([]);
    }
  };

  const openCreateModal = () => {
    setEditingTask(null);
    setTaskName('');
    setTaskDetail('');
    setTaskProject('');
    setTaskAssigneeId('');
    setAssignableMembers([]);
    setTaskGoalId('');
    setTaskPriority('MEDIUM');
    setTaskDate(selectedDate || getCurrentDateInTimezone(userTimezone));
    setTaskSessionType('REGULAR');
    setTaskEst('1');
    setTaskContext('COMPUTER');
    setIsCustomContext(false);
    setCustomContext('');
    setTaskEffort('5');
    setTaskImpact('5');
    setTaskStatus('PENDING');
    setTaskNotes('');
    setTaskStartTime('');
    setTaskEndTime('');
    setTaskSlots([{ startTime: '', endTime: '' }]);
    setIsModalOpen(true);
  };

  const openEditModal = async (task: Task) => {
    setEditingTask(task);
    setTaskName(task.name);
    setTaskDetail(task.detail || '');
    setTaskProject(task.projectId || '');
    // Reassignment isn't supported from the edit flow yet - only at
    // creation, matching the /api/tasks POST scope - so this stays cleared.
    setTaskAssigneeId('');
    setAssignableMembers([]);
    setTaskGoalId(task.linkedGoalId || '');
    setTaskPriority(task.priority);
    setTaskDate(task.date ? getLocalDateString(task.date, userTimezone) : getCurrentDateInTimezone(userTimezone));
    setTaskSessionType(normalizeSessionType(task.sessionType));
    setTaskEst(String(task.estimatedTime));
    
    const standardContexts = ['COMPUTER', 'CODING', 'READING', 'WRITING', 'RESEARCH', 'MEETING', 'ANALYSIS'];
    if (standardContexts.includes(task.context)) {
      setTaskContext(task.context);
      setIsCustomContext(false);
      setCustomContext('');
    } else {
      setTaskContext('CUSTOM');
      setIsCustomContext(true);
      setCustomContext(task.context);
    }
    
    setTaskEffort(String(task.effort));
    setTaskImpact(String(task.impact));
    // The edit form doesn't carry the BLOCKED state (that's set via the
    // dedicated block dialog); show it as PENDING here so a save from the
    // form doesn't silently clobber the block - the user unblocks explicitly.
    setTaskStatus(task.status === 'BLOCKED' ? 'PENDING' : task.status);
    setTaskNotes(task.notes || '');
    setTaskStartTime((task as any).startTime || '');
    setTaskEndTime((task as any).endTime || '');

    let slots: Array<{ startTime: string; endTime: string }> = [];
    try {
      const calendarRes = await fetch('/api/calendar');
      if (calendarRes.ok) {
        const events = await calendarRes.json();
        const taskEvents = events.filter((e: any) => e.taskId === task.id);
        if (taskEvents.length > 0) {
          slots = taskEvents.map((event: any) => {
            const startD = new Date(event.start);
            const endD = new Date(event.end);
            const startHrs = String(getHourInTimezone(event.start, userTimezone, startD.getHours())).padStart(2, '0');
            const startMins = String(startD.getMinutes()).padStart(2, '0');
            const endHrs = String(getHourInTimezone(event.end, userTimezone, endD.getHours())).padStart(2, '0');
            const endMins = String(endD.getMinutes()).padStart(2, '0');
            return {
              startTime: `${startHrs}:${startMins}`,
              endTime: `${endHrs}:${endMins}`
            };
          });
        }
      }
    } catch (err) {
      console.error('Error fetching calendar events for task editing slots:', err);
    }

    if (slots.length === 0) {
      slots = [{
        startTime: (task as any).startTime || '',
        endTime: (task as any).endTime || ''
      }];
    }
    setTaskSlots(slots);
    setIsModalOpen(true);
  };

  const handleOpenExportModal = () => {
    const defaultDate = selectedDate || getCurrentDateInTimezone(userTimezone);
    setExportStartDate(defaultDate);
    setExportEndDate(defaultDate);
    
    // Set all projects to checked by default
    const projMap: Record<string, boolean> = {};
    projects.forEach(p => {
      projMap[p.id] = true;
    });
    setExportProjectIds(projMap);
    setExportStatus('ALL');
    setExportPriority('ALL');
    setIsExportModalOpen(true);
  };

  const handleGeneratePdfReport = () => {
    generateTaskPdfReport({
      tasks,
      projects,
      userTimezone,
      startDate: exportStartDate,
      endDate: exportEndDate,
      projectIds: exportProjectIds,
      status: exportStatus,
      priority: exportPriority,
    });
    setIsExportModalOpen(false);
  };

  const [isSavingTask, setIsSavingTask] = useState(false);
  const [taskFormError, setTaskFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskName) return;
    setTaskFormError(null);

    const validSlots = taskSlots.filter(s => s.startTime && s.endTime);
    if (validSlots.length > 0) {
      const internalValidationError = validateInternalSlots(validSlots);
      if (internalValidationError) {
        setTaskFormError(internalValidationError);
        return;
      }
      const overlaps = getOverlaps(validSlots, taskDate, events, userTimezone, editingTask?.id);
      if (overlaps.length > 0 && !allowConcurrentTasks) {
        setTaskFormError(
          `These time slots overlap with existing events or tasks: ` +
          overlaps.map(o => `${o.title} (${o.startStr}–${o.endStr})`).join(', ')
        );
        return;
      }
    }

    const body = {
      name: taskName,
      detail: taskDetail,
      projectId: taskProject || null,
      linkedGoalId: taskGoalId || null,
      priority: taskPriority,
      date: taskDate,
      sessionType: taskSessionType,
      estimatedTime: Number(taskEst),
      context: isCustomContext ? (customContext.trim().toUpperCase() || 'ANALYSIS') : taskContext,
      effort: Number(taskEffort),
      impact: Number(taskImpact),
      // Preserve an existing block: the edit form can't represent BLOCKED, so
      // omit status entirely when editing a blocked task (the block dialog is
      // the only place that clears it).
      status: editingTask?.status === 'BLOCKED' ? undefined : taskStatus,
      notes: taskNotes,
      startTime: taskSlots.length > 0 ? taskSlots[0].startTime : null,
      endTime: taskSlots.length > 0 ? taskSlots[0].endTime : null,
      slots: validSlots,
      assigneeUserId: !editingTask && taskAssigneeId ? taskAssigneeId : undefined
    };

    setIsSavingTask(true);
    try {
      let res;
      if (editingTask) {
        res = await fetch(`/api/tasks/${editingTask.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      } else {
        res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      }

      if (res.ok) {
        setIsModalOpen(false);
        setRefreshTrigger(prev => prev + 1);
        if (!editingTask) {
          setTimeout(() => {
            toast('Task created', `“${taskName}” was added.`, 'success');
          }, 50);
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setTaskFormError(data.error || 'Couldn’t save the task. Try again.');
      }
    } catch (err) {
      console.error(err);
      setTaskFormError('Network error. Check your connection and try again.');
    } finally {
      setIsSavingTask(false);
    }
  };


  const toggleTaskStatus = async (task: Task) => {
    // A blocked task's marker is a quick "unblock" back to the active list.
    if (task.status === 'BLOCKED') {
      try {
        const res = await fetch(`/api/tasks/${task.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'PENDING' })
        });
        if (res.ok) { setRefreshTrigger(prev => prev + 1); toast('Task unblocked', 'Back on your active list.', 'success'); }
        else toast('Not saved', 'Try again.', 'error');
      } catch { toast('Not saved', 'Check your connection and try again.', 'error'); }
      return;
    }

    const taskEvents = events.filter((e: any) => e.taskId === task.id);

    // Multiple scheduled slots: "complete"/"reopen" isn't well-defined for the
    // task as a single unit, so let the user pick exactly which slot(s) were
    // done instead of forcing all-or-nothing.
    if (taskEvents.length > 1) {
      setSlotPickerModal({ isOpen: true, task });
      return;
    }

    const nextStatus = task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    if (nextStatus === 'COMPLETED') {
      const initialSlots: Array<{ startTime: string; endTime: string }> = [];

      if (taskEvents.length > 0) {
        taskEvents.forEach((evt: any) => {
          const startTime = getTimeInTimezone(evt.start, userTimezone);
          const endTime = getTimeInTimezone(evt.end, userTimezone);
          initialSlots.push({ startTime, endTime });
        });
      }

      if (initialSlots.length === 0) {
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

  // Marks one specific slot's CalendarEvent complete/incomplete, then derives
  // the task's overall status from how many of its slots are now done
  // (none -> PENDING, some -> IN_PROGRESS, all -> COMPLETED). Mirrors the
  // equivalent calendar-view logic in src/app/page.tsx.
  const toggleTaskSlotCompletion = async (taskId: string, slotEventId: string, completed: boolean) => {
    try {
      const res = await fetch('/api/calendar', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: slotEventId, completed })
      });
      if (res.ok) {
        const siblingSlots = events.filter((e: any) => e.taskId === taskId);
        const completedCount = siblingSlots.reduce(
          (n: number, e: any) => n + ((e.id === slotEventId ? completed : e.completed) ? 1 : 0),
          0
        );
        const status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' =
          completedCount === 0 ? 'PENDING' : completedCount === siblingSlots.length ? 'COMPLETED' : 'IN_PROGRESS';
        await fetch(`/api/tasks/${taskId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });
        // Applied locally instead of setRefreshTrigger: the slot-picker modal
        // stays open while a user checks several slots in a row, and
        // refetching tasks/projects/settings/calendar after every single
        // click made that feel slow. We already know the exact new state.
        setEvents((prev: any[]) => prev.map(e => (e.id === slotEventId ? { ...e, completed } : e)));
        setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, status } : t)));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCompleteTaskConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completeTaskModal.task) return;
    const task = completeTaskModal.task;
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'COMPLETED',
          slots: completeTaskModal.slots.filter(s => s.startTime && s.endTime)
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

  // Duplicate asks for the copy's date first (the Move dialog, in copy
  // mode). It used to post the original's stored timestamp, which the server
  // cut to its UTC date - one day early anywhere east of UTC.
  const handleDuplicate = (task: Task) => {
    setMoveMode('copy');
    setMovingTask(task);
    setMoveDate('');
    setMoveReason('');
    setIsMoveModalOpen(true);
  };

  // A copy is a new task: the original's details, none of its history
  // (status, time spent, postponements, slots, assignment), on the chosen day.
  const createCopy = async (task: Task, date: string) => {
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${task.name} (Copy)`,
          detail: task.detail,
          projectId: task.projectId || undefined,
          priority: task.priority,
          date,
          sessionType: task.sessionType,
          estimatedTime: task.estimatedTime,
          context: task.context,
          effort: task.effort,
          impact: task.impact,
          status: 'PENDING',
          notes: task.notes
        })
      });
      if (res.ok) {
        setIsMoveModalOpen(false);
        setRefreshTrigger(prev => prev + 1);
        toast('Task copied', `“${task.name} (Copy)” is on ${new Date(`${date}T12:00:00Z`).toLocaleDateString([], { day: 'numeric', month: 'short', timeZone: 'UTC' })}.`, 'success');
      } else {
        toast('Couldn’t copy the task', 'Try again.', 'error');
      }
    } catch (e) {
      console.error(e);
      toast('Couldn’t copy the task', 'Try again.', 'error');
    }
  };

  const respondToAssignment = async (task: Task, action: 'accept' | 'decline') => {
    let reason: string | undefined;
    if (action === 'decline') {
      const result = await prompt({ title: 'Decline this task?', message: 'Add a reason (optional).', confirmLabel: 'Decline task' });
      if (result === null) return;
      reason = result || undefined;
    }
    try {
      const res = await fetch(`/api/tasks/${task.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason })
      });
      if (res.ok) {
        toast(action === 'accept' ? 'Task accepted' : 'Task declined', `“${task.name}”`, 'success');
        setRefreshTrigger(prev => prev + 1);
      } else {
        const data = await res.json().catch(() => ({}));
        toast('Not saved', data.error || 'Couldn’t send your response. Try again.', 'error');
      }
    } catch (e) {
      console.error(e);
      toast('Not saved', 'Check your connection and try again.', 'error');
    }
  };

  const handleDelete = async (taskId: string) => {
    if (!(await confirm({ title: 'Delete this task?', message: 'This also removes its calendar time slots. You can’t undo this.', confirmLabel: 'Delete task', danger: true }))) return;
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setRefreshTrigger(prev => prev + 1);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Generate 7 days centered around calendarCenter
  const daysOfWeekList = React.useMemo(() => {
    const days = [];
    const center = new Date(calendarCenter);
    for (let i = -3; i <= 3; i++) {
      const d = new Date(center);
      d.setUTCDate(center.getUTCDate() + i);
      days.push(d);
    }
    return days;
  }, [calendarCenter]);

  const shiftCalendar = (offsetDays: number) => {
    setCalendarCenter(prev => {
      const d = new Date(prev);
      d.setUTCDate(d.getUTCDate() + offsetDays);
      return d;
    });
  };

  // Filter tasks based on selected filters and mini calendar selection
  // Tasks on the selected day only (by scheduled date). Everything date-scoped
  // on this page - the list, the tab counts, the header summary - starts here.
  const dayTasks = React.useMemo(() => tasksOnDate(tasks, selectedDate, userTimezone), [tasks, selectedDate, userTimezone]);

  const matchesFilters = React.useCallback((t: Task) => {
    {
      // Search filter
      if (searchQuery && !t.name.toLowerCase().includes(searchQuery.toLowerCase()) && !(t.detail && t.detail.toLowerCase().includes(searchQuery.toLowerCase()))) {
        return false;
      }
      // Status is applied at the grouping stage (the segmented bar), not here,
      // so "Postponed" can cut across all three states.
      // Priority filter
      if (priorityFilter !== 'ALL' && t.priority !== priorityFilter) return false;
      // Context filter
      if (contextFilter !== 'ALL' && t.context?.toUpperCase() !== contextFilter.toUpperCase()) return false;
      // Project filter
      if (projectFilter !== 'ALL' && t.projectId !== projectFilter) return false;

      return true;
    }
  }, [searchQuery, priorityFilter, contextFilter, projectFilter]);
  const filteredTasks = React.useMemo(() => dayTasks.filter(matchesFilters), [dayTasks, matchesFilters]);

  // Postponed is about where a task was moved FROM, not where it is now: the
  // selected day's Postponed tab lists the tasks postponed off that day,
  // wherever they're scheduled today (a task moved from today to tomorrow
  // shows here under today, and in tomorrow's ordinary list - not tomorrow's
  // Postponed).
  const postponedTasks = React.useMemo(
    () => tasksPostponedFrom(tasks, selectedDate, userTimezone).filter(matchesFilters),
    [tasks, selectedDate, userTimezone, matchesFilters]
  );
  const postponedDayTasks = React.useMemo(() => tasksPostponedFrom(tasks, selectedDate, userTimezone), [tasks, selectedDate, userTimezone]);

  // Sort tasks
  const sortTasks = React.useCallback((list: Task[]) => {
    return [...list].sort((a, b) => {
      if (sortBy === 'date') {
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      }
      if (sortBy === 'priority') {
        const weight = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
        return weight[b.priority] - weight[a.priority];
      }
      if (sortBy === 'estimatedTime') {
        return b.estimatedTime - a.estimatedTime;
      }
      if (sortBy === 'impact') {
        return b.impact - a.impact;
      }
      if (sortBy === 'effort') {
        return b.effort - a.effort;
      }
      return 0;
    });
  }, [sortBy]);

  // Group by Date key (YYYY-MM-DD)
  const formatTasks = React.useCallback((list: Task[]) => {
    return list.map(t => {
      // The task's day in the account's timezone (its stored timestamp is
      // local midnight, which in UTC can fall on the previous date).
      const datePart = t.date ? getLocalDateString(t.date, userTimezone) : '';
      const formattedPlannedDate = datePart
        ? new Date(`${datePart}T12:00:00Z`).toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' })
        : 'Invalid date';

      const parsedHistory = parsePostponeHistory(t.postponeHistory).map((entry) => ({
        ...entry,
        entryOrig: formatPostponeDay(entry.originalDate, userTimezone),
        entryDest: formatPostponeDay(entry.newDate, userTimezone),
      }));

      return {
        ...t,
        formattedPlannedDate,
        parsedHistory
      };
    });
  }, [userTimezone]);
  const formattedTasksList = React.useMemo(() => formatTasks(sortTasks(filteredTasks)), [formatTasks, sortTasks, filteredTasks]);
  const formattedPostponedList = React.useMemo(() => formatTasks(sortTasks(postponedTasks)), [formatTasks, sortTasks, postponedTasks]);

  // The mockup groups tasks by STATE (In progress / To do / Done), not by date.
  // The date rail narrows the set; this decides the sections shown within it.
  const STATE_GROUPS = [
    { key: 'IN_PROGRESS', label: 'In progress' },
    { key: 'BLOCKED', label: 'Blocked' },
    { key: 'PENDING', label: 'To do' },
    { key: 'COMPLETED', label: 'Done' },
  ] as const;

  const groupedByState = React.useMemo(() => {
    const base = statusFilter === 'POSTPONED' ? formattedPostponedList : formattedTasksList;
    return STATE_GROUPS
      // To do is in the user's own order (drag to arrange); the other
      // sections keep their existing order.
      .map(g => ({ ...g, tasks: g.key === 'PENDING' ? sortByManualOrder(base.filter(t => t.status === g.key)) : base.filter(t => t.status === g.key) }))
      .filter(g => {
        if (statusFilter === 'ALL' || statusFilter === 'POSTPONED') return g.tasks.length > 0;
        return g.key === statusFilter;
      });
  }, [formattedTasksList, formattedPostponedList, statusFilter]);

  // One task row, shared by every section. `dragHandle` is only passed in
  // the To do section (ReorderableTaskList); it sits in the left gutter so
  // rows line up the same in every section.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderTaskRow = (task: any, dragHandle: React.ReactNode = null) => {
                  const isCompleted = task.status === 'COMPLETED';
                  const isInProgress = task.status === 'IN_PROGRESS';
                  const isBlocked = task.status === 'BLOCKED';
                  const pendingAcceptance = task.assignmentStatus === 'PENDING_ACCEPTANCE';
                  const declined = task.assignmentStatus === 'DECLINED';
                  const linkedProject = projects.find(p => p.id === task.projectId);
                  const postponeCount = getPostponeCount(task);
                  const expanded = !!expandedPostponeTaskIds[task.id];
                  const mins = Math.round((task.estimatedTime || 0) * 60);
                  const durStr = mins <= 0 ? '–' : mins < 60 ? `${mins}m` : (mins % 60 ? `${Math.floor(mins / 60)}h${mins % 60}m` : `${Math.floor(mins / 60)}h`);
                  return (
                    <div key={task.id} id={`task-row-${task.id}`}>
                      <div
                        className="group relative flex items-center gap-3 rounded-[8px] px-2 py-3 -mx-2 transition-colors hover:bg-surface"
                      >
                        {dragHandle}
                        <button
                          onClick={() => toggleTaskStatus(task)}
                          className="shrink-0 text-ink-faint hover:text-foreground transition-colors"
                          title={isCompleted ? 'Reopen task' : isBlocked ? 'Unblock task' : 'Mark done'}
                        >
                          {isCompleted ? <CheckCircle2 className="w-[18px] h-[18px] text-primary" />
                            : isBlocked ? <Ban className="w-[18px] h-[18px] text-[var(--color-data-slate)]" />
                            : isInProgress ? <CircleDot className="w-[18px] h-[18px] text-primary" />
                            : <Circle className="w-[18px] h-[18px]" strokeWidth={1.6} />}
                        </button>

                        <button
                          onClick={() => setExpandedPostponeTaskIds(p => ({ ...p, [task.id]: !p[task.id] }))}
                          className="flex-1 min-w-0 text-left flex items-center gap-2"
                        >
                          <span className={`text-[14.5px] truncate ${isCompleted ? 'line-through text-ink-faint' : 'text-foreground font-medium'}`}>
                            {task.name}
                          </span>
                          {isBlocked && (task.blockedOnName || task.blockedReason) && (
                            <span className="shrink-0 hidden sm:inline text-[12.5px] text-ink-secondary truncate max-w-[16rem]" title={task.blockedReason || undefined}>
                              {task.blockedOnName ? `waiting on ${task.blockedOnName}` : task.blockedReason}
                            </span>
                          )}
                          {pendingAcceptance && (
                            <span className="shrink-0 text-[10px] font-semibold text-primary truncate max-w-[14rem]">
                              {task.assignedByName ? `assigned by ${task.assignedByName}` : 'assigned to you'} · awaiting your response
                            </span>
                          )}
                          {declined && (
                            <span className="shrink-0 text-[10px] font-semibold text-danger truncate max-w-[14rem]" title={task.declineReason || undefined}>
                              declined
                            </span>
                          )}
                          {statusFilter === 'POSTPONED' && selectedDate && getLocalDateString(task.date, userTimezone) !== selectedDate && (
                            <span className="shrink-0 text-[12px] text-ink-secondary" title="Postponed off this day; scheduled on its new date">
                              moved to {task.formattedPlannedDate}
                            </span>
                          )}
                          {task.sessionType === 'DEEP_WORK' && <Flame className="w-3 h-3 shrink-0 text-ink-faint" />}
                          {task.sessionType === 'FOCUS' && <Brain className="w-3 h-3 shrink-0 text-ink-faint" />}
                          {postponeCount > 0 && (
                            <span className="shrink-0 text-[12px] text-ink-faint" title={`Postponed ${postponeCount}×`}>
                              moved {postponeCount}×
                            </span>
                          )}
                          {isInProgress && <InProgressLabel task={task} events={events} timezone={userTimezone} />}
                        </button>

                        <div className="flex items-center gap-2.5 shrink-0">
                          {pendingAcceptance && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => respondToAssignment(task, 'accept')}
                                className="flex items-center gap-1 px-2 py-1 rounded-[3px] bg-primary hover:bg-primary-hover text-primary-foreground text-[11px] font-semibold transition-colors"
                              >
                                <Check className="w-3 h-3" /> Accept
                              </button>
                              <button
                                onClick={() => respondToAssignment(task, 'decline')}
                                className="flex items-center gap-1 px-2 py-1 rounded-[3px] border border-border-strong hover:bg-surface-sunken text-ink-secondary text-[11px] font-semibold transition-colors"
                              >
                                <X className="w-3 h-3" /> Decline
                              </button>
                            </div>
                          )}
                          {linkedProject && (
                            <span className="hidden sm:inline-flex items-center gap-1.5 text-[13px] text-ink-secondary whitespace-nowrap max-w-[12rem]" title={linkedProject.name}>
                              <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: linkedProject.color || 'var(--border-strong)' }} aria-hidden="true" />
                              <span className="truncate">{linkedProject.name}</span>
                            </span>
                          )}
                          <span className={`hidden md:inline w-14 text-right text-[12.5px] font-medium ${task.priority === 'CRITICAL' ? 'text-danger' : task.priority === 'HIGH' ? 'text-warning' : 'text-ink-faint'}`} title={`${task.priority.toLowerCase()} priority · effort ${task.effort} · impact ${task.impact}`}>
                            <span className="sr-only">Priority </span>{task.priority === 'CRITICAL' ? 'Critical' : task.priority === 'HIGH' ? 'High' : task.priority === 'MEDIUM' ? 'Medium' : 'Low'}
                          </span>
                          <span className="text-[13px] text-ink-secondary tabular-nums w-12 text-right">{durStr}</span>

                          <div className="hidden group-hover:flex group-focus-within:flex items-center gap-0.5">
                            {linkedProject?.teamId && (
                              <button onClick={() => setDiscussingTask(task)} className="p-1 text-ink-faint hover:text-foreground rounded-[3px] hover:bg-surface-sunken transition-colors" title="Discuss this task" aria-label="Discuss this task">
                                <MessageSquare className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {!isCompleted && (
                              <button onClick={() => setBlockingTask(task)} className={`p-1 rounded-[3px] hover:bg-surface-sunken transition-colors ${isBlocked ? 'text-[var(--color-data-slate)]' : 'text-ink-faint hover:text-foreground'}`} title={isBlocked ? 'Edit block' : 'Mark blocked'} aria-label={isBlocked ? 'Edit block' : 'Mark blocked'}>
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button onClick={() => openEditModal(task)} className="p-1 text-ink-faint hover:text-foreground rounded-[3px] hover:bg-surface-sunken transition-colors" title="Edit" aria-label="Edit task">
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => openMoveModal(task)} className="p-1 text-ink-faint hover:text-foreground rounded-[3px] hover:bg-surface-sunken transition-colors" title="Move" aria-label="Move task">
                              <CalendarIcon className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDuplicate(task)} className="p-1 text-ink-faint hover:text-foreground rounded-[3px] hover:bg-surface-sunken transition-colors" title="Duplicate" aria-label="Duplicate task">
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDelete(task.id)} className="p-1 text-ink-faint hover:text-danger rounded-[3px] hover:bg-danger-soft transition-colors" title="Delete" aria-label="Delete task">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        {isInProgress && <InProgressStrip task={task} events={events} timezone={userTimezone} />}
                      </div>

                      {expanded && (
                        <div className="pb-4 pl-8 pr-2 text-[13.5px] text-ink-secondary space-y-2">
                          {isBlocked && (
                            <p className="leading-relaxed text-[var(--color-data-slate)] flex items-start gap-1.5">
                              <Ban className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                              <span>
                                Blocked{task.blockedOnName ? ` · waiting on ${task.blockedOnName}` : ''}
                                {task.blockedReason ? `: ${task.blockedReason}` : ''}.{' '}
                                <button onClick={() => setBlockingTask(task)} className="underline hover:text-foreground">Edit</button>
                              </span>
                            </p>
                          )}
                          {declined && (
                            <p className="leading-relaxed text-danger flex items-start gap-1.5">
                              <X className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                              <span>
                                You declined this task{task.declineReason ? `: ${task.declineReason}` : ''}.
                              </span>
                            </p>
                          )}
                          {task.detail && <p className="leading-relaxed whitespace-pre-wrap">{task.detail}</p>}
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-faint tabular-nums">
                            <span>planned {task.formattedPlannedDate}</span>
                            {isCompleted && <span>actual {(task.actualTime || 0).toFixed(1)}h</span>}
                            {!isCompleted && (() => {
                              const el = getTaskElapsed(task, events, userTimezone);
                              return el.minutes > 0 ? (
                                <span className={el.state === 'ongoing' ? 'font-medium text-primary' : ''} title="Time elapsed since the scheduled start (counted until it's marked done)">
                                  {formatElapsedMinutes(el.minutes)} {el.state === 'ongoing' ? 'so far' : 'elapsed'}
                                </span>
                              ) : null;
                            })()}
                            {isCompleted && (
                              <span className={(task.timeDifference || 0) >= 0 ? 'text-warning' : 'text-success'}>
                                {(task.timeDifference || 0) >= 0 ? '+' : ''}{(task.timeDifference || 0).toFixed(1)}h vs plan
                              </span>
                            )}
                            <span>effort {task.effort}/10 · impact {task.impact}/10</span>
                          </div>
                          {task.parsedHistory && task.parsedHistory.length > 0 && (
                            <div className="border-t border-border pt-2 space-y-1">
                              <p className="font-mono text-[11.5px] text-ink-faint">Postpone history</p>
                              {task.parsedHistory.map((entry: any, i: number) => (
                                <p key={i} className="font-mono text-[10px] text-ink-faint">{entry.entryOrig} → {entry.entryDest}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
  };

  // Saves a To do drag: the moved task usually gets one new manualOrder
  // between its neighbours (lib/taskOrder planReorder). Applied locally first
  // so the list doesn't jump back while the save is in flight.
  const commitTodoOrder = async (nextIds: string[], movedId: string) => {
    const byId = new Map(tasks.map(t => [t.id, t]));
    const next = nextIds.map(id => byId.get(id)).filter(Boolean) as Task[];
    const writes = planReorder(next, movedId);
    if (writes.length === 0) return;
    const value = new Map(writes.map(w => [w.id, w.manualOrder]));
    setTasks(prev => prev.map(t => (value.has(t.id) ? { ...t, manualOrder: value.get(t.id)! } : t)));
    try {
      const res = await fetch('/api/tasks/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: writes }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      toast('Couldn’t save the new order', 'Try again.', 'error');
      setRefreshTrigger(prev => prev + 1);
    }
  };

  const totalShown = groupedByState.reduce((n, g) => n + g.tasks.length, 0);
  const statusCounts = React.useMemo(() => countByStatusTab(filteredTasks, postponedTasks.length), [filteredTasks, postponedTasks]);
  const dayCounts = React.useMemo(() => countByStatusTab(dayTasks, postponedDayTasks.length), [dayTasks, postponedDayTasks]);

  // Pre-calculate task counts per day for the mini-calendar indicators
  const tasksByDateMap = React.useMemo(() => {
    const map: Record<string, Task[]> = {};
    tasks.forEach(t => {
      const dateKey = getLocalDateString(t.date, userTimezone);
      if (!map[dateKey]) {
        map[dateKey] = [];
      }
      map[dateKey].push(t);
    });
    return map;
  }, [tasks, userTimezone]);

  const todayStr = React.useMemo(() => getCurrentDateInTimezone(userTimezone), [userTimezone]);

  const isToday = (dateString: string) => {
    return dateString === todayStr;
  };

  const selectedProjGoals = React.useMemo(() => {
    const selectedProj = projects.find(p => p.id === taskProject);
    const goals: Goal[] = [];
    if (selectedProj && selectedProj.goals) {
      try {
        const parsed = JSON.parse(selectedProj.goals);
        if (Array.isArray(parsed)) {
          goals.push(...parsed);
        }
      } catch {
        const lines = selectedProj.goals.split('\n').filter(Boolean);
        lines.forEach((g, i) => goals.push({ id: String(i), text: g, completed: false }));
      }
    }
    return goals;
  }, [projects, taskProject]);

  if (dataLoading) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="flex justify-between items-center gap-4">
          <div className="h-9 w-56 bg-surface-raised rounded-[var(--radius-md)]" />
          <div className="flex gap-3">
            <div className="h-10 w-32 bg-surface-raised rounded-[var(--radius-md)]" />
            <div className="h-10 w-32 bg-surface-raised rounded-[var(--radius-md)]" />
          </div>
        </div>
        <div className="h-24 bg-surface-raised rounded-[var(--radius-lg)]" />
        <div className="space-y-3">
          <div className="h-16 bg-surface-raised rounded-[var(--radius-lg)]" />
          <div className="h-16 bg-surface-raised rounded-[var(--radius-lg)]" />
          <div className="h-16 bg-surface-raised rounded-[var(--radius-lg)]" />
          <div className="h-16 bg-surface-raised rounded-[var(--radius-lg)]" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        className=""
        title="Tasks"
        subtitle={`${dayCounts.ALL - dayCounts.COMPLETED} open · ${dayCounts.IN_PROGRESS} in progress · ${dayCounts.BLOCKED} blocked${selectedDate ? (selectedDate === todayStr ? ' today' : ` on ${new Date(`${selectedDate}T12:00:00Z`).toLocaleDateString([], { day: 'numeric', month: 'short', timeZone: 'UTC' })}`) : ''}`}
        actions={
          <>
            <Button variant="ghost" onClick={handleOpenExportModal}><Download className="w-4 h-4 text-ink-faint" /> Export</Button>
            <Button onClick={openCreateModal}><Plus className="w-4 h-4" /> New task</Button>
          </>
        }
      />
      {loadFailed && <LoadError what="your tasks" onRetry={() => setRefreshTrigger((n) => n + 1)} />}

      {/* Date rail + project / priority filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => shiftCalendar(-7)}
            className="grid h-8 w-8 place-items-center text-ink-faint hover:text-foreground hover:bg-surface-sunken rounded-[8px] transition-colors"
            title="Previous week" aria-label="Previous week"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex gap-1">
            {daysOfWeekList.map((d, index) => {
              const formatted = getLocalDateString(d, userTimezone);
              const isSel = selectedDate === formatted;
              const isTod = isToday(formatted);
              const dayTasks = tasksByDateMap[formatted] || [];
              const hasOpen = dayTasks.some(t => t.status !== 'COMPLETED');
              return (
                <button
                  key={index}
                  onClick={() => setSelectedDate(isSel ? null : formatted)}
                  title={d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
                  className={`flex flex-col items-center justify-center w-11 h-[52px] rounded-[10px] transition-colors relative ${
                    isSel
                      ? 'bg-foreground text-background'
                      : isTod
                        ? 'bg-surface shadow-[0_0_0_1px_var(--border-strong)] text-foreground'
                        : 'text-ink-secondary hover:bg-surface hover:text-foreground'
                  }`}
                >
                  {/* No opacity fade here - stacking it on top of the already-muted
                      inherited text color pushed contrast to 2.96:1 (axe-core), well
                      under WCAG AA's 4.5:1 for this real (non-decorative) label. */}
                  <span className="text-[11.5px]">
                    {d.toLocaleDateString([], { weekday: 'short' }).slice(0, 3)}
                  </span>
                  <span className="font-serif text-[18px] font-medium leading-tight tabular-nums">{d.getDate()}</span>
                  {dayTasks.length > 0 && (
                    <span className={`absolute bottom-1 w-1 h-1 rounded-full ${isSel ? 'bg-background/70' : hasOpen ? 'bg-ink-faint' : 'bg-primary'}`} />
                  )}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => shiftCalendar(7)}
            className="grid h-8 w-8 place-items-center text-ink-faint hover:text-foreground hover:bg-surface-sunken rounded-[8px] transition-colors"
            title="Next week" aria-label="Next week"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {selectedDate ? (
            <button
              onClick={() => { setSelectedDate(null); setCalendarCenter(anchorForToday(userTimezone)); }}
              className="ml-1 text-[13px] text-ink-secondary hover:text-foreground transition-colors"
            >
              Clear
            </button>
          ) : (
            <button
              onClick={() => { setSelectedDate(getCurrentDateInTimezone(userTimezone)); setCalendarCenter(anchorForToday(userTimezone)); }}
              className="ml-1 text-[13px] text-ink-secondary hover:text-foreground transition-colors"
            >
              Today
            </button>
          )}
        </div>

        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            aria-label="Filter by project"
            className="h-9 min-w-0 flex-1 truncate sm:max-w-[16rem] sm:flex-none bg-surface border border-border rounded-[9px] px-2.5 text-[13px] text-foreground focus:outline-none focus:border-border-strong"
          >
            <option value="ALL">All projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            aria-label="Filter by priority"
            className="h-9 bg-surface border border-border rounded-[9px] px-2.5 text-[13px] text-foreground focus:outline-none focus:border-border-strong"
          >
            <option value="ALL">Any priority</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>
      </div>

      {/* Segmented state bar + search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* min-w-0 lets this shrink inside the flex row instead of forcing
            the row to wrap; overflow-x-auto scrolls the tabs on narrow
            viewports instead of the old inline-flex's overflow-hidden
            silently clipping the last one (e.g. "Postponed" on a phone). */}
        <div className="min-w-0 max-w-full overflow-x-auto">
          <div className="inline-flex gap-1 border-b border-border" role="tablist" aria-label="Filter by status">
            {([
              ['ALL', 'All'],
              ['PENDING', 'To do'],
              ['IN_PROGRESS', 'In progress'],
              ['BLOCKED', 'Blocked'],
              ['COMPLETED', 'Done'],
              ['POSTPONED', 'Postponed'],
            ] as const).map(([val, label], i) => (
              <button
                key={val}
                role="tab"
                aria-selected={statusFilter === val}
                onClick={() => setStatusFilter(val)}
                className={`-mb-px shrink-0 border-b-2 px-2.5 pb-2 pt-1 text-[14px] transition-colors ${i === 0 ? '' : ''} ${
                  statusFilter === val
                    ? 'border-foreground font-semibold text-foreground'
                    : 'border-transparent text-ink-secondary hover:text-foreground'
                }`}
              >
                {label}
                <span className="ml-1.5 text-[12px] font-normal text-ink-faint tabular-nums">{statusCounts[val]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
          <input
            type="text"
            placeholder="Find a task…"
            aria-label="Find a task"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-60 bg-surface border border-border rounded-[9px] pl-9 pr-3 text-[13.5px] text-foreground placeholder-ink-faint focus:outline-none focus:border-border-strong"
          />
        </div>
      </div>

      {/* Task list — grouped by state (In progress / To do / Done) */}
      {totalShown === 0 ? (
        (() => {
          const filtersActive = searchQuery.trim() !== '' || statusFilter !== 'ALL' || priorityFilter !== 'ALL' || projectFilter !== 'ALL' || !!selectedDate;
          const hasAnyTasks = tasks.length > 0;
          return loadFailed ? null : (
            filtersActive && hasAnyTasks ? (
              <EmptyState
                spot="search"
                title="Nothing matches these filters"
                message="Try a different day, project or status, or clear them all."
                action={<Button variant="ghost" onClick={() => { setSearchQuery(''); setStatusFilter('ALL'); setPriorityFilter('ALL'); setProjectFilter('ALL'); setSelectedDate(null); }}>Clear filters</Button>}
              />
            ) : (
              <EmptyState
                spot="tasks"
                title="No tasks yet"
                message="Write down the first thing you need to do. Only the name is required; Rune groups everything here by status."
                action={<Button onClick={openCreateModal}><Plus className="w-4 h-4" /> New task</Button>}
              />
            )
          );
        })()
      ) : (
        <div className="space-y-10">
          {groupedByState.map(group => (
            <div key={group.key}>
              <SectionHeader title={group.label} meta={group.tasks.length} />
              {group.key === 'PENDING' && statusFilter !== 'POSTPONED' ? (
                <ReorderableTaskList tasks={group.tasks} renderRow={renderTaskRow} onCommit={commitTodoOrder} />
              ) : (
                <div className="divide-y divide-border">
                  {group.tasks.map((task) => renderTaskRow(task))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {blockingTask && (
        <BlockTaskDialog
          task={blockingTask}
          onClose={() => setBlockingTask(null)}
          onSaved={() => setRefreshTrigger(prev => prev + 1)}
        />
      )}

      {discussingTask && user?.id && (() => {
        const linkedProject = projects.find(p => p.id === discussingTask.projectId);
        if (!linkedProject?.teamId) return null;
        return (
          <div
            className="fixed inset-0 z-[60] flex justify-end bg-black/20"
            onMouseDown={(e) => { if (e.target === e.currentTarget) setDiscussingTask(null); }}
            onKeyDown={(e) => { if (e.key === 'Escape') setDiscussingTask(null); }}
          >
            <div role="dialog" aria-modal="true" aria-label="Discuss this task" className="w-full max-w-sm h-full bg-card border-l border-border shadow-[var(--shadow-modal)] flex flex-col p-4">
              <div className="flex items-center justify-between mb-3 shrink-0">
                <div className="min-w-0">
                  <p className="font-display text-sm font-bold text-foreground truncate">{discussingTask.name}</p>
                  <p className="text-[11px] text-ink-faint">{linkedProject.name}</p>
                </div>
                <button autoFocus onClick={() => setDiscussingTask(null)} className="p-1 text-ink-faint hover:text-foreground rounded-[3px] hover:bg-surface-sunken" aria-label="Close discussion">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ObjectChat
                teamId={linkedProject.teamId}
                objectType="task"
                objectId={discussingTask.id}
                currentUserId={user.id}
                fillHeight
              />
            </div>
          </div>
        );
      })()}

      {/* Task Modal (Create & Edit) */}
      {isModalOpen && (
        <TaskFormModal
          title={editingTask ? 'Edit task' : 'New task'}
          submitLabel={editingTask ? 'Save changes' : 'Create task'}
          submittingLabel={editingTask ? 'Saving…' : 'Creating…'}
          onClose={() => { setIsModalOpen(false); setTaskFormError(null); }}
          onSubmit={handleSubmit}
          isSubmitting={isSavingTask}
          errorMessage={taskFormError}
          projects={projects}
          selectedProjGoals={selectedProjGoals}
          name={taskName} onNameChange={setTaskName}
          detail={taskDetail} onDetailChange={setTaskDetail}
          projectId={taskProject} onProjectChange={handleTaskProjectChange}
          assigneeId={taskAssigneeId} onAssigneeChange={setTaskAssigneeId}
          assignableMembers={!editingTask ? assignableMembers : undefined}
          goalId={taskGoalId} onGoalChange={setTaskGoalId}
          context={taskContext} onContextChange={(v) => { setTaskContext(v); setIsCustomContext(v === 'CUSTOM'); }}
          isCustomContext={isCustomContext}
          customContext={customContext} onCustomContextChange={setCustomContext}
          priority={taskPriority} onPriorityChange={(v) => setTaskPriority(v as any)}
          estimatedTime={taskEst} onEstimatedTimeChange={setTaskEst}
          effort={taskEffort} onEffortChange={setTaskEffort}
          impact={taskImpact} onImpactChange={setTaskImpact}
          slots={taskSlots} onSlotsChange={setTaskSlots}
          date={taskDate} onDateChange={setTaskDate}
          sessionType={taskSessionType} onSessionTypeChange={setTaskSessionType}
          status={taskStatus} onStatusChange={(v) => setTaskStatus(v as any)}
          notes={taskNotes} onNotesChange={setTaskNotes}
        />
      )}
      {/* PDF Export Filters Modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md bg-card border border-border rounded-lg p-6 shadow-[var(--shadow-modal)] space-y-5">
            <div className="flex justify-between items-center pb-2 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Download className="w-4.5 h-4.5 text-primary" /> Export tasks to PDF
              </h3>
              <button 
                onClick={() => setIsExportModalOpen(false)}
                className="p-1 rounded-lg hover:bg-surface-raised text-muted-foreground hover:text-foreground transition-colors cursor-pointer" aria-label="Close">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Date Range Filter */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="page-start-date" className="block text-[11.5px] font-semibold text-muted-foreground mb-1.5">Start date</label>
                  <input id="page-start-date" 
                    type="date"
                    value={exportStartDate}
                    onChange={(e) => setExportStartDate(e.target.value)}
                                       className="w-full bg-surface-raised border border-border rounded-md px-3 py-2 text-ink-secondary text-xs focus:outline-none focus:border-border-strong"
                  />
                </div>
                <div>
                  <label htmlFor="page-end-date" className="block text-[11.5px] font-semibold text-muted-foreground mb-1.5">End date</label>
                  <input id="page-end-date" 
                    type="date"
                    value={exportEndDate}
                    onChange={(e) => setExportEndDate(e.target.value)}
                                       className="w-full bg-surface-raised border border-border rounded-md px-3 py-2 text-ink-secondary text-xs focus:outline-none focus:border-border-strong"
                  />
                </div>
              </div>

              {/* Project Multi-select Filter */}
              <div>
                <label className="block text-[11.5px] font-semibold text-muted-foreground mb-1.5">Projects</label>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[9px] text-ink-faint">Include these projects:</span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const allSelected: Record<string, boolean> = {};
                        projects.forEach(p => {
                          allSelected[p.id] = true;
                        });
                        setExportProjectIds(allSelected);
                      }}
                      className="text-[9px] text-primary hover:underline cursor-pointer"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setExportProjectIds({});
                      }}
                      className="text-[9px] text-muted-foreground hover:underline cursor-pointer"
                    >
                      Clear all
                    </button>
                  </div>
                </div>
                <div className="max-h-32 overflow-y-auto p-2 bg-surface-raised border border-border rounded-md space-y-1.5 pr-1.5">
                  {projects.map((p) => {
                    const checked = !!exportProjectIds[p.id];
                    return (
                      <label 
                        key={p.id}
                        className="flex items-center gap-2 px-2 py-1 hover:bg-surface-raised rounded-lg cursor-pointer text-xs text-foreground"
                      >
                        <input 
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setExportProjectIds(prev => ({
                              ...prev,
                              [p.id]: !prev[p.id]
                            }));
                          }}
                          className="accent-blue-500 w-4.5 h-4.5 rounded cursor-pointer"
                        />
                        <span>{p.name}</span>
                      </label>
                    );
                  })}
                  {projects.length === 0 && (
                    <div className="text-[10px] text-ink-faint text-center py-4 font-light">No active projects.</div>
                  )}
                </div>
              </div>

              {/* Task Status Filter */}
              <div>
                <label htmlFor="page-status" className="block text-[11.5px] font-semibold text-muted-foreground mb-1.5">Status</label>
                <select id="page-status"
                  value={exportStatus}
                  onChange={(e) => setExportStatus(e.target.value as any)}
                  className="w-full bg-surface-raised border border-border rounded-md px-3 py-2 text-ink-secondary text-xs focus:outline-none focus:border-border-strong"
                >
                  <option value="ALL">All tasks</option>
                  <option value="COMPLETED">Done only</option>
                  <option value="UNFINISHED">Not done only</option>
                  <option value="POSTPONED">Postponed only</option>
                </select>
              </div>

              {/* Priority Filter */}
              <div>
                <label htmlFor="page-priority" className="block text-[11.5px] font-semibold text-muted-foreground mb-1.5">Priority</label>
                <select id="page-priority"
                  value={exportPriority}
                  onChange={(e) => setExportPriority(e.target.value)}
                  className="w-full bg-surface-raised border border-border rounded-md px-3 py-2 text-ink-secondary text-xs focus:outline-none focus:border-border-strong"
                >
                  <option value="ALL">All priorities</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => setIsExportModalOpen(false)}
                className="px-3.5 py-2 border border-border hover:border-border-strong text-muted-foreground hover:text-foreground rounded-md text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGeneratePdfReport}
                className="px-4.5 py-2 bg-primary hover:bg-primary-hover text-primary-foreground font-bold rounded-full text-xs flex items-center gap-1 cursor-pointer animate-pulse"
              >
                <Download className="w-3.5 h-3.5" /> Export PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move Task Modal */}
      {isMoveModalOpen && movingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md bg-card border border-border rounded-lg p-6 shadow-[var(--shadow-modal)] space-y-5">
            <div className="flex justify-between items-center pb-2 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                {moveMode === 'copy'
                  ? <><Copy className="w-4.5 h-4.5 text-primary" /> Duplicate task</>
                  : <><CalendarIcon className="w-4.5 h-4.5 text-primary" /> Move task</>}
              </h3>
              <button 
                onClick={() => setIsMoveModalOpen(false)}
                className="p-1 rounded-lg hover:bg-surface-raised text-ink-faint hover:text-foreground transition-colors cursor-pointer" aria-label="Close">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <form onSubmit={handleMoveSubmit} className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground mb-2">
                  Task: <span className="font-semibold text-foreground">{movingTask.name}</span>
                </p>
                <p className="text-[10px] text-ink-faint mb-4">
                  {moveMode === 'copy' ? 'Original is planned for:' : 'Currently planned for:'} <span className="font-mono">{new Date(`${getLocalDateString(movingTask.date, userTimezone)}T12:00:00Z`).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</span>
                </p>
              </div>

              <div>
                <label htmlFor="page-new-date" className="block text-[11.5px] font-semibold text-muted-foreground mb-1.5">{moveMode === 'copy' ? 'Date for the copy' : 'New date'}</label>
                <input id="page-new-date" 
                  type="date"
                  required
                  value={moveDate}
                  onChange={(e) => setMoveDate(e.target.value)}
                                   className="w-full bg-surface-raised border border-border rounded-md px-3 py-2.5 text-foreground text-xs focus:outline-none focus:border-border-strong"
                />
              </div>

              {moveMode === 'copy' && !moveDate && (
                <p className="text-[12px] text-ink-secondary" role="status">Pick the day the copy should be on.</p>
              )}

              {moveMode === 'move' && <div>
                <label htmlFor="page-reason-optional" className="block text-[11.5px] font-semibold text-muted-foreground mb-1.5">Reason (optional)</label>
                <input id="page-reason-optional" 
                  type="text"
                  value={moveReason}
                  onChange={(e) => setMoveReason(e.target.value)}
                  placeholder="e.g. waiting on results, needs a longer focus block"
                  className="w-full bg-surface-raised border border-border rounded-md px-3 py-2.5 text-foreground text-xs focus:outline-none focus:border-border-strong"
                />
              </div>}

              <div className="flex justify-end gap-2.5 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsMoveModalOpen(false)}
                  className="px-3.5 py-2 border border-border hover:border-border-strong text-muted-foreground hover:text-foreground rounded-md text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!moveDate}
                  className="px-4.5 py-2 bg-primary hover:bg-primary-hover text-primary-foreground font-bold rounded-full text-xs flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {moveMode === 'copy' ? 'Create copy' : 'Move task'}
                </button>
              </div>
            </form>
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
                  className="px-5 py-2.5 bg-success hover:bg-success text-black text-sm font-bold rounded-md transition-colors cursor-pointer font-bold"
                >
                  Mark done
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {slotPickerModal.isOpen && slotPickerModal.task && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md bg-card border border-border rounded-lg p-6 shadow-[var(--shadow-modal)] space-y-5">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-success" /> Mark time slots done
              </h3>
              <button
                onClick={() => setSlotPickerModal({ isOpen: false, task: null })}
                className="p-1 rounded-lg hover:bg-surface-sunken text-muted-foreground" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <span className="text-[11.5px] font-mono text-muted-foreground block font-light">Task</span>
              <p className="text-foreground font-semibold text-sm mt-0.5">{slotPickerModal.task.name}</p>
            </div>

            <p className="text-xs text-muted-foreground">
              This task has several time slots. Check off the ones you completed. The task’s status and actual time are based on your selection.
            </p>

            <div className="space-y-1.5">
              {events
                .filter((e: any) => e.taskId === slotPickerModal.task!.id)
                .map((slot: any) => (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => toggleTaskSlotCompletion(slotPickerModal.task!.id, slot.id, !slot.completed)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md border border-border hover:border-border-strong bg-surface-raised/40 hover:bg-surface-sunken transition-colors text-left"
                  >
                    {slot.completed ? (
                      <CheckCircle2 className="w-4.5 h-4.5 shrink-0 text-success" />
                    ) : (
                      <Circle className="w-4.5 h-4.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className={`text-sm font-medium ${slot.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                      {getTimeInTimezone(slot.start, userTimezone)} – {getTimeInTimezone(slot.end, userTimezone)}
                    </span>
                  </button>
                ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setSlotPickerModal({ isOpen: false, task: null })}
                className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-primary-foreground text-sm font-bold rounded-full transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export const dynamic = 'force-dynamic';
