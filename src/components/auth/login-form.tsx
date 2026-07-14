'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { TempoLogo } from '@/components/ui/tempo-logo';
import { OtpInput } from '@/components/auth/otp-input';

/** Login form with OTP magic code and Discord OAuth */
export function LoginForm() {
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [otpError, setOtpError] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const router = useRouter();

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    });

    setLoading(false);

    if (error) {
      if (error.message.includes('Signups not allowed')) {
        setError("No account found with this email. Need to sign up?");
      } else {
        setError(error.message);
      }
      return;
    }

    setCooldown(60);
    setStep('code');
  }

  async function handleVerifyCode(code: string) {
    setVerifying(true);
    setError('');
    setOtpError(false);

    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code,
      type: 'email',
    });

    if (error) {
      setOtpError(true);
      setError('Invalid code. Please try again.');
      setVerifying(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  async function handleResendCode() {
    if (cooldown > 0) return;

    setError('');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    });

    if (error) {
      setError('Failed to resend code. Try again.');
      return;
    }

    setCooldown(60);
  }

  async function handleDiscordLogin() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  // Step 2: Code entry
  if (step === 'code') {
    return (
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <TempoLogo size="lg" animated />
          </div>

          <div className="inline-flex h-16 w-16 rounded-full bg-gradient-to-br from-[var(--primary)] to-[var(--pulse-accent-2)] items-center justify-center mx-auto">
            <Mail className="h-8 w-8 text-white" />
          </div>

          <h1 className="text-2xl font-bold text-[var(--foreground)]">Check your email</h1>
          <p className="text-sm text-muted-foreground">
            We sent a 6-digit code to <strong>{email}</strong>
          </p>
        </div>

        <div className="space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 text-red-600 text-sm text-center">
              {error}
            </div>
          )}

          <OtpInput
            onComplete={handleVerifyCode}
            disabled={verifying}
            error={otpError}
          />

          {verifying && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verifying...
            </div>
          )}

          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Didn&apos;t get the code?{' '}
              {cooldown > 0 ? (
                <span className="text-muted-foreground">Resend in {cooldown}s</span>
              ) : (
                <button
                  onClick={handleResendCode}
                  className="text-[var(--primary)] hover:underline font-medium"
                >
                  Resend code
                </button>
              )}
            </p>
          </div>

          <button
            onClick={() => { setStep('email'); setError(''); setOtpError(false); }}
            className="flex items-center justify-center gap-1 w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  // Step 1: Email entry
  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="text-center space-y-2">
        <div className="flex justify-center">
          <TempoLogo size="lg" animated />
        </div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Sign in to your Tempo account</p>
      </div>

      <form onSubmit={handleSendCode} className="space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-red-50 text-red-600 text-sm">
            {error}{' '}
            {error.includes('sign up') && (
              <Link href="/onboarding" className="underline font-medium">Sign up here</Link>
            )}
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(''); }}
            className="w-full px-4 py-2.5 rounded-xl border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/50"
            placeholder="you@company.com"
            required
            autoFocus
          />
        </div>

        <button
          type="submit"
          disabled={loading || !email.trim()}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-[var(--primary)] to-[var(--pulse-accent-2)] text-white font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-opacity shadow-lg shadow-[var(--primary)]/20"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending code...
            </>
          ) : (
            <>
              Continue
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-background px-2 text-muted-foreground">or continue with</span>
        </div>
      </div>

      <button
        onClick={handleDiscordLogin}
        className="w-full py-2.5 rounded-xl border border-border bg-[#5865F2] text-white font-medium text-sm hover:opacity-90 transition-opacity"
      >
        Sign in with Discord
      </button>

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{' '}
        <Link href="/onboarding" className="text-[var(--primary)] hover:underline font-medium">Sign up</Link>
      </p>
    </div>
  );
}
