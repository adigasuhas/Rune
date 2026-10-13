import { NextResponse } from 'next/server';
import { getSignupPolicy } from '@/lib/authConfig';
import { isSmtpConfigured } from '@/lib/mailer';

/**
 * What the sign-in screen may offer on THIS deployment. Public on purpose
 * (the login page needs it before anyone is signed in) and limited to
 * booleans/enums - never the allowed-domain list, keys, or anything else
 * an operator would consider internal.
 */
export async function GET() {
  const policy = getSignupPolicy();
  return NextResponse.json(
    {
      signup: policy.mode, // 'open' | 'domains' | 'closed'
      // Whether "email me a reset link" is offered next to the recovery question.
      emailReset: isSmtpConfigured(),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export const dynamic = 'force-dynamic';
