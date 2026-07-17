'use client';

import { useState } from 'react';
import { Check, ArrowRight, Loader2 } from 'lucide-react';
import { STRIPE_PRICES } from '@/lib/stripe-prices';

interface PlanSelectorProps {
  currentPlan?: string;
  onSelect?: (planId: string) => void;
}

export function PlanSelector({ currentPlan, onSelect }: PlanSelectorProps) {
  const [loading, setLoading] = useState(false);

  const isActive = currentPlan && currentPlan !== 'free' && currentPlan !== 'starter';

  async function handleSelect() {
    setLoading(true);
    try {
      // Use brand_scale as the single brand plan ($1,999/mo)
      const prices = STRIPE_PRICES['brand_scale'];
      if (!prices) { console.error('No Stripe price found for brand_scale'); setLoading(false); return; }
      const priceId = prices.monthly;

      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId,
          successUrl: `${window.location.origin}/dashboard?plan_activated=true`,
          cancelUrl: `${window.location.origin}/settings?plan_canceled=true`,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error('Checkout error:', data.error);
      }
    } catch (err) {
      console.error('Checkout error:', err);
    }
    setLoading(false);
    onSelect?.('brand');
  }

  if (isActive) {
    return (
      <div className="rounded-2xl border border-green-500/25 bg-green-500/10 p-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-green-500/15 flex items-center justify-center">
            <Check className="h-5 w-5" style={{ color: 'var(--pulse-pos)' }} />
          </div>
          <div>
            {/* See tiktok-connect.tsx: text-green-900 is fixed and never flips —
                it rendered at 1.25:1 on the dark ground. */}
            <h3 className="font-semibold text-foreground">Plan Active</h3>
            <p className="text-sm text-muted-foreground">Your Brand plan is active. You have full access to all features.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-2 border-[var(--primary)]/30 bg-gradient-to-br from-card to-[var(--primary)]/5 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-[var(--foreground)]">Brand Plan</h3>
            <p className="text-sm text-[var(--muted-foreground)] mt-1">Everything you need to manage creators and grow GMV</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-extrabold text-[var(--foreground)]">$1,999</div>
            <div className="text-sm text-[var(--muted-foreground)]">per month</div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-5 mb-6">
          {[
            'Full analytics dashboard',
            'Creator rankings & status',
            'Tempo Bot (Discord)',
            'Bulk messaging & alerts',
            'Creator portal',
            'Real-time GMV tracking',
            'Daily performance briefs',
            'Priority support',
          ].map((f) => (
            <div key={f} className="flex items-center gap-2 text-sm text-[#4B5563]">
              <Check className="w-3.5 h-3.5 text-[var(--primary)] flex-shrink-0" />
              {f}
            </div>
          ))}
        </div>

        <button
          onClick={handleSelect}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-[var(--primary)] to-[var(--pulse-accent-2)] text-white font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity shadow-lg shadow-[var(--primary)]/20"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Redirecting to checkout...
            </>
          ) : (
            <>
              Subscribe Now <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>

      <p className="text-xs text-center text-[var(--muted-foreground)]">
        Managing multiple brands? <a href="mailto:tyler@tempoapp.ai" className="text-[var(--primary)] hover:underline">Contact us about agency pricing</a>
      </p>
    </div>
  );
}
