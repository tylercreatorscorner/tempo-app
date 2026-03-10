'use client';

import { Lock, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useOnboarding } from '@/hooks/use-onboarding';

interface DashboardGateProps {
  children: React.ReactNode;
}

/** Wraps dashboard content. Shows blurred overlay with CTA when required onboarding steps are incomplete. */
export function DashboardGate({ children }: DashboardGateProps) {
  const { isGated, steps, loading } = useOnboarding();

  if (loading) return <>{children}</>;
  if (!isGated) return <>{children}</>;

  const incompleteRequired = steps.filter(s => s.required && !s.complete);

  return (
    <div className="relative">
      {/* Blurred content */}
      <div className="blur-[6px] pointer-events-none select-none opacity-70">
        {children}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 flex items-center justify-center z-10">
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl border border-gray-200 shadow-xl p-8 max-w-md mx-4 text-center space-y-5">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-gradient-to-br from-[#FF4D8D] to-[#7C5CFC] items-center justify-center">
            <Lock className="h-7 w-7 text-white" />
          </div>

          <div>
            <h3 className="text-xl font-bold">Almost there!</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Complete these steps to unlock your dashboard
            </p>
          </div>

          <div className="space-y-2">
            {incompleteRequired.map((step) => (
              <Link
                key={step.id}
                href={step.href}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:border-[#FF4D8D]/40 hover:bg-[#FF4D8D]/5 transition-all text-left group"
              >
                <span className="text-lg">{step.icon}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium">{step.label}</p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-[#FF4D8D] transition-colors" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
