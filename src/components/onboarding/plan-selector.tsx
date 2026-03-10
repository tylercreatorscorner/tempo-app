'use client';

import { useState } from 'react';
import { Check, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { STRIPE_PRICES } from '@/lib/stripe-prices';

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'For brands doing under $50K/mo GMV',
    monthlyPrice: 499,
    annualPrice: 399,
    stripePriceKey: 'brand_starter',
    features: ['1 brand', 'Creator analytics', 'Product performance', 'Video tracking', 'Email support'],
  },
  {
    id: 'growth',
    name: 'Growth',
    description: 'For brands doing $50K-$250K/mo GMV',
    monthlyPrice: 999,
    annualPrice: 799,
    stripePriceKey: 'brand_growth',
    popular: true,
    features: ['1 brand', 'Everything in Starter', 'Creator relationship management', 'Discord integration', 'Retainer tracking', 'Priority support'],
  },
  {
    id: 'scale',
    name: 'Scale',
    description: 'For brands doing $250K+/mo GMV',
    monthlyPrice: 1999,
    annualPrice: 1599,
    stripePriceKey: 'brand_scale',
    features: ['1 brand', 'Everything in Growth', 'Advanced analytics', 'Custom reports', 'API access', 'Dedicated success manager'],
  },
  {
    id: 'agency',
    name: 'Agency',
    description: 'Manage multiple brands under one roof',
    monthlyPrice: 2999,
    annualPrice: 2399,
    stripePriceKey: 'agency_pro',
    features: ['Up to 25 brands', 'Everything in Scale', 'Cross-brand reporting', 'Team management', 'White-label reports', 'Dedicated support'],
  },
];

interface PlanSelectorProps {
  currentPlan?: string;
  onSelect?: (planId: string) => void;
}

export function PlanSelector({ currentPlan, onSelect }: PlanSelectorProps) {
  const [annual, setAnnual] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  async function handleSelect(plan: typeof PLANS[0]) {
    setLoading(plan.id);
    try {
      const prices = STRIPE_PRICES[plan.stripePriceKey];
      if (!prices) { console.error('No Stripe price found for', plan.stripePriceKey); setLoading(null); return; }
      const priceId = annual ? prices.annual : prices.monthly;
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
      }
    } catch (err) {
      console.error('Checkout error:', err);
    }
    setLoading(null);
    onSelect?.(plan.id);
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex h-14 w-14 rounded-2xl bg-gradient-to-br from-[#FF4D8D] to-[#7C5CFC] items-center justify-center">
          <Sparkles className="h-7 w-7 text-white" />
        </div>
        <h2 className="text-2xl font-bold">Choose your plan</h2>
        <p className="text-muted-foreground text-sm">
          Select the plan that fits your TikTok Shop operation
        </p>
      </div>

      {/* Annual toggle */}
      <div className="flex items-center justify-center gap-3">
        <span className={`text-sm ${!annual ? 'font-semibold' : 'text-muted-foreground'}`}>Monthly</span>
        <button
          onClick={() => setAnnual(!annual)}
          className={`relative w-12 h-6 rounded-full transition-colors ${annual ? 'bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC]' : 'bg-gray-300'}`}
        >
          <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${annual ? 'translate-x-6' : 'translate-x-0.5'}`} />
        </button>
        <span className={`text-sm ${annual ? 'font-semibold' : 'text-muted-foreground'}`}>
          Annual <span className="text-[#FF4D8D] font-semibold">save 20%</span>
        </span>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {PLANS.map((plan) => {
          const price = annual ? plan.annualPrice : plan.monthlyPrice;
          const isCurrent = currentPlan === plan.id;
          const isPopular = 'popular' in plan && plan.popular;

          return (
            <div
              key={plan.id}
              className={`relative rounded-2xl border bg-white p-5 flex flex-col ${
                isPopular
                  ? 'border-[#FF4D8D] shadow-lg shadow-[#FF4D8D]/10 ring-1 ring-[#FF4D8D]/20'
                  : 'border-gray-200'
              }`}
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] text-white text-xs font-semibold">
                  Most Popular
                </div>
              )}

              <div className="space-y-1 mb-4">
                <h3 className="font-bold text-lg">{plan.name}</h3>
                <p className="text-xs text-muted-foreground">{plan.description}</p>
              </div>

              <div className="mb-4">
                <span className="text-3xl font-bold">${price.toLocaleString()}</span>
                <span className="text-sm text-muted-foreground">/mo</span>
                {annual && (
                  <p className="text-xs text-muted-foreground mt-0.5">billed annually</p>
                )}
              </div>

              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-[#FF4D8D] shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSelect(plan)}
                disabled={isCurrent || loading === plan.id}
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  isCurrent
                    ? 'bg-gray-100 text-muted-foreground cursor-default'
                    : isPopular
                    ? 'bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] text-white hover:opacity-90 shadow-md'
                    : 'bg-gray-900 text-white hover:bg-gray-800'
                }`}
              >
                {loading === plan.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isCurrent ? (
                  'Current Plan'
                ) : (
                  <>Get Started <ArrowRight className="h-4 w-4" /></>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
