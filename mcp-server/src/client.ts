export class RuneApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'RuneApiError';
  }
}

export interface RuneUser {
  id: string;
  email: string;
  name: string | null;
  timezone: string;
}

/** Thin authenticated wrapper over Rune's REST API. One instance per user token. */
export class RuneClient {
  private userCache: { user: RuneUser; at: number } | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly timeoutMs = 20_000
  ) {}

  async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(new URL(path, this.baseUrl), {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new RuneApiError(`Could not reach Rune at ${this.baseUrl} (${reason}). Check RUNE_BASE_URL and that the app is running.`, 0);
    }

    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (res.ok) return data as T;

    const serverMessage =
      data && typeof data === 'object' && 'error' in data ? String((data as { error: unknown }).error).replace(/\.$/, '') : undefined;
    throw new RuneApiError(describeFailure(res.status, serverMessage), res.status);
  }

  /** The token owner, cached briefly - its timezone drives every date calculation. */
  async me(): Promise<RuneUser> {
    if (this.userCache && Date.now() - this.userCache.at < 60_000) return this.userCache.user;
    const data = await this.request<{ user: RuneUser }>('GET', '/api/auth/me');
    this.userCache = { user: data.user, at: Date.now() };
    return data.user;
  }
}

function describeFailure(status: number, serverMessage?: string): string {
  switch (status) {
    case 401:
      return 'Rune rejected the API token (invalid, revoked or expired). Create a new one in Rune under Settings > Integrations and API tokens.';
    case 403:
      return serverMessage
        ? `Not allowed: ${serverMessage}`
        : 'Not allowed: this token or account cannot perform that action.';
    case 404:
      return serverMessage ? `Not found: ${serverMessage}. Use a list tool to find the correct id.` : 'Not found. Use a list tool to find the correct id.';
    case 400:
      return `Rune rejected the request as invalid${serverMessage ? `: ${serverMessage}` : ''}. Check the arguments and try again.`;
    case 429:
      return 'Rune is rate limiting this token. Wait a moment and retry.';
    default:
      return `Rune returned an error (HTTP ${status})${serverMessage ? `: ${serverMessage}` : ''}.`;
  }
}
