import type { Attempt, Job } from './types';

/** Splits a "YYYY-MM-DDTHH:MM" datetime-local value into its date and time parts. */
export function splitDateTime(dateTimeStr: string): { date: string; time: string } {
  if (!dateTimeStr) return { date: '', time: '' };
  const parts = dateTimeStr.split('T');
  if (parts.length === 2) {
    return { date: parts[0], time: parts[1].substring(0, 5) };
  }
  // Fallback if no 'T'
  if (dateTimeStr.includes('-') && dateTimeStr.length === 10) {
    return { date: dateTimeStr, time: '' };
  }
  return { date: '', time: '' };
}

/** Combines a date and time back into a "YYYY-MM-DDTHH:MM" datetime-local value, defaulting the date to `fallbackDate` or today, and the time to midnight. */
export function combineDateTime(date: string, time: string, fallbackDate?: string): string {
  let d = date;
  if (!d) {
    if (fallbackDate) {
      d = fallbackDate;
    } else {
      const now = new Date();
      const tzOffset = now.getTimezoneOffset() * 60000;
      d = new Date(now.getTime() - tzOffset).toISOString().split('T')[0];
    }
  }
  const t = time ? time : '00:00';
  return `${d}T${t}`;
}

/** Parses an instrument's maxRuntime field ("HH:MM" or a bare minute count) into a minute count, defaulting to 60 when unset or unparseable. */
export function parseMaxRuntimeToMinutes(maxRuntimeStr?: string): number {
  if (!maxRuntimeStr) return 60;
  const parts = maxRuntimeStr.split(':');
  if (parts.length === 2) {
    const hrs = parseInt(parts[0], 10);
    const mins = parseInt(parts[1], 10);
    if (!isNaN(hrs) && !isNaN(mins)) {
      return hrs * 60 + mins;
    }
  }
  const val = parseInt(maxRuntimeStr, 10);
  return !isNaN(val) ? val : 60;
}

/** A Date to a "YYYY-MM-DDTHH:MM" value in the browser's local timezone, for pre-filling a <input type="datetime-local">. */
export function formatDateTimeLocal(date: Date): string {
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}

/**
 * Minutes an attempt has actually run: live elapsed time (against `now`) while
 * it's the one currently executing, actual wall-clock duration once it has an
 * end time, or its recorded computeTime once it's reached a terminal status -
 * 0 otherwise (e.g. still queued behind another attempt).
 */
export function getActualAttemptMinutes(att: Attempt, parentJobStatus: string, now: Date): number {
  const startStr = att.projectedStartTime || att.submitTime;
  if (!startStr) return att.computeTime || 0;
  const startTime = new Date(startStr).getTime();

  if (att.status === 'Running' || (att.status === 'Queued' && parentJobStatus === 'Running')) {
    const diff = now.getTime() - startTime;
    return diff > 0 ? diff / 60000 : 0;
  }

  if (att.actualEndTime) {
    const endTime = new Date(att.actualEndTime).getTime();
    const diff = endTime - startTime;
    return diff > 0 ? diff / 60000 : 0;
  }

  if (['Completed', 'Failed', 'Cancelled', 'Timed Out'].includes(att.status)) {
    return att.computeTime || 0;
  }

  return 0;
}

/** Total minutes a job has run across all of its attempts. */
export function getJobElapsedMinutes(job: Job, now: Date): number {
  return job.attempts.reduce((s, att) => s + getActualAttemptMinutes(att, job.status, now), 0);
}
