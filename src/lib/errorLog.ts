/**
 * Append-only error log, self-hosted observability with zero external
 * services. Mirrors `audit.ts`'s pattern exactly: newline-delimited JSON to
 * `${RUNE_DATA_DIR|./data}/error.log`, git-ignored, fails silently to a
 * console warning on a read-only/serverless filesystem.
 *
 * Fed automatically by `instrumentation.ts`'s `onRequestError` hook (every
 * uncaught server-side error, Next 15+), so routes don't need their own
 * logging calls.
 */
import fs from 'fs';
import path from 'path';

export interface ErrorLogEntry {
  message: string;
  stack?: string;
  path?: string;
  method?: string;
  routeType?: string;
}

function errorFilePath(): string {
  const dir = process.env.RUNE_DATA_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), 'data');
  return path.join(/*turbopackIgnore: true*/ dir, 'error.log');
}

export function recordError(entry: ErrorLogEntry): void {
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n';
  try {
    const file = errorFilePath();
    fs.mkdirSync(/*turbopackIgnore: true*/ path.dirname(file), { recursive: true });
    fs.appendFileSync(/*turbopackIgnore: true*/ file, line, 'utf-8');
  } catch (err) {
    console.warn('[errorLog] could not persist entry:', (err as Error).message, '-', line.trim());
  }
}

export function readRecentErrors(limit = 200): Array<Record<string, unknown>> {
  try {
    const raw = fs.readFileSync(/*turbopackIgnore: true*/ errorFilePath(), 'utf-8');
    return raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .slice(-limit)
      .reverse()
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return { raw: l };
        }
      });
  } catch {
    return [];
  }
}
