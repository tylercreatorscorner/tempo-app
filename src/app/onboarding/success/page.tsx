'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FC] px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="inline-flex h-20 w-20 rounded-full bg-gradient-to-br from-[#FF4D8D] to-[#7C5CFC] items-center justify-center mx-auto">
          <Sparkles className="h-10 w-10 text-white" />
        </div>

        <h1 className="text-3xl font-bold text-[#1A1B3A]">Welcome to Tempo! 🎉</h1>
        <p className="text-[#6B7280] text-lg">
          Your subscription is active. Let&apos;s set up your account.
        </p>

        {sessionId && (
          <p className="text-xs text-[#9CA3AF]">Session: {sessionId}</p>
        )}

        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full text-white font-semibold bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] hover:shadow-xl hover:shadow-[#FF4D8D]/30 hover:scale-105 transition-all duration-200"
        >
          Go to Dashboard <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

export default function OnboardingSuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <SuccessContent />
    </Suspense>
  );
}
