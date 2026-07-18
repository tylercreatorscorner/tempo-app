'use client';

import { useEffect, useState } from 'react';
import { TempoLogo } from '@/components/ui/tempo-logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const VERIFY_ERROR_MESSAGES: Record<string, string> = {
  missing_token: 'That sign-in link is missing its token. Request a new one below.',
  invalid_token: 'That sign-in link is invalid or has expired. Request a new one below.',
  token_already_used: 'That sign-in link has already been used. Request a new one below.',
  verify_failed: 'We couldn\'t finish signing you in. Please try again.',
};

export default function CreatorLoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [devUrl, setDevUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Surface ?error=... codes set by the verify route on failure redirects.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('error');
    if (code) setError(VERIFY_ERROR_MESSAGES[code] ?? 'Sign-in failed. Please try again.');
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/creator/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setSent(true);
        if (data.dev_login_url) {
          setDevUrl(data.dev_login_url);
        }
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <TempoLogo size="lg" animated />
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-[var(--pulse-elev-1)] p-8">
          <h1 className="text-xl font-bold text-foreground text-center mb-2">Creator Login</h1>
          <p className="text-sm text-muted-foreground text-center mb-6">
            Enter your email and we will send you a login link.
          </p>

          {sent ? (
            <div className="text-center space-y-4">
              <div className="text-4xl">📬</div>
              <p className="text-sm text-muted-foreground">
                Check your email for a login link. It will expire in 15 minutes.
              </p>
              {devUrl && (
                <div className="mt-4 p-3 bg-[var(--pulse-warn-bg)] border border-[var(--pulse-warn)]/30 rounded-xl text-xs">
                  <p className="font-semibold text-[var(--pulse-warn)] mb-1">Dev Mode: Click to log in</p>
                  <a
                    href={devUrl}
                    className="text-primary underline break-all"
                  >
                    Open login link
                  </a>
                </div>
              )}
              <button
                onClick={() => { setSent(false); setDevUrl(null); }}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Try a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="px-4 py-3 text-sm rounded-xl"
              />
              {error && <p className="text-sm text-[var(--pulse-neg)]">{error}</p>}
              <Button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl py-3 text-sm"
              >
                {loading ? 'Sending...' : 'Send me a login link'}
              </Button>
            </form>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center mt-6">
          New here? Ask your brand manager for an invite link.
        </p>
      </div>
    </div>
  );
}
