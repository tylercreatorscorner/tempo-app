'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Briefcase,
  Check,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Music2,
  Lock,
  BarChart3,
  Shield,
} from 'lucide-react';
import { TempoLogo } from '@/components/ui/tempo-logo';
import { STRIPE_PRICES } from '@/lib/stripe-prices';

type Role = 'brand' | 'agency' | null;

const STEPS = ['Role', 'Account', 'Connect', 'Plan'] as const;

/* ── GMV → Tier mapping ── */
function getGmvTier(monthlyGmv: number, role: Role): {
  tierName: string;
  monthlyPrice: number;
  annualPrice: number;
  stripePlanKey: string;
} {
  if (role === 'agency') {
    return { tierName: 'Agency Base', monthlyPrice: 799, annualPrice: 639, stripePlanKey: 'agency_base' };
  }
  if (monthlyGmv < 250_000) return { tierName: 'Brand Starter', monthlyPrice: 499, annualPrice: 399, stripePlanKey: 'brand_starter' };
  if (monthlyGmv < 750_000) return { tierName: 'Brand Growth', monthlyPrice: 999, annualPrice: 799, stripePlanKey: 'brand_growth' };
  if (monthlyGmv < 1_500_000) return { tierName: 'Brand Pro', monthlyPrice: 1499, annualPrice: 1199, stripePlanKey: 'brand_pro' };
  if (monthlyGmv < 3_000_000) return { tierName: 'Brand Scale', monthlyPrice: 1999, annualPrice: 1599, stripePlanKey: 'brand_scale' };
  return { tierName: 'Brand Elite', monthlyPrice: 2999, annualPrice: 2399, stripePlanKey: 'brand_elite' };
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
      <OnboardingContent />
    </Suspense>
  );
}

function OnboardingContent() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');

  // Step 1
  const [role, setRole] = useState<Role>(null);

  // Step 2
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');

  // Step 3
  const [connectAttempted, setConnectAttempted] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);

  // Step 4
  const [annualBilling, setAnnualBilling] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const DEMO_GMV = 1_247_832;

  const goNext = useCallback(() => {
    setDirection('forward');
    setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1));
  }, []);

  const goBack = useCallback(() => {
    setDirection('back');
    setCurrentStep((s) => Math.max(s - 1, 0));
  }, []);

  // Confetti on Plan step
  useEffect(() => {
    if (currentStep === 3) {
      setShowConfetti(true);
      const t = setTimeout(() => setShowConfetti(false), 4000);
      return () => clearTimeout(t);
    }
  }, [currentStep]);

  async function handleCheckout() {
    const tier = getGmvTier(DEMO_GMV, role);
    const priceConfig = STRIPE_PRICES[tier.stripePlanKey];
    if (!priceConfig) {
      router.push('/dashboard');
      return;
    }
    const priceId = annualBilling ? priceConfig.annual : priceConfig.monthly;
    setIsCheckingOut(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error('No checkout URL:', data);
        setIsCheckingOut(false);
      }
    } catch (err) {
      console.error('Checkout error:', err);
      setIsCheckingOut(false);
    }
  }

  const animClass = direction === 'forward'
    ? 'animate-in fade-in slide-in-from-right-4 duration-300'
    : 'animate-in fade-in slide-in-from-left-4 duration-300';

  return (
    <div className="w-full max-w-2xl mx-auto space-y-8">
      {showConfetti && <ConfettiEffect />}

      {/* Connect Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl p-8 max-w-md mx-4 text-center space-y-4">
            <div className="text-4xl">🚀</div>
            <h3 className="text-xl font-bold">Coming Soon!</h3>
            <p className="text-sm text-muted-foreground">
              TikTok Shop API integration is launching soon! We&apos;ll notify you at{' '}
              <span className="font-medium text-foreground">{email}</span> when it&apos;s ready.
            </p>
            <p className="text-sm text-muted-foreground">
              In the meantime, explore the demo dashboard with sample data.
            </p>
            <button
              onClick={() => {
                setShowConnectModal(false);
                setConnectAttempted(true);
              }}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] text-white font-semibold hover:opacity-90 transition-opacity"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Logo */}
      <div className="text-center">
        <TempoLogo size="lg" animated showTagline />
      </div>

      {/* Progress */}
      <div className="flex items-center justify-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300 ${
                  i < currentStep
                    ? 'bg-gradient-to-br from-[#FF4D8D] to-[#7C5CFC] text-white'
                    : i === currentStep
                    ? 'bg-gradient-to-br from-[#FF4D8D] to-[#7C5CFC] text-white ring-2 ring-[#FF4D8D]/40 ring-offset-2 ring-offset-background'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {i < currentStep ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span className={`text-[10px] font-medium ${i <= currentStep ? 'text-foreground' : 'text-muted-foreground'}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-8 sm:w-16 h-0.5 mb-5 transition-colors duration-300 ${i < currentStep ? 'bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC]' : 'bg-muted'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div key={currentStep} className={animClass}>
        {currentStep === 0 && (
          <StepRole role={role} setRole={setRole} onNext={goNext} />
        )}
        {currentStep === 1 && (
          <StepAccount
            fullName={fullName} setFullName={setFullName}
            email={email} setEmail={setEmail}
            companyName={companyName} setCompanyName={setCompanyName}
            onNext={goNext} onBack={goBack}
          />
        )}
        {currentStep === 2 && (
          <StepConnect
            connectAttempted={connectAttempted}
            onConnect={() => setShowConnectModal(true)}
            onContinueDemo={goNext}
            onBack={goBack}
          />
        )}
        {currentStep === 3 && (
          <StepPlan
            role={role}
            demoGmv={DEMO_GMV}
            annualBilling={annualBilling}
            setAnnualBilling={setAnnualBilling}
            isCheckingOut={isCheckingOut}
            onCheckout={handleCheckout}
            onBack={goBack}
          />
        )}
      </div>
    </div>
  );
}

/* ── Step 1: Role ── */
function StepRole({ role, setRole, onNext }: { role: Role; setRole: (r: Role) => void; onNext: () => void }) {
  return (
    <div className="space-y-6 text-center">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] bg-clip-text text-transparent">
          Welcome to Tempo
        </h1>
        <p className="text-muted-foreground mt-2">How do you manage your TikTok Shop?</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <RoleCard
          selected={role === 'brand'}
          onClick={() => setRole('brand')}
          icon={<Building2 className="h-8 w-8" />}
          title="Brand"
          desc="I manage one brand's TikTok Shop"
        />
        <RoleCard
          selected={role === 'agency'}
          onClick={() => setRole('agency')}
          icon={<Briefcase className="h-8 w-8" />}
          title="Agency"
          desc="I manage multiple brands"
        />
      </div>
      <button
        disabled={!role}
        onClick={onNext}
        className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] text-white font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
      >
        Continue <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function RoleCard({ selected, onClick, icon, title, desc }: { selected: boolean; onClick: () => void; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <button
      onClick={onClick}
      className={`relative p-6 rounded-2xl border text-left transition-all duration-200 bg-white hover:shadow-md group ${
        selected
          ? 'border-[#FF4D8D] shadow-lg shadow-[#FF4D8D]/10 ring-1 ring-[#FF4D8D]/30'
          : 'border-gray-200 hover:border-[#FF4D8D]/40'
      }`}
    >
      <div className={`mb-3 transition-colors ${selected ? 'text-[#FF4D8D]' : 'text-gray-400 group-hover:text-gray-700'}`}>
        {icon}
      </div>
      <h3 className="font-semibold text-lg">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1">{desc}</p>
      {selected && (
        <div className="absolute top-4 right-4 h-6 w-6 rounded-full bg-gradient-to-br from-[#FF4D8D] to-[#7C5CFC] flex items-center justify-center">
          <Check className="h-3.5 w-3.5 text-white" />
        </div>
      )}
    </button>
  );
}

/* ── Step 2: Account Info ── */
function StepAccount({
  fullName, setFullName, email, setEmail, companyName, setCompanyName,
  onNext, onBack,
}: {
  fullName: string; setFullName: (s: string) => void;
  email: string; setEmail: (s: string) => void;
  companyName: string; setCompanyName: (s: string) => void;
  onNext: () => void; onBack: () => void;
}) {
  const isValid = fullName.trim() && email.trim() && companyName.trim();

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Create your account</h2>
        <p className="text-muted-foreground mt-1">We just need a few details to get started</p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-5">
        <div className="space-y-2">
          <label className="text-sm font-medium">Full name <span className="text-[#FF4D8D]">*</span></label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Tyler Drinkard"
            className="w-full px-4 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/50"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Email <span className="text-[#FF4D8D]">*</span></label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tyler@company.com"
            className="w-full px-4 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/50"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Company name <span className="text-[#FF4D8D]">*</span></label>
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Creator's Corner"
            className="w-full px-4 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/50"
          />
        </div>
      </div>

      <div className="flex justify-between">
        <button onClick={onBack} className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <button
          disabled={!isValid}
          onClick={onNext}
          className="inline-flex items-center gap-2 px-8 py-2.5 rounded-xl bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] text-white font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          Continue <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ── Step 3: Connect TikTok Shop (Mandatory) ── */
function StepConnect({
  connectAttempted, onConnect, onContinueDemo, onBack,
}: {
  connectAttempted: boolean;
  onConnect: () => void;
  onContinueDemo: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto h-24 w-24 rounded-3xl bg-gradient-to-br from-[#00F2EA] via-black to-[#FF0050] flex items-center justify-center shadow-xl">
        <Music2 className="h-12 w-12 text-white" />
      </div>
      <div>
        <h2 className="text-2xl font-bold">Connect your TikTok Shop</h2>
        <p className="text-muted-foreground mt-2 max-w-md mx-auto">
          We need to verify your shop data to set up your account. This takes less than 30 seconds.
        </p>
      </div>

      <button
        onClick={onConnect}
        className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-black text-white font-semibold text-lg border border-white/10 hover:bg-black/80 transition-colors shadow-lg"
      >
        <Music2 className="h-5 w-5 text-[#00F2EA]" />
        Connect TikTok Shop
      </button>

      {/* Trust signals */}
      <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground max-w-sm mx-auto">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-[#FF4D8D]" />
          <span>Read-only access — we never modify your shop</span>
        </div>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-[#7C5CFC]" />
          <span>We use your GMV data to set your plan pricing</span>
        </div>
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-[#00F2EA]" />
          <span>Your data is encrypted and isolated</span>
        </div>
      </div>

      {/* Demo continue — only after attempting connect */}
      {connectAttempted && (
        <div className="pt-2">
          <button
            onClick={onContinueDemo}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] text-white font-semibold hover:opacity-90 transition-opacity"
          >
            Continue with Demo Data <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      <div>
        <button onClick={onBack} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
      </div>
    </div>
  );
}

/* ── Step 4: Plan Verification ── */
function StepPlan({
  role, demoGmv, annualBilling, setAnnualBilling, isCheckingOut, onCheckout, onBack,
}: {
  role: Role;
  demoGmv: number;
  annualBilling: boolean;
  setAnnualBilling: (b: boolean) => void;
  isCheckingOut: boolean;
  onCheckout: () => void;
  onBack: () => void;
}) {
  const tier = getGmvTier(demoGmv, role);
  const displayPrice = annualBilling ? tier.annualPrice : tier.monthlyPrice;
  const billingLabel = annualBilling ? '/mo (billed annually)' : '/mo';

  return (
    <div className="space-y-6 text-center">
      <div>
        <div className="inline-flex h-16 w-16 rounded-full bg-gradient-to-br from-[#FF4D8D] to-[#7C5CFC] items-center justify-center mb-4">
          <Sparkles className="h-8 w-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold">Your plan</h2>
        <p className="text-muted-foreground mt-1">Based on your last 30 days of TikTok Shop data</p>
      </div>

      {/* Plan card with gradient border */}
      <div className="relative rounded-2xl p-[2px] bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] mx-auto max-w-md">
        <div className="rounded-2xl bg-white p-6 space-y-4">
          <div className="text-sm text-muted-foreground">Verified Monthly GMV</div>
          <div className="text-4xl font-bold bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] bg-clip-text text-transparent">
            ${demoGmv.toLocaleString()}
          </div>
          <div className="h-px bg-gray-200" />
          <div className="space-y-1">
            <div className="text-lg font-semibold">{tier.tierName}</div>
            <div className="text-3xl font-bold">
              ${displayPrice.toLocaleString()}<span className="text-base font-normal text-muted-foreground">{billingLabel}</span>
            </div>
          </div>
          <div className="text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">
            Monthly GMV: ${demoGmv.toLocaleString()} → {tier.tierName} tier
          </div>
        </div>
      </div>

      {/* Annual toggle */}
      <div className="flex items-center justify-center gap-3">
        <span className={`text-sm ${!annualBilling ? 'font-semibold' : 'text-muted-foreground'}`}>Monthly</span>
        <button
          onClick={() => setAnnualBilling(!annualBilling)}
          className={`relative w-12 h-6 rounded-full transition-colors ${annualBilling ? 'bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC]' : 'bg-gray-300'}`}
        >
          <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${annualBilling ? 'translate-x-6' : 'translate-x-0.5'}`} />
        </button>
        <span className={`text-sm ${annualBilling ? 'font-semibold' : 'text-muted-foreground'}`}>
          Annual <span className="text-[#FF4D8D] font-semibold">save 20%</span>
        </span>
      </div>

      <p className="text-xs text-muted-foreground">Plans are reviewed quarterly based on your actual GMV</p>

      <div className="flex flex-col items-center gap-3">
        <button
          onClick={onCheckout}
          disabled={isCheckingOut}
          className="inline-flex items-center gap-2 px-10 py-4 rounded-2xl bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] text-white font-bold text-lg hover:opacity-90 transition-opacity shadow-lg shadow-[#FF4D8D]/20 disabled:opacity-50"
        >
          {isCheckingOut ? 'Redirecting to Stripe...' : 'Proceed to Payment'} <ArrowRight className="h-5 w-5" />
        </button>
        <button onClick={onBack} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
      </div>
    </div>
  );
}

/* ── Confetti ── */
function ConfettiEffect() {
  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden" aria-hidden>
      {Array.from({ length: 50 }).map((_, i) => (
        <div
          key={i}
          className="absolute w-2 h-2 rounded-full animate-confetti"
          style={{
            left: `${Math.random() * 100}%`,
            backgroundColor: ['#FF4D8D', '#7C5CFC', '#00F2EA', '#FF0050', '#FFD700', '#00FF88'][i % 6],
            animationDelay: `${Math.random() * 2}s`,
            animationDuration: `${2 + Math.random() * 2}s`,
          }}
        />
      ))}
    </div>
  );
}
