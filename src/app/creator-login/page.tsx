'use client';

import { useState } from 'react';
import { TempoLogo } from '@/components/ui/tempo-logo';

export default function CreatorLoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [devUrl, setDevUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FC] px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <TempoLogo size="lg" animated />
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          <h1 className="text-xl font-bold text-[#1A1B3A] text-center mb-2">Creator Login</h1>
          <p className="text-sm text-gray-500 text-center mb-6">
            Enter your email and we will send you a login link.
          </p>

          {sent ? (
            <div className="text-center space-y-4">
              <div className="text-4xl">📬</div>
              <p className="text-sm text-gray-600">
                Check your email for a login link. It will expire in 15 minutes.
              </p>
              {devUrl && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-xs">
                  <p className="font-semibold text-yellow-800 mb-1">Dev Mode: Click to log in</p>
                  <a
                    href={devUrl}
                    className="text-[#FF4D8D] underline break-all"
                  >
                    Open login link
                  </a>
                </div>
              )}
              <button
                onClick={() => { setSent(false); setDevUrl(null); }}
                className="text-sm text-gray-400 hover:text-gray-600"
              >
                Try a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30 focus:border-[#FF4D8D]"
              />
              {error && <p className="text-sm text-red-500">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-[#FF4D8D] text-white font-semibold text-sm hover:bg-[#e8447f] transition-colors disabled:opacity-50"
              >
                {loading ? 'Sending...' : 'Send me a login link'}
              </button>
            </form>
          )}
        </div>

        <p className="text-xs text-gray-400 text-center mt-6">
          New here? Ask your brand manager for an invite link.
        </p>
      </div>
    </div>
  );
}
