import Link from 'next/link';
import { peekClaimToken } from '@/lib/auth/creator-claim';
import { ClaimContinue } from './claim-continue';

export const runtime = 'nodejs';
// The token is single-use — never cache this page.
export const dynamic = 'force-dynamic';

/**
 * Creator claim landing. Reached from a signed link the bot DMs. Verifies the
 * token for DISPLAY only (does not consume — see creator-claim.ts), greets the
 * creator, and hands off to the explicit Continue action that claims it.
 */
export default async function CreatorClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const info = token ? await peekClaimToken(token) : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-[var(--pulse-elev-2)]">
        <p className="mb-4 text-lg font-extrabold tracking-tight text-foreground">
          Temp<span className="text-primary">o</span>
        </p>
        {info ? (
          <>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Your portal is ready</p>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
              Welcome, {info.realName.split(/\s+/)[0]} 👋
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Everything in one place — every brand you&apos;re on, your retainers, posts, and GMV,
              and how you stack up across the network.
            </p>
            <ClaimContinue token={token!} />
            <p className="mt-4 text-[11px] text-muted-foreground">
              This is your personal link — please keep it to yourself.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-extrabold tracking-tight text-foreground">This link isn&apos;t valid</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              It may have expired or already been used. Ask your manager for a fresh link, or sign in with your email.
            </p>
            <Link
              href="/creator-login"
              className="mt-4 inline-block text-sm font-semibold text-primary hover:underline"
            >
              Go to login →
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
