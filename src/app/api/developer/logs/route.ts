import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { readRecentAudit } from '@/lib/audit';
import { readRecentErrors } from '@/lib/errorLog';
import { enforceRateLimit } from '@/lib/rateLimit';

/**
 * Real, self-hosted observability feed for the Developer console's Logs tab:
 * merges the admin audit trail (`audit.log`, privileged actions) and the
 * uncaught-error log (`error.log`, fed by `instrumentation.ts`'s
 * `onRequestError`) into one newest-first stream. Replaces what used to be
 * a hardcoded fake "Live Application Trace Log".
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if ('error' in admin) return NextResponse.json({ error: admin.error }, { status: admin.status });

  const limited = enforceRateLimit(req, 'developer-logs', 30, 60_000, admin.userId);
  if (limited) return limited;

  const audit: Array<Record<string, unknown>> = readRecentAudit(100).map((e) => ({ ...e, kind: 'audit' }));
  const errors: Array<Record<string, unknown>> = readRecentErrors(100).map((e) => ({ ...e, kind: 'error' }));

  const merged = [...audit, ...errors].sort((a, b) => {
    const at = typeof a.at === 'string' ? a.at : '';
    const bt = typeof b.at === 'string' ? b.at : '';
    return bt.localeCompare(at);
  });

  return NextResponse.json(merged.slice(0, 200));
}
