'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The explicit claim action. The token is only consumed here (on click), never on
 * the GET landing — so a Discord unfurl or link-scanner can't burn it before the
 * creator arrives.
 */
export function ClaimContinue({ token }: { token: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function onContinue() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/creator/claim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data?.error === 'invalid_or_used'
            ? 'This link has already been used or has expired. Ask your manager for a fresh one.'
            : 'Something went wrong. Please try again.',
        );
        setLoading(false);
        return;
      }
      router.push(data.redirect || '/creator-dashboard');
    } catch {
      setError('Network error — please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="mt-5">
      <button
        onClick={onContinue}
        disabled={loading}
        className="w-full rounded-xl bg-pulse-grad px-4 py-3 text-sm font-semibold text-white shadow-[var(--pulse-elev-1)] transition-all hover:brightness-[1.07] disabled:opacity-60"
      >
        {loading ? 'Signing you in…' : 'Continue to my dashboard'}
      </button>
      {error && <p className="mt-3 text-xs text-[var(--pulse-neg)]">{error}</p>}
    </div>
  );
}
