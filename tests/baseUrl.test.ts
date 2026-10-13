import { describe, it, expect, afterEach, vi } from 'vitest';
import { configuredBaseUrl, getBaseUrl, absoluteUrl, isValidBaseUrl, shouldUseSecureCookies } from '@/lib/baseUrl';

afterEach(() => vi.unstubAllEnvs());
const req = (origin: string) => ({ nextUrl: { origin } });

describe('RUNE_BASE_URL', () => {
  it('normalises to a bare origin (drops path and trailing slash)', () => {
    vi.stubEnv('RUNE_BASE_URL', 'https://rune.example.com/some/path/');
    expect(configuredBaseUrl()).toBe('https://rune.example.com');
    vi.stubEnv('RUNE_BASE_URL', ' http://localhost:3111 ');
    expect(configuredBaseUrl()).toBe('http://localhost:3111');
  });
  it('treats unset, garbage, and non-http schemes as not configured', () => {
    for (const v of ['', 'not a url', 'ftp://x.com', 'javascript:alert(1)']) {
      vi.stubEnv('RUNE_BASE_URL', v);
      expect(configuredBaseUrl()).toBeNull();
    }
  });
  it('isValidBaseUrl (used by the setup tool)', () => {
    expect(isValidBaseUrl('https://a.b')).toBe(true);
    expect(isValidBaseUrl('a.b')).toBe(false);
  });
});

describe('getBaseUrl / absoluteUrl', () => {
  it('the configured URL beats the request origin — a spoofed Host cannot redirect logins', () => {
    vi.stubEnv('RUNE_BASE_URL', 'https://rune.example.com');
    expect(getBaseUrl(req('https://evil.example'))).toBe('https://rune.example.com');
    expect(absoluteUrl('/settings?x=1', req('http://internal:3000')).toString()).toBe('https://rune.example.com/settings?x=1');
  });
  it('falls back to the request origin when unset (right on Vercel/Netlify/localhost)', () => {
    vi.stubEnv('RUNE_BASE_URL', '');
    expect(getBaseUrl(req('https://my-rune.vercel.app'))).toBe('https://my-rune.vercel.app');
  });
});

describe('shouldUseSecureCookies', () => {
  it('follows the scheme of RUNE_BASE_URL', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RUNE_BASE_URL', 'https://rune.example.com');
    expect(shouldUseSecureCookies()).toBe(true);
    vi.stubEnv('RUNE_BASE_URL', 'http://localhost:3000'); // the "run it on my laptop" production build
    expect(shouldUseSecureCookies()).toBe(false);
  });
  it('production without RUNE_BASE_URL stays Secure — except plain-http localhost', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RUNE_BASE_URL', '');
    expect(shouldUseSecureCookies(req('https://rune.example.com'))).toBe(true);
    // behind a TLS-terminating proxy the origin can read http:// — must NOT drop Secure
    expect(shouldUseSecureCookies(req('http://internal-host:3000'))).toBe(true);
    expect(shouldUseSecureCookies()).toBe(true);
    expect(shouldUseSecureCookies(req('http://localhost:3000'))).toBe(false);
    expect(shouldUseSecureCookies(req('http://127.0.0.1:3000'))).toBe(false);
  });
  it('development is only Secure over https', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('RUNE_BASE_URL', '');
    expect(shouldUseSecureCookies(req('http://localhost:3000'))).toBe(false);
    expect(shouldUseSecureCookies(req('https://dev.example.com'))).toBe(true);
  });
});
