'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { TempoLogo } from '@/components/ui/tempo-logo';

type Step = 1 | 2 | 3;

export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const [step, setStep] = useState<Step>(1);
  const [brandInfo, setBrandInfo] = useState<{ brand: string; brand_display_name: string } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [usernames, setUsernames] = useState(['']);
  const [verified, setVerified] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Validate invite on load
  useEffect(() => {
    fetch(`/api/invites/${code}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setBrandInfo(data);
        }
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to validate invite');
        setLoading(false);
      });
  }, [code]);

  const addUsername = () => setUsernames([...usernames, '']);
  const updateUsername = (i: number, val: string) => {
    const next = [...usernames];
    next[i] = val.replace(/^@/, '').trim();
    setUsernames(next);
  };
  const removeUsername = (i: number) => {
    if (usernames.length > 1) setUsernames(usernames.filter((_, idx) => idx !== i));
  };

  const handleSubmitInfo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setStep(2);
  };

  const handleSubmitUsernames = async (e: React.FormEvent) => {
    e.preventDefault();
    const filtered = usernames.filter((u) => u.trim());
    if (filtered.length === 0) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          name: name.trim(),
          email: email.trim(),
          tiktok_usernames: filtered,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setVerified(data.verified);
        setStep(3);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FC]">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }

  if (error && !brandInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FC] px-4">
        <div className="text-center space-y-4">
          <TempoLogo size="lg" animated />
          <p className="text-gray-600 mt-4">{error}</p>
          <a href="/creator-login" className="text-sm text-[#FF4D8D] hover:underline">
            Already have an account? Log in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FC] px-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <TempoLogo size="lg" animated />
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-6">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`w-2.5 h-2.5 rounded-full transition-colors ${
                s === step ? 'bg-[#FF4D8D]' : s < step ? 'bg-[#7C5CFC]' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          {brandInfo && (
            <p className="text-xs text-center text-gray-400 mb-4">
              Joining <span className="font-semibold text-[#1A1B3A]">{brandInfo.brand_display_name}</span>
            </p>
          )}

          {step === 1 && (
            <>
              <h1 className="text-xl font-bold text-[#1A1B3A] text-center mb-2">Welcome to Tempo</h1>
              <p className="text-sm text-gray-500 text-center mb-6">Tell us about yourself</p>
              <form onSubmit={handleSubmitInfo} className="space-y-4">
                <input
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30 focus:border-[#FF4D8D]"
                />
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30 focus:border-[#FF4D8D]"
                />
                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-[#FF4D8D] text-white font-semibold text-sm hover:bg-[#e8447f] transition-colors"
                >
                  Continue
                </button>
              </form>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="text-xl font-bold text-[#1A1B3A] text-center mb-2">Your TikTok Account(s)</h1>
              <p className="text-sm text-gray-500 text-center mb-6">
                Add the TikTok username(s) you create content with
              </p>
              <form onSubmit={handleSubmitUsernames} className="space-y-4">
                {usernames.map((u, i) => (
                  <div key={i} className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">@</span>
                      <input
                        type="text"
                        placeholder="username"
                        value={u}
                        onChange={(e) => updateUsername(i, e.target.value)}
                        required={i === 0}
                        className="w-full pl-8 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30 focus:border-[#FF4D8D]"
                      />
                    </div>
                    {usernames.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeUsername(i)}
                        className="text-gray-400 hover:text-red-400 px-2"
                      >
                        x
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addUsername}
                  className="text-sm text-[#7C5CFC] hover:underline"
                >
                  + Add another account
                </button>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 rounded-xl bg-[#FF4D8D] text-white font-semibold text-sm hover:bg-[#e8447f] transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Setting up...' : 'Continue'}
                </button>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="w-full text-sm text-gray-400 hover:text-gray-600"
                >
                  Back
                </button>
              </form>
            </>
          )}

          {step === 3 && (
            <div className="text-center space-y-4">
              <div className="text-5xl">🎉</div>
              <h1 className="text-xl font-bold text-[#1A1B3A]">You are in!</h1>
              {verified ? (
                <p className="text-sm text-gray-600">
                  Your account has been verified. Check your email for login instructions.
                </p>
              ) : (
                <p className="text-sm text-gray-600">
                  We will verify your account and notify you by email when everything is ready.
                </p>
              )}
              <a
                href="/creator-login"
                className="inline-block mt-4 px-6 py-3 rounded-xl bg-[#FF4D8D] text-white font-semibold text-sm hover:bg-[#e8447f] transition-colors"
              >
                Go to Login
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
