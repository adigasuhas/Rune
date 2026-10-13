// Load environment variables from .env
import dotenv from 'dotenv';
dotenv.config();

import { db } from '../src/lib/db';
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
  console.log('    RUNE OS: DELETE USER ACCOUNT    ');
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

    const confirm = await question(`⚠️ Are you sure you want to delete user "${email}" and ALL their data? (y/N): `);
    rl.close();

    if (confirm.trim().toLowerCase() !== 'y') {
      console.log('❌ Deletion cancelled.');
      return;
    }

    await db.user.delete({
      where: { email }
    });

    console.log('\n🎉 Success! User deleted successfully.');
    console.log('--------------------------------------');
    console.log(`Email: ${email}`);
    console.log('======================================\n');
  } catch (error) {
    console.error('❌ System Error: Failed to delete user:', error);
    rl.close();
  }
}

main().catch((err) => {
  console.error('❌ Fatal Error:', err);
  process.exit(1);
});
