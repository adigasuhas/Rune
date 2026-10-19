import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Review the Day persistence + the Today first-focus reminder:
 * /api/reviews (GET/POST), /api/reviews/first-focus (GET) and
 * /api/reviews/first-focus/ack (POST), against a small in-memory db that
 * understands the where-clauses these routes use.
 */

const getSessionUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getSessionUser: (...a: unknown[]) => getSessionUser(...a) }));

let seq = 0;
const nextId = () => `id${++seq}`;
const records: any[] = [];
const acks: any[] = [];
const tasks: any[] = [];
const users: any[] = [];
const settings: any[] = [];

function matches(row: any, where: any = {}): boolean {
  return Object.entries(where).every(([k, cond]: [string, any]) => {
    const v = row[k];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('not' in cond && (cond.not === null ? v == null : v === cond.not)) return false;
      if ('lt' in cond && !(v < cond.lt)) return false;
      if ('in' in cond && !cond.in.includes(v)) return false;
      return true;
    }
    return v === cond;
  });
}
function ordered(rows: any[], orderBy?: any) {
  if (!orderBy) return rows;
  const [[k, dir]] = Object.entries(orderBy) as [string, string][];
  return [...rows].sort((a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0) * (dir === 'desc' ? -1 : 1));
}

const db = {
  accomplishmentRecord: {
    findUnique: async ({ where }: any) =>
      records.find((r) => r.userId === where.userId_date.userId && r.date === where.userId_date.date) ?? null,
    findFirst: async ({ where, orderBy }: any) => ordered(records.filter((r) => matches(r, where)), orderBy)[0] ?? null,
    findMany: async ({ where, orderBy, take }: any) => ordered(records.filter((r) => matches(r, where)), orderBy).slice(0, take ?? Infinity),
    count: async ({ where }: any) => records.filter((r) => matches(r, where)).length,
    upsert: async ({ where, update, create }: any) => {
      const existing = records.find((r) => r.userId === where.userId_date.userId && r.date === where.userId_date.date);
      if (existing) { Object.assign(existing, update, { updatedAt: new Date() }); return existing; }
      const row = { id: nextId(), createdAt: new Date(), updatedAt: new Date(), ...create };
      records.push(row);
      return row;
    },
  },
  firstFocusAck: {
    findUnique: async ({ where }: any) =>
      acks.find((a) => a.userId === where.userId_focusDate.userId && a.focusDate === where.userId_focusDate.focusDate) ?? null,
    findMany: async ({ where }: any) => acks.filter((a) => matches(a, where)),
    upsert: async ({ where, create }: any) => {
      const existing = acks.find((a) => a.userId === where.userId_focusDate.userId && a.focusDate === where.userId_focusDate.focusDate);
      if (existing) return existing;
      const row = { id: nextId(), acknowledgedAt: new Date(), ...create };
      acks.push(row);
      return row;
    },
  },
  task: {
    findMany: async ({ where }: any = {}) => tasks.filter((t) => matches(t, where)),
    findUnique: async ({ where }: any) => tasks.find((t) => t.id === where.id) ?? null,
    create: async ({ data }: any) => { const row = { id: nextId(), ...data }; tasks.push(row); return row; },
  },
  calendarEvent: { findMany: async () => [] },
  project: { findUnique: async () => null },
  user: { findUnique: async ({ where }: any) => users.find((u) => u.id === where.id) ?? null },
  setting: { findUnique: async ({ where }: any) => settings.find((s) => s.userId === where.userId) ?? null },
};
vi.mock('@/lib/db', () => ({ db }));

const post = (url: string, body: unknown) =>
  new Request(`http://localhost${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) as never;
const get = (url: string) => new Request(`http://localhost${url}`) as never;

const routes = () => import('@/app/api/reviews/route');
const focusRoute = () => import('@/app/api/reviews/first-focus/route');
const ackRoute = () => import('@/app/api/reviews/first-focus/ack/route');

async function saveReview(body: Record<string, unknown>) {
  const { POST } = await routes();
  const res = await POST(post('/api/reviews', body));
  return { status: res.status, body: await res.json() };
}
async function firstFocus() {
  const { GET } = await focusRoute();
  return (await GET()).json();
}
async function ack(focusDate: string) {
  const { POST } = await ackRoute();
  const res = await POST(post('/api/reviews/first-focus/ack', { focusDate }));
  return { status: res.status, body: await res.json() };
}
/** Pretend "now" is this UTC instant. */
const at = (iso: string) => vi.setSystemTime(new Date(iso));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  for (const a of [records, acks, tasks, users, settings]) a.length = 0;
  seq = 0;
  users.push({ id: 'u1', timezone: 'UTC' }, { id: 'u2', timezone: 'UTC' });
  settings.push({ userId: 'u1', workStart: '09:00', workEnd: '17:00', workingDays: 'Monday,Tuesday,Wednesday,Thursday,Friday' });
  getSessionUser.mockResolvedValue({ userId: 'u1' });
});
afterEach(() => { vi.useRealTimers(); });

describe('POST /api/reviews', () => {
  it('401 when signed out, 400 on a bad date', async () => {
    getSessionUser.mockResolvedValue(null);
    expect((await saveReview({ date: '2026-10-16' })).status).toBe(401);
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    expect((await saveReview({ date: '2026-02-30' })).status).toBe(400);
  });

  it('keeps both answers verbatim and points a Friday review at Monday', async () => {
    at('2026-10-16T17:40:00Z');
    const text = 'Line one\n  “quoted” & <b>not html</b> — ünïcödé';
    const { status, body } = await saveReview({ date: '2026-10-16', wentWell: text, firstFocus: 'Finish the methods section' });
    expect(status).toBe(200);
    expect(body.review).toMatchObject({ date: '2026-10-16', wentWell: text, firstFocus: 'Finish the methods section', firstFocusDate: '2026-10-19', firstFocusTaskId: null });
    expect(records).toHaveLength(1);
    expect(records[0].keyAchievements).toBe(text); // the legacy summary still filled
  });

  it('does not create a task unless asked', async () => {
    await saveReview({ date: '2026-10-16', wentWell: '', firstFocus: 'Call the vendor' });
    expect(tasks).toHaveLength(0);
  });

  it('creates exactly one task when asked, even across repeated saves', async () => {
    const first = await saveReview({ date: '2026-10-16', firstFocus: 'Call the vendor', addFirstFocusAsTask: true });
    expect(first.body.taskCreated).toBe(true);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ name: 'Call the vendor', priority: 'HIGH', sessionType: 'DEEP_WORK', userId: 'u1', status: 'PENDING' });
    expect(tasks[0].date.toISOString()).toBe('2026-10-19T00:00:00.000Z'); // Monday, not Saturday
    const again = await saveReview({ date: '2026-10-16', firstFocus: 'Call the vendor', addFirstFocusAsTask: true });
    expect(again.body.taskCreated).toBe(false);
    expect(tasks).toHaveLength(1);
  });

  it('updates the same review in place - no duplicates - and keeps reviewedAt', async () => {
    at('2026-10-16T17:40:00Z');
    await saveReview({ date: '2026-10-16', wentWell: 'A', firstFocus: 'B' });
    at('2026-10-16T18:05:00Z');
    const { body } = await saveReview({ date: '2026-10-16', wentWell: 'A, edited', firstFocus: '' });
    expect(records).toHaveLength(1);
    expect(body.updated).toBe(true);
    expect(body.review.reviewedAt).toBe('2026-10-16T17:40:00.000Z');
    expect(body.review).toMatchObject({ wentWell: 'A, edited', firstFocus: null, firstFocusDate: null });
  });

  it('blank answers are stored as null, and the old summary fallback still applies', async () => {
    tasks.push({ id: 't1', userId: 'u1', date: new Date('2026-10-16T10:00:00Z'), status: 'COMPLETED', name: 'x' });
    const { body } = await saveReview({ date: '2026-10-16', wentWell: '   ', firstFocus: '\n' });
    expect(body.review).toMatchObject({ wentWell: null, firstFocus: null, firstFocusDate: null });
    expect(records[0].keyAchievements).toBe('Completed 1 task.');
  });

  it('leaves out-of-request fields alone (a plain metrics refresh keeps the words)', async () => {
    await saveReview({ date: '2026-10-16', wentWell: 'kept', firstFocus: 'kept too' });
    const { body } = await saveReview({ date: '2026-10-16' });
    expect(body.review).toMatchObject({ wentWell: 'kept', firstFocus: 'kept too', firstFocusDate: '2026-10-19' });
  });
});

describe('GET /api/reviews', () => {
  it('returns one day for ?date=, null when that day was never reviewed', async () => {
    await saveReview({ date: '2026-10-16', wentWell: 'w', firstFocus: 'f' });
    const { GET } = await routes();
    expect((await (await GET(get('/api/reviews?date=2026-10-16'))).json()).review.wentWell).toBe('w');
    expect((await (await GET(get('/api/reviews?date=2026-10-15'))).json()).review).toBeNull();
  });

  it('lists newest first, only the caller’s reviews, with paging and plain counts', async () => {
    for (const d of ['2026-10-12', '2026-10-14', '2026-10-13', '2026-10-15']) await saveReview({ date: d, wentWell: d, firstFocus: d === '2026-10-13' ? null : 'next' });
    records.push({ id: 'x', userId: 'u2', date: '2026-10-16', reviewedAt: new Date() });
    records.push({ id: 'y', userId: 'u1', date: '2026-10-11', reviewedAt: null }); // not a review (API-written metrics)
    const { GET } = await routes();
    const p1 = await (await GET(get('/api/reviews?limit=3'))).json();
    expect(p1.reviews.map((r: any) => r.date)).toEqual(['2026-10-15', '2026-10-14', '2026-10-13']);
    expect(p1.nextBefore).toBe('2026-10-13');
    expect(p1.summary).toEqual({ total: 4, withFocus: 3, since: '2026-10-12' });
    const p2 = await (await GET(get('/api/reviews?limit=3&before=2026-10-13'))).json();
    expect(p2.reviews.map((r: any) => r.date)).toEqual(['2026-10-12']);
    expect(p2.nextBefore).toBeNull();
  });

  it('shows when a first focus was acknowledged', async () => {
    at('2026-10-16T17:00:00Z');
    await saveReview({ date: '2026-10-16', firstFocus: 'f' });
    at('2026-10-19T08:30:00Z');
    await ack('2026-10-19');
    const { GET } = await routes();
    const list = await (await GET(get('/api/reviews'))).json();
    expect(list.reviews[0].acknowledgedAt).toBe('2026-10-19T08:30:00.000Z');
  });
});

describe('first focus on Today', () => {
  beforeEach(async () => {
    at('2026-10-16T17:40:00Z'); // Friday evening
    await saveReview({ date: '2026-10-16', wentWell: 'Good Friday', firstFocus: 'Finish the methods section' });
  });

  it('nothing over the weekend; Monday shows Friday’s first focus with its window', async () => {
    at('2026-10-17T09:00:00Z');
    expect((await firstFocus()).focus).toBeNull();
    at('2026-10-18T09:00:00Z');
    expect((await firstFocus()).focus).toBeNull();
    at('2026-10-19T07:55:00Z');
    const data = await firstFocus();
    expect(data.focus).toMatchObject({ date: '2026-10-16', firstFocus: 'Finish the methods section', firstFocusDate: '2026-10-19' });
    expect(data.today).toBe('2026-10-19');
    expect(data.window).toEqual({ startsAt: '2026-10-19T08:00:00.000Z', endsAt: '2026-10-19T17:00:00.000Z' });
  });

  it('gone once acknowledged - on every later load that day - and the review is untouched', async () => {
    at('2026-10-19T09:10:00Z');
    const before = JSON.stringify(records);
    const r = await ack('2026-10-19');
    expect(r.status).toBe(200);
    expect((await firstFocus()).focus).toBeNull();
    at('2026-10-19T14:00:00Z'); // later, "reopened"
    expect((await firstFocus()).focus).toBeNull();
    expect(JSON.stringify(records)).toBe(before);
    expect(tasks).toHaveLength(0);
  });

  it('acknowledging twice keeps one row and the first time', async () => {
    at('2026-10-19T09:10:00Z');
    const a = await ack('2026-10-19');
    at('2026-10-19T09:20:00Z');
    const b = await ack('2026-10-19');
    expect(acks).toHaveLength(1);
    expect(b.body.acknowledgedAt).toBe(a.body.acknowledgedAt);
  });

  it('the next working day shows its own first focus', async () => {
    at('2026-10-19T17:30:00Z');
    await saveReview({ date: '2026-10-19', firstFocus: 'Send the draft to Priya' });
    at('2026-10-19T09:00:00Z');
    await ack('2026-10-19');
    at('2026-10-20T08:30:00Z');
    expect((await firstFocus()).focus).toMatchObject({ date: '2026-10-19', firstFocus: 'Send the draft to Priya' });
  });

  it('nothing after the working day has ended, nothing on a day marked leave', async () => {
    at('2026-10-19T17:00:00Z');
    expect((await firstFocus()).focus).toBeNull();
    settings[0].workingDays = '2026-10-19:leave:Conference';
    at('2026-10-19T09:00:00Z');
    expect((await firstFocus()).focus).toBeNull();
  });

  it('a review without a first focus shows nothing, and cannot be acknowledged', async () => {
    at('2026-10-19T17:30:00Z');
    await saveReview({ date: '2026-10-19', wentWell: 'only this' });
    at('2026-10-20T09:00:00Z');
    expect((await firstFocus()).focus).toBeNull();
    const r = await ack('2026-10-20');
    expect(r.status).toBe(404);
    expect(acks).toHaveLength(0);
  });

  it('a review of the same day never counts as "the previous review"', async () => {
    at('2026-10-21T08:30:00Z');
    records.push({ id: 'z', userId: 'u1', date: '2026-10-21', reviewedAt: new Date(), firstFocus: 'odd', firstFocusDate: '2026-10-21' });
    expect((await firstFocus()).focus).toBeNull();
  });

  it('uses the user’s time zone for "today" and the window', async () => {
    users[0].timezone = 'America/Los_Angeles';
    // 06:30 UTC Monday is still Sunday evening in Los Angeles.
    at('2026-10-19T06:30:00Z');
    expect((await firstFocus()).focus).toBeNull();
    // 08:30 PDT Monday = 15:30 UTC.
    at('2026-10-19T15:30:00Z');
    const data = await firstFocus();
    expect(data.focus?.firstFocus).toBe('Finish the methods section');
    expect(data.window.startsAt).toBe('2026-10-19T15:00:00.000Z');
  });

  it('acks are per user', async () => {
    at('2026-10-19T09:00:00Z');
    getSessionUser.mockResolvedValue({ userId: 'u2' });
    expect((await ack('2026-10-19')).status).toBe(404);
    getSessionUser.mockResolvedValue({ userId: 'u1' });
    expect((await firstFocus()).focus).not.toBeNull();
  });
});
