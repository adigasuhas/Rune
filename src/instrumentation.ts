/**
 * Next.js runs this once when the server process starts (both `next dev` and
 * `next start`). We use it to validate the environment up front so a
 * misconfigured production deployment fails immediately with a clear message
 * instead of 500-ing on the first sign-in attempt.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { assertProductionEnv } = await import('./lib/env');
    assertProductionEnv();

    const { ensureDeveloperAccount } = await import('./lib/devAccount');
    await ensureDeveloperAccount();
  }
}

/**
 * Global catch for every uncaught server-side error (route handlers, server
 * components, server actions) - Next's native instrumentation hook, no
 * third-party APM required. Persists to `data/error.log` via `errorLog.ts`
 * so a self-host has real, inspectable error history (surfaced in the
 * Developer console's Logs tab) instead of only console output.
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string }
) {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { recordError } = await import('./lib/errorLog');
  recordError({
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    path: request.path,
    method: request.method,
    routeType: context.routeType,
  });
}
