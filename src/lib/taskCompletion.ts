/**
 * "A task just moved to Done" - announced by every place that completes a
 * task, so the reflection prompt (CompletionReflectionPrompt) can ask the
 * time-sheet questions once, at the moment it's finished, and never while a
 * task is still To do or In progress.
 */
export const TASK_COMPLETED = 'rune-task-completed';
/** Open the reflection for a task to read or edit it (from the time sheet). */
export const EDIT_REFLECTION = 'rune-edit-reflection';

export interface CompletedTaskDetail {
  taskId: string;
  name: string;
}

/** Call after a successful save that moved a task from another status to COMPLETED. */
export function announceTaskCompleted(task: { id: string; name: string }, previousStatus?: string | null) {
  if (typeof window === 'undefined' || previousStatus === 'COMPLETED') return;
  window.dispatchEvent(new CustomEvent<CompletedTaskDetail>(TASK_COMPLETED, { detail: { taskId: task.id, name: task.name } }));
}

export function openReflection(task: { id: string; name: string }) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<CompletedTaskDetail>(EDIT_REFLECTION, { detail: { taskId: task.id, name: task.name } }));
}
