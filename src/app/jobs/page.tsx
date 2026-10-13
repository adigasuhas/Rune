'use client';

import React, { useState, useEffect, useRef } from 'react';
import { LoadError } from '@/components/LoadError';
import Link from 'next/link';
import { useSession } from '@/context/SessionContext';
import { useNotifications } from '@/context/NotificationContext';
import { useConfirm } from '@/components/ConfirmDialog';
import {
  Plus,
  Cpu,
  Trash2,
  Terminal,
  Activity,
  Clock,
  Search,
  Filter,
  ArrowUpDown,
  CheckCircle2,
  X,
  History,
  FileDown,
  Star,
  Bell,
  AlertTriangle,
  Pin,
  ChevronDown,
  Pencil,
} from 'lucide-react';
import { getLocalDateString } from '@/lib/dateUtils';
import { ClockTimePicker } from '@/components/ClockTimePicker';
import { Modal } from '@/components/Modal';
import { Button, EmptyState, PageHeader, SectionHeader } from '@/components/ui';
import type { Instrument, Attempt, Job, Task } from './types';
import {
  splitDateTime,
  combineDateTime,
  parseMaxRuntimeToMinutes,
  formatDateTimeLocal,
  getActualAttemptMinutes as getActualAttemptMinutesPure,
  getJobElapsedMinutes as getJobElapsedMinutesPure,
} from './jobHelpers';

export default function JobMonitorPage() {
  const { user, loading: sessionLoading } = useSession();
  const { toast, notify } = useNotifications();
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'instruments' | 'timeline'>('dashboard');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Data States
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notebookPages, setNotebookPages] = useState<Array<{ id: string; title: string; notebookTitle: string }>>([]);
  const [loading, setLoading] = useState(true);

  // Time / Tickers
  const [now, setNow] = useState<Date>(new Date());

  // Job check-in reminder cadence (global defaults from Settings)
  const [jobReminderDefaultMins, setJobReminderDefaultMins] = useState(15);
  const [jobReminderRecurringMins, setJobReminderRecurringMins] = useState(10);

  // Modal control
  const [isInstrumentModalOpen, setIsInstrumentModalOpen] = useState(false);
  const [isJobModalOpen, setIsJobModalOpen] = useState(false);
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [isResubmitModalOpen, setIsResubmitModalOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isAttemptHistoryOpen, setIsAttemptHistoryOpen] = useState(false);
  const [editingInstrument, setEditingInstrument] = useState<Instrument | null>(null);
  const [editingJob, setEditingJob] = useState<Job | null>(null);

  // 1. Add Instrument Form States
  const [instName, setInstName] = useState('');
  const [instCategory, setInstCategory] = useState('HPC');
  const [instTeamId, setInstTeamId] = useState('');
  const [myTeams, setMyTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [instCustomCategory, setInstCustomCategory] = useState('');
  const [instRam, setInstRam] = useState('');
  const [instCpuArch, setInstCpuArch] = useState('');
  const [instNodes, setInstNodes] = useState('');
  const [instCores, setInstCores] = useState('');
  const [instGpuNodes, setInstGpuNodes] = useState('');
  const [instGpusPerNode, setInstGpusPerNode] = useState('');
  const [instGpuModel, setInstGpuModel] = useState('');
  const [instGpuMemory, setInstGpuMemory] = useState('');
  const [instHardwareSpecs, setInstHardwareSpecs] = useState('');
  const [instRuntimeType, setInstRuntimeType] = useState('fixed'); // fixed or slots
  const [instMaxRuntime, setInstMaxRuntime] = useState('24:00');
  const [instSlots, setInstSlots] = useState<string[]>(['30m', '1h', '6h', '12h', '24h']);
  const [newSlotVal, setNewSlotVal] = useState('');

  // 2. New Run Form States
  const [jobName, setJobName] = useState('');
  const [jobTaskId, setJobTaskId] = useState('');
  const [jobNotebookPageId, setJobNotebookPageId] = useState('');
  const [jobCategory, setJobCategory] = useState('General'); // General | HPC | Scientific Instrument | CUSTOM
  const [jobCustomCategory, setJobCustomCategory] = useState('');
  const [showRunMoreOptions, setShowRunMoreOptions] = useState(false);
  const [jobInstrumentId, setJobInstrumentId] = useState('');
  const [jobType, setJobType] = useState<'cpu' | 'gpu'>('cpu'); // for HPC
  const [jobQueue, setJobQueue] = useState('standard'); // for HPC
  const [jobStatus, setJobStatus] = useState('Queued');
  const [jobSubmitId, setJobSubmitId] = useState('');
  const [jobSubmitTime, setJobSubmitTime] = useState('');
  const [jobProjStartTime, setJobProjStartTime] = useState('');
  const [jobProjCompletionTime, setJobProjCompletionTime] = useState('');
  const [userOverriddenCompletionTime, setUserOverriddenCompletionTime] = useState(false);
  const [jobRuntimePreset, setJobRuntimePreset] = useState('');
  const [jobRuntimeCustom, setJobRuntimeCustom] = useState('60'); // in minutes
  const [jobInputFile, setJobInputFile] = useState('');
  const [jobWorkDir, setJobWorkDir] = useState('');
  const [jobSampleName, setJobSampleName] = useState('');
  const [jobSampleId, setJobSampleId] = useState('');
  const [jobNotes, setJobNotes] = useState('');
  const [jobTags, setJobTags] = useState('');
  const [jobReminders, setJobReminders] = useState<{ enabled: boolean }>({ enabled: true });

  // 3. Complete Job Form States
  const [compEndTime, setCompEndTime] = useState('');
  const [compNotes, setCompNotes] = useState('');
  const [compStatus, setCompStatus] = useState('Completed');

  // 4. Report Failure & Resubmit Form States
  const [failReason, setFailReason] = useState('Wall-time exceeded');
  const [failCustomReason, setFailCustomReason] = useState('');
  const [failNotes, setFailNotes] = useState('');
  const [resubJobId, setResubJobId] = useState('');
  const [resubSubmitTime, setResubSubmitTime] = useState('');
  const [resubProjStartTime, setResubProjStartTime] = useState('');
  const [resubComputeTime, setResubComputeTime] = useState('');
  const [resubInputFile, setResubInputFile] = useState('');
  const [resubWorkDir, setResubWorkDir] = useState('');
  const [failTermStatus, setFailTermStatus] = useState('Failed');
  const [failEndTime, setFailEndTime] = useState('');

  // Search & Filter History
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [instrumentFilter, setInstrumentFilter] = useState('ALL');
  const [sortField, setSortField] = useState<'submitTime' | 'name' | 'computeTime' | 'attempts'>('submitTime');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Live-tab table: which run's detail row is open.
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  // User Timezone
  const [userTimezone] = useState<string>(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch (e) {
      return 'UTC';
    }
  });

  // Thin closures over `now` (the 1s-ticking clock) so every existing call
  // site below keeps working unchanged - the actual logic is the pure,
  // independently-testable versions in jobHelpers.ts.
  const getActualAttemptMinutes = (att: Attempt, parentJobStatus: string) => getActualAttemptMinutesPure(att, parentJobStatus, now);
  const getJobElapsedMinutes = (job: Job) => getJobElapsedMinutesPure(job, now);

  // Tick clock & notify completed jobs based on projection
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch initial data
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [instRes, jobsRes, tasksRes, settingsRes, pagesRes] = await Promise.all([
          fetch('/api/instruments'),
          fetch('/api/jobs'),
          fetch('/api/tasks'),
          fetch('/api/settings'),
          fetch('/api/notebook-pages')
        ]);
        setLoadFailed(![instRes, jobsRes].every((r) => r.ok));
        if (instRes.ok) setInstruments(await instRes.json());
        if (jobsRes.ok) {
          const list: Job[] = await jobsRes.json();
          // Sort list such that pinned items are always at top
          setJobs(list);
        }
        if (tasksRes.ok) setTasks(await tasksRes.json());
        if (pagesRes.ok) setNotebookPages(await pagesRes.json());
        fetch('/api/teams').then(r => r.ok ? r.json() : []).then((d: any[]) => setMyTeams(Array.isArray(d) ? d.map(t => ({ id: t.id, name: t.name })) : [])).catch(() => {});
        if (settingsRes.ok) {
          const s = await settingsRes.json();
          setJobReminderDefaultMins(s.jobReminderDefaultMins ?? 15);
          setJobReminderRecurringMins(s.jobReminderRecurringMins ?? 10);
        }
      } catch (err) {
        setLoadFailed(true);
        console.error('Error fetching jobs monitor details:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [refreshTrigger]);

  // Deep-link from a \run{} reference clicked in the notebook - see
  // NotebookView.tsx's reference-click handler, which stashes the target
  // id here rather than a URL param (same handoff pattern as the tasks
  // page's notification deep-link).
  useEffect(() => {
    if (loading) return;
    let deepLinkId: string | null = null;
    try { deepLinkId = sessionStorage.getItem('rune-deep-link-run-id'); } catch { /* private mode */ }
    if (!deepLinkId) return;
    try { sessionStorage.removeItem('rune-deep-link-run-id'); } catch { /* ignore */ }
    if (!jobs.some(j => j.id === deepLinkId)) return;
    const id = deepLinkId;
    setExpandedJobId(id);
    requestAnimationFrame(() => {
      document.getElementById(`job-row-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [loading, jobs]);

  // Initialize failure and resubmit form states when modal opens
  useEffect(() => {
    if (isResubmitModalOpen && selectedJob) {
      setFailTermStatus('Failed');
      setFailEndTime(formatDateTimeLocal(new Date()));
      setFailReason('Wall-time exceeded');
      setFailCustomReason('');
      setFailNotes('');
      
      setResubJobId('');
      setResubComputeTime('');
      setResubSubmitTime(selectedJob.submitTime ? formatDateTimeLocal(new Date(selectedJob.submitTime)) : formatDateTimeLocal(new Date()));
      setResubProjStartTime(selectedJob.projectedStartTime ? formatDateTimeLocal(new Date(selectedJob.projectedStartTime)) : formatDateTimeLocal(new Date()));
      setResubInputFile('');
      setResubWorkDir('');
    }
  }, [isResubmitModalOpen, selectedJob]);

  // Automatically transition queued jobs to running when projected start time is reached
  useEffect(() => {
    const nowMs = now.getTime();
    const jobsToTransition = jobs.filter(job => {
      if (job.status !== 'Queued' || !job.projectedStartTime) return false;
      const startTimeMs = new Date(job.projectedStartTime).getTime();
      return nowMs >= startTimeMs;
    });

    if (jobsToTransition.length > 0) {
      const runTransitions = async () => {
        for (const job of jobsToTransition) {
          try {
            const updatedAttempts = [...job.attempts];
            if (updatedAttempts.length > 0) {
              const lastIdx = updatedAttempts.length - 1;
              updatedAttempts[lastIdx] = {
                ...updatedAttempts[lastIdx],
                status: 'Running'
              };
            }
            await fetch(`/api/jobs/${job.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                status: 'Running',
                attempts: updatedAttempts
              })
            });
            toast('Run started', `“${job.name}” started at its projected start time.`, 'info');
          } catch (err) {
            console.error('Error auto-transitioning job:', err);
          }
        }
        setRefreshTrigger(prev => prev + 1);
      };
      runTransitions();
    }
  }, [now, jobs]);

  // Job check-in reminders: first reminder jobReminderDefaultMins after a job starts running,
  // then a repeat reminder every jobReminderRecurringMins after that, until it terminates.
  // Client-side ref only avoids re-POSTing every tick; the server's (userId, dedupeKey) unique
  // constraint is what actually prevents duplicate/repeat toasts across reloads (see notify()).
  const lastNotifiedBucket = useRef<Record<string, number>>({});
  useEffect(() => {
    jobs.forEach(job => {
      if (job.status !== 'Running') return;
      if (job.reminders?.enabled === false) return;
      const startRef = job.projectedStartTime || job.submitTime;
      if (!startRef) return;

      const elapsedMins = (now.getTime() - new Date(startRef).getTime()) / 60000;
      if (elapsedMins < jobReminderDefaultMins) return;

      const cadence = Math.max(jobReminderRecurringMins, 1);
      const bucket = Math.floor((elapsedMins - jobReminderDefaultMins) / cadence);
      if (lastNotifiedBucket.current[job.id] === bucket) return;
      lastNotifiedBucket.current[job.id] = bucket;

      notify({
        type: bucket === 0 ? 'JOB_REMINDER' : 'JOB_RECURRING',
        title: bucket === 0 ? 'Run check-in' : 'Run check-in (repeat)',
        body: `“${job.name}” has been running for about ${Math.round(elapsedMins)} minutes. Check whether it has failed.`,
        sourceType: 'Job',
        sourceId: job.id,
        dedupeKey: `job:${job.id}:checkin:${bucket}`
      });
    });
  }, [now, jobs, jobReminderDefaultMins, jobReminderRecurringMins, notify]);

  // ETA-aware alerts, alongside (not replacing) the fixed-cadence check-in
  // above: one notification when a Running run crosses into the same
  // "≤30 min to projected end" window already used for the completingSoon
  // stat tile/card highlight, and one when it's past that projection and
  // still non-terminal. Threshold-crossing, so a client-side ref (not the
  // bucket-cadence math above) is enough to avoid re-firing every tick; the
  // server's (userId, dedupeKey) unique constraint guards duplicates across reloads.
  const notifiedApproachingEnd = useRef<Set<string>>(new Set());
  const notifiedOverdue = useRef<Set<string>>(new Set());
  useEffect(() => {
    jobs.forEach(job => {
      if (job.status !== 'Running' || !job.projectedCompletionTime) return;
      const remainingMs = new Date(job.projectedCompletionTime).getTime() - now.getTime();

      if (remainingMs > 0 && remainingMs <= 30 * 60 * 1000 && !notifiedApproachingEnd.current.has(job.id)) {
        notifiedApproachingEnd.current.add(job.id);
        notify({
          type: 'RUN_APPROACHING_END',
          title: 'Run almost finished',
          body: `“${job.name}” is projected to finish in about ${Math.round(remainingMs / 60000)} minutes.`,
          sourceType: 'Job',
          sourceId: job.id,
          dedupeKey: `run:${job.id}:approaching`
        });
      }

      if (remainingMs <= 0 && !notifiedOverdue.current.has(job.id)) {
        notifiedOverdue.current.add(job.id);
        notify({
          type: 'RUN_OVERDUE',
          title: 'Run overdue',
          body: `“${job.name}” is past its projected finish time and still running.`,
          sourceType: 'Job',
          sourceId: job.id,
          dedupeKey: `run:${job.id}:overdue`
        });
      }
    });
  }, [now, jobs, notify]);

  // Helper: Format DateTime for Input

  // Trigger default times on schedule job status select
  useEffect(() => {
    if (isJobModalOpen && !editingJob) {
      const dtNow = new Date();
      if (!jobSubmitTime) {
        setJobSubmitTime(formatDateTimeLocal(dtNow));
      }
      if (jobStatus === 'Running') {
        if (!jobProjStartTime) {
          setJobProjStartTime(jobSubmitTime || formatDateTimeLocal(dtNow));
        }
      } else {
        setJobProjStartTime('');
      }
    }
  }, [jobStatus, isJobModalOpen, editingJob, jobSubmitTime]);

  // Enforce Projected Start Time to be not earlier than Submission Date / Time
  useEffect(() => {
    if (jobSubmitTime && jobProjStartTime) {
      const submitDate = new Date(jobSubmitTime);
      const projStartDate = new Date(jobProjStartTime);
      if (!isNaN(submitDate.getTime()) && !isNaN(projStartDate.getTime())) {
        if (projStartDate.getTime() < submitDate.getTime()) {
          setJobProjStartTime(jobSubmitTime);
        }
      }
    }
  }, [jobSubmitTime, jobProjStartTime]);

  // Enforce Resubmission Projected Start Time to be not earlier than Submission Date / Time
  useEffect(() => {
    if (resubSubmitTime && resubProjStartTime) {
      const submitDate = new Date(resubSubmitTime);
      const projStartDate = new Date(resubProjStartTime);
      if (!isNaN(submitDate.getTime()) && !isNaN(projStartDate.getTime())) {
        if (projStartDate.getTime() < submitDate.getTime()) {
          setResubProjStartTime(resubSubmitTime);
        }
      }
    }
  }, [resubSubmitTime, resubProjStartTime]);

  const closeInstrumentModal = () => {
    setIsInstrumentModalOpen(false);
    setEditingInstrument(null);
    setInstName('');
    setInstRam('');
    setInstCpuArch('');
    setInstNodes('');
    setInstCores('');
    setInstGpuNodes('');
    setInstGpusPerNode('');
    setInstGpuModel('');
    setInstGpuMemory('');
    setInstHardwareSpecs('');
    setInstRuntimeType('fixed');
    setInstMaxRuntime('24:00');
    setInstSlots(['30m', '1h', '6h', '12h', '24h']);
    setInstCustomCategory('');
    setInstTeamId('');
  };

  const openEditInstrumentModal = (inst: Instrument) => {
    setEditingInstrument(inst);
    setInstName(inst.name);
    setInstCategory(inst.category === 'HPC' || inst.category === 'Scientific Instrument' ? inst.category : 'CUSTOM');
    setInstCustomCategory(inst.category === 'HPC' || inst.category === 'Scientific Instrument' ? '' : inst.category);
    setInstRam(inst.ram || '');
    setInstCpuArch(inst.cpuArch || '');
    setInstNodes(inst.nodes ? String(inst.nodes) : '');
    setInstCores(inst.coresPerNode ? String(inst.coresPerNode) : '');
    setInstGpuNodes(inst.gpuNodes ? String(inst.gpuNodes) : '');
    setInstGpusPerNode(inst.gpusPerNode ? String(inst.gpusPerNode) : '');
    setInstGpuModel(inst.gpuModel || '');
    setInstGpuMemory(inst.gpuMemory || '');
    setInstHardwareSpecs(inst.hardwareSpecs || '');
    setInstRuntimeType(inst.runtimeType || 'fixed');
    setInstMaxRuntime(inst.maxRuntime || '24:00');
    setInstSlots(inst.slots || ['30m', '1h', '6h', '12h', '24h']);
    setInstTeamId(inst.teamId || '');
    setIsInstrumentModalOpen(true);
  };

  // Form Submit: Create or Update Instrument
  const handleCreateInstrument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instName) return;

    const payload = {
      id: editingInstrument?.id,
      name: instName,
      category: instCategory === 'CUSTOM' ? instCustomCategory : instCategory,
      ram: instRam || undefined,
      cpuArch: instCpuArch || undefined,
      nodes: instNodes ? Number(instNodes) : undefined,
      coresPerNode: instCores ? Number(instCores) : undefined,
      gpuNodes: instGpuNodes ? Number(instGpuNodes) : undefined,
      gpusPerNode: instGpusPerNode ? Number(instGpusPerNode) : undefined,
      gpuModel: instGpuModel || undefined,
      gpuMemory: instGpuMemory || undefined,
      hardwareSpecs: instHardwareSpecs || undefined,
      runtimeType: instRuntimeType,
      maxRuntime: instRuntimeType === 'fixed' ? instMaxRuntime : undefined,
      slots: instRuntimeType === 'slots' ? instSlots : [],
      teamId: instTeamId || null
    };

    try {
      const url = '/api/instruments';
      const method = editingInstrument ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        closeInstrumentModal();
        setRefreshTrigger(prev => prev + 1);
        toast(
          editingInstrument ? 'Instrument updated' : 'Instrument added',
          `“${instName}” was ${editingInstrument ? 'updated' : 'added'}.`,
          'success'
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Toggle favorite instrument
  const toggleFavoriteInstrument = async (id: string, currentFav: boolean) => {
    try {
      const res = await fetch('/api/instruments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isFavorite: !currentFav })
      });
      if (res.ok) {
        setRefreshTrigger(prev => prev + 1);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Delete Instrument
  const handleDeleteInstrument = async (id: string) => {
    if (!(await confirm({ title: 'Delete this instrument?', message: 'Every run linked to it is deleted too. You can’t undo this.', confirmLabel: 'Delete instrument', danger: true }))) return;
    try {
      const res = await fetch(`/api/instruments?id=${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setRefreshTrigger(prev => prev + 1);
        toast('Instrument deleted', 'The instrument was removed.', 'info');
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Parses an instrument's predefined runtime slot ("30m", "6h", "24h") into
  // minutes. Shared by getSelectedRuntimeMinutes and the preset picker, so a
  // preset selection can also update the always-visible Expected Duration
  // field (jobRuntimeCustom) instead of only affecting it indirectly.
  const parseSlotMinutes = (preset: string): number => {
    const num = parseInt(preset, 10);
    if (isNaN(num)) return 60;
    if (preset.endsWith('h')) return num * 60;
    return num; // 'm' suffix or a bare number of minutes
  };

  // Auto completion time calc on job schedule
  const getSelectedRuntimeMinutes = () => {
    if (jobRuntimePreset && jobRuntimePreset !== 'custom') {
      return parseSlotMinutes(jobRuntimePreset);
    }
    return Number(jobRuntimeCustom) || 60;
  };

  const closeJobModal = () => {
    setIsJobModalOpen(false);
    setEditingJob(null);
    setJobName('');
    setJobTaskId('');
    setJobNotebookPageId('');
    setJobCategory('General');
    setJobCustomCategory('');
    setShowRunMoreOptions(false);
    setJobInstrumentId('');
    setJobType('cpu');
    setJobQueue('standard');
    setJobStatus('Queued');
    setJobSubmitId('');
    setJobSubmitTime('');
    setJobProjStartTime('');
    setJobProjCompletionTime('');
    setUserOverriddenCompletionTime(false);
    setJobRuntimePreset('');
    setJobRuntimeCustom('60');
    setJobInputFile('');
    setJobWorkDir('');
    setJobSampleName('');
    setJobSampleId('');
    setJobNotes('');
    setJobReminders({ enabled: true });
    setJobTags('');
  };

  const openScheduleJobModal = () => {
    setEditingJob(null);
    setJobName('');
    setJobTaskId('');
    setJobNotebookPageId('');
    setJobCategory('General');
    setJobCustomCategory('');
    setShowRunMoreOptions(false);
    setJobInstrumentId('');
    setJobType('cpu');
    setJobQueue('standard');
    setJobStatus('Queued');
    setJobSubmitId('');
    
    // Set default times to current time
    const dtNow = new Date();
    setJobSubmitTime(formatDateTimeLocal(dtNow));
    setJobProjStartTime('');
    setJobProjCompletionTime('');
    setUserOverriddenCompletionTime(false);
    
    setJobRuntimePreset('');
    setJobRuntimeCustom('60');
    setJobInputFile('');
    setJobWorkDir('');
    setJobSampleName('');
    setJobSampleId('');
    setJobNotes('');
    setJobReminders({ enabled: true });
    setJobTags('');
    setIsJobModalOpen(true);
  };

  const openEditJobModal = (job: Job) => {
    setEditingJob(job);
    setJobName(job.name);
    setJobTaskId(job.taskId || '');
    setJobNotebookPageId((job as any).notebookPageId || '');
    const knownCategories = ['General', 'HPC', 'Scientific Instrument'];
    setJobCategory(knownCategories.includes(job.category) ? job.category : 'CUSTOM');
    setJobCustomCategory(knownCategories.includes(job.category) ? '' : job.category);
    setShowRunMoreOptions(false);
    setJobInstrumentId(job.instrumentId || '');
    setJobType(job.isGpu ? 'gpu' : 'cpu');
    setJobQueue(job.queue || 'standard');
    setJobStatus(job.status);
    setJobSubmitId(job.jobId || '');
    setJobSubmitTime(formatDateTimeLocal(new Date(job.submitTime)));
    setJobProjStartTime(job.projectedStartTime ? formatDateTimeLocal(new Date(job.projectedStartTime)) : '');
    setJobProjCompletionTime(job.projectedCompletionTime ? formatDateTimeLocal(new Date(job.projectedCompletionTime)) : '');
    
    // Determine if manual override of projected completion time was used
    const startStr = job.projectedStartTime || job.submitTime;
    let isOverridden = false;
    if (startStr && job.projectedCompletionTime) {
      const startDate = new Date(startStr);
      const completionDate = new Date(job.projectedCompletionTime);
      const calculatedCompletionDate = new Date(startDate.getTime() + job.computeTime * 60 * 1000);
      if (Math.abs(completionDate.getTime() - calculatedCompletionDate.getTime()) > 60000) {
        isOverridden = true;
      }
    }
    setUserOverriddenCompletionTime(isOverridden);
    
    // Determine runtime preset vs custom
    const inst = instruments.find(i => i.id === job.instrumentId);
    if (inst && inst.runtimeType === 'slots') {
      const matchSlot = inst.slots.find(s => {
        let mins = parseInt(s);
        if (s.endsWith('h')) mins *= 60;
        return mins === job.computeTime;
      });
      if (matchSlot) {
        setJobRuntimePreset(matchSlot);
      } else {
        setJobRuntimePreset('custom');
        setJobRuntimeCustom(String(job.computeTime));
      }
    } else {
      setJobRuntimePreset('');
      setJobRuntimeCustom(String(job.computeTime));
    }
    
    setJobInputFile(job.inputFile || '');
    setJobWorkDir(job.workingDirectory || '');
    setJobSampleName(job.sampleName || '');
    setJobSampleId(job.sampleId || '');
    setJobNotes(job.notes || '');
    setJobReminders({ enabled: job.reminders?.enabled !== false });
    setJobTags((job.reminders as any)?.tags?.join(', ') || '');
    setIsJobModalOpen(true);
  };

  // Automatically recalculate projected completion time when submitTime, projStartTime or duration changes
  useEffect(() => {
    if (!userOverriddenCompletionTime) {
      const startStr = jobProjStartTime || jobSubmitTime;
      if (startStr) {
        const startDate = new Date(startStr);
        const durationMins = getSelectedRuntimeMinutes();
        if (!isNaN(startDate.getTime())) {
          const completionDate = new Date(startDate.getTime() + durationMins * 60 * 1000);
          setJobProjCompletionTime(formatDateTimeLocal(completionDate));
        }
      }
    }
  }, [jobSubmitTime, jobProjStartTime, jobRuntimePreset, jobRuntimeCustom, userOverriddenCompletionTime]);

  // Form Submit: Schedule or Edit Job
  const handleScheduleJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobName) return;

    const runtimeMins = getSelectedRuntimeMinutes();
    const projStart = jobProjStartTime ? new Date(jobProjStartTime) : null;
    const submitDate = jobSubmitTime ? new Date(jobSubmitTime) : new Date();

    if (projStart && submitDate && projStart.getTime() < submitDate.getTime()) {
      toast('Check the times', 'The projected start can’t be earlier than the submission time.', 'error');
      return;
    }

    const projComp = jobProjCompletionTime ? new Date(jobProjCompletionTime) : null;
    const isTerminal = ['Completed', 'Failed', 'Cancelled', 'Timed Out'].includes(jobStatus);
    const updatedAttempts = editingJob ? [...editingJob.attempts] : [];
    if (editingJob && updatedAttempts.length > 0) {
      const lastIdx = updatedAttempts.length - 1;
      updatedAttempts[lastIdx] = {
        ...updatedAttempts[lastIdx],
        status: jobStatus,
        submitTime: jobSubmitTime ? new Date(jobSubmitTime).toISOString() : updatedAttempts[lastIdx].submitTime,
        projectedStartTime: projStart ? projStart.toISOString() : undefined,
        computeTime: runtimeMins,
        inputFile: jobInputFile || undefined,
        workingDirectory: jobWorkDir || undefined,
        actualEndTime: isTerminal 
          ? (updatedAttempts[lastIdx].actualEndTime || new Date().toISOString())
          : undefined
      };
    }

    const resolvedCategory = jobCategory === 'CUSTOM' ? (jobCustomCategory || 'General') : jobCategory;
    const isHpc = jobCategory === 'HPC';
    const isBench = jobCategory === 'Scientific Instrument';

    const payload = {
      name: jobName,
      taskId: jobTaskId || undefined,
      notebookPageId: jobNotebookPageId || null,
      category: resolvedCategory,
      instrumentId: jobInstrumentId || undefined,
      isCpu: isHpc ? jobType === 'cpu' : true,
      isGpu: isHpc ? jobType === 'gpu' : false,
      queue: isHpc ? (jobQueue || undefined) : null,
      status: jobStatus,
      jobId: jobSubmitId || undefined,
      submitTime: jobSubmitTime ? new Date(jobSubmitTime) : new Date(),
      projectedStartTime: projStart,
      projectedCompletionTime: projComp,
      computeTime: runtimeMins,
      inputFile: isHpc ? (jobInputFile || undefined) : null,
      workingDirectory: isHpc ? (jobWorkDir || undefined) : null,
      sampleName: isBench ? (jobSampleName || undefined) : null,
      sampleId: isBench ? (jobSampleId || undefined) : null,
      reminders: {
        ...jobReminders,
        tags: jobTags.split(',').map(t => t.trim()).filter(Boolean)
      },
      notes: jobNotes,
      actualEndTime: editingJob 
        ? (isTerminal ? (editingJob.actualEndTime || new Date()) : null)
        : null,
      attempts: editingJob ? updatedAttempts : [
        {
          attemptNumber: 1,
          jobId: jobSubmitId || undefined,
          status: jobStatus,
          submitTime: jobSubmitTime ? new Date(jobSubmitTime).toISOString() : new Date().toISOString(),
          projectedStartTime: projStart ? projStart.toISOString() : undefined,
          computeTime: runtimeMins,
          inputFile: jobInputFile || undefined,
          workingDirectory: jobWorkDir || undefined
        }
      ]
    };

    try {
      const url = editingJob ? `/api/jobs/${editingJob.id}` : '/api/jobs';
      const method = editingJob ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        closeJobModal();
        setRefreshTrigger(prev => prev + 1);
        toast(
          editingJob ? 'Run updated' : 'Run created',
          `“${jobName}” was ${editingJob ? 'updated' : 'created'}.`,
          'success'
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Complete Job Form Submit
  const handleCompleteJobSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJob) return;

    const actualEnd = compEndTime ? new Date(compEndTime) : new Date();
    
    // Update attempts array status
    const updatedAttempts = [...selectedJob.attempts];
    if (updatedAttempts.length > 0) {
      const lastIdx = updatedAttempts.length - 1;
      updatedAttempts[lastIdx] = {
        ...updatedAttempts[lastIdx],
        status: compStatus,
        actualEndTime: actualEnd.toISOString()
      };
    }

    try {
      const res = await fetch(`/api/jobs/${selectedJob.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: compStatus,
          actualEndTime: actualEnd,
          notes: compNotes ? `${selectedJob.notes || ''}\n[Completion Note]: ${compNotes}` : selectedJob.notes,
          attempts: updatedAttempts
        })
      });

      if (res.ok) {
        setIsCompleteModalOpen(false);
        setSelectedJob(null);
        setRefreshTrigger(prev => prev + 1);
        toast('Run finished', `Marked as ${compStatus}.`, 'success');
        notify({
          type: 'JOB_TERMINATION',
          title: 'Run finished',
          body: `“${selectedJob.name}” finished with status ${compStatus}.`,
          sourceType: 'Job',
          sourceId: selectedJob.id,
          dedupeKey: `job:${selectedJob.id}:termination`
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Report Failure & Resubmit Attempt
  const handleResubmitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJob) return;

    const nowStr = new Date().toISOString();
    const updatedAttempts = [...selectedJob.attempts];
    
    // 1. Close current active attempt as Failed/Cancelled/Timed Out
    if (updatedAttempts.length > 0) {
      const lastIdx = updatedAttempts.length - 1;
      updatedAttempts[lastIdx] = {
        ...updatedAttempts[lastIdx],
        status: failTermStatus,
        actualEndTime: nowStr,
        failureReason: failReason === 'OTHER' ? failCustomReason : failReason,
        failureNotes: failNotes
      };
    }

    // 2. Append new execution attempt
    const newAttemptNum = updatedAttempts.length + 1;
    const computedRuntime = resubComputeTime ? Number(resubComputeTime) : selectedJob.computeTime;
    const newSubmit = resubSubmitTime ? new Date(resubSubmitTime) : new Date();
    const newProjStart = resubProjStartTime ? new Date(resubProjStartTime) : newSubmit;
    const newProjComp = new Date(newProjStart.getTime() + computedRuntime * 60 * 1000);

    const isQueued = newProjStart.getTime() > new Date().getTime();
    const newStatus = isQueued ? 'Queued' : 'Running';

    const newAttempt: Attempt = {
      attemptNumber: newAttemptNum,
      jobId: resubJobId || undefined,
      status: newStatus,
      submitTime: newSubmit.toISOString(),
      projectedStartTime: newProjStart.toISOString(),
      computeTime: computedRuntime,
      inputFile: resubInputFile || selectedJob.inputFile || undefined,
      workingDirectory: resubWorkDir || selectedJob.workingDirectory || undefined
    };

    updatedAttempts.push(newAttempt);

    try {
      const res = await fetch(`/api/jobs/${selectedJob.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus, // Transition main job back to Running or Queued
          jobId: resubJobId || selectedJob.jobId,
          submitTime: newSubmit,
          projectedStartTime: newProjStart,
          projectedCompletionTime: newProjComp,
          computeTime: computedRuntime,
          inputFile: resubInputFile || selectedJob.inputFile,
          workingDirectory: resubWorkDir || selectedJob.workingDirectory,
          actualEndTime: null,
          attempts: updatedAttempts
        })
      });

      if (res.ok) {
        setIsResubmitModalOpen(false);
        setSelectedJob(null);
        setRefreshTrigger(prev => prev + 1);
        toast(
          isQueued ? 'Run queued' : 'Run resubmitted',
          isQueued ? `Attempt ${newAttemptNum} is queued.` : `Attempt ${newAttemptNum} started.`,
          'success'
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Report failure Job
  const handleFailureAndTerminate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJob) return;

    const actualEnd = failEndTime ? new Date(failEndTime) : new Date();
    if (failReason === 'OTHER' && !failCustomReason.trim()) {
      toast('Reason required', 'Enter a failure reason.', 'error');
      return;
    }
    const resolvedReason = failReason === 'OTHER' ? failCustomReason : failReason;
    const finalStatus = failTermStatus;

    const updatedAttempts = [...selectedJob.attempts];
    if (updatedAttempts.length > 0) {
      const lastIdx = updatedAttempts.length - 1;
      updatedAttempts[lastIdx] = {
        ...updatedAttempts[lastIdx],
        status: finalStatus,
        actualEndTime: actualEnd.toISOString(),
        failureReason: resolvedReason,
        failureNotes: failNotes
      };
    }

    try {
      const res = await fetch(`/api/jobs/${selectedJob.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: finalStatus,
          actualEndTime: actualEnd,
          notes: failNotes ? `${selectedJob.notes || ''}\n[Failure Note]: ${failNotes}` : selectedJob.notes,
          attempts: updatedAttempts
        })
      });

      if (res.ok) {
        setIsResubmitModalOpen(false);
        setSelectedJob(null);
        setRefreshTrigger(prev => prev + 1);
        toast('Run ended', `Marked as ${finalStatus}.`, 'error');
        notify({
          type: 'JOB_TERMINATION',
          title: 'Run ended',
          body: `“${selectedJob.name}” ended with status ${finalStatus}${resolvedReason ? ` (${resolvedReason})` : ''}.`,
          sourceType: 'Job',
          sourceId: selectedJob.id,
          dedupeKey: `job:${selectedJob.id}:termination`
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Toggle Pinned status on dashboard
  const togglePinJob = async (id: string, currentPin: boolean) => {
    try {
      await fetch(`/api/jobs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPinned: !currentPin })
      });
      setRefreshTrigger(prev => prev + 1);
    } catch (e) {
      console.error(e);
    }
  };

  // Duplicate / Resubmit past job templates
  const handleDuplicateJob = (job: Job) => {
    setEditingJob(null);
    setJobName(`${job.name} (copy)`);
    const knownCategories = ['General', 'HPC', 'Scientific Instrument'];
    setJobCategory(knownCategories.includes(job.category) ? job.category : 'CUSTOM');
    setJobCustomCategory(knownCategories.includes(job.category) ? '' : job.category);
    setShowRunMoreOptions(false);
    setJobInstrumentId(job.instrumentId || '');
    setJobType(job.isCpu ? 'cpu' : 'gpu');
    setJobQueue(job.queue || 'standard');
    setJobStatus('Queued');
    setJobInputFile(job.inputFile || '');
    setJobWorkDir(job.workingDirectory || '');
    setJobSampleName(job.sampleName || '');
    setJobSampleId(job.sampleId || '');
    setJobNotes(job.notes || '');
    setJobRuntimeCustom(String(job.computeTime));
    setJobRuntimePreset('custom');
    setIsJobModalOpen(true);
    toast('Run duplicated', 'Edit the copy, then save it.', 'info');
  };

  // Delete logical Job card
  const handleDeleteJob = async (id: string) => {
    if (!(await confirm({ title: 'Delete this run?', message: 'All of its submission history is deleted. You can’t undo this.', confirmLabel: 'Delete run', danger: true }))) return;
    try {
      const res = await fetch(`/api/jobs/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setRefreshTrigger(prev => prev + 1);
        toast('Run deleted', 'The run and its history were removed.', 'info');
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Print PDF History Generator
  const handleExportPDF = () => {
    const filteredJobs = getFilteredHistory();
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Calculations for metrics
    const totalJobs = filteredJobs.length;
    const completed = filteredJobs.filter(j => j.status === 'Completed').length;
    const failed = filteredJobs.filter(j => ['Failed', 'Cancelled', 'Timed Out'].includes(j.status)).length;
    const successRate = totalJobs > 0 ? Math.round((completed / (completed + failed || 1)) * 100) : 100;
    
    const totalHoursConsumed = filteredJobs.reduce((sum, j) => {
      const attemptsSum = j.attempts.reduce((s, att) => s + getActualAttemptMinutes(att, j.status), 0);
      return sum + (attemptsSum / 60);
    }, 0).toFixed(1);

    const tableRows = filteredJobs.map((j) => {
      const inst = instruments.find(i => i.id === j.instrumentId);
      const isHpc = inst && inst.category === 'HPC';
      
      const attemptsStr = j.attempts.map(att => `
        <div style="font-size: 8.5pt; border-bottom: 1px dashed #e5e7eb; padding: 4px 0; margin-bottom: 4px;">
          <strong>Attempt ${att.attemptNumber}:</strong> ${att.jobId ? '#' + att.jobId : 'No job ID'} | 
          <span style="font-weight:605; color: ${att.status === 'Completed' ? '#16a34a' : att.status === 'Running' ? '#2563eb' : '#dc2626'}">${att.status}</span> | 
          ${Math.round(getActualAttemptMinutes(att, j.status))} mins (spent)
          ${att.failureReason ? `<div><span style="color:#b91c1c;">Failure: ${att.failureReason}</span></div>` : ''}
        </div>
      `).join('');

      return `
        <tr>
          <td>
            <div style="font-weight: 700; color: #111827;">${j.name}</div>
            <div style="font-size: 7.5pt; color: #6b7280; font-family: monospace;">UUID: ${j.id}</div>
          </td>
          <td>
            <div style="font-weight: 505;">${inst ? inst.name : 'Unknown instrument'}</div>
            <div style="font-size: 8pt; color: #4b5563;">Category: ${inst ? inst.category : 'N/A'}</div>
          </td>
          <td>
            <span style="font-size: 8.5pt; font-weight: 600; padding: 2px 6px; border-radius: 4px; border: 1px solid ${
              j.status === 'Completed' ? '#bbf7d0; color: #15803d; background-color: #f0fdf4;' :
              j.status === 'Running' ? '#bfdbfe; color: #1d4ed8; background-color: #eff6ff;' :
              j.status === 'Queued' ? '#fef08a; color: #a16207; background-color: #fefce8;' :
              '#fecaca; color: #b91c1c; background-color: #fef2f2;'
            }">${j.status}</span>
          </td>
          <td>
            <div>${new Date(j.submitTime).toLocaleDateString()}</div>
            <div style="font-size: 8pt; color: #6b7280;">${new Date(j.submitTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
          </td>
          <td>${attemptsStr}</td>
          <td>
            <div style="font-size: 8pt; max-width: 140px; white-space: normal; word-wrap: break-word;">
              ${isHpc ? `<strong>HPC:</strong> ${j.isGpu ? 'GPU' : 'CPU'} (${j.queue || 'default'})` : `<strong>Sample:</strong> ${j.sampleName || '-'}`}
              ${j.notes ? `<div style="margin-top: 4px; border-top: 1px solid #f3f4f6; padding-top: 2px; color: #6b7280;">${j.notes}</div>` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Rune run report</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #1f2937;
              background-color: #fff;
              line-height: 1.4;
              padding: 1.5cm;
            }
            h1 { font-size: 20pt; margin: 0 0 4px 0; color: #111827; font-weight: 800; }
            h2 { font-size: 11pt; margin: 0 0 20px 0; color: #4b5563; font-weight: 500; }
            
            .header-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; border-bottom: 2px solid #e5e7eb; padding-bottom: 12px; }
            .header-left { text-align: left; vertical-align: top; }
            .header-right { text-align: right; vertical-align: top; font-size: 9.5pt; color: #6b7280; font-family: monospace; }
            .meta-item { font-size: 9.5pt; color: #4b5563; margin-top: 4px; }
            .meta-item strong { color: #111827; }
            
            .summary-grid { display: table; width: 100%; table-layout: fixed; border-spacing: 12px; margin: 0 -12px 24px -12px; }
            .summary-card { display: table-cell; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; text-align: center; }
            .summary-val { font-size: 15pt; font-weight: 800; color: #111827; margin-top: 2px; }
            .summary-lbl { font-size: 7.5pt; text-transform: uppercase; color: #6b7280; font-weight: 600; letter-spacing: 0.05em; }
            
            table.job-table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            tr { page-break-inside: avoid; }
            th { border-bottom: 2px solid #d1d5db; padding: 8px 10px; background-color: #f3f4f6; font-weight: bold; text-align: left; font-size: 8pt; text-transform: uppercase; color: #374151; }
            td { border-bottom: 1px solid #e5e7eb; padding: 10px; font-size: 8.5pt; color: #4b5563; vertical-align: top; }
            
            @media print {
              body { padding: 0; }
              @page {
                size: A4 landscape;
                margin: 1.2cm;
              }
            }
          </style>
        </head>
        <body>
          <table class="header-table">
            <tr>
              <td class="header-left">
                <h1>RUNE</h1>
                <h2>Run report</h2>
                <div class="meta-item"><strong>Date:</strong> ${new Date().toLocaleDateString()}</div>
                <div class="meta-item"><strong>Scope:</strong> ${statusFilter === 'ALL' ? 'All statuses' : statusFilter} | ${instrumentFilter === 'ALL' ? 'All instruments' : 'One instrument'}</div>
              </td>
              <td class="header-right">
                <div>Generated: ${new Date().toLocaleDateString()}</div>
                <div>Author: ${user?.name || 'User'}</div>
              </td>
            </tr>
          </table>

          <div class="summary-grid">
            <div class="summary-card">
              <div class="summary-lbl">Runs</div>
              <div class="summary-val">${totalJobs}</div>
            </div>
            <div class="summary-card">
              <div class="summary-lbl">Completed</div>
              <div class="summary-val" style="color: #16a34a;">${completed}</div>
            </div>
            <div class="summary-card">
              <div class="summary-lbl">Success rate</div>
              <div class="summary-val" style="color: #2563eb;">${successRate}%</div>
            </div>
            <div class="summary-card">
              <div class="summary-lbl">Failed attempts</div>
              <div class="summary-val" style="color: #dc2626;">${failed}</div>
            </div>
            <div class="summary-card">
              <div class="summary-lbl">Compute hours</div>
              <div class="summary-val" style="color: #7c3aed;">${totalHoursConsumed} hrs</div>
            </div>
          </div>

          <table class="job-table">
            <thead>
              <tr>
                <th style="width: 20%;">Run</th>
                <th style="width: 15%;">Instrument</th>
                <th style="width: 10%;">Status</th>
                <th style="width: 12%;">Submitted</th>
                <th style="width: 25%;">Attempts</th>
                <th style="width: 18%;">Details and notes</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows.length > 0 ? tableRows : '<tr><td colspan="6" style="text-align: center; color: #9ca3af; padding: 24px;">No runs match the selected filters.</td></tr>'}
            </tbody>
          </table>
          
          <script>
            window.addEventListener('DOMContentLoaded', () => {
              setTimeout(() => {
                window.print();
              }, 500);
            });
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Helper: filter jobs for history list
  const getFilteredHistory = () => {
    return jobs.filter(j => {
      const matchSearch = j.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (j.jobId && j.jobId.toLowerCase().includes(searchQuery.toLowerCase())) ||
                          (j.reminders?.tags && j.reminders.tags.some((tag: string) => tag.toLowerCase().includes(searchQuery.toLowerCase())));
      const matchStatus = statusFilter === 'ALL' ? true : j.status === statusFilter;
      const matchInst = instrumentFilter === 'ALL' ? true : j.instrumentId === instrumentFilter;
      return matchSearch && matchStatus && matchInst;
    }).sort((a, b) => {
      let valA: any = a[sortField] || '';
      let valB: any = b[sortField] || '';
      
      if (sortField === 'submitTime') {
        valA = new Date(a.submitTime).getTime();
        valB = new Date(b.submitTime).getTime();
      } else if (sortField === 'attempts') {
        valA = a.attempts.length;
        valB = b.attempts.length;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  };

  // Calculate analytics metrics
  const getAnalytics = () => {
    const totalJobsCount = jobs.length;
    const runningJobs = jobs.filter(j => j.status === 'Running');
    const queuedJobs = jobs.filter(j => j.status === 'Queued');
    const completedJobs = jobs.filter(j => j.status === 'Completed');
    const failedJobs = jobs.filter(j => ['Failed', 'Cancelled', 'Timed Out'].includes(j.status));

    const completingSoonCount = jobs.filter(j => 
      j.status === 'Running' && 
      j.projectedCompletionTime && 
      (new Date(j.projectedCompletionTime).getTime() - now.getTime() > 0) && 
      (new Date(j.projectedCompletionTime).getTime() - now.getTime() <= 30 * 60 * 1000)
    ).length;

    const completedTodayCount = jobs.filter(j => 
      j.status === 'Completed' && 
      ((j.actualEndTime && new Date(j.actualEndTime).toDateString() === now.toDateString()) || 
       (!j.actualEndTime && new Date(j.updatedAt || j.createdAt).toDateString() === now.toDateString()))
    ).length;

    // Success Rate
    const totalTerminated = completedJobs.length + failedJobs.length;
    const successRate = totalTerminated > 0 ? Math.round((completedJobs.length / totalTerminated) * 100) : 100;

    // Total compute hours
    const totalComputeTime = jobs.reduce((sum, j) => {
      const attemptsSum = j.attempts.reduce((s, att) => s + getActualAttemptMinutes(att, j.status), 0);
      return sum + (attemptsSum / 60);
    }, 0);

    return {
      totalJobsCount,
      runningCount: runningJobs.length,
      queuedCount: queuedJobs.length,
      completedCount: completedJobs.length,
      failedCount: failedJobs.length,
      completingSoonCount,
      completedTodayCount,
      successRate,
      totalComputeHours: totalComputeTime.toFixed(1)
    };
  };

  const analytics = getAnalytics();

  if (sessionLoading) return null;

  return (
    <div className="space-y-6 text-foreground">
      <PageHeader
        className=""
        title="Runs"
        subtitle="Anything that takes a while and might need another go: a compute job, an instrument booking, a long experiment. Rune keeps every attempt and nudges you when one needs a look."
        actions={
          <>
            <Button variant="ghost" onClick={() => setIsInstrumentModalOpen(true)}><Plus className="w-4 h-4 text-ink-faint" /> Add instrument</Button>
            <Button onClick={openScheduleJobModal}><Plus className="w-4 h-4" /> New run</Button>
          </>
        }
      />
      {loadFailed && <LoadError what="your runs" onRetry={() => setRefreshTrigger((n) => n + 1)} />}

      <dl className="flex flex-wrap gap-x-10 gap-y-4">
        {[
          [analytics.runningCount, 'running'],
          [analytics.queuedCount, 'waiting'],
          [analytics.completedTodayCount, 'finished today'],
          [analytics.failedCount, 'failed', analytics.failedCount > 0],
          [`${analytics.totalComputeHours}h`, 'compute, last 30 days'],
          [`${analytics.successRate}%`, 'succeeded, last 30 days'],
        ].map(([v, l, bad]) => (
          <div key={String(l)} className="flex flex-col-reverse">
            <dt className="mt-1 text-[12.5px] text-ink-faint">{l}</dt>
            <dd className={`font-serif text-[26px] font-medium leading-none tracking-[-0.02em] tabular-nums ${bad ? 'text-danger' : 'text-foreground'}`}>{v}</dd>
          </div>
        ))}
      </dl>

      <div className="flex gap-1 border-b border-border" role="tablist">
        {([
          ['dashboard', 'Live'],
          ['history', 'History'],
          ['instruments', `Instruments`],
          ['timeline', 'Timeline'],
        ] as const).map(([val, label]) => (
          <button
            key={val}
            role="tab"
            aria-selected={activeTab === val}
            onClick={() => setActiveTab(val)}
            className={`-mb-px border-b-2 px-2.5 pb-2 pt-1 text-[14px] transition-colors ${
              activeTab === val ? 'border-foreground font-semibold text-foreground' : 'border-transparent text-ink-secondary hover:text-foreground'
            }`}
          >
            {label}{val === 'instruments' && instruments.length > 0 && <span className="ml-1.5 text-[12px] font-normal text-ink-faint">{instruments.length}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
          <p className="text-muted-foreground text-xs">Loading runs…</p>
        </div>
      ) : (
        <>
          {/* TAB 1: DASHBOARD */}
          {activeTab === 'dashboard' && jobs.length === 0 && !loadFailed && (
            <EmptyState
              spot="runs"
              title="No runs yet"
              message="Track a compute job, an instrument run, or any other long process, with its full attempt history."
              action={
                <button onClick={openScheduleJobModal} className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary-hover text-primary-foreground text-[13px] font-semibold rounded-[9px] transition-colors">
                  <Plus className="w-4 h-4" /> New run
                </button>
              }
            />
          )}
          {activeTab === 'dashboard' && jobs.length > 0 && (() => {
            const rank: Record<string, number> = { Running: 0, Queued: 1, Failed: 2, 'Timed Out': 2, Cancelled: 2, Completed: 3 };
            const remainingMsOf = (j: Job) =>
              j.status === 'Running' && j.projectedCompletionTime
                ? new Date(j.projectedCompletionTime).getTime() - now.getTime()
                : Number.POSITIVE_INFINITY;
            const sorted = [...jobs].sort((a, b) => {
              if (!!a.isPinned !== !!b.isPinned) return a.isPinned ? -1 : 1;
              const ra = rank[a.status] ?? 4, rb = rank[b.status] ?? 4;
              if (ra !== rb) return ra - rb;
              // Among running rows, the run closest to its projected finish
              // (or already past it) sorts first - restores the "completing
              // soon" signal that the table rebuild dropped.
              if (a.status === 'Running' && b.status === 'Running') {
                const diff = remainingMsOf(a) - remainingMsOf(b);
                if (diff !== 0) return diff;
              }
              return new Date(b.submitTime).getTime() - new Date(a.submitTime).getTime();
            });
            const queuedOrder = jobs
              .filter(j => j.status === 'Queued')
              .sort((a, b) => new Date(a.submitTime).getTime() - new Date(b.submitTime).getTime());

            const fmtClock = (s?: string) =>
              s ? new Date(s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '–';
            const fmtDur = (min: number) => {
              const m = Math.max(0, Math.round(min));
              return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${(m % 60).toString().padStart(2, '0')}m`;
            };

            // Details + actions for one run, shown when its row is opened.
            const details = (job: Job) => {
              const inst = instruments.find(i => i.id === job.instrumentId);
              const running = job.status === 'Running';
              const failed = ['Failed', 'Cancelled', 'Timed Out'].includes(job.status);
              const failCount = job.attempts.filter(a => a.failureReason).length;
              const stop = (e: React.MouseEvent) => e.stopPropagation();
              const act = 'h-8 px-3 text-[13px] font-medium rounded-[8px] transition-colors';
              return (
                <div className="flex flex-wrap items-start justify-between gap-4 pb-4 pl-[26px] pt-1">
                  <div className="min-w-0 space-y-0.5 text-[13px] text-ink-secondary">
                    <div>
                      {job.attempts.length === 0
                        ? 'No attempts recorded yet'
                        : `${job.attempts.length} ${job.attempts.length === 1 ? 'attempt' : 'attempts'}${failCount > 0 ? ` · ${failCount} ${failCount === 1 ? 'failure' : 'failures'}` : ''}`}
                      {' · '}compute budget {fmtDur(job.computeTime)}{inst ? ` · ${inst.name}` : ''}
                    </div>
                    {job.reminders?.enabled && <div>Check-in reminders on</div>}
                    {job.workingDirectory && <div className="truncate font-mono text-[12px]">{job.workingDirectory}</div>}
                    {(job as any).notebookPageTitle && (
                      <div className="truncate">
                        <Link href="/notebook" className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                          Written up in {(job as any).notebookPageTitle}
                        </Link>
                      </div>
                    )}
                    {job.notes && <div className="whitespace-pre-wrap text-ink-faint">{job.notes}</div>}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {running && (
                      <button onClick={(e) => { stop(e); setSelectedJob(job); setCompEndTime(formatDateTimeLocal(new Date())); setIsCompleteModalOpen(true); }} className={`${act} bg-primary text-primary-foreground hover:bg-primary-hover`}>Mark finished</button>
                    )}
                    {(running || job.status === 'Queued') && (
                      <button onClick={(e) => { stop(e); setSelectedJob(job); setResubSubmitTime(formatDateTimeLocal(new Date())); setIsResubmitModalOpen(true); }} className={`${act} border border-danger/50 text-danger hover:bg-danger-soft`}>Report failure</button>
                    )}
                    {failed && (
                      <button onClick={(e) => { stop(e); setSelectedJob(job); setResubSubmitTime(formatDateTimeLocal(new Date())); setIsResubmitModalOpen(true); }} className={`${act} border border-border-strong text-foreground hover:bg-surface-sunken`}>Try again</button>
                    )}
                    <button onClick={(e) => { stop(e); setSelectedJob(job); setIsAttemptHistoryOpen(true); }} className={`${act} text-ink-secondary hover:bg-surface-sunken hover:text-foreground`}>Attempts ({job.attempts.length})</button>
                    <button onClick={(e) => { stop(e); openEditJobModal(job); }} className={`${act} text-ink-secondary hover:bg-surface-sunken hover:text-foreground`}>Edit</button>
                    <button onClick={(e) => { stop(e); handleDuplicateJob(job); }} className={`${act} text-ink-secondary hover:bg-surface-sunken hover:text-foreground`}>Duplicate</button>
                    <button onClick={(e) => { stop(e); togglePinJob(job.id, !!job.isPinned); }} className={`${act} text-ink-secondary hover:bg-surface-sunken hover:text-foreground`}>{job.isPinned ? 'Unpin' : 'Pin'}</button>
                    <button onClick={(e) => { stop(e); handleDeleteJob(job.id); }} className={`${act} text-ink-faint hover:bg-danger-soft hover:text-danger`}>Delete</button>
                  </div>
                </div>
              );
            };

            const runningJobs = sorted.filter(j => j.status === 'Running');
            const waiting = sorted.filter(j => j.status === 'Queued');
            const finished = sorted.filter(j => j.status !== 'Running' && j.status !== 'Queued').slice(0, 12);
            const rowBtn = (job: Job) => ({
              id: `job-row-${job.id}`,
              role: 'button' as const,
              tabIndex: 0,
              'aria-expanded': expandedJobId === job.id,
              onClick: () => setExpandedJobId(expandedJobId === job.id ? null : job.id),
              onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedJobId(expandedJobId === job.id ? null : job.id); } },
            });
            const meta = (job: Job) => {
              const inst = instruments.find(i => i.id === job.instrumentId);
              return [job.category && job.category !== 'General' ? job.category : null, inst?.name, job.sampleName ? `sample ${job.sampleName}` : null].filter(Boolean).join(' · ');
            };

            return (
              <div className="space-y-10">
                {/* Running now: each run as a track from start to its projected finish */}
                <section>
                  <SectionHeader title="Running now" meta={runningJobs.length} />
                  {runningJobs.length === 0 ? (
                    <p className="py-5 text-[14px] text-ink-secondary">Nothing running. Start one with <button onClick={openScheduleJobModal} className="font-medium text-foreground underline decoration-border-strong underline-offset-4">New run</button>.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {runningJobs.map(job => {
                        const startMs = new Date(job.projectedStartTime || job.submitTime).getTime();
                        const endMs = job.projectedCompletionTime ? new Date(job.projectedCompletionTime).getTime() : null;
                        const elapsedMin = (now.getTime() - startMs) / 60000;
                        const pct = endMs && endMs > startMs ? Math.min(100, Math.max(1, ((now.getTime() - startMs) / (endMs - startMs)) * 100)) : null;
                        const leftMin = endMs ? (endMs - now.getTime()) / 60000 : null;
                        const late = leftMin != null && leftMin <= 0;
                        const expanded = expandedJobId === job.id;
                        return (
                          <li key={job.id}>
                            <div {...rowBtn(job)} className="group cursor-pointer py-4 outline-none focus-visible:bg-surface">
                              <div className="flex items-baseline justify-between gap-4">
                                <div className="min-w-0">
                                  <p className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
                                    <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
                                      <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-50 motion-safe:animate-ping" />
                                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                                    </span>
                                    <span className="truncate">{job.name}</span>
                                    {job.isPinned && <Pin className="h-3 w-3 shrink-0 rotate-45 text-ink-faint" />}
                                  </p>
                                  {meta(job) && <p className="mt-0.5 pl-[18px] text-[13px] text-ink-faint">{meta(job)}</p>}
                                </div>
                                <p className={`shrink-0 text-right text-[13px] ${late ? 'text-warning' : 'text-ink-secondary'}`}>
                                  {leftMin == null ? `${fmtDur(elapsedMin)} so far` : late ? `Past its expected finish by ${fmtDur(-leftMin)}` : <><span className="font-serif text-[20px] font-medium text-foreground tabular-nums">{fmtDur(leftMin)}</span> left</>}
                                </p>
                              </div>
                              {pct != null && (
                                <div className="mt-3 pl-[18px]">
                                  <div className="relative h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                                    <div className={`h-full rounded-full ${late ? 'bg-warning' : 'bg-primary'} transition-[width] duration-700`} style={{ width: `${pct}%` }} />
                                  </div>
                                  <div className="mt-1.5 flex justify-between text-[12px] text-ink-faint tabular-nums">
                                    <span>Started {fmtClock(job.projectedStartTime || job.submitTime)}</span>
                                    <span>{Math.round(pct)}% · expected {fmtClock(job.projectedCompletionTime)}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                            {expanded && details(job)}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>

                {waiting.length > 0 && (
                  <section>
                    <SectionHeader title="Waiting" meta={waiting.length} />
                    <ul className="divide-y divide-border">
                      {waiting.map(job => (
                        <li key={job.id}>
                          <div {...rowBtn(job)} className="flex cursor-pointer items-baseline justify-between gap-4 py-3 outline-none focus-visible:bg-surface">
                            <p className="min-w-0 truncate text-[14.5px] font-medium">
                              <span className="mr-2.5 inline-block w-5 text-[12.5px] font-normal text-ink-faint tabular-nums">{queuedOrder.findIndex(j => j.id === job.id) + 1}.</span>
                              {job.name}
                              {meta(job) && <span className="ml-2 text-[13px] font-normal text-ink-faint">{meta(job)}</span>}
                            </p>
                            <span className="shrink-0 text-[13px] text-ink-secondary">{job.projectedStartTime ? `Starts ${fmtClock(job.projectedStartTime)}` : 'In the queue'}</span>
                          </div>
                          {expandedJobId === job.id && details(job)}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {finished.length > 0 && (
                  <section>
                    <SectionHeader title="Recently finished" meta={finished.length} right={<button onClick={() => setActiveTab('history')} className="text-[12.5px] text-ink-secondary hover:text-foreground">Full history →</button>} />
                    <ul className="divide-y divide-border">
                      {finished.map(job => {
                        const failed = ['Failed', 'Cancelled', 'Timed Out'].includes(job.status);
                        const lastFail = failed ? [...job.attempts].reverse().find(a => a.failureReason)?.failureReason : null;
                        return (
                          <li key={job.id}>
                            <div {...rowBtn(job)} className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 gap-y-0.5 py-3 outline-none focus-visible:bg-surface sm:grid-cols-[minmax(0,1fr)_7rem_6rem_auto]">
                              <p className="min-w-0 truncate text-[14.5px]">
                                <span className="font-medium">{job.name}</span>
                                {lastFail && <span className="ml-2 text-[13px] text-danger">{lastFail}</span>}
                              </p>
                              <span className={`text-[13px] ${failed ? 'text-danger' : 'text-ink-secondary'}`}>{job.status === 'Completed' ? 'Finished' : job.status}</span>
                              <span className="hidden text-[13px] text-ink-faint tabular-nums sm:block">{getJobElapsedMinutes(job) > 0 ? fmtDur(getJobElapsedMinutes(job)) : '–'}</span>
                              <span className="hidden text-right text-[13px] text-ink-faint tabular-nums sm:block">{new Date(job.actualEndTime || job.submitTime).toLocaleDateString([], { day: 'numeric', month: 'short' })}</span>
                            </div>
                            {expandedJobId === job.id && details(job)}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}
              </div>
            );
          })()}

          {/* TAB 2: SEARCHABLE HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              {/* Search & Filter bar */}
              <div className="flex flex-col md:flex-row gap-3 bg-surface-sunken/60 border border-border p-4 rounded-md items-center">
                <div className="relative flex-1 w-full">
                  <Search className="absolute left-3.5 top-3 w-4 h-4 text-ink-faint" />
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name or job ID…"
                    aria-label="Search runs"
                    className="w-full bg-surface-raised border border-border rounded-md pl-10 pr-4 py-2 text-foreground text-xs focus:outline-none focus:border-border-strong"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                  <div className="flex items-center gap-2">
                    <Filter className="w-3.5 h-3.5 text-ink-faint" />
                    <select 
                      aria-label="Filter by status"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="bg-surface-raised border border-border rounded-md px-3 py-1.5 text-foreground text-xs focus:outline-none focus:border-border-strong"
                    >
                      <option value="ALL">All statuses</option>
                      <option value="Queued">Queued</option>
                      <option value="Running">Running</option>
                      <option value="Completed">Completed</option>
                      <option value="Failed">Failed</option>
                      <option value="Cancelled">Cancelled</option>
                      <option value="Timed Out">Timed Out</option>
                    </select>
                  </div>

                  <select 
                    aria-label="Filter by instrument"
                    value={instrumentFilter}
                    onChange={(e) => setInstrumentFilter(e.target.value)}
                    className="bg-surface-raised border border-border rounded-md px-3 py-1.5 text-foreground text-xs focus:outline-none focus:border-border-strong"
                  >
                    <option value="ALL">All instruments</option>
                    {instruments.map(i => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>

                  <button 
                    onClick={handleExportPDF}
                    className="flex items-center gap-1 px-4 py-1.5 bg-surface-raised border border-border-strong hover:border-border-strong rounded-full text-ink-secondary hover:text-foreground text-xs cursor-pointer transition-colors ml-auto"
                  >
                    <FileDown className="w-3.5 h-3.5" /> Export PDF
                  </button>
                </div>
              </div>

              {/* Data Table */}
              <div className="bg-surface-sunken/60 border border-border rounded-md overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-surface-sunken/80">
                      <th 
                        onClick={() => { setSortField('name'); setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc'); }}
                        className="p-4 font-bold text-muted-foreground select-none cursor-pointer hover:text-foreground"
                      >
                        Run <ArrowUpDown className="w-3 h-3 inline ml-0.5 text-ink-faint" />
                      </th>
                      <th className="p-4 font-bold text-muted-foreground">Instrument</th>
                      <th className="p-4 font-bold text-muted-foreground">Status</th>
                      <th 
                        onClick={() => { setSortField('submitTime'); setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc'); }}
                        className="p-4 font-bold text-muted-foreground select-none cursor-pointer hover:text-foreground"
                      >
                        Submission <ArrowUpDown className="w-3 h-3 inline ml-0.5 text-ink-faint" />
                      </th>
                      <th 
                        onClick={() => { setSortField('computeTime'); setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc'); }}
                        className="p-4 font-bold text-muted-foreground select-none cursor-pointer hover:text-foreground"
                      >
                        Elapsed <ArrowUpDown className="w-3 h-3 inline ml-0.5 text-ink-faint" />
                      </th>
                      <th 
                        onClick={() => { setSortField('attempts'); setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc'); }}
                        className="p-4 font-bold text-muted-foreground select-none cursor-pointer hover:text-foreground"
                      >
                        Attempts <ArrowUpDown className="w-3 h-3 inline ml-0.5 text-ink-faint" />
                      </th>
                      <th className="p-4 font-bold text-muted-foreground text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredHistory().length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-ink-faint">
                          No runs match these filters.
                        </td>
                      </tr>
                    ) : (
                      getFilteredHistory().map((job) => {
                        const inst = instruments.find(i => i.id === job.instrumentId);
                        const formattedSubmit = new Date(job.submitTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
                        return (
                          <tr key={job.id} className="border-b border-border/60 hover:bg-surface-raised/5 transition-colors">
                            <td className="p-4">
                              <div className="font-semibold text-foreground">{job.name}</div>
                              <div className="text-[10px] text-ink-faint font-mono mt-0.5">{job.jobId ? `#${job.jobId}` : 'No job ID'}</div>
                              {job.reminders?.tags && job.reminders.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {job.reminders.tags.map((tag: string) => (
                                    <span key={tag} className="px-1.5 py-0.2 bg-surface-sunken text-muted-foreground text-[8px] rounded border border-border font-mono">
                                      #{tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="p-4">
                              <div className="font-semibold text-ink-secondary">{inst ? inst.name : 'Deleted instrument'}</div>
                              <div className="text-[10px] text-ink-faint">{inst ? inst.category : 'N/A'}</div>
                            </td>
                            <td className="p-4">
                              <span className={`px-2 py-0.5 rounded-md border text-[11.5px] font-semibold font-mono ${
                                job.status === 'Completed' ? 'bg-success/10 text-success border-success/20' :
                                job.status === 'Running' ? 'bg-primary/10 text-primary border-primary/20' :
                                job.status === 'Queued' ? 'bg-warning/10 text-warning border-warning/20' :
                                'bg-danger/10 text-danger border-danger/20'
                              }`}>
                                {job.status}
                              </span>
                            </td>
                            <td className="p-4 text-muted-foreground">{formattedSubmit}</td>
                            <td className="p-4 font-mono text-foreground">{Math.round(getJobElapsedMinutes(job))} mins</td>
                            <td className="p-4 text-muted-foreground font-semibold">{job.attempts.length} attempts</td>
                            <td className="p-4 text-right space-x-2">
                              <button 
                                onClick={() => openEditJobModal(job)}
                                className="px-2 py-1 bg-surface-raised border border-border-strong hover:border-border-strong text-ink-secondary hover:text-foreground rounded-lg cursor-pointer"
                                title="Edit run"
                              >
                                Edit
                              </button>
                              <button 
                                onClick={() => { setSelectedJob(job); setIsAttemptHistoryOpen(true); }}
                                className="px-2 py-1 bg-surface-raised border border-border-strong hover:border-border-strong text-ink-secondary hover:text-foreground rounded-lg cursor-pointer"
                                title="Attempt history"
                              >
                                History
                              </button>
                              <button 
                                onClick={() => handleDuplicateJob(job)}
                                className="px-2 py-1 bg-surface-raised border border-border-strong hover:border-border-strong text-ink-secondary hover:text-foreground rounded-lg cursor-pointer"
                                title="Duplicate run"
                              >
                                Clone
                              </button>
                              <button 
                                onClick={() => handleDeleteJob(job.id)}
                                className="px-2 py-1 bg-danger-soft/20 border border-border/20 hover:border-border/40 text-danger rounded-lg cursor-pointer"
                                title="Delete run"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: SAVED INSTRUMENTS */}
          {activeTab === 'instruments' && (
            <div className="space-y-4">
              {instruments.length === 0 ? (
                <div className="py-20 border border-dashed border-border rounded-md text-center space-y-3">
                  <Cpu className="w-10 h-10 text-ink-faint mx-auto animate-pulse" />
                  <h3 className="text-sm font-bold text-foreground">No instruments yet</h3>
                  <p className="text-ink-faint text-xs max-w-sm mx-auto leading-normal">
                    Add a compute cluster, a workstation, or lab equipment to reuse its specs and runtime limits when you create runs.
                  </p>
                  <button 
                    onClick={() => setIsInstrumentModalOpen(true)}
                    className="px-4.5 py-2.5 bg-surface-raised border border-border-strong rounded-full text-foreground text-xs font-bold hover:bg-surface-sunken cursor-pointer"
                  >
                    Add an instrument
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {instruments.map(inst => {
                    const isHpc = inst.category === 'HPC';
                    return (
                      <div 
                        key={inst.id} 
                        className="bg-surface border border-border rounded-md p-5 hover:border-border-strong transition-colors duration-[var(--duration-standard)] relative space-y-4"
                      >
                        {/* Header card info */}
                        <div className="flex justify-between items-start gap-4">
                          <div className="space-y-1">
                            <h3 className="font-bold text-foreground text-sm">{inst.name}</h3>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded-md bg-surface-sunken border border-border text-muted-foreground font-mono text-[11.5px] font-semibold">
                                {inst.category}
                              </span>
                              {inst.sharedFrom && (
                                <span className="px-2 py-0.5 rounded-md border border-border text-[var(--color-data-slate)] font-mono text-[11.5px] font-semibold">
                                  shared: {inst.sharedFrom}
                                </span>
                              )}
                              {inst.canEdit && inst.teamId && (
                                <span className="px-2 py-0.5 rounded-md border border-primary/40 text-primary font-mono text-[11.5px] font-semibold">
                                  shared by me
                                </span>
                              )}
                            </div>
                          </div>

                          {inst.canEdit !== false ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => toggleFavoriteInstrument(inst.id, inst.isFavorite)}
                                className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                                  inst.isFavorite
                                    ? 'text-warning border-warning/20 bg-warning/5'
                                    : 'text-ink-faint border-border hover:text-muted-foreground bg-surface-sunken/40'
                                }`}
                                title="Pin instrument" aria-label="Pin instrument">
                                <Star className={`w-3.5 h-3.5 ${inst.isFavorite ? 'fill-current' : ''}`} />
                              </button>
                              <button
                                onClick={() => openEditInstrumentModal(inst)}
                                className="p-1.5 text-muted-foreground border border-border hover:text-foreground bg-surface-sunken/40 rounded-lg cursor-pointer"
                                title="Edit instrument" aria-label="Edit instrument">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteInstrument(inst.id)}
                                className="p-1.5 bg-danger-soft/20 border border-border/10 hover:border-border/30 text-danger rounded-lg cursor-pointer"
                                title="Delete instrument" aria-label="Delete instrument">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-ink-faint font-mono">view only</span>
                          )}
                        </div>

                        {/* specs specs */}
                        <div className="bg-surface-sunken/40 border border-border rounded-md p-3.5 text-[11px] space-y-2 leading-relaxed">
                          {isHpc ? (
                            <>
                              <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                                <div><strong className="text-ink-secondary">CPU:</strong> {inst.cpuArch || 'N/A'}</div>
                                <div><strong className="text-ink-secondary">Nodes × cores:</strong> {inst.nodes || 1} x {inst.coresPerNode || 1}</div>
                                <div><strong className="text-ink-secondary">RAM:</strong> {inst.ram || 'N/A'}</div>
                                <div><strong className="text-ink-secondary">GPU:</strong> {inst.gpuModel || 'None'}</div>
                                {inst.gpuNodes !== undefined && inst.gpuNodes > 0 && (
                                  <div className="col-span-2"><strong className="text-ink-secondary">GPU Nodes:</strong> {inst.gpuNodes} node(s) @ {inst.gpusPerNode} x {inst.gpuMemory}</div>
                                )}
                              </div>
                            </>
                          ) : (
                            <div className="text-muted-foreground">
                              {inst.hardwareSpecs || 'No hardware notes.'}
                            </div>
                          )}
                        </div>

                        {/* presets */}
                        <div className="space-y-1.5">
                          <span className="text-[11.5px] text-ink-faint font-semibold font-mono block">Runtime limits</span>
                          {inst.runtimeType === 'fixed' ? (
                            <span className="text-xs text-foreground font-semibold font-mono">Max wall time: {inst.maxRuntime}</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {inst.slots.map(slot => (
                                <span key={slot} className="px-2 py-0.5 bg-surface-raised border border-border-strong rounded font-mono text-[10px] text-foreground">
                                  {slot}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: TIMELINE/GANTT VIEW */}
          {activeTab === 'timeline' && (
            <div className="space-y-4">
              <div className="bg-surface-sunken/60 border border-border p-6 rounded-md space-y-6">
                <div className="flex justify-between items-center border-b border-border pb-3">
                  <h3 className="text-[12.5px] font-semibold text-muted-foreground">Projected run schedule</h3>
                  <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-primary rounded" /> Running</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-warning rounded" /> Queued</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-success rounded" /> Completed</span>
                  </div>
                </div>

                <div className="space-y-4">
                  {jobs.filter(j => ['Queued', 'Running', 'Completed'].includes(j.status)).length === 0 ? (
                    <p className="text-center text-ink-faint text-xs py-8">No scheduled or active runs.</p>
                  ) : (
                    jobs.filter(j => ['Queued', 'Running', 'Completed'].includes(j.status)).map(job => {
                      const startTime = job.projectedStartTime || job.submitTime;
                      const elapsedMins = Math.round(getJobElapsedMinutes(job));
                      const formattedStart = new Date(startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      const formattedEnd = job.projectedCompletionTime 
                        ? new Date(job.projectedCompletionTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : '-';
                      
                      // Mock Gantt Bar offsets for aesthetics
                      const progress = job.status === 'Completed' ? 100 : job.status === 'Queued' ? 0 : 45;
                      
                      return (
                        <div key={job.id} className="grid grid-cols-4 gap-4 items-center border-b border-border/40 pb-3 last:border-b-0">
                          <div className="col-span-1 min-w-0">
                            <span className="font-bold text-foreground block truncate text-xs">{job.name}</span>
                            <span className="text-[10px] text-ink-faint font-mono">{formattedStart} - {formattedEnd} ({elapsedMins}m elapsed)</span>
                          </div>
                          
                          <div className="col-span-3">
                            <div className="h-3 w-full bg-surface-sunken border border-border rounded-full overflow-hidden relative">
                              <div 
                                style={{ width: `${progress}%` }} 
                                className={`h-full transition-[width] duration-[var(--duration-standard)] ${
                                  job.status === 'Completed' ? 'bg-success/20 border-r-2 border-success' :
                                  job.status === 'Running' ? 'bg-primary/30 border-r-2 border-primary animate-pulse' :
                                  'bg-warning/20 border-r-2 border-warning'
                                }`}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ================= MODALS ================= */}

      {/* MODAL 1: ADD INSTRUMENT */}
      {isInstrumentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-lg bg-card border border-border rounded-md p-6 shadow-[var(--shadow-modal)] overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-5 border-b border-border pb-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                <Cpu className="w-4.5 h-4.5 text-muted-foreground" /> {editingInstrument ? 'Edit' : 'Add'} instrument
              </h3>
              <button onClick={closeInstrumentModal} className="p-1 rounded-lg hover:bg-surface-sunken text-muted-foreground cursor-pointer" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateInstrument} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="page-instrument-name" className="block text-[11.5px] font-semibold text-muted-foreground mb-1.5">Instrument name *</label>
                  <input id="page-instrument-name" 
                    type="text" 
                    required
                    value={instName}
                    onChange={(e) => setInstName(e.target.value)}
                    placeholder="e.g. University HPC Cluster, Local Workstation"
                    className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground text-xs focus:outline-none focus:border-border-strong"
                  />
                </div>
                <div>
                  <label htmlFor="page-category" className="block text-[11.5px] font-semibold text-muted-foreground mb-1.5">Category *</label>
                  <select id="page-category" 
                    value={instCategory}
                    onChange={(e) => setInstCategory(e.target.value)}
                    className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground text-xs focus:outline-none focus:border-border-strong"
                  >
                    <option value="HPC">HPC cluster</option>
                    <option value="Scientific Instrument">Lab equipment</option>
                    <option value="CUSTOM">Custom category</option>
                  </select>
                </div>
              </div>

              {instCategory === 'CUSTOM' && (
                <div>
                  <label htmlFor="page-category-name" className="block text-[11.5px] font-semibold text-muted-foreground mb-1.5">Category name *</label>
                  <input id="page-category-name"
                    type="text"
                    required
                    value={instCustomCategory}
                    onChange={(e) => setInstCustomCategory(e.target.value)}
                    placeholder="e.g. Electron Microscope"
                    className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground text-xs focus:outline-none focus:border-border-strong"
                  />
                </div>
              )}

              {myTeams.length > 0 && (
                <div>
                  <label htmlFor="page-share-with-team" className="block text-[11.5px] font-semibold text-muted-foreground mb-1.5">Share with team</label>
                  <select id="page-share-with-team"
                    value={instTeamId}
                    onChange={(e) => setInstTeamId(e.target.value)}
                    className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground text-xs focus:outline-none focus:border-border-strong"
                  >
                    <option value="">Private to me</option>
                    {myTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <p className="text-[10px] text-ink-faint mt-1">Shared instruments show in every team member’s Run form. Only you edit the specs.</p>
                </div>
              )}

              {/* HPC SPECIFIC OPTIONS */}
              {instCategory === 'HPC' && (
                <div className="bg-surface-sunken/50 border border-border rounded-md p-4.5 space-y-4">
                  <h4 className="font-semibold text-foreground text-[11.5px]">HPC specs</h4>
                  
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label htmlFor="page-ram" className="block text-[9px] text-muted-foreground mb-1">RAM</label>
                      <input id="page-ram" 
                        type="text" 
                        value={instRam}
                        onChange={(e) => setInstRam(e.target.value)}
                        placeholder="e.g. 256 GB"
                        className="w-full bg-surface-raised border border-border rounded-md px-3 py-2 text-foreground text-xs focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="page-cpu" className="block text-[9px] text-muted-foreground mb-1">CPU</label>
                      <input id="page-cpu" 
                        type="text" 
                        value={instCpuArch}
                        onChange={(e) => setInstCpuArch(e.target.value)}
                        placeholder="e.g. AMD EPYC, Intel Xeon"
                        className="w-full bg-surface-raised border border-border rounded-md px-3 py-2 text-foreground text-xs focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="page-cpu-nodes" className="block text-[9px] text-muted-foreground mb-1">CPU nodes</label>
                      <input id="page-cpu-nodes" 
                        type="number" 
                        value={instNodes}
                        onChange={(e) => setInstNodes(e.target.value)}
                        placeholder="e.g. 64"
                        className="w-full bg-surface-raised border border-border rounded-md px-3 py-2 text-foreground text-xs focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label htmlFor="page-cores-per-node" className="block text-[9px] text-muted-foreground mb-1">Cores per node</label>
                      <input id="page-cores-per-node" 
                        type="number" 
                        value={instCores}
                        onChange={(e) => setInstCores(e.target.value)}
                        placeholder="e.g. 128"
                        className="w-full bg-surface-raised border border-border rounded-md px-3 py-2 text-foreground text-xs focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="page-gpu-nodes" className="block text-[9px] text-muted-foreground mb-1">GPU nodes</label>
                      <input id="page-gpu-nodes" 
                        type="number" 
                        value={instGpuNodes}
                        onChange={(e) => setInstGpuNodes(e.target.value)}
                        placeholder="e.g. 8"
                        className="w-full bg-surface-raised border border-border rounded-md px-3 py-2 text-foreground text-xs focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="page-gpus-per-node" className="block text-[9px] text-muted-foreground mb-1">GPUs per node</label>
                      <input id="page-gpus-per-node" 
                        type="number" 
                        value={instGpusPerNode}
                        onChange={(e) => setInstGpusPerNode(e.target.value)}
                        placeholder="e.g. 4"
                        className="w-full bg-surface-raised border border-border rounded-md px-3 py-2 text-foreground text-xs focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="page-gpu-model" className="block text-[9px] text-muted-foreground mb-1">GPU model</label>
                      <input id="page-gpu-model" 
                        type="text" 
                        value={instGpuModel}
                        onChange={(e) => setInstGpuModel(e.target.value)}
                        placeholder="e.g. NVIDIA H100"
                        className="w-full bg-surface-raised border border-border rounded-md px-3 py-2 text-foreground text-xs focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="page-gpu-memory" className="block text-[9px] text-muted-foreground mb-1">GPU memory</label>
                    <input id="page-gpu-memory" 
                      type="text" 
                      value={instGpuMemory}
                      onChange={(e) => setInstGpuMemory(e.target.value)}
                      placeholder="e.g. 80 GB HBM3"
                      className="w-full bg-surface-raised border border-border rounded-md px-3 py-2 text-foreground text-xs focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Scientific Instrument Specification */}
              {instCategory !== 'HPC' && (
                <div>
                  <label htmlFor="page-hardware-notes" className="block text-[11.5px] font-semibold text-muted-foreground mb-1.5">Hardware notes</label>
                  <textarea id="page-hardware-notes" 
                    value={instHardwareSpecs}
                    onChange={(e) => setInstHardwareSpecs(e.target.value)}
                    placeholder="e.g. UV-Vis spectrometer, 190–1100 nm, high-resolution detector"
                    rows={3}
                    className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground text-xs focus:outline-none focus:border-border-strong"
                  />
                </div>
              )}

              {/* RUNTIME CONFIGURATION POLICIES */}
              <div className="space-y-3 border-t border-border pt-4">
                <h4 className="font-semibold text-foreground text-[11.5px]">Runtime limits</h4>
                
                <div className="flex gap-4">
                  <label className="flex items-center space-x-2 cursor-pointer select-none">
                    <input 
                      type="radio" 
                      name="runtimeType" 
                      value="fixed"
                      checked={instRuntimeType === 'fixed'}
                      onChange={() => setInstRuntimeType('fixed')}
                      className="accent-white w-3.5 h-3.5"
                    />
                    <span>Maximum wall time</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer select-none">
                    <input 
                      type="radio" 
                      name="runtimeType" 
                      value="slots"
                      checked={instRuntimeType === 'slots'}
                      onChange={() => setInstRuntimeType('slots')}
                      className="accent-white w-3.5 h-3.5"
                    />
                    <span>Preset durations</span>
                  </label>
                </div>

                {instRuntimeType === 'fixed' ? (
                  <div>
                    <label htmlFor="page-maximum-wall-time-hh-mm" className="block text-[9px] text-muted-foreground mb-1">Maximum wall time (HH:MM)</label>
                    <input id="page-maximum-wall-time-hh-mm" 
                      type="text" 
                      value={instMaxRuntime}
                      onChange={(e) => setInstMaxRuntime(e.target.value)}
                      placeholder="e.g. 72:00"
                      className="w-full bg-surface-raised border border-border rounded-md px-4 py-2 text-foreground text-xs focus:outline-none"
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label htmlFor="page-preset-durations" className="block text-[9px] text-muted-foreground">Preset durations</label>
                    <div className="flex flex-wrap gap-1.5 p-2 bg-surface-sunken/40 border border-border rounded-md min-h-10">
                      {instSlots.map((s, idx) => (
                        <span key={idx} className="flex items-center gap-1 px-2.5 py-0.5 bg-surface-raised border border-border-strong rounded-lg text-foreground font-mono text-[10px]">
                          {s} 
                          <button 
                            type="button" 
                            onClick={() => setInstSlots(instSlots.filter((_, i) => i !== idx))} 
                            className="text-danger hover:text-foreground cursor-pointer ml-1"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input id="page-preset-durations" 
                        type="text" 
                        value={newSlotVal}
                        onChange={(e) => setNewSlotVal(e.target.value)}
                        placeholder="e.g. 48h, 90m"
                        className="bg-surface-raised border border-border rounded-md px-3 py-1.5 text-foreground text-xs focus:outline-none"
                      />
                      <button 
                        type="button" 
                        onClick={() => { if(newSlotVal.trim()) { setInstSlots([...instSlots, newSlotVal.trim()]); setNewSlotVal(''); } }}
                        className="px-3 bg-surface-raised hover:bg-surface-sunken border border-border-strong rounded-md text-foreground"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 border-t border-border pt-5 mt-6">
                <button 
                  type="button"
                  onClick={closeInstrumentModal}
                  className="px-4 py-2 bg-surface-raised border border-border text-muted-foreground hover:text-foreground rounded-full"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-primary-foreground font-bold rounded-full transition-colors cursor-pointer"
                >
                  {editingInstrument ? 'Save changes' : 'Add instrument'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: SCHEDULE JOB */}
      {isJobModalOpen && (
        <Modal onClose={closeJobModal} size="md">
          <Modal.Header
            title={editingJob ? 'Edit run' : 'New run'}
            onClose={closeJobModal}
            icon={<Terminal className="w-5 h-5 text-muted-foreground" />}
          />

          <form onSubmit={handleScheduleJob} className="space-y-5 text-xs">
            {/* Always visible: Name, Category, Initial Status, single ETA field */}
            <div>
              <label htmlFor="page-name" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Name *</label>
              <input id="page-name"
                type="text"
                required
                value={jobName}
                onChange={(e) => setJobName(e.target.value)}
                placeholder="e.g. Molecular dynamics simulation, 45-minute PCR, training epoch 12 of 50"
                className="w-full bg-surface-raised border border-border rounded-md px-4 py-3 text-foreground placeholder-muted-foreground text-sm font-semibold focus:outline-none focus:border-border-strong"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="page-category-2" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Category</label>
                <select id="page-category-2"
                  value={jobCategory}
                  onChange={(e) => setJobCategory(e.target.value)}
                  className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground text-sm focus:outline-none focus:border-border-strong"
                >
                  <option value="General">General</option>
                  <option value="HPC">HPC job</option>
                  <option value="Scientific Instrument">Bench / instrument</option>
                  <option value="CUSTOM">Custom…</option>
                </select>
                <p className="text-[10px] text-ink-faint mt-1">
                  {jobCategory === 'HPC' ? 'Adds queue, script path, and working directory.'
                    : jobCategory === 'Scientific Instrument' ? 'Adds sample, conditions, and protocol.'
                    : 'Just the essentials.'}
                </p>
              </div>
              <div>
                <label htmlFor="page-initial-status" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Initial status</label>
                <select id="page-initial-status"
                  value={jobStatus}
                  onChange={(e) => setJobStatus(e.target.value)}
                  className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground text-sm focus:outline-none focus:border-border-strong"
                >
                  <option value="Queued">Queued (not started)</option>
                  <option value="Running">Running</option>
                  {editingJob && (
                    <>
                      <option value="Completed">Completed</option>
                      <option value="Failed">Failed</option>
                      <option value="Cancelled">Cancelled</option>
                      <option value="Timed Out">Timed Out</option>
                    </>
                  )}
                </select>
              </div>
              <div>
                <label htmlFor="page-expected-duration-min" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Expected duration (min)</label>
                <input id="page-expected-duration-min"
                  type="number"
                  value={jobRuntimeCustom}
                  onChange={(e) => {
                    setJobRuntimeCustom(e.target.value);
                    setJobRuntimePreset('custom');
                  }}
                  placeholder="e.g. 60"
                  className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-border-strong"
                />
              </div>
            </div>

            {jobCategory === 'CUSTOM' && (
              <div>
                <label htmlFor="page-custom-category-name" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Custom category name</label>
                <input id="page-custom-category-name"
                  type="text"
                  value={jobCustomCategory}
                  onChange={(e) => setJobCustomCategory(e.target.value)}
                  placeholder="e.g. Field Survey, Training Run"
                  className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-border-strong"
                />
              </div>
            )}

            {/* HPC details disclosure - only when category = HPC */}
            {jobCategory === 'HPC' && (
              <div className="bg-surface-raised/50 border border-border/60 rounded-md p-5 space-y-4">
                <h4 className="font-semibold text-foreground text-[12.5px] mb-1">HPC details</h4>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="page-compute-type" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Compute type</label>
                    <select id="page-compute-type"
                      value={jobType}
                      onChange={(e) => setJobType(e.target.value as any)}
                      className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground text-sm focus:outline-none focus:border-border-strong"
                    >
                      <option value="cpu">CPU</option>
                      <option value="gpu">GPU</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="page-queue-or-partition-name" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Queue or partition name</label>
                    <input id="page-queue-or-partition-name"
                      type="text"
                      value={jobQueue}
                      onChange={(e) => setJobQueue(e.target.value)}
                      placeholder="e.g. standard, gpu, debug"
                      className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-border-strong"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="page-input-script-or-file-path" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Input script or file path</label>
                    <input id="page-input-script-or-file-path"
                      type="text"
                      value={jobInputFile}
                      onChange={(e) => setJobInputFile(e.target.value)}
                      placeholder="e.g. /path/to/input.in"
                      className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-border-strong"
                    />
                  </div>
                  <div>
                    <label htmlFor="page-working-directory-optional" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Working directory (optional)</label>
                    <input id="page-working-directory-optional"
                      type="text"
                      value={jobWorkDir}
                      onChange={(e) => setJobWorkDir(e.target.value)}
                      placeholder="e.g. /home/user/project/run/"
                      className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-border-strong"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Bench / instrument disclosure - sample + conditions, no HPC noise */}
            {jobCategory === 'Scientific Instrument' && (
              <div className="bg-surface-raised/50 border border-border/60 rounded-md p-5 space-y-4">
                <h4 className="font-semibold text-foreground text-[12.5px] mb-1">Sample and conditions</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="page-sample-name" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Sample name</label>
                    <input id="page-sample-name"
                      type="text"
                      value={jobSampleName}
                      onChange={(e) => setJobSampleName(e.target.value)}
                      placeholder="e.g. Standard Silicon Wafer, Chemical Sample A"
                      className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-border-strong"
                    />
                  </div>
                  <div>
                    <label htmlFor="page-sample-id-or-lot-number" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Sample ID or lot number</label>
                    <input id="page-sample-id-or-lot-number"
                      type="text"
                      value={jobSampleId}
                      onChange={(e) => setJobSampleId(e.target.value)}
                      placeholder="e.g. LOT-2026-06"
                      className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-border-strong"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="page-conditions-and-protocol" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Conditions and protocol</label>
                  <textarea id="page-conditions-and-protocol"
                    value={jobNotes}
                    onChange={(e) => setJobNotes(e.target.value)}
                    rows={2}
                    placeholder="e.g. 25 °C, pH 7.4, protocol v3, 45 min incubation"
                    className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-border-strong resize-none"
                  />
                </div>
              </div>
            )}

            {/* Progressive disclosure - instrument attachment and every other
                rarely-changed field stay out of the way until asked for. */}
            <button
              type="button"
              onClick={() => setShowRunMoreOptions((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-ink-secondary hover:text-foreground transition-colors cursor-pointer pt-1"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-[var(--duration-micro)] ${showRunMoreOptions ? 'rotate-180' : ''}`} />
              {showRunMoreOptions ? 'Fewer options' : 'More options'}
              <span className="text-ink-faint font-normal normal-case">(instrument, batch ID, linked task, tags, full timeline, notes)</span>
            </button>

            {showRunMoreOptions && (
              <div className="space-y-4 border-t border-border pt-4">
                <div>
                  <label htmlFor="page-instrument-optional" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Instrument (optional)</label>
                  <select id="page-instrument-optional"
                    value={jobInstrumentId}
                    onChange={(e) => {
                      setJobInstrumentId(e.target.value);
                      const inst = instruments.find(i => i.id === e.target.value);
                      if (inst) {
                        setJobRuntimePreset('custom');
                        setJobRuntimeCustom(String(parseMaxRuntimeToMinutes(inst.maxRuntime)));
                      } else {
                        setJobRuntimePreset('');
                        setJobRuntimeCustom('60');
                      }
                    }}
                    className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground text-sm focus:outline-none focus:border-border-strong"
                  >
                    <option value="">No instrument attached</option>
                    {instruments.map(i => (
                      <option key={i.id} value={i.id}>{i.name} ({i.category}){i.sharedFrom ? ` · shared: ${i.sharedFrom}` : ''}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="page-job-or-batch-id-optional" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Job or batch ID (optional)</label>
                    <input id="page-job-or-batch-id-optional"
                      type="text"
                      value={jobSubmitId}
                      onChange={(e) => setJobSubmitId(e.target.value)}
                      placeholder="e.g. job_10283"
                      className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-border-strong"
                    />
                  </div>
                  <div>
                    <label htmlFor="page-linked-task-optional" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Linked task (optional)</label>
                    <select id="page-linked-task-optional"
                      value={jobTaskId}
                      onChange={(e) => setJobTaskId(e.target.value)}
                      className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground text-sm focus:outline-none focus:border-border-strong"
                    >
                      <option value="">No linked task</option>
                      {(() => {
                        const chosenDateStr = jobSubmitTime ? jobSubmitTime.substring(0, 10) : '';
                        return tasks
                          .filter(t => {
                            if (t.id === jobTaskId) return true;
                            if (!chosenDateStr) return true;
                            return getLocalDateString(t.date, userTimezone) === chosenDateStr;
                          })
                          .map(t => (
                            <option key={t.id} value={t.id}>{t.name} ({t.status})</option>
                          ));
                      })()}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="page-linked-notebook-optional" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Linked notebook (optional)</label>
                    <select id="page-linked-notebook-optional"
                      value={jobNotebookPageId}
                      onChange={(e) => setJobNotebookPageId(e.target.value)}
                      className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground text-sm focus:outline-none focus:border-border-strong"
                    >
                      <option value="">No linked notebook</option>
                      {notebookPages.map(pg => (
                        <option key={pg.id} value={pg.id}>
                          {pg.notebookTitle}
                        </option>
                      ))}
                    </select>
                    {notebookPages.length === 0 && (
                      <p className="text-[11px] text-ink-faint mt-1">No notebooks yet.</p>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor="page-tags-comma-separated" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Tags (comma-separated)</label>
                  <input id="page-tags-comma-separated"
                    type="text"
                    value={jobTags}
                    onChange={(e) => setJobTags(e.target.value)}
                    placeholder="e.g. materials, simulation, batch-1"
                    className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-border-strong"
                  />
                </div>

                {/* Execution Timeline Card */}
                <div className="space-y-4 bg-surface-raised/50 border border-border/60 p-5 rounded-md">
                  <h4 className="font-semibold text-foreground text-[12.5px] flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" /> Timeline
                  </h4>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label htmlFor="page-submitted" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Submitted *</label>
                      <div className="space-y-2">
                        <input id="page-submitted"
                          type="date"
                          required
                          value={splitDateTime(jobSubmitTime).date}
                          onChange={(e) => setJobSubmitTime(combineDateTime(e.target.value, splitDateTime(jobSubmitTime).time))}
                                                   className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-border-strong font-mono"
                        />
                        <ClockTimePicker
                          value={splitDateTime(jobSubmitTime).time}
                          onChange={(newTime) => setJobSubmitTime(combineDateTime(splitDateTime(jobSubmitTime).date, newTime))}
                          placeholder="Submitted"
                          align="left"
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="page-projected-start" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Projected start</label>
                      <div className="space-y-2">
                        <input id="page-projected-start"
                          type="date"
                          value={splitDateTime(jobProjStartTime).date}
                          min={splitDateTime(jobSubmitTime).date}
                          onChange={(e) => setJobProjStartTime(combineDateTime(e.target.value, splitDateTime(jobProjStartTime).time))}
                                                   className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-border-strong font-mono"
                        />
                        <ClockTimePicker
                          value={splitDateTime(jobProjStartTime).time}
                          onChange={(newTime) => setJobProjStartTime(combineDateTime(splitDateTime(jobProjStartTime).date, newTime, splitDateTime(jobSubmitTime).date))}
                          placeholder="Start"
                          align="left"
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="page-projected-end" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Projected end</label>
                      <div className="space-y-2">
                        <input id="page-projected-end"
                          type="date"
                          value={splitDateTime(jobProjCompletionTime).date}
                          min={splitDateTime(jobProjStartTime).date || splitDateTime(jobSubmitTime).date}
                          onChange={(e) => {
                            setJobProjCompletionTime(combineDateTime(e.target.value, splitDateTime(jobProjCompletionTime).time));
                            setUserOverriddenCompletionTime(true);
                          }}
                                                   className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-border-strong font-mono"
                        />
                        <ClockTimePicker
                          value={splitDateTime(jobProjCompletionTime).time}
                          onChange={(newTime) => {
                            setJobProjCompletionTime(combineDateTime(splitDateTime(jobProjCompletionTime).date, newTime, splitDateTime(jobProjStartTime).date || splitDateTime(jobSubmitTime).date));
                            setUserOverriddenCompletionTime(true);
                          }}
                          placeholder="End"
                          align="right"
                        />
                      </div>
                      {userOverriddenCompletionTime && (
                        <button
                          type="button"
                          onClick={() => setUserOverriddenCompletionTime(false)}
                          className="text-[9px] text-muted-foreground hover:underline mt-1 block font-medium"
                        >
                          Reset to the calculated end time
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Instrument-defined runtime presets - only relevant once a
                    slots-type instrument is attached above; selecting one also
                    updates the always-visible Expected Duration field. */}
                {(() => {
                  const inst = instruments.find(i => i.id === jobInstrumentId);
                  const isSlots = inst && inst.runtimeType === 'slots';
                  if (!isSlots || !inst) return null;

                  return (
                    <div className="space-y-3 bg-surface-raised/50 border border-border/60 p-5 rounded-md">
                      <h4 className="font-semibold text-foreground text-[12.5px] flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-muted-foreground" /> Instrument presets
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {inst.slots.map(slot => (
                          <label key={slot} className="flex items-center gap-1 bg-surface-raised border border-border rounded-lg px-3 py-1.5 cursor-pointer font-mono text-sm">
                            <input
                              type="radio"
                              name="runtimePreset"
                              value={slot}
                              checked={jobRuntimePreset === slot}
                              onChange={() => {
                                setJobRuntimePreset(slot);
                                setJobRuntimeCustom(String(parseSlotMinutes(slot)));
                              }}
                              className="accent-white"
                            />
                            <span>{slot}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Reminders section */}
                <div className="bg-surface-raised/50 border border-border/60 p-5 rounded-md space-y-3">
                  <h4 className="font-semibold text-foreground text-[12.5px] flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5 text-muted-foreground" /> Reminders
                  </h4>

                  <label className="flex items-center space-x-3 text-foreground select-none cursor-pointer">
                    <input
                      type="checkbox"
                      checked={jobReminders.enabled}
                      onChange={(e) => setJobReminders({ enabled: e.target.checked })}
                      className="w-4 h-4 accent-white border-border-strong bg-surface-raised"
                    />
                    <span>Enable check-in reminders for this run</span>
                  </label>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    You’ll get a first reminder {jobReminderDefaultMins} minutes after this run starts to check whether it has failed,
                    then a reminder every {jobReminderRecurringMins} minutes until it finishes, plus alerts as it nears and passes its projected end time.
                    Change these defaults in <a href="/settings" className="text-primary hover:underline">Settings</a>.
                  </p>
                </div>

                {jobCategory !== 'Scientific Instrument' && (
                  <div>
                    <label htmlFor="page-notes" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Notes</label>
                    <textarea id="page-notes"
                      value={jobNotes}
                      onChange={(e) => setJobNotes(e.target.value)}
                      placeholder="Environment variables, libraries, hardware requirements, or other context"
                      rows={2}
                      className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-border-strong"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 border-t border-border pt-5 mt-6">
              <button
                type="button"
                onClick={closeJobModal}
                className="px-4 py-2 bg-surface-raised border border-border text-muted-foreground hover:text-foreground rounded-full"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-primary-foreground font-bold rounded-full transition-colors cursor-pointer"
              >
                {editingJob ? 'Save changes' : 'Create run'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL 3: COMPLETE JOB */}
      {isCompleteModalOpen && selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md bg-card border border-border rounded-md p-6 shadow-[var(--shadow-modal)]">
            <div className="flex justify-between items-center mb-5 border-b border-border pb-3">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-success" /> Finish run
              </h3>
              <button onClick={() => { setIsCompleteModalOpen(false); setSelectedJob(null); }} className="p-1 rounded-lg hover:bg-surface-sunken text-muted-foreground cursor-pointer" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCompleteJobSubmit} className="space-y-4 text-xs">
              <div>
                <span className="text-[11.5px] text-muted-foreground block font-semibold font-mono">Run</span>
                <p className="text-foreground font-bold text-sm mt-0.5">{selectedJob.name}</p>
              </div>

              <div>
                <label htmlFor="page-final-status" className="block text-[11.5px] font-semibold text-muted-foreground mb-1.5">Final status</label>
                <select id="page-final-status" 
                  value={compStatus}
                  onChange={(e) => setCompStatus(e.target.value)}
                  className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground text-xs focus:outline-none"
                >
                  <option value="Completed">Completed</option>
                  <option value="Failed">Failed</option>
                  <option value="Cancelled">Cancelled</option>
                  <option value="Timed Out">Timed Out (wall time)</option>
                </select>
              </div>

              <div>
                <label htmlFor="page-actual-end-time" className="block text-[11.5px] font-semibold text-muted-foreground mb-1.5">Actual end time *</label>
                <div className="grid grid-cols-2 gap-4">
                  <input id="page-actual-end-time" 
                    type="date" 
                    required
                    value={splitDateTime(compEndTime).date}
                    onChange={(e) => setCompEndTime(combineDateTime(e.target.value, splitDateTime(compEndTime).time))}
                                       className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-border-strong font-mono"
                  />
                  <ClockTimePicker 
                    value={splitDateTime(compEndTime).time}
                    onChange={(newTime) => setCompEndTime(combineDateTime(splitDateTime(compEndTime).date, newTime))}
                    placeholder="End"
                    align="right"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="page-notes-optional" className="block text-[11.5px] font-semibold text-muted-foreground mb-1.5">Notes (optional)</label>
                <textarea id="page-notes-optional" 
                  value={compNotes}
                  onChange={(e) => setCompNotes(e.target.value)}
                  placeholder="Exit codes, a summary of the output, or the log file location"
                  rows={3}
                  className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground text-xs focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-border pt-5 mt-6">
                <button 
                  type="button"
                  onClick={() => { setIsCompleteModalOpen(false); setSelectedJob(null); }}
                  className="px-4 py-2 bg-surface-raised border border-border text-muted-foreground hover:text-foreground rounded-full"
                >
                  Close
                </button>
                <button 
                  type="submit"
                  className="px-5 py-2.5 bg-success hover:bg-success text-black font-bold rounded-full"
                >
                  Finish run
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: REPORT FAILURE / RESUBMIT */}
      {isResubmitModalOpen && selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-lg bg-card border border-border rounded-md p-6 shadow-[var(--shadow-modal)] overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-5 border-b border-border pb-3">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-danger" /> Report failure
              </h3>
              <button onClick={() => { setIsResubmitModalOpen(false); setSelectedJob(null); }} className="p-1 rounded-lg hover:bg-surface-sunken text-muted-foreground cursor-pointer" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleResubmitSubmit} className="space-y-4 text-xs">
              <div className="bg-danger/5 border border-danger/10 rounded-md p-5 space-y-4">
                <h4 className="font-semibold text-danger text-[12.5px]">1. What happened</h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="page-failure-reason" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Failure reason</label>
                    <select id="page-failure-reason" 
                      value={failReason}
                      onChange={(e) => setFailReason(e.target.value)}
                      className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground text-sm focus:outline-none focus:border-border-strong"
                    >
                      <option value="Wall-time exceeded">Wall-time exceeded</option>
                      <option value="Out of memory (OOM)">Out of memory (OOM)</option>
                      <option value="Node failure">Node failure</option>
                      <option value="Queue preemption">Queue preemption</option>
                      <option value="Application error">Application error</option>
                      <option value="Input error">Input error</option>
                      <option value="Hardware failure">Hardware failure</option>
                      <option value="User cancelled">User cancelled</option>
                      <option value="OTHER">Other (specify below)</option>
                    </select>
                  </div>
                  {failReason === 'OTHER' ? (
                    <div>
                      <label htmlFor="page-failure-reason-2" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Failure reason</label>
                      <input id="page-failure-reason-2" 
                        type="text"
                        required
                        value={failCustomReason}
                        onChange={(e) => setFailCustomReason(e.target.value)}
                        placeholder="e.g. Cluster storage full"
                        className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-border-strong"
                      />
                    </div>
                  ) : (
                    <div>
                      <label htmlFor="page-final-status-2" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Final status</label>
                      <select id="page-final-status-2" 
                        value={failTermStatus}
                        onChange={(e) => setFailTermStatus(e.target.value)}
                        className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground text-sm focus:outline-none focus:border-border-strong"
                      >
                        <option value="Failed">Failed</option>
                        <option value="Cancelled">Cancelled</option>
                        <option value="Timed Out">Timed Out (wall time)</option>
                      </select>
                    </div>
                  )}
                </div>

                {failReason === 'OTHER' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="page-final-status-3" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Final status</label>
                      <select id="page-final-status-3" 
                        value={failTermStatus}
                        onChange={(e) => setFailTermStatus(e.target.value)}
                        className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground text-sm focus:outline-none focus:border-border-strong"
                      >
                        <option value="Failed">Failed</option>
                        <option value="Cancelled">Cancelled</option>
                        <option value="Timed Out">Timed Out (wall time)</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="page-actual-end-time-2" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Actual end time *</label>
                      <div className="space-y-2">
                        <input id="page-actual-end-time-2" 
                          type="date"
                          required
                          value={splitDateTime(failEndTime).date}
                          onChange={(e) => setFailEndTime(combineDateTime(e.target.value, splitDateTime(failEndTime).time))}
                                                   className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground text-sm font-mono focus:outline-none focus:border-border-strong"
                        />
                        <ClockTimePicker 
                          value={splitDateTime(failEndTime).time}
                          onChange={(newTime) => setFailEndTime(combineDateTime(splitDateTime(failEndTime).date, newTime))}
                          placeholder="End"
                          align="right"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {failReason !== 'OTHER' && (
                  <div>
                    <label htmlFor="page-actual-end-time-3" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Actual end time *</label>
                    <div className="grid grid-cols-2 gap-4">
                      <input id="page-actual-end-time-3" 
                        type="date"
                        required
                        value={splitDateTime(failEndTime).date}
                        onChange={(e) => setFailEndTime(combineDateTime(e.target.value, splitDateTime(failEndTime).time))}
                                               className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground text-sm font-mono focus:outline-none focus:border-border-strong"
                      />
                      <ClockTimePicker 
                        value={splitDateTime(failEndTime).time}
                        onChange={(newTime) => setFailEndTime(combineDateTime(splitDateTime(failEndTime).date, newTime))}
                        placeholder="End"
                        align="right"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="page-failure-notes-optional" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Failure notes (optional)</label>
                  <input id="page-failure-notes-optional" 
                    type="text" 
                    value={failNotes}
                    onChange={(e) => setFailNotes(e.target.value)}
                    placeholder="e.g. Segmentation fault at line 482"
                    className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-border-strong"
                  />
                </div>
              </div>

              <div className="bg-surface-raised/50 border border-border/60 rounded-md p-5 space-y-4">
                <h4 className="font-semibold text-foreground text-[12.5px]">2. Resubmit (optional)</h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="page-new-job-id" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">New job ID</label>
                    <input id="page-new-job-id" 
                      type="text"
                      value={resubJobId}
                      onChange={(e) => setResubJobId(e.target.value)}
                      placeholder="e.g. 947115"
                      className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-border-strong"
                    />
                  </div>
                  <div>
                    <label htmlFor="page-updated-compute-duration-min-opt" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Updated compute duration (min, optional)</label>
                    <input id="page-updated-compute-duration-min-opt" 
                      type="number"
                      value={resubComputeTime}
                      onChange={(e) => setResubComputeTime(e.target.value)}
                      placeholder={`Current: ${selectedJob.computeTime}m`}
                      className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-border-strong"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="page-resubmission-time" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Resubmission time</label>
                    <div className="space-y-2">
                      <input id="page-resubmission-time" 
                        type="date"
                        value={splitDateTime(resubSubmitTime).date}
                        onChange={(e) => setResubSubmitTime(combineDateTime(e.target.value, splitDateTime(resubSubmitTime).time))}
                                               className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground text-sm font-mono focus:outline-none focus:border-border-strong"
                      />
                      <ClockTimePicker 
                        value={splitDateTime(resubSubmitTime).time}
                        onChange={(newTime) => setResubSubmitTime(combineDateTime(splitDateTime(resubSubmitTime).date, newTime))}
                        placeholder="Submitted"
                        align="left"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="page-projected-start-2" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Projected start</label>
                    <div className="space-y-2">
                      <input id="page-projected-start-2" 
                        type="date"
                        value={splitDateTime(resubProjStartTime).date}
                        min={splitDateTime(resubSubmitTime).date}
                        onChange={(e) => setResubProjStartTime(combineDateTime(e.target.value, splitDateTime(resubProjStartTime).time))}
                                               className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground text-sm font-mono focus:outline-none focus:border-border-strong"
                      />
                      <ClockTimePicker 
                        value={splitDateTime(resubProjStartTime).time}
                        onChange={(newTime) => setResubProjStartTime(combineDateTime(splitDateTime(resubProjStartTime).date, newTime, splitDateTime(resubSubmitTime).date))}
                        placeholder="Start"
                        align="right"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="page-updated-input-script-optional" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Updated input script (optional)</label>
                    <input id="page-updated-input-script-optional" 
                      type="text"
                      value={resubInputFile}
                      onChange={(e) => setResubInputFile(e.target.value)}
                      placeholder="Leave blank to keep the current one"
                      className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-border-strong"
                    />
                    {selectedJob.inputFile && <p className="mt-1 truncate text-[12.5px] text-ink-faint" title={selectedJob.inputFile}>Current: <span className="font-mono">{selectedJob.inputFile}</span></p>}
                  </div>
                  <div>
                    <label htmlFor="page-updated-working-directory-option" className="block text-[12.5px] font-semibold text-muted-foreground mb-2">Updated working directory (optional)</label>
                    <input id="page-updated-working-directory-option" 
                      type="text"
                      value={resubWorkDir}
                      onChange={(e) => setResubWorkDir(e.target.value)}
                      placeholder="Leave blank to keep the current one"
                      className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-border-strong"
                    />
                    {selectedJob.workingDirectory && <p className="mt-1 truncate text-[12.5px] text-ink-faint" title={selectedJob.workingDirectory}>Current: <span className="font-mono">{selectedJob.workingDirectory}</span></p>}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-border pt-5 mt-6">
                <button 
                  type="button"
                  onClick={() => { setIsResubmitModalOpen(false); setSelectedJob(null); }}
                  className="px-4 py-2 bg-surface-raised border border-border text-muted-foreground hover:text-foreground rounded-full cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="button"
                  onClick={handleFailureAndTerminate}
                  className="px-5 py-2.5 bg-surface-sunken hover:bg-border-strong border border-border-strong text-foreground font-bold rounded-full cursor-pointer"
                >
                  Report failure
                </button>
                <button 
                  type="submit"
                  className="px-5 py-2.5 bg-danger hover:bg-danger-hover text-danger-foreground font-bold rounded-full cursor-pointer"
                >
                  Resubmit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: ATTEMPT HISTORY LIST (DRAWER) */}
      {isAttemptHistoryOpen && selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-xl bg-card border border-border rounded-md p-6 shadow-[var(--shadow-modal)] overflow-y-auto max-h-[90vh] space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <History className="w-5 h-5 text-muted-foreground" /> Attempt history
              </h3>
              <button onClick={() => { setIsAttemptHistoryOpen(false); setSelectedJob(null); }} className="p-1 rounded-lg hover:bg-surface-sunken text-muted-foreground cursor-pointer" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1.5">
              <span className="text-[11.5px] text-ink-faint block font-semibold font-mono">Run</span>
              <h4 className="text-foreground font-black text-sm">{selectedJob.name}</h4>
              <p className="text-muted-foreground text-xs font-light leading-relaxed">{selectedJob.notes || 'No notes.'}</p>
            </div>

            <div className="space-y-3">
              <span className="text-[11.5px] text-muted-foreground font-semibold block">Attempts</span>
              <div className="space-y-3">
                {selectedJob.attempts.map((att) => {
                  const formattedSubmit = new Date(att.submitTime).toLocaleString();
                  const formattedEnd = att.actualEndTime ? new Date(att.actualEndTime).toLocaleString() : '-';
                  return (
                    <div key={att.attemptNumber} className="bg-surface-sunken border border-border/60 p-4.5 rounded-md text-xs space-y-2">
                      <div className="flex justify-between items-center border-b border-border pb-2">
                        <span className="font-bold text-foreground">Attempt #{att.attemptNumber}</span>
                        <span className={`px-2 py-0.5 rounded text-[11.5px] font-semibold font-mono ${
                          att.status === 'Completed' ? 'bg-success/10 text-success' :
                          att.status === 'Running' ? 'bg-primary/10 text-primary' :
                          att.status === 'Queued' ? 'bg-warning/10 text-warning' :
                          'bg-danger/10 text-danger'
                        }`}>
                          {att.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                        <div><strong>Job ID:</strong> {att.jobId || 'N/A'}</div>
                        <div><strong>Compute time:</strong> {Math.round(getActualAttemptMinutes(att, selectedJob.status))} minutes</div>
                        <div className="col-span-2"><strong>Submitted:</strong> {formattedSubmit}</div>
                        {att.actualEndTime && (
                          <div className="col-span-2"><strong>Terminated:</strong> {formattedEnd}</div>
                        )}
                        {att.inputFile && (
                          <div className="col-span-2"><strong>Input file:</strong> {att.inputFile}</div>
                        )}
                        {att.failureReason && (
                          <div className="col-span-2 border-t border-border pt-1.5 mt-1.5 text-danger">
                            <strong>Failure reason:</strong> {att.failureReason}
                            {att.failureNotes && <div className="text-muted-foreground text-[10px] mt-0.5 italic">{att.failureNotes}</div>}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-border">
              <button 
                onClick={() => { setIsAttemptHistoryOpen(false); setSelectedJob(null); }}
                className="px-5 py-2 bg-surface-raised hover:bg-surface-sunken text-foreground rounded-full"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
