/**
 * Canonical external links and public-facing facts, kept in one place so
 * every page (nav, footer, docs, why-free) says the same thing - and so a
 * change is a one-line edit.
 */
export const GITHUB_REPO_URL = 'https://github.com/adigasuhas/Rune';
export const GITHUB_CLONE_URL = `${GITHUB_REPO_URL}.git`;
export const BUY_ME_A_COFFEE_URL = 'https://buymeacoffee.com/adigasuhas';

/**
 * How the public pages describe the licence. Deliberately makes no
 * open-source / MIT claim: LICENSE in the repo is currently a proprietary
 * placeholder pending a final decision, and the site must not promise rights
 * the licence doesn't grant. Update this (and docs/open-source) together
 * once the licence is settled.
 */
export const LICENSE_SUMMARY = 'Free to use. The source lives on GitHub; see its LICENSE file for the terms.';

/**
 * Where the public pages' sign-up buttons go and what they say. This is one
 * of two files that differ in the standalone marketing site (landing_page/,
 * which has no accounts): its copy points these at the self-hosting guide
 * and hides "Sign in". Everything else is shared - see
 * landing_page/scripts/sync-from-app.mjs.
 */
export const SIGNUP = { href: '/login?mode=signup', label: 'Create a free account', short: 'Get started' } as const;
export const SHOW_SIGN_IN = true;
