// Load environment variables from .env
import dotenv from 'dotenv';
dotenv.config();

import { db } from '../src/lib/db';
import { hashPassword } from '../src/lib/crypto';
import { validatePassword } from '../src/lib/authConfig';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query: string): Promise<string> => {
  return new Promise((resolve) => rl.question(query, resolve));
};

async function main() {
  console.log('\n======================================');
  console.log('    RUNE OS: RESET USER PASSWORD    ');
  console.log('======================================\n');
  
  const emailInput = await question('📧 Enter email address: ');
  const email = emailInput.trim().toLowerCase();
  
  if (!email || !email.includes('@')) {
    console.error('❌ Error: Invalid email address.');
    rl.close();
    return;
  }

  try {
    const existingUser = await db.user.findUnique({ where: { email } });
    if (!existingUser) {
      console.error(`❌ Error: User with email "${email}" does not exist.`);
      rl.close();
      return;
    }

    const passwordInput = await question('🔑 Enter new secure password: ');
    const password = passwordInput.trim();
    
    const passwordError = validatePassword(password, email);
    if (passwordError) {
      console.error(`❌ Error: ${passwordError}`);
      rl.close();
      return;
    }

    rl.close();

    const passwordHash = hashPassword(password);
    // Like a reset from the app: every existing session for this account
    // stops working (a CLI reset usually means the old password is compromised).
    await db.user.update({
      where: { email },
      data: { passwordHash, sessionVersion: (existingUser.sessionVersion ?? 0) + 1 }
    });

    console.log('\n🎉 Success! Password reset successfully.');
    console.log('--------------------------------------');
    console.log(`Email: ${email}`);
    console.log('======================================\n');
  } catch (error) {
    console.error('❌ System Error: Failed to reset password:', error);
    rl.close();
  }
}

main().catch((err) => {
  console.error('❌ Fatal Error:', err);
  process.exit(1);
});
