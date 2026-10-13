'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@/context/SessionContext';
import { Logo } from '@/components/Logo';
import { Modal } from '@/components/Modal';
import { TimezonePicker } from '@/components/TimezonePicker';
import {
  Calendar,
  Briefcase,
  Brain,
  BarChart3,
  ArrowRight,
  ArrowLeft,
  Check,
  RefreshCw,
  CheckCircle,
  Clock,
  User
} from 'lucide-react';

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
      </div>
    }>
      <OnboardingWizard />
    </Suspense>
  );
}

function OnboardingWizard() {
  const { user, refreshSession } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isRevisit = searchParams.get('revisit') === 'true';

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form States
  const [workingDays, setWorkingDays] = useState<string[]>([
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'
  ]);
  const [workStart, setWorkStart] = useState('08:00');
  const [workEnd, setWorkEnd] = useState('18:00');
  const [deepWorkStart, setDeepWorkStart] = useState('09:00');
  const [deepWorkEnd, setDeepWorkEnd] = useState('12:00');
  const [deepWorkMaxSession, setDeepWorkMaxSession] = useState(90);

  // Timezones & Theme Preferences
  const [name, setName] = useState('');
  // Pre-fill with the browser's detected timezone rather than a hardcoded
  // 'UTC' - the account row's timezone column defaults to 'UTC' for every
  // new user (see prisma/schema.prisma), so trusting that default here would
  // silently start almost everyone on the one timezone they're not in. The
  // dropdown below is still a full override.
  const [timezone, setTimezone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  });
  const [theme, setTheme] = useState('dark');
  const [showTimezonePicker, setShowTimezonePicker] = useState(false);

  // Load existing settings if revisiting
  useEffect(() => {
    setName(user?.name || '');
    const fetchExistingSettings = async () => {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          if (data.workingDays) {
            const rawDays = data.workingDays.split(',');
            if (data.workingDays.includes('-')) {
              const weekdaySet = new Set<string>();
              const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
              rawDays.forEach((dateStr: string) => {
                const parts = dateStr.trim().split('-');
                if (parts.length === 3) {
                  const [y, m, d] = parts.map(Number);
                  const dateObj = new Date(Date.UTC(y, m - 1, d));
                  if (!isNaN(dateObj.getTime())) {
                    weekdaySet.add(days[dateObj.getUTCDay()]);
                  }
                }
              });
              setWorkingDays(Array.from(weekdaySet));
            } else {
              setWorkingDays(rawDays);
            }
          }
          if (data.workStart) setWorkStart(data.workStart);
          if (data.workEnd) setWorkEnd(data.workEnd);
          if (data.deepWorkStart) setDeepWorkStart(data.deepWorkStart);
          if (data.deepWorkEnd) setDeepWorkEnd(data.deepWorkEnd);
          if (data.deepWorkMaxSession) setDeepWorkMaxSession(Number(data.deepWorkMaxSession));
          // Only honor a saved timezone that isn't the schema's own default -
          // an explicit non-UTC choice always wins over the browser guess,
          // but a still-at-default 'UTC' row (every never-configured account)
          // should not override the smarter auto-detected pre-fill above.
          if (data.timezone && data.timezone !== 'UTC') setTimezone(data.timezone);
          if (data.theme) setTheme(data.theme);
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    };
    if (user) {
      fetchExistingSettings();
    }
  }, [user?.id]);

  const toggleDay = (day: string) => {
    if (workingDays.includes(day)) {
      setWorkingDays(workingDays.filter(d => d !== day));
    } else {
      setWorkingDays([...workingDays, day]);
    }
  };

  const handleCompleteSetup = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workStart,
          workEnd,
          workingDays: workingDays.join(','),
          deepWorkStart,
          deepWorkEnd,
          deepWorkMaxSession,
          name: name || user?.name,
          timezone,
          theme,
          isOnboarded: true
        })
      });
      if (res.ok) {
        await refreshSession();
        router.push(isRevisit ? '/settings' : '/');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const daysOfWeek = [
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
  ];

  return (
    <div className="relative flex items-center justify-center min-h-screen bg-background text-foreground overflow-hidden px-4 py-8">
      {/* Glow Orbs */}

      <div className="w-full max-w-2xl z-10 flex flex-col items-center">
        {/* Brand */}
        <div className="flex items-center mb-8">
          <Logo size="md" />
        </div>

        {/* Wizard Card */}
        <div className="w-full bg-surface border border-border rounded-lg p-8 md:p-10">
          
          {/* Progress bar */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center space-x-2 w-full">
              {[1, 2, 3, 4].map((i) => (
                <React.Fragment key={i}>
                  <div 
                    className={`h-1.5 rounded-full transition-colors duration-[var(--duration-standard)] ${
                      step >= i ? 'bg-primary w-full' : 'bg-surface-sunken w-12'
                    }`}
                  />
                </React.Fragment>
              ))}
            </div>
            <span className="text-xs font-semibold text-muted-foreground ml-4 whitespace-nowrap">Step {step} of 4</span>
          </div>

          {/* STEP 1: WELCOME */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h1 className="app-title text-foreground">Welcome to Rune</h1>
                <p className="text-muted-foreground text-sm font-light mt-2 max-w-md mx-auto">
                  Plan your week, run your experiments and write the paper, all in one place.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
                <div className="p-4 bg-surface-sunken border border-border rounded-md flex items-start space-x-3">
                  <div className="p-2 bg-primary-soft rounded-md text-primary shrink-0">
                    <Briefcase className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Projects</h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Group your work into projects with objectives, priorities, and progress.</p>
                  </div>
                </div>

                <div className="p-4 bg-surface-sunken border border-border rounded-md flex items-start space-x-3">
                  <div className="p-2 bg-primary-soft rounded-md text-primary shrink-0">
                    <CheckCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Tasks</h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Plan your day, track postponements, and mark sessions as deep work or focus.</p>
                  </div>
                </div>

                <div className="p-4 bg-surface-sunken border border-border rounded-md flex items-start space-x-3">
                  <div className="p-2 bg-primary-soft rounded-md text-primary shrink-0">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Calendar</h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">See your day as time blocks.</p>
                  </div>
                </div>

                <div className="p-4 bg-surface-sunken border border-border rounded-md flex items-start space-x-3">
                  <div className="p-2 bg-primary-soft rounded-md text-primary shrink-0">
                    <BarChart3 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Analytics</h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">See completion rates, deep work hours, and trends over time.</p>
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <label htmlFor="page-your-name" className="block text-[11.5px] font-semibold text-ink-faint mb-1.5">
                  Your name
                </label>
                <input id="page-your-name" 
                  type="text" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  placeholder="Your name"
                  className="w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-foreground placeholder-ink-faint text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-ring/25 transition-colors"
                />
              </div>
            </div>
          )}

          {/* STEP 2: WORK SCHEDULE */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-foreground flex items-center">
                  <Calendar className="w-6 h-6 mr-2 text-warning" /> Set your work schedule
                </h1>
                <p className="text-muted-foreground text-xs mt-1 font-light leading-normal">
                  Set your usual working hours. They shape your calendar, daily planning, and analytics.
                </p>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="page-start-time-24-hour" className="block text-xs text-muted-foreground mb-2 font-medium">Start time (24-hour)</label>
                    <input id="page-start-time-24-hour"
                      type="time"
                      value={workStart}
                      onChange={(e) => setWorkStart(e.target.value)}
                      className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-ring/30 font-mono"
                    />
                  </div>
                  <div>
                    <label htmlFor="page-end-time-24-hour" className="block text-xs text-muted-foreground mb-2 font-medium">End time (24-hour)</label>
                    <input id="page-end-time-24-hour"
                      type="time"
                      value={workEnd}
                      onChange={(e) => setWorkEnd(e.target.value)}
                      className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-ring/30 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11.5px] font-semibold text-ink-faint mb-1.5">
                    Working days
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {daysOfWeek.map((day) => {
                      const active = workingDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(day)}
                          className={`px-3.5 py-2 rounded-[9px] text-xs font-semibold transition-colors cursor-pointer border ${
                            active
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-surface-raised text-muted-foreground border-border hover:text-foreground hover:border-border-strong'
                          }`}
                        >
                          {day.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-ink-faint mt-2 leading-normal">
                    Defaults to weekdays. You can change individual days and add leave later in Settings.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: DEEP WORK PREFERENCES */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-foreground flex items-center">
                  <Brain className="w-5 h-5 mr-2 text-primary" /> Deep work preferences
                </h1>
                <p className="text-muted-foreground text-xs mt-1 font-light leading-normal">
                  Deep work is your highest-concentration work. Instead of setting fixed hours, mark individual tasks and events as deep work and Rune tracks how long you spend.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label htmlFor="page-preferred-deep-work-session-leng" className="block text-[11.5px] font-semibold text-ink-faint mb-1.5">
                    Preferred deep work session length (minutes)
                  </label>
                  <select id="page-preferred-deep-work-session-leng"
                    value={deepWorkMaxSession}
                    onChange={(e) => setDeepWorkMaxSession(Number(e.target.value))}
                    className="w-full bg-surface-raised border border-border rounded-md px-4 py-2.5 text-foreground text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
                  >
                    <option value={60}>60 minutes</option>
                    <option value={90}>90 minutes (Recommended)</option>
                    <option value={120}>120 minutes</option>
                    <option value={180}>180 minutes</option>
                  </select>
                </div>

                <div className="p-4 bg-surface-raised border border-border rounded-md hover:border-border-strong transition-colors">
                  <div className="flex gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg shrink-0 mt-0.5 text-primary">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-foreground">How deep work is tracked</h4>
                      <p className="text-[10px] text-muted-foreground leading-normal mt-1">
                        Rune tracks the time you actually spend, based on completed deep work sessions on your calendar.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: COMPLETE SETUP */}
          {step === 4 && (
            <div className="space-y-6">
              <div className="text-center">
                <CheckCircle className="w-12 h-12 text-warning mx-auto animate-bounce mb-3" />
                <h1 className="text-2xl font-bold text-foreground">Setup complete</h1>
                <p className="text-muted-foreground text-xs mt-1">Review your settings, then finish.</p>
              </div>

              <div className="bg-surface-sunken border border-border rounded-md p-5 space-y-4 text-xs">
                <div className="flex justify-between py-1 border-b border-border">
                  <span className="text-muted-foreground">Name:</span>
                  <span className="text-foreground font-semibold">{name || user?.name || 'User'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border">
                  <span className="text-muted-foreground">Hours:</span>
                  <span className="text-foreground font-semibold font-mono">{workStart} – {workEnd}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Deep work:</span>
                  <span className="text-foreground font-semibold font-mono">{deepWorkMaxSession}m session length</span>
                </div>
              </div>

              {/* Time Zone / Theme Configuration */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11.5px] text-muted-foreground mb-1 font-semibold">Time zone</label>
                  <button
                    type="button"
                    onClick={() => setShowTimezonePicker(true)}
                    className="w-full flex items-center justify-between gap-2 bg-surface-raised border border-border hover:border-border-strong rounded-md px-3 py-2 text-ink-secondary text-xs focus:outline-none focus:border-primary focus:ring-2 focus:ring-ring/30 transition-colors cursor-pointer"
                  >
                    <span className="font-mono truncate">{timezone}</span>
                    <span className="text-primary font-semibold shrink-0">Change</span>
                  </button>
                </div>
                <div>
                  <label htmlFor="page-theme" className="block text-[11.5px] text-muted-foreground mb-1 font-semibold">Theme</label>
                  <select id="page-theme"
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                    className="w-full bg-surface-raised border border-border rounded-md px-3 py-2 text-ink-secondary text-xs focus:outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
                  >
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Controls */}
          <div className="flex justify-between items-center mt-10 border-t border-border pt-6">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="flex items-center px-4 py-2.5 bg-surface-raised border border-border-strong hover:bg-surface-sunken text-muted-foreground hover:text-foreground text-xs font-bold rounded-full transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
              </button>
            ) : (
              <div />
            )}

            {step < 4 ? (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                className="flex items-center px-5 py-2.5 bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold rounded-full transition-[background-color,transform] duration-200 hover:-translate-y-px active:scale-[0.97] cursor-pointer"
              >
                Continue <ArrowRight className="w-4 h-4 ml-1.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCompleteSetup}
                disabled={submitting}
                className="flex items-center px-6 py-2.5 bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold rounded-full transition-[background-color,transform] duration-200 hover:-translate-y-px active:scale-[0.97] cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> Finishing…
                  </>
                ) : (
                  <>
                    Finish setup <Check className="w-4 h-4 ml-1.5" />
                  </>
                )}
              </button>
            )}
          </div>

        </div>
      </div>

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
    </div>
  );
}

export const dynamic = 'force-dynamic';
