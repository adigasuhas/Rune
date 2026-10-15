import { getLocalDateString } from '@/lib/dateUtils';
import { parsePostponeHistory, postponeDayKey } from '@/lib/postpone';

/**
 * Builds the printable task report and opens it in a new window that
 * auto-prints. Extracted from tasks/page.tsx — pure apart from `window.open`.
 *
 * The report HTML is a light-styled standalone document (its own `<style>`),
 * deliberately not using the app's Ledger tokens — it's a print artefact.
 */

interface ReportTask {
  name: string;
  detail?: string;
  projectId?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  date: string;
  sessionType: string;
  estimatedTime: number;
  context: string;
  status: string;
  notes?: string;
  postponeHistory?: string;
}

interface ReportProject {
  id: string;
  name: string;
  color?: string;
}

export interface TaskReportOptions {
  tasks: ReportTask[];
  projects: ReportProject[];
  userTimezone: string;
  startDate: string;
  endDate: string;
  projectIds: Record<string, boolean>;
  status: 'ALL' | 'COMPLETED' | 'UNFINISHED' | 'POSTPONED';
  priority: string;
}

const PRIORITY_WEIGHT: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

const STATUS_LABEL: Record<string, string> = { PENDING: 'To do', IN_PROGRESS: 'In progress', COMPLETED: 'Done', BLOCKED: 'Blocked' };
const PRIORITY_LABEL: Record<string, string> = { CRITICAL: 'Critical', HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };
const STATUS_FILTER_LABEL: Record<string, string> = { ALL: 'All', COMPLETED: 'Done', UNFINISHED: 'Not done', POSTPONED: 'Postponed' };
const sentenceCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replace(/_/g, ' ');

export function generateTaskPdfReport(opts: TaskReportOptions): void {
  const { tasks, projects, userTimezone, startDate, endDate, projectIds, status, priority } = opts;

  const filtered = tasks.filter((t) => {
    const taskDateOnly = getLocalDateString(t.date, userTimezone);
    if (status === 'POSTPONED') {
      // Postponed in the range = moved OFF a day in the range, wherever the
      // task is scheduled now.
      const postponedInRange = parsePostponeHistory(t.postponeHistory).some((e) => {
        const from = postponeDayKey(e.originalDate, userTimezone);
        return from >= startDate && from <= endDate;
      });
      if (!postponedInRange) return false;
    } else if (taskDateOnly < startDate || taskDateOnly > endDate) {
      return false;
    }

    if (t.projectId) {
      if (!projectIds[t.projectId]) return false;
    } else {
      const anyProjectUnchecked = projects.some((p) => !projectIds[p.id]);
      if (anyProjectUnchecked) return false;
    }

    if (status === 'COMPLETED' && t.status !== 'COMPLETED') return false;
    if (status === 'UNFINISHED' && t.status === 'COMPLETED') return false;

    if (priority !== 'ALL' && t.priority !== priority) return false;

    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const dateCompare = getLocalDateString(a.date, userTimezone).localeCompare(getLocalDateString(b.date, userTimezone));
    if (dateCompare !== 0) return dateCompare;
    const priCompare = (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0);
    if (priCompare !== 0) return priCompare;
    return a.status.localeCompare(b.status);
  });

  const totalTasks = sorted.length;
  const completedTasks = sorted.filter((t) => t.status === 'COMPLETED').length;
  const unfinishedTasks = totalTasks - completedTasks;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const deepWorkTasks = sorted.filter((t) => t.sessionType === 'DEEP_WORK').length;
  const totalHours = sorted.reduce((sum, t) => sum + (Number(t.estimatedTime) || 0), 0);

  const selectedProjNames = projects.filter((p) => projectIds[p.id]).map((p) => p.name);
  const selectedProjectsStr =
    selectedProjNames.length === projects.length
      ? 'All projects'
      : selectedProjNames.length === 0
        ? 'None'
        : selectedProjNames.join(', ');

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const tableRows = sorted
    .map((t) => {
      const proj = projects.find((p) => p.id === t.projectId);
      const projColor = proj ? proj.color || '#71717a' : '#71717a';
      const projName = proj ? proj.name : 'Unassigned';
      return `
        <tr>
          <td>
            <div style="font-weight: 600; color: #111827;">${t.name}</div>
            ${t.detail ? '<div style="font-size: 8pt; color: #6b7280; margin-top: 2px;">' + t.detail + '</div>' : ''}
          </td>
          <td>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${projColor};"></span>
              <span>${projName}</span>
            </div>
          </td>
          <td>${getLocalDateString(t.date, userTimezone)}</td>
          <td>
            <span style="font-weight: 500; font-size: 8pt; padding: 2px 6px; border-radius: 4px; border: 1px solid ${t.priority === 'CRITICAL' ? '#fecaca; color: #b91c1c; background-color: #fef2f2;' : t.priority === 'HIGH' ? '#fed7aa; color: #c2410c; background-color: #fff7ed;' : t.priority === 'MEDIUM' ? '#bfdbfe; color: #1d4ed8; background-color: #eff6ff;' : '#e5e7eb; color: #374151; background-color: #f9fafb;'}">${PRIORITY_LABEL[t.priority] || t.priority}</span>
          </td>
          <td>
            <span style="font-size: 9pt; font-weight: 500; color: ${t.status === 'COMPLETED' ? '#16a34a' : t.status === 'IN_PROGRESS' ? '#d97706' : '#4b5563'};">${STATUS_LABEL[t.status] || sentenceCase(t.status)}</span>
          </td>
          <td style="text-align: center;">${t.sessionType === 'DEEP_WORK' ? 'Yes' : 'No'}</td>
          <td>${t.estimatedTime}h</td>
          <td>${sentenceCase(t.context)}</td>
          <td>${t.notes || '-'}</td>
        </tr>
      `;
    })
    .join('');

  printWindow.document.write(`
      <html>
        <head>
          <title>Rune task report</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #1f2937;
              background-color: #fff;
              line-height: 1.5;
              padding: 2cm;
            }
            h1 { font-size: 22pt; margin: 0 0 6px 0; color: #111827; font-weight: 800; letter-spacing: -0.025em; }
            h2 { font-size: 13pt; margin: 0 0 16px 0; color: #4b5563; font-weight: 500; }

            .header-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; border-bottom: 2px solid #e5e7eb; padding-bottom: 16px; }
            .header-left { text-align: left; vertical-align: top; }
            .header-right { text-align: right; vertical-align: top; font-size: 9pt; color: #6b7280; font-family: monospace; }
            .meta-item { font-size: 9.5pt; color: #4b5563; margin-top: 4px; }
            .meta-item strong { color: #111827; }

            .summary-grid { display: table; width: 100%; table-layout: fixed; border-spacing: 12px; margin: 0 -12px 24px -12px; }
            .summary-card { display: table-cell; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; text-align: center; }
            .summary-val { font-size: 16pt; font-weight: 800; color: #111827; margin-top: 2px; }
            .summary-lbl { font-size: 8pt; text-transform: uppercase; color: #6b7280; font-weight: 600; letter-spacing: 0.05em; }

            table.task-table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            tr { page-break-inside: avoid; }
            th { border-bottom: 2px solid #d1d5db; padding: 10px 12px; background-color: #f3f4f6; font-weight: bold; text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.05em; color: #374151; }
            td { border-bottom: 1px solid #e5e7eb; padding: 10px 12px; font-size: 9pt; color: #4b5563; vertical-align: top; }

            @media print {
              body { padding: 0; }
              @page {
                size: A4 landscape;
                margin: 1.5cm;
              }
            }
          </style>
        </head>
        <body>
          <table class="header-table">
            <tr>
              <td class="header-left">
                <h1>RUNE</h1>
                <h2>Task report</h2>
                <div class="meta-item"><strong>Date range:</strong> ${startDate} to ${endDate}</div>
                <div class="meta-item"><strong>Projects:</strong> ${selectedProjectsStr}</div>
              </td>
              <td class="header-right">
                <div>Generated: ${new Date().toLocaleDateString()}</div>
                <div>Status: ${STATUS_FILTER_LABEL[status] || status} | Priority: ${priority === 'ALL' ? 'All' : PRIORITY_LABEL[priority] || priority}</div>
              </td>
            </tr>
          </table>

          <div class="summary-grid">
            <div class="summary-card">
              <div class="summary-lbl">Total tasks</div>
              <div class="summary-val">${totalTasks}</div>
            </div>
            <div class="summary-card">
              <div class="summary-lbl">Done</div>
              <div class="summary-val" style="color: #16a34a;">${completedTasks}</div>
            </div>
            <div class="summary-card">
              <div class="summary-lbl">Not done</div>
              <div class="summary-val" style="color: #dc2626;">${unfinishedTasks}</div>
            </div>
            <div class="summary-card">
              <div class="summary-lbl">Completion rate</div>
              <div class="summary-val" style="color: #2563eb;">${completionRate}%</div>
            </div>
            <div class="summary-card">
              <div class="summary-lbl">Deep work</div>
              <div class="summary-val" style="color: #7c3aed;">${deepWorkTasks}</div>
            </div>
            <div class="summary-card">
              <div class="summary-lbl">Estimated hours</div>
              <div class="summary-val">${totalHours}h</div>
            </div>
          </div>

          <table class="task-table">
            <thead>
              <tr>
                <th style="width: 25%;">Task</th>
                <th style="width: 15%;">Project</th>
                <th style="width: 10%;">Date</th>
                <th style="width: 10%;">Priority</th>
                <th style="width: 10%;">Status</th>
                <th style="width: 8%; text-align: center;">Deep work</th>
                <th style="width: 7%;">Estimate</th>
                <th style="width: 7%;">Context</th>
                <th style="width: 8%;">Notes</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows.length > 0 ? tableRows : '<tr><td colspan="9" style="text-align: center; color: #9ca3af; padding: 24px;">No tasks match the selected filters.</td></tr>'}
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
}
