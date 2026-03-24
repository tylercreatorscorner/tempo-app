'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, AlertCircle, Mail, Loader2, ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { TempoLogo } from '@/components/ui/tempo-logo';
import { OtpInput } from '@/components/auth/otp-input';

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function OnboardingPage() {
  return (
    <div className="min-h-screen bg-[#FAFBFE] flex items-center justify-center px-4 py-12">
      <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
        <SignupForm />
      </Suspense>
    </div>
  );
}

function SignupForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'details' | 'verify'>('details');
  const [verifying, setVerifying] = useState(false);
  const [otpError, setOtpError] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const isValid = fullName.trim() && isValidEmail(email) && companyName.trim();

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;

    setLoading(true);
    setError('');

    const supabase = createClient();

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: true,
        data: {
          org_name: companyName.trim(),
          full_name: fullName.trim(),
        },
      },
    });

    setLoading(false);

    if (otpError) {
      if (otpError.message.includes('already registered')) {
        setError('An account with this email already exists. Try signing in instead.');
      } else {
        setError(otpError.message);
      }
      return;
    }

    // Save onboarding info
    try {
      await fetch('/api/onboarding/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          fullName: fullName.trim(),
          companyName: companyName.trim(),
          role: 'brand',
        }),
      });
    } catch {
      // Non-blocking
    }

    setCooldown(60);
    setStep('verify');
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
      options: {
        shouldCreateUser: true,
        data: {
          org_name: companyName.trim(),
          full_name: fullName.trim(),
        },
      },
    });

    if (error) {
      setError('Failed to resend code. Try again.');
      return;
    }

    setCooldown(60);
  }

  // Step 2: OTP verification
  if (step === 'verify') {
    return (
      <div className="w-full max-w-md text-center space-y-6">
        <TempoLogo size="lg" animated />

        <div className="inline-flex h-20 w-20 rounded-full bg-gradient-to-br from-[#FF4D8D] to-[#7C5CFC] items-center justify-center mx-auto">
          <Mail className="h-10 w-10 text-white" />
        </div>

        <div>
          <h1 className="text-2xl font-bold">Verify your email</h1>
          <p className="text-muted-foreground mt-2">
            We sent a 6-digit code to <strong>{email}</strong>
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Enter the code below to create your account.
          </p>
        </div>

        <div className="space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 text-red-600 text-sm">
              {error}
            </div>
          )}

          <OtpInput
            onComplete={handleVerifyCode}
            disabled={verifying}
            error={otpError}
          />

          {verifying && (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating your account...
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3">
          <p className="text-sm text-muted-foreground">Didn&apos;t get the code?</p>
          {cooldown > 0 ? (
            <p className="text-sm text-gray-400">Resend in {cooldown}s</p>
          ) : (
            <button
              onClick={handleResendCode}
              className="text-sm font-medium text-[#FF4D8D] hover:underline"
            >
              Resend code
            </button>
          )}
        </div>

        <button
          onClick={() => { setStep('details'); setError(''); setOtpError(false); }}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to details
        </button>
      </div>
    );
  }

  // Step 1: Details form
  return (
    <div className="w-full max-w-md space-y-8">
      {/* Logo + header */}
      <div className="text-center space-y-3">
        <TempoLogo size="lg" animated />
        <div>
          <h1 className="text-2xl font-bold">Get started with Tempo</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Creator management, simplified. Set up in under 2 minutes.
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 text-red-600 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>
                {error}{' '}
                {error.includes('signing in') && (
                  <Link href="/login" className="underline font-medium">Sign in here</Link>
                )}
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="fullName" className="text-sm font-medium">
              Full name
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Tyler Drinkard"
              required
              className="w-full px-4 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/50"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              Work email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              placeholder="you@company.com"
              required
              className="w-full px-4 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/50"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="company" className="text-sm font-medium">
              Company name
            </label>
            <input
              id="company"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Your brand or agency name"
              required
              className="w-full px-4 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/50"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={!isValid || loading}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] text-white font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity shadow-lg shadow-[#FF4D8D]/20"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending verification code...
            </>
          ) : (
            <>
              Create account
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>

      <div className="text-center space-y-3">
        <p className="text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="text-[#FF4D8D] hover:underline font-medium">
            Sign in
          </Link>
        </p>
        <p className="text-xs text-muted-foreground">
          By creating an account, you agree to our{' '}
          <Link href="/terms" className="underline hover:text-foreground">Terms</Link>
          {' '}and{' '}
          <Link href="/privacy" className="underline hover:text-foreground">Privacy Policy</Link>
        </p>
      </div>
    </div>
  );
}
