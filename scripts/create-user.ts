// Creates an account from the command line - the first administrator during
// setup, or any account on a deployment where sign-ups are closed.
//
//   npm run create-user                       (interactive prompts)
//   npm run create-user -- --email a@b.co --password '...' --name 'Ada' --admin
//
// Flags: --email, --password, --name, --admin (grants the admin console),
// --if-missing (exit 0 and change nothing if the address already exists).
// The interactive form is used whenever --email/--password aren't both given.

// Load environment variables from .env (never overrides ones already set,
// which is how `npm run setup` points this at the database it just configured).
import dotenv from 'dotenv';
dotenv.config();

import { db } from '../src/lib/db';
import { hashPassword } from '../src/lib/crypto';
import { validatePassword } from '../src/lib/authConfig';
import readline from 'readline';

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

async function prompt(query: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(query, (a) => { rl.close(); resolve(a); }));
}

async function main() {
  let email = flag('email');
  // The password may come from the environment so callers (npm run setup)
  // don't have to put it on a command line where `ps` can see it.
  let password = flag('password') ?? process.env.RUNE_CREATE_USER_PASSWORD;
  let name = flag('name');
  const admin = has('admin');

  if (!email || !password) {
    console.log('\n=== Rune: create an account ===\n');
    email = email ?? await prompt('Email address: ');
    name = name ?? await prompt('Display name (optional): ');
    password = password ?? await prompt('Password (at least 10 characters): ');
  }

  email = (email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Error: that is not a valid email address.');
    process.exit(1);
  }
  const passwordError = validatePassword(password ?? '', email);
  if (passwordError) {
    console.error(`Error: ${passwordError}`);
    process.exit(1);
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    if (has('if-missing')) {
      console.log(`An account for ${email} already exists; left unchanged.`);
      process.exit(0);
    }
    console.error(`Error: an account for ${email} already exists.`);
    process.exit(1);
  }

  const user = await db.user.create({
    data: {
      email,
      name: name?.trim() || null,
      passwordHash: hashPassword(password!),
      role: admin ? 'DEVELOPER' : 'USER',
      avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(email)}`,
    },
  });

  console.log(`Created ${admin ? 'administrator' : 'account'}: ${user.email} (id ${user.id})`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to create the account:', err instanceof Error ? err.message : err);
  process.exit(1);
});
