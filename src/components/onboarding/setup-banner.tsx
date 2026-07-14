'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X, ChevronDown, ChevronUp, Check, ArrowRight } from 'lucide-react';
import { useOnboarding, type OnboardingStep } from '@/hooks/use-onboarding';

export function SetupBanner() {
  const { steps, progress, isComplete, loading } = useOnboarding();
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const pathname = usePathname();

  // Hide on dashboard (it has its own onboarding cards)
  if (loading || isComplete || dismissed || steps.length === 0 || pathname === '/dashboard') return null;

  const nextStep = steps.find(s => !s.complete);

  return (
    <div className="mx-3 sm:mx-4 md:mx-6 mb-4">
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4 flex-1">
            <div className="flex items-center gap-3">
              <div className="text-2xl">🚀</div>
              <div>
                <h3 className="font-semibold text-sm">Get set up</h3>
                <p className="text-xs text-muted-foreground">
                  {progress === 0 ? "Let's get your dashboard ready" : `You're ${progress}% there`}
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="flex-1 max-w-xs hidden sm:block">
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--pulse-accent-2)] transition-all duration-700 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <span className="text-xs font-medium text-muted-foreground hidden sm:block">
              {steps.filter(s => s.required && s.complete).length}/{steps.filter(s => s.required).length}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-muted-foreground"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {progress >= 50 && (
              <button
                onClick={() => setDismissed(true)}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Mobile progress bar */}
        <div className="px-5 pb-3 sm:hidden">
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--pulse-accent-2)] transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Steps */}
        {expanded && (
          <div className="px-5 pb-4 space-y-1">
            {steps.map((step) => (
              <StepRow key={step.id} step={step} isNext={step.id === nextStep?.id} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StepRow({ step, isNext }: { step: OnboardingStep; isNext: boolean }) {
  return (
    <Link
      href={step.href}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
        step.complete
          ? 'opacity-60'
          : isNext
          ? 'bg-gradient-to-r from-[var(--primary)]/5 to-[var(--pulse-accent-2)]/5 hover:from-[var(--primary)]/10 hover:to-[var(--pulse-accent-2)]/10'
          : 'hover:bg-gray-50'
      }`}
    >
      {/* Status indicator */}
      <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-sm ${
        step.complete
          ? 'bg-gradient-to-br from-[var(--primary)] to-[var(--pulse-accent-2)]'
          : isNext
          ? 'border-2 border-[var(--primary)] bg-[var(--primary)]/5'
          : 'border-2 border-gray-200'
      }`}>
        {step.complete ? (
          <Check className="h-3.5 w-3.5 text-white" />
        ) : (
          <span>{step.icon}</span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${step.complete ? 'line-through text-muted-foreground' : ''}`}>
          {step.label}
          {step.required && !step.complete && (
            <span className="ml-1.5 text-[10px] font-semibold text-[var(--primary)] uppercase">Required</span>
          )}
        </p>
        {!step.complete && (
          <p className="text-xs text-muted-foreground truncate">{step.description}</p>
        )}
      </div>

      {!step.complete && isNext && (
        <ArrowRight className="h-4 w-4 text-[var(--primary)] shrink-0" />
      )}
    </Link>
  );
}
