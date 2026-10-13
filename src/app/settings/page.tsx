'use client';

import { LoadError } from '@/components/LoadError';
import React, { useState, useEffect } from 'react';
import { useSession } from '@/context/SessionContext';
import { useNotifications } from '@/context/NotificationContext';
import { RecoveryQuestionSettings } from '@/components/settings/RecoveryQuestionSettings';
import { useRouter } from 'next/navigation';
import {
  Settings,
  ShieldCheck,
  Save,
  Info,
  User,
  Upload,
  RefreshCw,
  Calendar,
  Clock,
  HelpCircle,
  Monitor,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Trash2,
  KeyRound
} from 'lucide-react';
import { getLocalDateString, isDefaultWorking } from '@/lib/dateUtils';
import { SETTINGS_FIELDS } from '@/lib/settingsFields';
import { Modal } from '@/components/Modal';
import { TimezonePicker } from '@/components/TimezonePicker';
import { ApiTokensPanel } from '@/components/ApiTokensPanel';
import { PageHeader } from '@/components/ui';

/** Looks up a field's canonical label/description from the single source of truth. */
function fieldMeta(key: string): { label: string; description: string } {
  const field = SETTINGS_FIELDS.find(f => f.key === key);
  return { label: field?.label || key, description: field?.description || '' };
}

// Per-type opt-outs, grouped for the "Notifications & Reminders" section.
// TASK_REMINDER (the "Task Reminders" toggle above) and JOB_REMINDER/
// JOB_RECURRING/JOB_TERMINATION (the check-in timing controls above) already
// have their own dedicated controls in that section, so aren't repeated here.
const NOTIFICATION_PREFERENCE_GROUPS: { label: string; items: { type: string; label: string; description: string }[] }[] = [
  {
    label: 'Tasks',
    items: [
      { type: 'TASK_ASSIGNED', label: 'Assigned to you', description: 'Someone on your team hands you a task.' },
      { type: 'TASK_ACCEPTED', label: 'Assignment accepted', description: 'A task you assigned to someone is accepted.' },
      { type: 'TASK_DECLINED', label: 'Assignment declined', description: 'A task you assigned to someone is declined.' },
      { type: 'TASK_BLOCKED', label: 'Waiting on you', description: 'A teammate marks a task as blocked on you.' },
    ]
  },
  {
    label: 'Runs',
    items: [
      { type: 'RUN_APPROACHING_END', label: 'Nearing projected finish', description: 'A run is close to its projected finish time.' },
      { type: 'RUN_OVERDUE', label: 'Past projected finish', description: 'A run has passed its projected finish time.' },
    ]
  },
  {
    label: 'Notebook',
    items: [
      { type: 'NOTEBOOK_REVIEW_REQUESTED', label: 'Review requests and sign-offs', description: 'A page is sent to you for review, or a reviewer signs off on yours.' },
      { type: 'NOTEBOOK_COMMENT', label: 'Comments', description: 'Someone comments on a notebook page you own or can review.' },
    ]
  },
  {
    label: 'Chat',
    items: [
      { type: 'CHAT_MENTION', label: 'Mentions', description: 'Someone @mentions you in team chat.' },
    ]
  },
  {
    label: 'Digest',
    items: [
      { type: 'WEEKLY_DIGEST', label: 'Weekly digest', description: 'A summary of the week ahead, sent at the start of each week.' },
    ]
  }
];

export default function SettingsPage() {
  const { user, logout, refreshSession } = useSession();
  const { toast } = useNotifications();
  // Set when /api/settings didn't load: saving then would replace the
  // real settings with this page's defaults, so saves are blocked.
  const [settingsLoadFailed, setSettingsLoadFailed] = useState(false);
  const [settingsReload, setSettingsReload] = useState(0);
  const router = useRouter();
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    if (newPassword.length < 10) {
      setPasswordError('Use at least 10 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords don’t match.');
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch('/api/user/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: user?.hasPassword ? currentPassword : undefined, newPassword })
      });
      const data = await res.json();
      if (res.ok) {
        toast(user?.hasPassword ? 'Password changed' : 'Password set', 'You can now also sign in with your email and password.', 'success');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        await refreshSession();
      } else {
        setPasswordError(data.error || 'Couldn’t save the password. Try again.');
      }
    } catch {
      setPasswordError('Couldn’t save the password. Check your connection and try again.');
    } finally {
      setSavingPassword(false);
    }
  };

  // Accounts with a password confirm with it (checked on the server); an old
  // account without one types its email instead.
  const deleteConfirmReady = user?.hasPassword
    ? deleteConfirmText.length > 0
    : deleteConfirmText.trim().toLowerCase() === (user?.email || '').toLowerCase();

  const handleDeleteAccount = async () => {
    if (!deleteConfirmReady) return;
    setDeletingAccount(true);
    setDeleteAccountError(null);
    try {
      const res = await fetch('/api/user/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user?.hasPassword ? { password: deleteConfirmText } : { confirmEmail: deleteConfirmText }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        // Session cookie is already cleared server-side; refreshSession()
        // picks that up and ClientLayout's existing redirect-when-logged-out
        // effect takes it from here.
        await refreshSession();
      } else {
        setDeleteAccountError(data.error || 'Couldn’t delete the account. Try again.');
      }
    } catch (err) {
      console.error('Error deleting account:', err);
      setDeleteAccountError('Couldn’t delete the account. Try again.');
    } finally {
      setDeletingAccount(false);
    }
  };

  // Profile Photo Upload Handlers
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 128;
        const MAX_HEIGHT = 128;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
          
          fetch('/api/user/avatar', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ avatarUrl: compressedBase64 })
          })
          .then(async (res) => {
            if (res.ok) {
              await refreshSession();
            }
          })
          .catch((err) => {
            console.error('Failed to upload compressed profile picture:', err);
          });
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = async () => {
    try {
      const res = await fetch('/api/user/avatar', {
        method: 'DELETE'
      });
      if (res.ok) {
        await refreshSession();
      }
    } catch (err) {
      console.error('Failed to remove profile picture:', err);
    }
  };
  
  // Settings Form States
  const [autoSyncTaskStatus, setAutoSyncTaskStatus] = useState(true);
  const [allowConcurrentTasks, setAllowConcurrentTasks] = useState(false);
  const [taskNotificationsEnabled, setTaskNotificationsEnabled] = useState(true);
  const [notificationPreferences, setNotificationPreferences] = useState<Record<string, boolean>>({});
  
  // Work Schedule & Focus Preferences
  const [workingDays, setWorkingDays] = useState<string[]>([]);
  const [workStart, setWorkStart] = useState('08:00');
  const [workEnd, setWorkEnd] = useState('18:00');
  const [deepWorkStart, setDeepWorkStart] = useState('09:00');
  const [deepWorkEnd, setDeepWorkEnd] = useState('12:00');
  const [deepWorkMaxSession, setDeepWorkMaxSession] = useState(90);
  const [jobReminderDefaultMins, setJobReminderDefaultMins] = useState(15);
  const [jobReminderRecurringMins, setJobReminderRecurringMins] = useState(10);
  const [showOffDayWork, setShowOffDayWork] = useState(false);
  const [createdAt, setCreatedAt] = useState('');
  
  // Work Calendar State
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState<Date>(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  
  // Selected Day configuration local state
  const [localDayType, setLocalDayType] = useState('working');
  const [localDayComment, setLocalDayComment] = useState('');
  const [daySaveSuccess, setDaySaveSuccess] = useState(false);
  const [isSavingDay, setIsSavingDay] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);
  const [pendingImportData, setPendingImportData] = useState<any>(null);

  // One section at a time, linkable as /settings?section=<key>.
  const [activeSection, setActiveSection] = useState<string>(() => {
    if (typeof window === 'undefined') return 'general';
    return new URLSearchParams(window.location.search).get('section') || 'general';
  });
  const chooseSection = (key: string) => {
    setActiveSection(key);
    try { window.history.replaceState(null, '', `/settings?section=${key}`); } catch {}
  };

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getLocalDateStringUTC = (year: number, month: number, day: number) => {
    const y = String(year);
    const m = String(month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // Helper to parse workingDays entries
  const getDayConfig = (dateStr: string) => {
    const entry = workingDays.find(d => d.startsWith(dateStr));
    if (!entry) return null;
    const parts = entry.split(':');
    return {
      dateStr: parts[0],
      type: parts[1] || 'working', // 'working', 'off', 'leave', 'other'
      comment: parts[2] || ''
    };
  };

  const handleDayConfigChange = (dateStr: string, newType: string, newComment: string) => {
    const parts = dateStr.split('-');
    const monthKey = `${parts[0]}-${parts[1]}`;
    const marker = `cfg:${monthKey}`;
    
    // Remove existing config for this day
    const newWorking = workingDays.filter(d => !d.startsWith(dateStr) && d !== marker);
    
    let suffix = '';
    if (newType !== 'working' || newComment) {
      suffix = `:${newType}${newComment ? `:${newComment}` : ''}`;
    }
    
    newWorking.push(`${dateStr}${suffix}`);
    newWorking.push(marker); // Keep month marked as configured
    
    setWorkingDays(newWorking);
  };

  const handleClearDayConfig = (dateStr: string) => {
    setWorkingDays(prev => prev.filter(d => !d.startsWith(dateStr)));
  };

  const handleSaveDayConfig = async () => {
    if (settingsLoadFailed) { toast('Settings not loaded', 'Your saved settings couldn’t be loaded, so saving now could overwrite them. Try again first.', 'error'); return; }
    if (!selectedDay) return;
    setIsSavingDay(true);
    setDaySaveSuccess(false);
    
    const parts = selectedDay.split('-');
    const monthKey = `${parts[0]}-${parts[1]}`;
    const marker = `cfg:${monthKey}`;
    
    const newWorking = workingDays.filter(d => !d.startsWith(selectedDay) && d !== marker);
    
    let suffix = '';
    if (localDayType !== 'working' || localDayComment) {
      suffix = `:${localDayType}${localDayComment ? `:${localDayComment}` : ''}`;
    }
    
    newWorking.push(`${selectedDay}${suffix}`);
    newWorking.push(marker);
    
    setWorkingDays(newWorking);
    
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workStart,
          workEnd,
          workingDays: newWorking.join(','),
          deepWorkStart,
          deepWorkEnd,
          deepWorkMaxSession,
          jobReminderDefaultMins,
          jobReminderRecurringMins,
          allowConcurrentTasks,
          taskNotificationsEnabled,
          showOffDayWork,
          name: profileName,
          timezone,
          theme
        })
      });
      if (res.ok) {
        setDaySaveSuccess(true);
        window.dispatchEvent(new CustomEvent('rune-settings-updated'));
        await refreshSession();
        setTimeout(() => setDaySaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Failed to save day config:', err);
    } finally {
      setIsSavingDay(false);
    }
  };

  const handleResetDayConfig = async () => {
    if (settingsLoadFailed) { toast('Settings not loaded', 'Your saved settings couldn’t be loaded, so saving now could overwrite them. Try again first.', 'error'); return; }
    if (!selectedDay) return;
    setIsSavingDay(true);
    
    const newWorking = workingDays.filter(d => !d.startsWith(selectedDay));
    setWorkingDays(newWorking);
    
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workStart,
          workEnd,
          workingDays: newWorking.join(','),
          deepWorkStart,
          deepWorkEnd,
          deepWorkMaxSession,
          jobReminderDefaultMins,
          jobReminderRecurringMins,
          allowConcurrentTasks,
          taskNotificationsEnabled,
          showOffDayWork,
          name: profileName,
          timezone,
          theme
        })
      });
      if (res.ok) {
        window.dispatchEvent(new CustomEvent('rune-settings-updated'));
        await refreshSession();
        setSelectedDay(null);
      }
    } catch (err) {
      console.error('Failed to reset day config:', err);
    } finally {
      setIsSavingDay(false);
    }
  };

  const handlePrevMonth = () => {
    setCurrentCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const renderCalendarDays = () => {
    const year = currentCalendarMonth.getFullYear();
    const month = currentCalendarMonth.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    
    const startOffset = (new Date(year, month, 1).getDay() + 6) % 7;
    
    const cells = [];
    for (let i = 0; i < startOffset; i++) {
      cells.push(<div key={`empty-${i}`} className="h-12 bg-transparent rounded-lg"></div>);
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = getLocalDateStringUTC(year, month, day);
      const config = getDayConfig(dateStr);
      
      let type = 'unconfigured';
      let comment = '';
      let isWorking = false;
      
      if (config) {
        type = config.type;
        comment = config.comment;
        isWorking = type === 'working' || !['off', 'leave', 'other'].includes(type);
      } else {
        isWorking = isDefaultWorking(dateStr, createdAt);
      }
      
      const todayStr = getLocalDateString(new Date(), timezone);
      const isToday = dateStr === todayStr;
      const isSelected = dateStr === selectedDay;
      
      let btnStyles = 'bg-surface-sunken text-ink-faint border-border hover:border-border-strong hover:text-foreground';
      if (isWorking) {
        btnStyles = 'bg-primary-soft text-primary border-primary hover:bg-primary-soft';
      } else if (type === 'off') {
        btnStyles = 'bg-surface-sunken text-ink-faint border-border hover:border-border-strong';
      } else if (type === 'leave') {
        btnStyles = 'bg-danger-soft text-danger border-danger hover:bg-danger-soft';
      } else if (type === 'other') {
        btnStyles = 'bg-warning-soft text-warning border-warning hover:bg-warning-soft';
      }
      
      if (isSelected) {
        btnStyles += ' ring-2 ring-primary ring-offset-1 ring-offset-background';
      } else if (isToday) {
        btnStyles += ' ring-1 ring-border-strong ring-offset-1 ring-offset-background';
      }
      
      cells.push(
        <button
          key={`day-${day}`}
          type="button"
          onClick={() => setSelectedDay(dateStr)}
          className={`h-12 text-[13.5px] font-semibold rounded-md border transition-colors flex flex-col items-center justify-center relative cursor-pointer p-1 ${btnStyles}`}
        >
          <span>{day}</span>
          <div className="flex gap-0.5 mt-0.5">
            {type === 'leave' && <span className="w-1 h-1 bg-danger rounded-full" />}
            {type === 'other' && <span className="w-1 h-1 bg-warning rounded-full" />}
            {type === 'off' && <span className="w-1 h-1 bg-ink-faint rounded-full" />}
            {comment && <span className="w-1.5 h-1.5 bg-primary rounded-full" title={comment} />}
          </div>
        </button>
      );
    }
    return cells;
  };

  // Profile Settings
  const [profileName, setProfileName] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [showTimezonePicker, setShowTimezonePicker] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [fontSize, setFontSize] = useState('medium');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (selectedDay) {
      const config = getDayConfig(selectedDay);
      const defaultWorking = isDefaultWorking(selectedDay, createdAt);
      setLocalDayType(config?.type || (defaultWorking ? 'working' : 'off'));
      setLocalDayComment(config?.comment || '');
      setDaySaveSuccess(false);
    }
  }, [selectedDay]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/settings');
        setSettingsLoadFailed(!res.ok);
        if (res.ok) {
          const data = await res.json();
          setWorkStart(data.workStart || '08:00');
          setWorkEnd(data.workEnd || '18:00');
          if (data.workingDays) {
            setWorkingDays(data.workingDays.split(','));
          }
          setDeepWorkStart(data.deepWorkStart || '09:00');
          setDeepWorkEnd(data.deepWorkEnd || '12:00');
          setDeepWorkMaxSession(data.deepWorkMaxSession !== undefined ? Number(data.deepWorkMaxSession) : 90);
          setJobReminderDefaultMins(data.jobReminderDefaultMins !== undefined ? Number(data.jobReminderDefaultMins) : 15);
          setJobReminderRecurringMins(data.jobReminderRecurringMins !== undefined ? Number(data.jobReminderRecurringMins) : 10);
          setAllowConcurrentTasks(data.allowConcurrentTasks === true);
          setTaskNotificationsEnabled(data.taskNotificationsEnabled !== false);
          setNotificationPreferences(data.notificationPreferences || {});
          setShowOffDayWork(data.showOffDayWork === true);
          setProfileName(data.name || '');
          setTimezone(data.timezone || 'UTC');
          setTheme(data.theme || 'dark');
          setCreatedAt(data.createdAt || '');
          
          const syncVal = localStorage.getItem('rune_auto_sync_task_status');
          if (syncVal !== null) {
            setAutoSyncTaskStatus(syncVal === 'true');
          }
        }
      } catch (err) {
        setSettingsLoadFailed(true);
        console.error(err);
      } finally {
        const localFontSize = localStorage.getItem('rune_font_size') || 'medium';
        setFontSize(localFontSize);
        setLoading(false);
      }
    };
    fetchSettings();
  }, [settingsReload]);

  // /api/settings replaces every Setting field with its default when a
  // key is missing from the request body (see buildSettingsPayload) — so
  // a "just persist theme" call would silently wipe workStart/workingDays/
  // etc back to defaults. Any partial update has to go through this same
  // full-payload shape; buildSettingsBody takes overrides for the one or
  // two fields that actually changed.
  const buildSettingsBody = (overrides: Record<string, unknown> = {}) => ({
    workStart,
    workEnd,
    workingDays: workingDays.join(','),
    deepWorkStart,
    deepWorkEnd,
    deepWorkMaxSession,
    jobReminderDefaultMins,
    jobReminderRecurringMins,
    allowConcurrentTasks,
    taskNotificationsEnabled,
    notificationPreferences,
    showOffDayWork,
    name: profileName,
    timezone,
    theme,
    ...overrides
  });

  // Theme applies instantly (localStorage + a live event ClientLayout
  // listens for) and persists to the account right away — a toggle like
  // this shouldn't require a separate "Save" click to survive a reload.
  const handleThemeChange = async (next: 'dark' | 'light' | 'system') => {
    setTheme(next);
    // ClientLayout resolves 'system' against the OS and applies it.
    window.dispatchEvent(new CustomEvent('rune-theme-changed', { detail: next }));
    if (settingsLoadFailed) return;
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildSettingsBody({ theme: next }))
      });
      await refreshSession();
    } catch (err) {
      console.error('Failed to persist theme', err);
    }
  };

  const handleFontSizeChange = (next: string) => {
    setFontSize(next);
    localStorage.setItem('rune_font_size', next);
    document.body.setAttribute('data-font-size', next);
    document.documentElement.setAttribute('data-font-size', next);
    window.dispatchEvent(new CustomEvent('rune-font-size-changed', { detail: next }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (settingsLoadFailed) { toast('Settings not loaded', 'Your saved settings couldn’t be loaded, so saving now could overwrite them. Try again first.', 'error'); return; }
    setSaving(true);
    setSaveSuccess(false);

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildSettingsBody())
      });
      if (res.ok) {
        setSaveSuccess(true);
        localStorage.setItem('rune_auto_sync_task_status', String(autoSyncTaskStatus));
        localStorage.setItem('rune_font_size', fontSize);
        window.dispatchEvent(new CustomEvent('rune-font-size-changed', { detail: fontSize }));
        window.dispatchEvent(new CustomEvent('rune-settings-updated'));
        await refreshSession();
        setTimeout(() => setSaveSuccess(false), 4000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const togglePreference = (type: string, enabled: boolean) => {
    setNotificationPreferences((prev) => ({ ...prev, [type]: enabled }));
  };

  const handleRevisitWizard = () => {
    router.push('/onboarding?revisit=true');
  };

  const isDeveloperAccount = user?.isDeveloper;

  const handleExportAllData = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/user/backup');
      if (!res.ok) throw new Error('Couldn’t fetch your backup data');
      const data = await res.json();
      
      const username = data.username || user?.name || 'user';
      const cleanUsername = username.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      
      // format local timestamp
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const timestamp = `${year}${month}${day}_${hours}${minutes}${seconds}`;
      
      const filename = `${cleanUsername}_rune_backup_${timestamp}.json`;
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = url;
      downloadAnchor.download = filename;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      document.body.removeChild(downloadAnchor);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      toast('Export failed', 'Your data could not be exported. Try again.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setImportError(null);
    setImportSuccess(false);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (!json || json.version !== '1.0') {
          setImportError('This isn’t a valid Rune backup file.');
          return;
        }
        setPendingImportData(json);
        setImportConfirmOpen(true);
      } catch (err) {
        setImportError('Couldn’t read the file. Choose a Rune backup (.json).');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleConfirmImport = async () => {
    if (!pendingImportData) return;
    setImportConfirmOpen(false);
    setImporting(true);
    setImportError(null);
    
    try {
      const res = await fetch('/api/user/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pendingImportData)
      });
      
      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Couldn’t restore the backup');
      }
      
      setImportSuccess(true);
      setPendingImportData(null);
      
      window.dispatchEvent(new CustomEvent('rune-settings-updated'));
      await refreshSession();
      window.location.reload();
    } catch (err: any) {
      console.error(err);
      setImportError(err.message || 'Couldn’t import the backup');
    } finally {
      setImporting(false);
    }
  };

  const SECTIONS: { key: string; label: string; description: string; group: string; saves?: boolean }[] = [
    { key: 'general', label: 'Profile and appearance', description: 'Your name, photo and time zone, and how Rune looks.', group: 'You', saves: true },
    { key: 'notifications', label: 'Notifications', description: 'What Rune tells you about, and when.', group: 'You', saves: true },
    { key: 'calendar', label: 'Working hours', description: 'Your working hours and days, days off and leave. Today and Analytics are built on these.', group: 'Your work', saves: true },
    { key: 'taskPrefs', label: 'Tasks and planner', description: 'How tasks and calendar events stay in sync, and whether time slots can overlap.', group: 'Your work', saves: true },
    { key: 'integrations', label: 'Integrations', description: 'Access tokens for the Rune MCP server and the chat bots built on it.', group: 'Data and connections' },
    { key: 'dataExport', label: 'Backups', description: 'Download a backup of your workspace, or restore one after data loss or a move.', group: 'Data and connections' },
    { key: 'advanced', label: 'Sign-in and security', description: 'Your password and recovery question, and running the setup steps again.', group: 'Account' },
    ...(!isDeveloperAccount ? [{ key: 'dangerZone', label: 'Delete account', description: 'Permanently delete your account and everything in it.', group: 'Account' }] : []),
  ];
  const current = SECTIONS.find((x) => x.key === activeSection) ?? SECTIONS[0];
  const groups = [...new Set(SECTIONS.map((x) => x.group))];

  return (
    <div className="max-w-6xl space-y-8">
      <PageHeader className="" title="Settings" subtitle="Everything that shapes how Rune works for you." />
      {settingsLoadFailed && <LoadError what="your settings" onRetry={() => setSettingsReload((n) => n + 1)} />}
      {loading ? (
        <div className="grid gap-8 md:grid-cols-[220px_minmax(0,1fr)] animate-pulse">
          <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-8 rounded-[8px] bg-surface-raised" />)}</div>
          <div className="h-96 rounded-[14px] bg-surface-raised" />
        </div>
      ) : (
        <div className="grid gap-8 md:grid-cols-[220px_minmax(0,1fr)] lg:gap-12">
          {/* Section list (a select on phones) */}
          <nav aria-label="Settings sections" className="md:sticky md:top-0 md:self-start">
            <label className="md:hidden">
              <span className="sr-only">Section</span>
              <select value={current.key} onChange={(e) => chooseSection(e.target.value)} className="h-10 w-full rounded-[10px] border border-border-strong bg-surface px-3 text-[14px]">
                {SECTIONS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
            </label>
            <div className="hidden space-y-6 md:block">
              {groups.map((g) => (
                <div key={g}>
                  <p className="mb-1.5 px-2.5 text-[12px] font-medium text-ink-faint">{g}</p>
                  <ul className="space-y-0.5">
                    {SECTIONS.filter((x) => x.group === g).map((x) => (
                      <li key={x.key}>
                        <button
                          type="button"
                          onClick={() => chooseSection(x.key)}
                          aria-current={current.key === x.key ? 'page' : undefined}
                          className={`w-full rounded-[8px] px-2.5 py-[7px] text-left text-[14px] transition-colors ${
                            current.key === x.key ? 'bg-surface font-semibold text-foreground shadow-[0_0_0_1px_var(--border-c)]' : x.key === 'dangerZone' ? 'text-danger hover:bg-danger-soft' : 'text-ink-secondary hover:bg-surface-sunken hover:text-foreground'
                          }`}
                        >
                          {x.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </nav>

          <div className="min-w-0">
            <header className="mb-7 border-b border-foreground/75 pb-4">
              <h2 className={`font-serif text-[26px] font-medium tracking-[-0.015em] ${current.key === 'dangerZone' ? 'text-danger' : 'text-foreground'}`}>{current.label}</h2>
              <p className="mt-1 text-[14px] text-ink-secondary">{current.description}</p>
            </header>
        <form onSubmit={handleSave} className={SECTIONS.find((x) => x.key === activeSection)?.saves ? 'space-y-4' : 'hidden'}>
          
          {/* SECTION 1: GENERAL */}
          <div className={activeSection === 'general' ? '' : 'hidden'}>
            {activeSection === 'general' && (
              <div className="space-y-6">
                <div className="flex flex-col md:flex-row gap-6 items-start">
                  {/* Avatar Upload block */}
                  <div className="flex items-center gap-4 bg-surface-sunken/40 border border-border p-4 rounded-md w-full md:w-auto shrink-0 justify-center">
                    <div className="relative group w-16 h-16 shrink-0">
                      {user?.avatarUrl && !user.avatarUrl.includes('dicebear.com') ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img 
                          src={user.avatarUrl} 
                          alt={user.name || 'User'} 
                          className="w-16 h-16 rounded-md object-cover border border-border-strong"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-md bg-surface-raised border border-border-strong text-muted-foreground flex items-center justify-center text-xl font-extrabold font-display">
                          {user?.name?.[0] || 'U'}
                        </div>
                      )}
                      
                      <label className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 rounded-md cursor-pointer transition-opacity duration-200 border border-border-strong">
                        <Upload className="w-3.5 h-3.5 text-foreground mb-0.5" />
                        <span className="text-[12px] font-semibold text-foreground">Upload</span>
                        <input 
                          type="file" 
                          accept="image/*" 
                          onChange={handleAvatarUpload} 
                          className="hidden" 
                        />
                      </label>
                    </div>
                    
                    <div className="space-y-1">
                      <h4 className="text-[13.5px] font-bold text-foreground leading-none">{user?.name || 'Developer'}</h4>
                      <p className="text-[12.5px] text-muted-foreground font-mono leading-none">{user?.email}</p>
                      {user?.avatarUrl && (
                        <button 
                          type="button"
                          onClick={handleRemoveAvatar}
                          className="text-[12.5px] text-danger hover:text-danger block hover:underline transition-colors pt-1"
                        >
                          Remove photo
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Name and Timezone fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1 w-full">
                    <div>
                      <label htmlFor="page-display-name" className="block text-[11.5px] font-semibold text-muted-foreground mb-1.5">Display name</label>
                      <input id="page-display-name"
                        type="text"
                        value={profileName}
                        onChange={(e) => setProfileName(e.target.value)}
                        placeholder="How your name appears to teammates"
                        className="w-full bg-surface border border-border-strong rounded-[9px] px-3 h-9 text-foreground text-[13.5px] focus:outline-none focus:border-border-strong font-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-[11.5px] font-semibold text-muted-foreground mb-1.5">Time zone</label>
                      <button
                        type="button"
                        onClick={() => setShowTimezonePicker(true)}
                        aria-label={`Time zone: ${timezone}. Change`}
                        className="w-full flex items-center justify-between gap-2 bg-surface-raised border border-border hover:border-border-strong rounded-md px-4 py-2 text-foreground text-[13.5px] focus:outline-none transition-colors cursor-pointer"
                      >
                        <span className="font-mono truncate">{timezone}</span>
                        <span className="text-primary font-semibold shrink-0">Change</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Appearance: theme + font size */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p id="settings-theme-label" className="block text-[11.5px] font-semibold text-muted-foreground mb-1.5">Theme</p>
                    <div role="group" aria-labelledby="settings-theme-label" className="inline-flex p-1 gap-1 bg-surface-sunken border border-border rounded-md">
                      {(['system', 'light', 'dark'] as const).map((option) => (
                        <button
                          key={option}
                          type="button"
                          aria-pressed={theme === option}
                          onClick={() => handleThemeChange(option)}
                          className={`px-3.5 py-1.5 rounded-[7px] text-[13.5px] font-medium transition-colors cursor-pointer ${
                            theme === option
                              ? 'bg-surface text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.08)]'
                              : 'text-ink-secondary hover:text-foreground'
                          }`}
                        >
                          {option === 'system' ? 'Match my device' : option === 'light' ? 'Light' : 'Dark'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p id="settings-font-label" className="block text-[11.5px] font-semibold text-muted-foreground mb-1.5">Font size</p>
                    <div role="group" aria-labelledby="settings-font-label" className="inline-flex p-1 gap-1 bg-surface-sunken border border-border rounded-md">
                      {(['small', 'medium', 'large'] as const).map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => handleFontSizeChange(option)}
                          className={`px-3.5 py-1.5 rounded-lg text-[13.5px] font-semibold capitalize transition-colors cursor-pointer ${
                            fontSize === option
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 3: TASK PREFERENCES */}
          <div className={activeSection === 'taskPrefs' ? '' : 'hidden'}>
            {activeSection === 'taskPrefs' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Allow Concurrent Tasks Switch */}
                  <div className="flex items-start justify-between p-4 bg-surface-sunken/40 border border-border rounded-md hover:border-border-strong transition-colors">
                    <div className="space-y-1 pr-4">
                      <h4 className="text-[13.5px] font-semibold text-foreground">{fieldMeta('allowConcurrentTasks').label}</h4>
                      <p className="text-[12.5px] text-muted-foreground leading-normal">
                        {fieldMeta('allowConcurrentTasks').description}
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                      <input
                        type="checkbox"
                        checked={allowConcurrentTasks}
                        onChange={(e) => setAllowConcurrentTasks(e.target.checked)}
                        role="switch" aria-label={fieldMeta('allowConcurrentTasks').label} className="sr-only peer"
                      />
                      <div className="w-[38px] h-[22px] bg-surface-sunken peer-focus-visible:ring-2 peer-focus-visible:ring-ring/60 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background rounded-full peer peer-checked:after:translate-x-[18px] peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[2px] after:bg-muted-foreground peer-checked:after:bg-white after:border-border-strong after:border after:rounded-full after:h-4 after:w-4 after:transition-colors peer-checked:bg-primary"></div>
                    </label>
                  </div>

                  {/* Sync Status Switch */}
                  <div className="flex items-start justify-between p-4 bg-surface-sunken/40 border border-border rounded-md hover:border-border-strong transition-colors">
                    <div className="space-y-1 pr-4">
                      <h4 className="text-[13.5px] font-semibold text-foreground">Sync task status</h4>
                      <p className="text-[12.5px] text-muted-foreground leading-normal">
                        When you mark a calendar event done, also mark its linked task done without asking.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                      <input
                        type="checkbox"
                        checked={autoSyncTaskStatus}
                        onChange={(e) => setAutoSyncTaskStatus(e.target.checked)}
                        role="switch" aria-label="Sync task status"
                        className="sr-only peer"
                      />
                      <div className="w-[38px] h-[22px] bg-surface-sunken peer-focus-visible:ring-2 peer-focus-visible:ring-ring/60 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background rounded-full peer peer-checked:after:translate-x-[18px] peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[2px] after:bg-muted-foreground peer-checked:after:bg-white after:border-border-strong after:border after:rounded-full after:h-4 after:w-4 after:transition-colors peer-checked:bg-primary"></div>
                    </label>
                  </div>

                  {/* Show Off-day Work Switch */}
                  <div className="flex items-start justify-between p-4 bg-surface-sunken/40 border border-border rounded-md hover:border-border-strong transition-colors">
                    <div className="space-y-1 pr-4">
                      <h4 className="text-[13.5px] font-semibold text-foreground">{fieldMeta('showOffDayWork').label}</h4>
                      <p className="text-[12.5px] text-muted-foreground leading-normal">
                        {fieldMeta('showOffDayWork').description}
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                      <input
                        type="checkbox"
                        checked={showOffDayWork}
                        onChange={(e) => setShowOffDayWork(e.target.checked)}
                        role="switch" aria-label={fieldMeta('showOffDayWork').label} className="sr-only peer"
                      />
                      <div className="w-[38px] h-[22px] bg-surface-sunken peer-focus-visible:ring-2 peer-focus-visible:ring-ring/60 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background rounded-full peer peer-checked:after:translate-x-[18px] peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[2px] after:bg-muted-foreground peer-checked:after:bg-white after:border-border-strong after:border after:rounded-full after:h-4 after:w-4 after:transition-colors peer-checked:bg-primary"></div>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 4: NOTIFICATIONS & REMINDERS */}
          <div className={activeSection === 'notifications' ? '' : 'hidden'}>
            {activeSection === 'notifications' && (
              <div className="space-y-3">
                <div className="flex items-start justify-between p-4 bg-surface-sunken/40 border border-border rounded-md hover:border-border-strong transition-colors">
                  <div className="space-y-1 pr-4">
                    <h4 className="text-[13.5px] font-semibold text-foreground">{fieldMeta('taskNotificationsEnabled').label}</h4>
                    <p className="text-[12.5px] text-muted-foreground leading-normal">{fieldMeta('taskNotificationsEnabled').description}</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                    <input 
                      type="checkbox" 
                      checked={taskNotificationsEnabled} 
                      onChange={(e) => setTaskNotificationsEnabled(e.target.checked)}
                      role="switch" aria-label={fieldMeta('taskNotificationsEnabled').label} className="sr-only peer" 
                    />
                    <div className="w-[38px] h-[22px] bg-surface-sunken peer-focus-visible:ring-2 peer-focus-visible:ring-ring/60 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background rounded-full peer peer-checked:after:translate-x-[18px] peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[2px] after:bg-muted-foreground peer-checked:after:bg-white after:border-border-strong after:border after:rounded-full after:h-4 after:w-4 after:transition-colors peer-checked:bg-primary"></div>
                  </label>
                </div>
                <div className="p-4 bg-surface-sunken/40 border border-border rounded-md space-y-3">
                  <div>
                    <h4 className="text-[13.5px] font-semibold text-foreground">Run check-in reminders</h4>
                    <p className="text-[12.5px] text-muted-foreground leading-normal mt-0.5">
                      While a run is in progress, you get a first reminder to check whether it has failed, repeat reminders after that, and a final notice when it ends.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="page-field" className="block text-[11.5px] font-semibold text-muted-foreground mb-1.5">{fieldMeta('jobReminderDefaultMins').label}</label>
                      <input id="page-field"
                        type="number"
                        min="1"
                        value={jobReminderDefaultMins}
                        onChange={(e) => setJobReminderDefaultMins(Number(e.target.value))}
                        className="w-full bg-card border border-border rounded-md px-3 py-2 text-foreground text-[13.5px] focus:outline-none focus:border-border-strong font-mono"
                      />
                      <p className="text-[12.5px] text-ink-faint leading-normal mt-1">{fieldMeta('jobReminderDefaultMins').description}</p>
                    </div>
                    <div>
                      <label htmlFor="page-field-2" className="block text-[11.5px] font-semibold text-muted-foreground mb-1.5">{fieldMeta('jobReminderRecurringMins').label}</label>
                      <input id="page-field-2"
                        type="number"
                        min="1"
                        value={jobReminderRecurringMins}
                        onChange={(e) => setJobReminderRecurringMins(Number(e.target.value))}
                        className="w-full bg-card border border-border rounded-md px-3 py-2 text-foreground text-[13.5px] focus:outline-none focus:border-border-strong font-mono"
                      />
                      <p className="text-[12.5px] text-ink-faint leading-normal mt-1">{fieldMeta('jobReminderRecurringMins').description}</p>
                    </div>
                  </div>
                </div>

                {NOTIFICATION_PREFERENCE_GROUPS.map((group) => (
                  <div key={group.label} className="p-4 bg-surface-sunken/40 border border-border rounded-md space-y-2.5">
                    <h4 className="text-[11.5px] font-semibold text-muted-foreground">{group.label}</h4>
                    {group.items.map((item) => {
                      const enabled = notificationPreferences[item.type] !== false;
                      return (
                        <div key={item.type} className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[13.5px] font-semibold text-foreground">{item.label}</p>
                            <p className="text-[12.5px] text-muted-foreground leading-normal">{item.description}</p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                            <input
                              type="checkbox"
                              checked={enabled}
                              onChange={(e) => togglePreference(item.type, e.target.checked)}
                              role="switch" aria-label={item.label} className="sr-only peer"
                            />
                            <div className="w-[38px] h-[22px] bg-surface-sunken peer-focus-visible:ring-2 peer-focus-visible:ring-ring/60 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background rounded-full peer peer-checked:after:translate-x-[18px] peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[2px] after:bg-muted-foreground peer-checked:after:bg-white after:border-border-strong after:border after:rounded-full after:h-4 after:w-4 after:transition-colors peer-checked:bg-primary"></div>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECTION 5: CALENDAR & SCHEDULING */}
          <div className={activeSection === 'calendar' ? '' : 'hidden'}>
            {activeSection === 'calendar' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="page-field-3" className="block text-[11.5px] font-semibold text-muted-foreground mb-1.5">{fieldMeta('workStart').label}</label>
                    <input id="page-field-3"
                      type="time"
                      value={workStart}
                      aria-label={fieldMeta('workStart').label}
                      onChange={(e) => setWorkStart(e.target.value)}
                      className="w-full bg-surface border border-border-strong rounded-[9px] px-3 h-9 text-foreground text-[13.5px] focus:outline-none focus:border-border-strong font-mono"
                    />
                    <p className="text-[12.5px] text-ink-faint leading-normal mt-1">{fieldMeta('workStart').description}</p>
                  </div>
                  <div>
                    <label htmlFor="page-field-4" className="block text-[11.5px] font-semibold text-muted-foreground mb-1.5">{fieldMeta('workEnd').label}</label>
                    <input id="page-field-4"
                      type="time"
                      value={workEnd}
                      aria-label={fieldMeta('workEnd').label}
                      onChange={(e) => setWorkEnd(e.target.value)}
                      className="w-full bg-surface border border-border-strong rounded-[9px] px-3 h-9 text-foreground text-[13.5px] focus:outline-none focus:border-border-strong font-mono"
                    />
                    <p className="text-[12.5px] text-ink-faint leading-normal mt-1">{fieldMeta('workEnd').description}</p>
                  </div>
                </div>

                <div className="border-t border-border/50 pt-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="page-field-5" className="block text-[11.5px] font-semibold text-muted-foreground mb-1.5">{fieldMeta('deepWorkStart').label}</label>
                    <input id="page-field-5"
                      type="time"
                      value={deepWorkStart}
                      aria-label={fieldMeta('deepWorkStart').label}
                      onChange={(e) => setDeepWorkStart(e.target.value)}
                      className="w-full bg-surface border border-border-strong rounded-[9px] px-3 h-9 text-foreground text-[13.5px] focus:outline-none focus:border-border-strong font-mono"
                    />
                    <p className="text-[12.5px] text-ink-faint leading-normal mt-1">{fieldMeta('deepWorkStart').description}</p>
                  </div>
                  <div>
                    <label htmlFor="page-field-6" className="block text-[11.5px] font-semibold text-muted-foreground mb-1.5">{fieldMeta('deepWorkEnd').label}</label>
                    <input id="page-field-6"
                      type="time"
                      value={deepWorkEnd}
                      aria-label={fieldMeta('deepWorkEnd').label}
                      onChange={(e) => setDeepWorkEnd(e.target.value)}
                      className="w-full bg-surface border border-border-strong rounded-[9px] px-3 h-9 text-foreground text-[13.5px] focus:outline-none focus:border-border-strong font-mono"
                    />
                    <p className="text-[12.5px] text-ink-faint leading-normal mt-1">{fieldMeta('deepWorkEnd').description}</p>
                  </div>
                  <div>
                    <label htmlFor="page-field-7" className="block text-[11.5px] font-semibold text-muted-foreground mb-1.5">{fieldMeta('deepWorkMaxSession').label}</label>
                    <input id="page-field-7"
                      type="number"
                      min="1"
                      value={deepWorkMaxSession}
                      aria-label={fieldMeta('deepWorkMaxSession').label}
                      onChange={(e) => setDeepWorkMaxSession(Number(e.target.value))}
                      className="w-full bg-surface border border-border-strong rounded-[9px] px-3 h-9 text-foreground text-[13.5px] focus:outline-none focus:border-border-strong font-mono"
                    />
                    <p className="text-[12.5px] text-ink-faint leading-normal mt-1">{fieldMeta('deepWorkMaxSession').description}</p>
                  </div>
                </div>

                <div className="border-t border-border/50 pt-5 space-y-4">
                  <h4 className="text-[13.5px] font-semibold text-foreground">Working days and off days</h4>
                  <p className="text-[12.5px] text-ink-faint leading-relaxed font-light">
                    {fieldMeta('workingDays').description} Select a date to change its status. Muted dates are weekly days off.
                  </p>

                  <div className="flex items-center justify-between pb-2">
                    <button type="button" onClick={handlePrevMonth} aria-label="Previous month" className="p-1.5 bg-surface-raised border border-border hover:border-border-strong text-muted-foreground rounded-lg transition-colors cursor-pointer">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-[12.5px] font-semibold text-foreground">
                      {currentCalendarMonth.toLocaleDateString([], { month: 'long', year: 'numeric' })}
                    </span>
                    <button type="button" onClick={handleNextMonth} aria-label="Next month" className="p-1.5 bg-surface-raised border border-border hover:border-border-strong text-muted-foreground rounded-lg transition-colors cursor-pointer">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center text-[11.5px] font-semibold text-muted-foreground">
                    <div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div><div>S</div>
                  </div>
                  <div className="grid grid-cols-7 gap-1 pt-1">
                    {renderCalendarDays()}
                  </div>

                  {selectedDay && (() => {
                    const config = getDayConfig(selectedDay);
                    const defaultWorking = isDefaultWorking(selectedDay, createdAt);
                    
                    const dateObj = new Date(selectedDay + 'T00:00:00Z');
                    const formattedDate = dateObj.toLocaleDateString([], { 
                      weekday: 'long', 
                      year: 'numeric', 
                      month: 'short', 
                      day: 'numeric',
                      timeZone: 'UTC'
                    });

                    return (
                      <div className="p-4 bg-surface-raised border border-border-strong rounded-md space-y-4">
                        <div className="flex justify-between items-center pb-2 border-b border-border">
                          <div className="flex items-center space-x-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                            <span className="text-[11.5px] font-semibold text-foreground">
                              Day settings: {formattedDate}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedDay(null)}
                            className="text-muted-foreground hover:text-foreground text-[11.5px] font-semibold"
                          >
                            Close
                          </button>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label htmlFor="page-status" className="block text-[11.5px] text-muted-foreground mb-1 font-semibold">Status</label>
                            <select id="page-status"
                              value={localDayType}
                              onChange={(e) => setLocalDayType(e.target.value)}
                              className="w-full bg-card border border-border rounded-md px-3 py-2 text-foreground text-[13.5px] focus:outline-none"
                            >
                              <option value="working">Working day</option>
                              <option value="off">Weekly day off</option>
                              <option value="leave">Leave</option>
                              <option value="other">Other</option>
                            </select>
                          </div>
                          <div>
                            <label htmlFor="page-reason" className="block text-[11.5px] text-muted-foreground mb-1 font-semibold">Reason</label>
                            <input id="page-reason"
                              type="text"
                              value={localDayComment}
                              placeholder="e.g. holiday, sick leave"
                              onChange={(e) => setLocalDayComment(e.target.value)}
                              className="w-full bg-card border border-border rounded-md px-3 py-2 text-foreground text-[13.5px] placeholder-muted-foreground focus:outline-none"
                            />
                          </div>
                        </div>
                        
                        <div className="flex justify-between items-center pt-2 border-t border-border/50">
                          <div className="text-[12.5px] text-muted-foreground">
                            {daySaveSuccess ? (
                              <span className="text-success font-semibold animate-pulse">Saved</span>
                            ) : config ? (
                              <span className="text-primary font-medium">Custom status</span>
                            ) : (
                              <span>Default ({defaultWorking ? 'Working' : 'Off'})</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handleResetDayConfig}
                              disabled={isSavingDay}
                              className="px-3 py-1.5 bg-danger-soft hover:bg-danger-soft border border-danger text-danger hover:text-danger disabled:opacity-30 rounded-md text-[12.5px] font-bold"
                            >
                              Reset
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveDayConfig}
                              disabled={isSavingDay}
                              className="px-4 py-1.5 bg-primary hover:bg-primary-hover text-primary-foreground rounded-full text-[12.5px] font-bold disabled:opacity-50"
                            >
                              {isSavingDay ? 'Saving…' : 'Apply'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Global Save Button */}
          <div className="sticky bottom-0 mt-8 flex items-center justify-end gap-3 border-t border-border bg-background/95 py-4 backdrop-blur-sm">
            {saveSuccess && (
              <span className="mr-1 flex items-center text-[13.5px] font-medium text-primary">
                Saved
              </span>
            )}
            <button
              type="submit"
              disabled={saving}
              className="flex h-9 items-center gap-2 px-4 bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-[14px] font-semibold rounded-[9px] transition-colors cursor-pointer"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save changes
                </>
              )}
            </button>
          </div>
        </form>

          {/* SECTION 7b: INTEGRATIONS (MCP / chat-bot access tokens) */}
          <div className={activeSection === 'integrations' ? '' : 'hidden'}>
            {activeSection === 'integrations' && <ApiTokensPanel />}
          </div>

          {/* SECTION 8: DATA & EXPORT */}
          <div className={activeSection === 'dataExport' ? '' : 'hidden'}>
            {activeSection === 'dataExport' && (
              <div className="space-y-6">
                {/* Export Data */}
                <div className="p-4 bg-surface-sunken/40 border border-border rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <span className="text-[13.5px] font-semibold text-foreground block">Export all data</span>
                    <span className="text-[12.5px] text-muted-foreground block leading-normal">
                      Download a JSON backup of your personal workspace: projects, tasks, calendar events, notebooks, runs, and settings. Keep it as a backup, or use it to move to another account by signing in there and restoring this file.
                      <br />
                      <strong className="text-foreground/80">Wall notes and team data aren’t included.</strong> Team membership, chat history, and notebook comments and version history stay with the team.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportAllData}
                    disabled={exporting}
                    className="px-4 py-2 bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-[13.5px] font-bold rounded-[9px] transition-colors cursor-pointer inline-flex items-center gap-1.5"
                  >
                    {exporting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Exporting…
                      </>
                    ) : (
                      'Download backup'
                    )}
                  </button>
                </div>

                {/* Import Data */}
                <div className="p-4 bg-surface-sunken/40 border border-border rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <span className="text-[13.5px] font-semibold text-foreground block font-sans">Restore backup</span>
                    <span className="text-[12.5px] text-muted-foreground block leading-normal font-sans">
                      Load a backup into this account, either your own or one from another account. This replaces your entire personal workspace (projects, tasks, calendar, notebooks, runs, and settings) with what’s in the file. Team membership and teams you own aren’t affected.
                    </span>
                  </div>
                  <div className="flex flex-col sm:items-end gap-2">
                    <label className="px-4 py-2 bg-transparent hover:bg-primary/5 border border-primary/30 hover:border-primary/50 text-primary text-[13.5px] font-bold rounded-md transition-colors cursor-pointer text-center inline-flex items-center justify-center gap-1.5">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Choose backup file</span>
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleImportFileChange}
                        disabled={importing}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                {/* Status Messages */}
                {importing && (
                  <div className="p-3 bg-primary-soft border border-primary rounded-md text-primary text-[12.5px] font-mono flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Restoring your backup…</span>
                  </div>
                )}
                {importError && (
                  <div className="p-3 bg-danger/5 border border-danger/20 text-danger text-[12.5px] font-mono rounded-md">
                    {importError}
                  </div>
                )}
                {importSuccess && (
                  <div className="p-3 bg-success/5 border border-success/20 text-success text-[12.5px] font-mono rounded-md">
                    Backup restored. Reloading…
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SECTION 9: ADVANCED */}
          <div className={activeSection === 'advanced' ? '' : 'hidden'}>
            {activeSection === 'advanced' && (
              <div className="space-y-6">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleRevisitWizard}
                    className="flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-surface-raised hover:bg-surface-sunken border border-border-strong hover:border-border-strong text-foreground text-[13px] font-semibold rounded-[9px] transition-colors cursor-pointer font-semibold"
                  >
                    <Monitor className="w-3 h-3" /> Run setup again
                  </button>
                </div>

                {/* Shown to every account, administrators included: the built-in
                    developer account ships with a public default password that
                    has to be changeable from here. */}
                <div className="border-t border-border/50 pt-5 space-y-3">
                    <h4 className="text-[13.5px] font-semibold text-foreground">Password sign-in</h4>
                    <p className="text-[12.5px] text-muted-foreground leading-relaxed max-w-sm">
                      {user?.hasPassword ? 'Change the password you sign in with.' : 'Set a password so you can sign in with your email and password.'}
                    </p>
                    <form onSubmit={handleSetPassword} className="space-y-3 max-w-xs">
                      {user?.hasPassword && (
                        <div>
                          <label htmlFor="settings-current-password" className="mb-1 block text-[12.5px] font-medium text-ink-secondary">Current password</label>
                          <input
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            id="settings-current-password"
                            autoComplete="current-password"
                            required
                            className="w-full bg-surface border border-border-strong rounded-md px-3 py-1.5 text-foreground placeholder-ink-faint text-[13.5px] focus:outline-none focus:border-primary focus:ring-2 focus:ring-ring/25 transition-colors"
                          />
                        </div>
                      )}
                      <div>
                        <label htmlFor="settings-new-password" className="mb-1 block text-[12.5px] font-medium text-ink-secondary">New password</label>
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          id="settings-new-password"
                          autoComplete="new-password"
                          aria-describedby="settings-new-password-help"
                          required
                          className="w-full bg-surface border border-border-strong rounded-md px-3 py-1.5 text-foreground placeholder-ink-faint text-[13.5px] focus:outline-none focus:border-primary focus:ring-2 focus:ring-ring/25 transition-colors"
                        />
                        <p id="settings-new-password-help" className="mt-1 text-[12px] text-ink-faint">At least 10 characters.</p>
                      </div>
                      <div>
                        <label htmlFor="settings-confirm-password" className="mb-1 block text-[12.5px] font-medium text-ink-secondary">Confirm new password</label>
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          id="settings-confirm-password"
                          autoComplete="new-password"
                          required
                          className="w-full bg-surface border border-border-strong rounded-md px-3 py-1.5 text-foreground placeholder-ink-faint text-[13.5px] focus:outline-none focus:border-primary focus:ring-2 focus:ring-ring/25 transition-colors"
                        />
                      </div>
                      {passwordError && <p className="text-danger text-[12.5px] font-semibold">{passwordError}</p>}
                      <button
                        type="submit"
                        disabled={savingPassword}
                        className="px-3.5 py-1.5 bg-primary hover:bg-primary-hover text-primary-foreground text-[13px] font-semibold rounded-[9px] transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {savingPassword ? 'Saving…' : user?.hasPassword ? 'Change password' : 'Set password'}
                      </button>
                    </form>
                  </div>

                <RecoveryQuestionSettings />

              </div>
            )}
          </div>

          {/* SECTION: DANGER ZONE */}
          {!isDeveloperAccount && (
            <div className={activeSection === 'dangerZone' ? '' : 'hidden'}>
              {activeSection === 'dangerZone' && (
                <div className="space-y-4">
                  <p className="text-[12.5px] text-muted-foreground leading-relaxed max-w-lg">
                    This permanently deletes your account and everything you own: projects, tasks, notebooks, calendar events, runs, and notes. You can’t undo this. If you own a team with other members, transfer ownership or remove them first. Deletion is blocked while it would leave a team without an owner.
                  </p>
                  <button
                    type="button"
                    onClick={() => { setShowDeleteAccountModal(true); setDeleteConfirmText(''); setDeleteAccountError(null); }}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-danger hover:bg-danger-hover text-danger-foreground text-[13px] font-semibold rounded-[9px] transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete account
                  </button>
                </div>
              )}
            </div>
          )}
          </div>
        </div>

      )}

      {showTimezonePicker && (
        <Modal onClose={() => setShowTimezonePicker(false)} size="lg">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h3 className="text-base font-bold text-foreground">Choose your time zone</h3>
          </div>
          <div className="px-5 pb-5">
            <TimezonePicker
              value={timezone}
              onChange={(tz) => {
                setTimezone(tz);
                setShowTimezonePicker(false);
              }}
            />
          </div>
        </Modal>
      )}

      {/* Import Confirmation Dialog Modal */}
      {importConfirmOpen && pendingImportData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md bg-card border border-border-strong rounded-lg p-6 shadow-[var(--shadow-modal)] space-y-5">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-primary" /> Restore this backup?
              </h3>
            </div>
            <div className="space-y-3">
              <p className="text-[13.5px] text-ink-secondary leading-relaxed font-sans">
                Restoring will <strong className="text-foreground">replace</strong> all of your current projects, tasks, calendar events, notebook pages, and settings with the contents of this file.
              </p>
              <p className="text-[13.5px] text-muted-foreground leading-normal font-sans">
                You can’t undo this. Continue?
              </p>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-border mt-6">
              <button 
                type="button"
                onClick={() => {
                  setImportConfirmOpen(false);
                  setPendingImportData(null);
                }}
                className="px-4 py-2 bg-surface-raised border border-border-strong text-muted-foreground hover:text-foreground text-[13.5px] font-semibold rounded-[9px] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={handleConfirmImport}
                className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-primary-foreground text-[13.5px] font-bold rounded-[9px] transition-colors cursor-pointer font-semibold"
              >
                Replace and restore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Confirmation Modal */}
      {showDeleteAccountModal && (
        <Modal onClose={() => setShowDeleteAccountModal(false)} size="sm">
          <Modal.Header
            title="Delete account"
            onClose={() => setShowDeleteAccountModal(false)}
            icon={<AlertTriangle className="w-5 h-5 text-danger" />}
          />
          <div className="space-y-4">
            <p className="text-[13.5px] text-ink-secondary leading-relaxed">
              This permanently deletes your account and everything you own: projects, tasks, notebooks, calendar events, runs, and notes. <strong className="text-foreground">You can’t undo this.</strong>
            </p>
            <div>
              <label htmlFor="page-type-your-email-to-confirm" className="block text-[11.5px] font-semibold text-muted-foreground mb-1.5">
                {user?.hasPassword ? 'Enter your password to confirm' : `Type your email (${user?.email}) to confirm`}
              </label>
              <input id="page-type-your-email-to-confirm"
                type={user?.hasPassword ? 'password' : 'text'}
                autoComplete={user?.hasPassword ? 'current-password' : 'off'}
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={user?.hasPassword ? undefined : user?.email}
                className="w-full bg-surface-raised border border-border rounded-md px-3 py-2 text-foreground text-[13.5px] focus:outline-none focus:border-danger"
              />
            </div>
            {deleteAccountError && (
              <p className="text-danger text-[13.5px] font-semibold">{deleteAccountError}</p>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteAccountModal(false)}
                className="px-4 py-2 bg-surface-raised border border-border-strong text-muted-foreground hover:text-foreground text-[13.5px] font-semibold rounded-[9px] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deletingAccount || !deleteConfirmReady}
                className="px-5 py-2.5 bg-danger hover:bg-danger-hover disabled:opacity-50 disabled:cursor-not-allowed text-danger-foreground text-[13.5px] font-bold rounded-[9px] transition-colors cursor-pointer"
              >
                {deletingAccount ? 'Deleting…' : 'Delete account permanently'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export const dynamic = 'force-dynamic';
