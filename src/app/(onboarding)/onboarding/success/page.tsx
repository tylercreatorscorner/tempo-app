'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { TempoLogo } from '@/components/ui/tempo-logo';

function SuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (!sessionId) {
      router.replace('/onboarding');
      return;
    }

    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          router.push('/dashboard');
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [sessionId, router]);

  return (
    <div className="w-full max-w-lg mx-auto text-center space-y-8">
      <TempoLogo size="lg" animated showTagline />

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-8 space-y-6">
        <div className="inline-flex h-20 w-20 rounded-full bg-gradient-to-br from-[#FF4D8D] to-[#7C5CFC] items-center justify-center mx-auto">
          <CheckCircle2 className="h-10 w-10 text-white" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold">You&apos;re all set!</h1>
          <p className="text-muted-foreground">
            Your payment went through and your workspace is being set up now.
          </p>
        </div>

        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Setting up your workspace... Redirecting in {countdown}s</span>
        </div>

        <button
          onClick={() => router.push('/dashboard')}
          className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] text-white font-semibold hover:opacity-90 transition-opacity"
        >
          Go to Dashboard Now
        </button>
      </div>
    </div>
  );
}

export default function OnboardingSuccessPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
      <SuccessContent />
    </Suspense>
  );
}
