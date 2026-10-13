/**
 * Single source of truth for every field on the `Setting` model.
 * The settings API route and settings UI both derive their defaults,
 * request payloads, and section grouping from this array instead of
 * hand-listing each field in multiple places.
 */
export type SettingValue = string | number | boolean;

export interface SettingFieldDescriptor {
  key: string;
  defaultValue: SettingValue;
  section: 'general' | 'taskPrefs' | 'calendar' | 'notifications';
  label: string;
  description: string;
  /** Coerce an incoming POST value before it's persisted (e.g. string -> number). */
  coerce?: (value: SettingValue) => SettingValue;
}

export const SETTINGS_FIELDS: SettingFieldDescriptor[] = [
  {
    key: 'workStart',
    defaultValue: '08:00',
    section: 'calendar',
    label: 'Workday start',
    description: 'When your daily schedule and calendar grid begin.'
  },
  {
    key: 'workEnd',
    defaultValue: '18:00',
    section: 'calendar',
    label: 'Workday end',
    description: 'When your daily schedule and calendar grid end.'
  },
  {
    key: 'workingDays',
    defaultValue: 'Monday,Tuesday,Wednesday,Thursday,Friday',
    section: 'calendar',
    label: 'Working days',
    description: 'Which days count as working days in your analytics, as opposed to off days or leave.'
  },
  {
    key: 'deepWorkStart',
    defaultValue: '09:00',
    section: 'calendar',
    label: 'Deep work window start',
    description: 'The earliest time of day you like to schedule deep work.'
  },
  {
    key: 'deepWorkEnd',
    defaultValue: '17:00',
    section: 'calendar',
    label: 'Deep work window end',
    description: 'The latest time of day you like to schedule deep work.'
  },
  {
    key: 'deepWorkMaxSession',
    defaultValue: 90,
    section: 'calendar',
    label: 'Preferred deep work session length (minutes)',
    description: 'Your preferred maximum length for a deep work session.',
    coerce: (v) => Number(v)
  },
  {
    key: 'allowConcurrentTasks',
    defaultValue: false,
    section: 'taskPrefs',
    label: 'Allow overlapping tasks',
    description: 'Let time slots overlap. You get a warning about conflicts instead of being blocked from saving.'
  },
  {
    key: 'taskNotificationsEnabled',
    defaultValue: true,
    section: 'notifications',
    label: 'Task reminders',
    description: 'Get a reminder 10 minutes before a task with a start time begins.'
  },
  {
    key: 'jobReminderDefaultMins',
    defaultValue: 15,
    section: 'notifications',
    label: 'First run check-in (minutes)',
    description: 'How long after a run starts before you get a first reminder to check whether it has failed.',
    coerce: (v) => Number(v)
  },
  {
    key: 'jobReminderRecurringMins',
    defaultValue: 10,
    section: 'notifications',
    label: 'Repeat run check-in every (minutes)',
    description: 'How often you get a check-in reminder after the first one, until the run finishes.',
    coerce: (v) => Number(v)
  },
  {
    key: 'showOffDayWork',
    defaultValue: false,
    section: 'taskPrefs',
    label: 'Show work on off days',
    description: 'Count work done on non-working days as its own day in analytics, instead of merging it into the nearest working day.'
  }
];

export function buildSettingsDefaults(settings: Record<string, SettingValue> | null | undefined) {
  return SETTINGS_FIELDS.reduce((acc, field) => {
    const raw = settings?.[field.key];
    acc[field.key] = raw !== undefined && raw !== null ? raw : field.defaultValue;
    return acc;
  }, {} as Record<string, SettingValue>);
}

export function buildSettingsPayload(body: Record<string, SettingValue>) {
  return SETTINGS_FIELDS.reduce((acc, field) => {
    const raw = body[field.key];
    const value = raw !== undefined ? raw : field.defaultValue;
    acc[field.key] = field.coerce ? field.coerce(value) : value;
    return acc;
  }, {} as Record<string, SettingValue>);
}
