'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Loader2, Plus, X, AlertCircle } from 'lucide-react';
import { ClockTimePicker } from '@/components/ClockTimePicker';
import { SessionTypeSelector } from '@/components/SessionTypeSelector';
import { SessionType, durationLabel } from '@/lib/sessionType';
import { Modal } from '@/components/Modal';

interface TaskFormModalProps {
  title: string;
  submitLabel: string;
  submittingLabel: string;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  isSubmitting: boolean;
  errorMessage: string | null;

  projects: Array<{ id: string; name: string }>;
  selectedProjGoals: Array<{ id: string; text: string }>;

  name: string; onNameChange: (v: string) => void;
  detail: string; onDetailChange: (v: string) => void;
  projectId: string; onProjectChange: (v: string) => void;
  goalId: string; onGoalChange: (v: string) => void;

  // Only present when the selected project is a team project the current
  // user can assign on (Owner, or a Team Leader who's a collaborator) - the
  // parent only populates assignableMembers in that case, so an empty/
  // undefined list means "don't render the field" rather than "no options."
  assigneeId?: string; onAssigneeChange?: (v: string) => void;
  assignableMembers?: Array<{ userId: string; name: string | null; email: string }>;
  context: string; onContextChange: (v: string) => void;
  isCustomContext: boolean;
  customContext: string; onCustomContextChange: (v: string) => void;
  priority: string; onPriorityChange: (v: string) => void;
  estimatedTime: string; onEstimatedTimeChange: (v: string) => void;
  effort: string; onEffortChange: (v: string) => void;
  impact: string; onImpactChange: (v: string) => void;
  slots: Array<{ startTime: string; endTime: string }>;
  onSlotsChange: (v: Array<{ startTime: string; endTime: string }>) => void;
  date: string; onDateChange: (v: string) => void;
  sessionType: SessionType; onSessionTypeChange: (v: SessionType) => void;

  // Only present on the Tasks page's modal (edit reuses it too); Dashboard's
  // quick-add omits these and the fields simply don't render.
  status?: string; onStatusChange?: (v: string) => void;
  notes?: string; onNotesChange?: (v: string) => void;
}

const inputClass = 'w-full bg-surface-raised border border-border rounded-[var(--radius-md)] px-4 py-2.5 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-ring/30 transition-colors duration-[var(--duration-micro)]';
const labelClass = 'block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2';

export function TaskFormModal(props: TaskFormModalProps) {
  const {
    title, submitLabel, submittingLabel, onClose, onSubmit, isSubmitting, errorMessage,
    projects, selectedProjGoals,
    name, onNameChange, detail, onDetailChange,
    projectId, onProjectChange, goalId, onGoalChange,
    assigneeId, onAssigneeChange, assignableMembers,
    context, onContextChange, isCustomContext, customContext, onCustomContextChange,
    priority, onPriorityChange, estimatedTime, onEstimatedTimeChange,
    effort, onEffortChange, impact, onImpactChange,
    slots, onSlotsChange, date, onDateChange, sessionType, onSessionTypeChange,
    status, onStatusChange, notes, onNotesChange
  } = props;

  const [showMore, setShowMore] = useState(false);
  const [touched, setTouched] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const nameEmpty = touched && name.trim().length === 0;

  return (
    <Modal onClose={onClose} size="md">
      <Modal.Header title={title} onClose={onClose} />
      <form
          onSubmit={(e) => {
            setTouched(true);
            if (!name.trim()) {
              e.preventDefault();
              nameRef.current?.focus();
              return;
            }
            onSubmit(e);
          }}
          className="space-y-4"
        >
          {/* Primary field — dominant, no competing weight from anything else on the form */}
          <div>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="What do you need to do?"
              aria-label="Task name"
              aria-invalid={nameEmpty || undefined}
              aria-describedby={nameEmpty ? 'taskformmodal-name-error' : undefined}
              className={`w-full bg-surface-raised border rounded-[var(--radius-md)] px-4 py-3.5 text-foreground placeholder-muted-foreground text-base font-semibold focus:outline-none focus:ring-2 transition-colors duration-[var(--duration-micro)] ${
                nameEmpty ? 'border-danger focus:border-danger focus:ring-danger/30' : 'border-border focus:border-primary focus:ring-ring/30'
              }`}
            />
            {nameEmpty && (
              <p id="taskformmodal-name-error" role="alert" className="mt-1.5 text-xs text-danger flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" /> Give the task a name before saving.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="taskformmodal-details" className={labelClass}>Details</label>
            <textarea id="taskformmodal-details"
              value={detail}
              onChange={(e) => onDetailChange(e.target.value)}
              placeholder="Add context or links (optional)"
              rows={2}
              className={inputClass}
            />
          </div>

          {/* Common secondary fields — visible but visually subordinate to the name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="taskformmodal-project" className={labelClass}>Project</label>
              <select id="taskformmodal-project"
                value={projectId}
                onChange={(e) => { onProjectChange(e.target.value); onGoalChange(''); }}
                className={inputClass}
              >
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="taskformmodal-priority" className={labelClass}>Priority</label>
              <select id="taskformmodal-priority"
                value={priority}
                onChange={(e) => onPriorityChange(e.target.value)}
                className={inputClass}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
          </div>

          {assignableMembers && assignableMembers.length > 0 && onAssigneeChange && (
            <div>
              <label htmlFor="taskformmodal-assign-to" className={labelClass}>Assign to</label>
              <select id="taskformmodal-assign-to"
                value={assigneeId || ''}
                onChange={(e) => onAssigneeChange(e.target.value)}
                className={inputClass}
              >
                <option value="">Myself</option>
                {assignableMembers.map((m) => (
                  <option key={m.userId} value={m.userId}>{m.name || m.email}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="taskformmodal-planned-date" className={labelClass}>Planned date</label>
            <input id="taskformmodal-planned-date"
              type="date"
              value={date}
              onChange={(e) => onDateChange(e.target.value)}
              style={{ colorScheme: 'var(--input-color-scheme, dark)' }}
              className={`${inputClass} max-w-xs`}
            />
          </div>

          <div>
            <label className={labelClass}>Session type</label>
            <SessionTypeSelector value={sessionType} onChange={onSessionTypeChange} className="w-full justify-between" />
          </div>

          {projectId && selectedProjGoals.length > 0 && (
            <div>
              <label htmlFor="taskformmodal-linked-objective" className={labelClass}>Linked objective</label>
              <select id="taskformmodal-linked-objective"
                value={goalId}
                onChange={(e) => onGoalChange(e.target.value)}
                className={inputClass}
              >
                <option value="">No linked objective</option>
                {selectedProjGoals.map((g) => (
                  <option key={g.id} value={g.id}>{g.text}</option>
                ))}
              </select>
            </div>
          )}

          {/* Progressive disclosure — advanced/rare fields stay out of the way
              until asked for, so a quick-add doesn't compete visually with a
              fully-configured task (Hick's Law / cognitive load). */}
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold text-ink-secondary hover:text-foreground transition-colors cursor-pointer pt-1"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-[var(--duration-micro)] ${showMore ? 'rotate-180' : ''}`} />
            {showMore ? 'Fewer options' : 'More options'}
            <span className="text-ink-faint font-normal normal-case">(context, effort, time slots{status !== undefined ? ', status, notes' : ''})</span>
          </button>

          {showMore && (
            <div className="space-y-4 border-t border-border pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="taskformmodal-context" className={labelClass}>Context</label>
                  <select id="taskformmodal-context"
                    value={context}
                    onChange={(e) => onContextChange(e.target.value)}
                    className={inputClass}
                  >
                    <option value="COMPUTER">Computer</option>
                    <option value="CODING">Coding</option>
                    <option value="READING">Reading</option>
                    <option value="WRITING">Writing</option>
                    <option value="RESEARCH">Research</option>
                    <option value="MEETING">Meeting</option>
                    <option value="ANALYSIS">Analysis</option>
                    <option value="CUSTOM">Custom…</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="taskformmodal-hours" className={labelClass}>{durationLabel(sessionType)} (hours)</label>
                  <input id="taskformmodal-hours"
                    type="number"
                    step="any"
                    min="0.01"
                    max="12"
                    value={estimatedTime}
                    onChange={(e) => onEstimatedTimeChange(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              {isCustomContext && (
                <div>
                  <label htmlFor="taskformmodal-custom-context-name" className={labelClass}>Custom context name</label>
                  <input id="taskformmodal-custom-context-name"
                    type="text"
                    placeholder="e.g. Writing, Calls, Bench work"
                    value={customContext}
                    onChange={(e) => onCustomContextChange(e.target.value)}
                    className={inputClass}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="taskformmodal-effort-1-10" className={labelClass}>Effort (1–10)</label>
                  <input id="taskformmodal-effort-1-10"
                    type="range" min="1" max="10"
                    value={effort}
                    onChange={(e) => onEffortChange(e.target.value)}
                    className="w-full accent-primary h-1.5 bg-surface-sunken rounded-lg cursor-pointer mt-3"
                  />
                  <div className="text-right text-[10px] text-muted-foreground font-mono tabular-nums mt-1">{effort} of 10</div>
                </div>
                <div>
                  <label htmlFor="taskformmodal-impact-1-10" className={labelClass}>Impact (1–10)</label>
                  <input id="taskformmodal-impact-1-10"
                    type="range" min="1" max="10"
                    value={impact}
                    onChange={(e) => onImpactChange(e.target.value)}
                    className="w-full accent-primary h-1.5 bg-surface-sunken rounded-lg cursor-pointer mt-3"
                  />
                  <div className="text-right text-[10px] text-muted-foreground font-mono tabular-nums mt-1">{impact} of 10</div>
                </div>
              </div>

              <div className="space-y-3">
                <label className={labelClass}>Time slots</label>
                {slots.map((slot, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="flex-1">
                      <span className="text-[11.5px] text-ink-secondary font-semibold block mb-1">Start</span>
                      <ClockTimePicker
                        value={slot.startTime}
                        onChange={(val) => onSlotsChange(slots.map((s, i) => (i === index ? { ...s, startTime: val } : s)))}
                        placeholder="Start"
                      />
                    </div>
                    <div className="flex-1">
                      <span className="text-[11.5px] text-ink-secondary font-semibold block mb-1">End</span>
                      <ClockTimePicker
                        value={slot.endTime}
                        onChange={(val) => onSlotsChange(slots.map((s, i) => (i === index ? { ...s, endTime: val } : s)))}
                        placeholder="End"
                        align="right"
                      />
                    </div>
                    {slots.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onSlotsChange(slots.filter((_, idx) => idx !== index))}
                        className="mt-5 p-2.5 bg-surface-raised border border-border hover:border-danger/30 hover:text-danger rounded-[var(--radius-md)] transition-colors cursor-pointer"
                        title="Remove time slot" aria-label="Remove time slot">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => onSlotsChange([...slots, { startTime: '', endTime: '' }])}
                  className="text-xs font-bold text-ink-secondary hover:text-foreground flex items-center gap-1.5 px-3 py-1.5 bg-surface-raised border border-border rounded-[var(--radius-md)] cursor-pointer hover:bg-surface-sunken transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add time slot
                </button>
              </div>

              {status !== undefined && onStatusChange && (
                <div>
                  <label htmlFor="taskformmodal-status" className={labelClass}>Status</label>
                  <select id="taskformmodal-status"
                    value={status}
                    onChange={(e) => onStatusChange(e.target.value)}
                    className={inputClass}
                  >
                    <option value="PENDING">Pending</option>
                    <option value="IN_PROGRESS">In progress</option>
                    <option value="COMPLETED">Completed</option>
                  </select>
                </div>
              )}

              {notes !== undefined && onNotesChange && (
                <div>
                  <label htmlFor="taskformmodal-notes" className={labelClass}>Notes</label>
                  <textarea id="taskformmodal-notes"
                    value={notes}
                    onChange={(e) => onNotesChange(e.target.value)}
                    placeholder="Outcome, follow-ups, anything worth logging"
                    rows={2}
                    className={inputClass}
                  />
                </div>
              )}
            </div>
          )}

          {errorMessage && (
            <div className="flex items-start gap-2 p-3 rounded-[var(--radius-md)] bg-danger-soft border border-danger/20 text-danger text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Von Restorff: the primary action is the one visually distinct
              element on the form — everything else here is neutral. */}
          <div className="flex justify-end gap-3 pt-6 border-t border-border mt-8">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 bg-surface-raised border border-border text-muted-foreground hover:text-foreground text-sm font-semibold rounded-[var(--radius-md)] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-hover text-primary-foreground text-sm font-bold rounded-[var(--radius-md)] transition-colors shadow-[var(--shadow-sm)] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSubmitting ? submittingLabel : submitLabel}
            </button>
          </div>
        </form>
    </Modal>
  );
}
