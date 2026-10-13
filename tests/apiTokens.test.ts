import { describe, it, expect } from 'vitest';
import {
  API_TOKEN_PREFIX,
  generateApiToken,
  hashApiToken,
  isApiPathAllowedForToken,
  isApiToken,
  parseBearer,
} from '@/lib/apiTokens';

describe('generateApiToken / hashApiToken', () => {
  it('produces a prefixed, high-entropy token whose hash is what gets stored', () => {
    const { token, tokenHash, prefix } = generateApiToken();
    expect(token.startsWith(API_TOKEN_PREFIX)).toBe(true);
    expect(token.length).toBeGreaterThan(API_TOKEN_PREFIX.length + 40);
    expect(tokenHash).toBe(hashApiToken(token));
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).not.toContain(token);
    expect(token.startsWith(prefix)).toBe(true);
    expect(prefix.length).toBeLessThan(token.length / 2); // the prefix must not leak the secret
  });

  it('never repeats', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateApiToken().token));
    expect(seen.size).toBe(200);
  });
});

describe('parseBearer / isApiToken', () => {
  it('extracts a bearer credential, case-insensitively on the scheme', () => {
    expect(parseBearer('Bearer abc')).toBe('abc');
    expect(parseBearer('bearer abc')).toBe('abc');
  });
  it('rejects other schemes and malformed headers', () => {
    expect(parseBearer('Basic abc')).toBeNull();
    expect(parseBearer('Bearer')).toBeNull();
    expect(parseBearer('Bearer a b')).toBeNull();
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer(undefined)).toBeNull();
  });
  it('only treats rune_pat_ credentials as API tokens', () => {
    expect(isApiToken('rune_pat_abc')).toBe(true);
    expect(isApiToken('eyJhbGciOi...')).toBe(false);
    expect(isApiToken(null)).toBe(false);
  });
});

describe('isApiPathAllowedForToken - what a leaked chat-bot token can reach', () => {
  it.each([
    '/api/auth/me',
    '/api/tasks',
    '/api/tasks/abc',
    '/api/tasks/blocking-me',
    '/api/calendar',
    '/api/projects',
    '/api/projects/abc',
    '/api/jobs',
    '/api/digest/weekly',
  ])('allows %s', (path) => {
    expect(isApiPathAllowedForToken(path)).toBe(true);
  });

  // The account-takeover / data-exfiltration surface must stay closed.
  it.each([
    '/api/auth/change-password',
    '/api/auth/logout',
    '/api/auth/password-login',
    '/api/auth/signup',
    '/api/auth/config',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/user/set-password',
    '/api/user/account',
    '/api/user/backup',
    '/api/user/api-tokens',
    '/api/settings',
    '/api/developer/users',
    '/api/projects/abc/collaborators',
    '/api/projects/abc/wall',
    '/api/projects/abc/notebook',
    '/api/projects/abc/wall/n1',
    '/api/teams',
    '/api/teams/abc/transfer-ownership',
    '/api/notebooks',
    '/api/uploads/x',
  ])('denies %s', (path) => {
    expect(isApiPathAllowedForToken(path)).toBe(false);
  });

  it('does not match on look-alike prefixes or traversal', () => {
    expect(isApiPathAllowedForToken('/api/tasksXYZ')).toBe(false);
    expect(isApiPathAllowedForToken('/api/auth/me-not')).toBe(false);
    expect(isApiPathAllowedForToken('/tasks')).toBe(false);
    expect(isApiPathAllowedForToken('/api/tasks/../user/backup')).toBe(false);
    expect(isApiPathAllowedForToken('/api/tasks/%2e%2e/user/backup')).toBe(false);
    expect(isApiPathAllowedForToken('/api/tasks/..\\user')).toBe(false);
  });
});
