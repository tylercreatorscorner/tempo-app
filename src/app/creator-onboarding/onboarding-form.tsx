'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TempoLogo } from '@/components/ui/tempo-logo';
import { Loader2, Check } from 'lucide-react';

export function OnboardingForm({
  firstName,
  initialEmail,
  initialPhone,
}: {
  firstName: string | null;
  initialEmail: string;
  initialPhone: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState(initialPhone);
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [error, setError] = useState('');

  const post = async (payload: Record<string, unknown>) => {
    const res = await fetch('/api/auth/creator/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || 'Something went wrong');
    }
    return res.json();
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const result = await post({ email: email.trim(), phone: phone.trim(), smsOptIn });
      // Surface soft validation warnings without blocking — but if BOTH fields
      // were invalid and nothing saved, keep them on the form.
      if (Array.isArray(result.warnings) && result.warnings.length > 0 && (!result.saved || result.saved.length === 0)) {
        setError(
          result.warnings.includes('phone_invalid')
            ? 'That phone number doesn\'t look right. Use a 10-digit US number.'
            : 'That email doesn\'t look right.',
        );
        setSaving(false);
        return;
      }
      router.replace('/creator-dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    setSkipping(true);
    setError('');
    try {
      await post({ skip: true });
      router.replace('/creator-dashboard');
    } catch {
      // Even if the skip write fails, don't trap the creator — let them through.
      router.replace('/creator-dashboard');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FC] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <TempoLogo size="lg" animated />
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          <h1 className="text-xl font-bold text-[#1A1B3A] text-center">
            {firstName ? `Welcome, ${firstName}!` : 'Welcome to Tempo!'}
          </h1>
          <p className="text-sm text-gray-500 text-center mt-1.5 mb-6">
            Add your contact info so your manager can reach you about campaigns,
            payouts, and opportunities.
          </p>

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Email
              </label>
              <input
                type="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/40 focus:border-[#FF4D8D]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Mobile phone
              </label>
              <input
                type="tel"
                placeholder="(555) 123-4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/40 focus:border-[#FF4D8D]"
              />
            </div>

            {/* SMS consent — deliberately UNCHECKED by default (TCPA: express
                opt-in must be an affirmative action, never pre-checked). The
                disclosure copy below is a PLACEHOLDER pending legal review. */}
            <label className="flex items-start gap-2.5 cursor-pointer rounded-xl bg-gray-50 border border-gray-100 p-3">
              <input
                type="checkbox"
                checked={smsOptIn}
                onChange={(e) => setSmsOptIn(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#FF4D8D] focus:ring-[#FF4D8D]/40"
              />
              <span className="text-xs text-gray-600 leading-relaxed">
                I agree to receive text messages from Tempo about my creator
                campaigns and account. Message &amp; data rates may apply. Reply
                STOP to opt out at any time. {/* TODO: replace with legal-approved TCPA disclosure */}
              </span>
            </label>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={saving || skipping}
              className="w-full py-3 rounded-xl bg-[#FF4D8D] text-white font-semibold text-sm hover:bg-[#e8447f] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Save & continue'}
            </button>
          </form>

          <button
            onClick={handleSkip}
            disabled={saving || skipping}
            className="w-full mt-2 py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            {skipping ? 'One moment…' : 'Skip for now'}
          </button>
        </div>

        <p className="text-xs text-gray-400 text-center mt-5">
          We&apos;ll only use this to contact you about your work with Tempo.
        </p>
      </div>
    </div>
  );
}
