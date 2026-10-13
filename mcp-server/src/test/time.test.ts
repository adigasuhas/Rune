import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, localDate, localTime, weekdayShort, zonedToUtc } from '../time.js';

test('zonedToUtc: fixed-offset zone (IST, +05:30)', () => {
  assert.equal(zonedToUtc('2026-09-19', '09:00', 'Asia/Kolkata').toISOString(), '2026-09-19T03:30:00.000Z');
  assert.equal(zonedToUtc('2026-09-19', '00:15', 'Asia/Kolkata').toISOString(), '2026-09-18T18:45:00.000Z');
});

test('zonedToUtc: honours DST (New York summer vs winter)', () => {
  assert.equal(zonedToUtc('2026-07-01', '09:00', 'America/New_York').toISOString(), '2026-07-01T13:00:00.000Z');
  assert.equal(zonedToUtc('2026-01-15', '09:00', 'America/New_York').toISOString(), '2026-01-15T14:00:00.000Z');
});

test('zonedToUtc: day after a DST change still lands on the right wall-clock time', () => {
  // US spring-forward is 2026-03-08; 09:00 the day after is EDT (UTC-4).
  assert.equal(zonedToUtc('2026-03-09', '09:00', 'America/New_York').toISOString(), '2026-03-09T13:00:00.000Z');
  assert.equal(zonedToUtc('2026-03-07', '09:00', 'America/New_York').toISOString(), '2026-03-07T14:00:00.000Z');
});

test('zonedToUtc / localDate / localTime round-trip', () => {
  for (const tz of ['UTC', 'Asia/Kolkata', 'America/Los_Angeles', 'Europe/London', 'Australia/Sydney', 'Pacific/Auckland']) {
    for (const [d, t] of [['2026-09-19', '09:00'], ['2026-12-31', '23:45'], ['2026-06-01', '00:00']]) {
      const instant = zonedToUtc(d, t, tz);
      assert.equal(localDate(instant, tz), d, `${tz} ${d} ${t} date`);
      assert.equal(localTime(instant, tz), t, `${tz} ${d} ${t} time`);
    }
  }
});

test('localTime never renders 24:00 at midnight', () => {
  assert.equal(localTime(zonedToUtc('2026-09-19', '00:00', 'Asia/Kolkata'), 'Asia/Kolkata'), '00:00');
});

test('addDays crosses month/year boundaries and leap days', () => {
  assert.equal(addDays('2026-09-30', 1), '2026-10-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('weekdayShort', () => {
  assert.equal(weekdayShort('2026-09-19'), 'Sat');
});
