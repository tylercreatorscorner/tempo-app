'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TempoLogo } from '@/components/ui/tempo-logo';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
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
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <TempoLogo size="lg" animated />
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-[var(--pulse-elev-1)] p-8">
          <h1 className="text-xl font-bold text-foreground text-center">
            {firstName ? `Welcome, ${firstName}!` : 'Welcome to Tempo!'}
          </h1>
          <p className="text-sm text-muted-foreground text-center mt-1.5 mb-6">
            Add your contact info so your manager can reach you about campaigns,
            payouts, and opportunities.
          </p>

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <Label>Mobile phone</Label>
              <Input
                type="tel"
                placeholder="(555) 123-4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            {/* SMS consent — deliberately UNCHECKED by default (TCPA: express
                opt-in must be an affirmative action, never pre-checked). The
                disclosure copy below is a PLACEHOLDER pending legal review. */}
            <label className="flex items-start gap-2.5 cursor-pointer rounded-xl bg-secondary border border-border p-3">
              <input
                type="checkbox"
                checked={smsOptIn}
                onChange={(e) => setSmsOptIn(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border accent-[var(--primary)] focus:ring-primary/40"
              />
              <span className="text-xs text-muted-foreground leading-relaxed">
                I agree to receive text messages from Tempo about my creator
                campaigns and account. Message &amp; data rates may apply. Reply
                STOP to opt out at any time. {/* TODO: replace with legal-approved TCPA disclosure */}
              </span>
            </label>

            {error && <p className="text-sm text-[var(--pulse-neg)]">{error}</p>}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={saving || skipping}
              className="w-full"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Save & continue'}
            </Button>
          </form>

          <Button
            variant="ghost"
            size="md"
            onClick={handleSkip}
            disabled={saving || skipping}
            className="w-full mt-2"
          >
            {skipping ? 'One moment…' : 'Skip for now'}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-5">
          We&apos;ll only use this to contact you about your work with Tempo.
        </p>
      </div>
    </div>
  );
}
