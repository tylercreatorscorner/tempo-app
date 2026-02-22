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
  AlertCircle,
} from 'lucide-react';
import { TempoLogo } from '@/components/ui/tempo-logo';
import { STRIPE_PRICES } from '@/lib/stripe-prices';
import Link from 'next/link';

type Role = 'brand' | 'agency' | null;
type AgencySize = '1-3' | '4-10' | '11-15' | '15+' | null;

const STEPS = ['Role', 'Account', 'Connect', 'Plan'] as const;

/* ── Email validation ── */
function isValidEmail(email: string): boolean {
  const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return re.test(email.trim());
}

/* ── GMV to Tier mapping ── */
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

/* ── Agency tier mapping ── */
function getAgencyTier(size: AgencySize): {
  tierName: string;
  monthlyPrice: number;
  annualPrice: number;
  stripePlanKey: string;
  description: string;
} {
  switch (size) {
    case '1-3':
      return { tierName: 'Agency', monthlyPrice: 1999, annualPrice: 1599, stripePlanKey: 'agency_base', description: 'Up to 3 brands included' };
    case '4-10':
      return { tierName: 'Agency Pro', monthlyPrice: 4999, annualPrice: 3999, stripePlanKey: 'agency_pro', description: 'Up to 15 brands included' };
    case '11-15':
      return { tierName: 'Agency Pro', monthlyPrice: 4999, annualPrice: 3999, stripePlanKey: 'agency_pro', description: 'Up to 15 brands included' };
    case '15+':
      return { tierName: 'Enterprise', monthlyPrice: 0, annualPrice: 0, stripePlanKey: '', description: 'Custom pricing for 15+ brands' };
    default:
      return { tierName: 'Agency', monthlyPrice: 1999, annualPrice: 1599, stripePlanKey: 'agency_base', description: 'Up to 3 brands included' };
  }
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
  const [emailError, setEmailError] = useState('');
  const [emailExists, setEmailExists] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);

  // Step 3
  const [connectAttempted, setConnectAttempted] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);

  // Step 4
  const [annualBilling, setAnnualBilling] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agencySize, setAgencySize] = useState<AgencySize>(null);

  const DEMO_GMV = 1_247_832;

  const goNext = useCallback(() => {
    setDirection('forward');
    setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1));
  }, []);

  const goBack = useCallback(() => {
    setDirection('back');
    setCurrentStep((s) => Math.max(s - 1, 0));
  }, []);

  // Save to Supabase when moving between steps
  const saveProgress = useCallback(async () => {
    if (!email || !fullName) return;
    try {
      await fetch('/api/onboarding/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          fullName: fullName.trim(),
          companyName: companyName.trim(),
          role,
          agencyBrandCount: agencySize === '1-3' ? 3 : agencySize === '4-10' ? 10 : agencySize === '11-15' ? 15 : agencySize === '15+' ? 20 : null,
        }),
      });
    } catch {
      // Non-blocking, best effort
    }
  }, [email, fullName, companyName, role, agencySize]);

  // Confetti on Plan step
  useEffect(() => {
    if (currentStep === 3) {
      setShowConfetti(true);
      const t = setTimeout(() => setShowConfetti(false), 4000);
      return () => clearTimeout(t);
    }
  }, [currentStep]);

  // Save progress when step changes (after account step)
  useEffect(() => {
    if (currentStep >= 2 && email && fullName) {
      saveProgress();
    }
  }, [currentStep, saveProgress, email, fullName]);

  async function handleAccountNext() {
    // Validate email format
    if (!isValidEmail(email)) {
      setEmailError('Please enter a valid email address');
      return;
    }
    setEmailError('');

    // Check for duplicate email
    setCheckingEmail(true);
    try {
      const res = await fetch('/api/onboarding/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (data.exists) {
        setEmailExists(true);
        setCheckingEmail(false);
        return;
      }
    } catch {
      // If check fails, allow through
    }
    setEmailExists(false);
    setCheckingEmail(false);
    goNext();
  }

  async function handleCheckout() {
    if (role === 'agency' && agencySize === '15+') {
      // Enterprise: redirect to contact
      window.location.href = 'mailto:hello@usetempo.ai?subject=Enterprise%20Inquiry';
      return;
    }

    let tier;
    let priceConfig;
    if (role === 'agency' && agencySize) {
      tier = getAgencyTier(agencySize);
      priceConfig = STRIPE_PRICES[tier.stripePlanKey];
    } else {
      tier = getGmvTier(DEMO_GMV, role);
      priceConfig = STRIPE_PRICES[tier.stripePlanKey];
    }

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
        body: JSON.stringify({
          priceId,
          email: email.trim(),
          name: fullName.trim(),
          company: companyName.trim(),
          role,
          agencyBrandCount: agencySize === '1-3' ? 3 : agencySize === '4-10' ? 10 : agencySize === '11-15' ? 15 : agencySize === '15+' ? 20 : null,
        }),
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
            email={email} setEmail={(v) => { setEmail(v); setEmailError(''); setEmailExists(false); }}
            companyName={companyName} setCompanyName={setCompanyName}
            emailError={emailError}
            emailExists={emailExists}
            checkingEmail={checkingEmail}
            onNext={handleAccountNext} onBack={goBack}
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
            agreedToTerms={agreedToTerms}
            setAgreedToTerms={setAgreedToTerms}
            agencySize={agencySize}
            setAgencySize={setAgencySize}
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
  emailError, emailExists, checkingEmail,
  onNext, onBack,
}: {
  fullName: string; setFullName: (s: string) => void;
  email: string; setEmail: (s: string) => void;
  companyName: string; setCompanyName: (s: string) => void;
  emailError: string;
  emailExists: boolean;
  checkingEmail: boolean;
  onNext: () => void; onBack: () => void;
}) {
  const isValid = fullName.trim() && email.trim() && companyName.trim() && !checkingEmail;

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
            className={`w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/50 ${
              emailError || emailExists ? 'border-red-400 bg-red-50/50' : 'border-input bg-background'
            }`}
          />
          {emailError && (
            <div className="flex items-center gap-1.5 text-sm text-red-500">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>{emailError}</span>
            </div>
          )}
          {emailExists && (
            <div className="flex items-center gap-1.5 text-sm text-amber-600">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>
                An account with this email already exists.{' '}
                <Link href="/sign-in" className="underline font-medium hover:text-amber-700">
                  Sign in instead?
                </Link>
              </span>
            </div>
          )}
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
          {checkingEmail ? 'Checking...' : 'Continue'} <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ── Step 3: Connect TikTok Shop ── */
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

      <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground max-w-sm mx-auto">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-[#FF4D8D]" />
          <span>Read-only access. We never modify your shop</span>
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

/* ── Step 4: Plan ── */
function StepPlan({
  role, demoGmv, annualBilling, setAnnualBilling, isCheckingOut, agreedToTerms, setAgreedToTerms,
  agencySize, setAgencySize, onCheckout, onBack,
}: {
  role: Role;
  demoGmv: number;
  annualBilling: boolean;
  setAnnualBilling: (b: boolean) => void;
  isCheckingOut: boolean;
  agreedToTerms: boolean;
  setAgreedToTerms: (b: boolean) => void;
  agencySize: AgencySize;
  setAgencySize: (s: AgencySize) => void;
  onCheckout: () => void;
  onBack: () => void;
}) {
  const isAgency = role === 'agency';
  const agencyTier = isAgency && agencySize ? getAgencyTier(agencySize) : null;
  const brandTier = getGmvTier(demoGmv, role);

  const tier = isAgency && agencyTier ? agencyTier : brandTier;
  const displayPrice = annualBilling ? tier.annualPrice : tier.monthlyPrice;
  const billingLabel = annualBilling ? '/mo (billed annually)' : '/mo';
  const isEnterprise = isAgency && agencySize === '15+';

  return (
    <div className="space-y-6 text-center">
      <div>
        <div className="inline-flex h-16 w-16 rounded-full bg-gradient-to-br from-[#FF4D8D] to-[#7C5CFC] items-center justify-center mb-4">
          <Sparkles className="h-8 w-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold">Your plan</h2>
        <p className="text-muted-foreground mt-1">
          {isAgency ? 'Select how many brands you manage' : 'Based on your last 30 days of TikTok Shop data'}
        </p>
      </div>

      {/* Agency brand count selector */}
      {isAgency && (
        <div className="space-y-3 max-w-md mx-auto">
          <p className="text-sm font-medium">How many brands do you manage?</p>
          <div className="grid grid-cols-4 gap-2">
            {(['1-3', '4-10', '11-15', '15+'] as AgencySize[]).map((size) => (
              <button
                key={size}
                onClick={() => setAgencySize(size)}
                className={`py-2.5 px-3 rounded-xl text-sm font-medium transition-all ${
                  agencySize === size
                    ? 'bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] text-white shadow-md'
                    : 'bg-white border border-gray-200 hover:border-[#FF4D8D]/40 text-gray-700'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Plan card */}
      <div className="relative rounded-2xl p-[2px] bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] mx-auto max-w-md">
        <div className="rounded-2xl bg-white p-6 space-y-4">
          {isAgency ? (
            <>
              <div className="text-sm text-muted-foreground">Agency Plan</div>
              {agencySize ? (
                <>
                  <div className="space-y-1">
                    <div className="text-lg font-semibold">{tier.tierName}</div>
                    {isEnterprise ? (
                      <div className="text-2xl font-bold text-[#7C5CFC]">Custom Pricing</div>
                    ) : (
                      <div className="text-3xl font-bold">
                        ${displayPrice.toLocaleString()}<span className="text-base font-normal text-muted-foreground">{billingLabel}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">
                    {'description' in tier ? (tier as { description: string }).description : ''}
                  </div>
                  {/* Per-brand breakdown */}
                  {!isEnterprise && (
                    <div className="space-y-2 pt-2">
                      <div className="text-xs font-medium text-left text-muted-foreground">What you get:</div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-left">
                        <div className="bg-muted/50 rounded-lg p-2">
                          <div className="font-semibold text-foreground">{agencySize === '1-3' ? '3' : '15'} brands</div>
                          <div className="text-muted-foreground">Included in plan</div>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-2">
                          <div className="font-semibold text-foreground">Per-brand analytics</div>
                          <div className="text-muted-foreground">GMV, creators, products</div>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-2">
                          <div className="font-semibold text-foreground">Cross-brand reporting</div>
                          <div className="text-muted-foreground">Compare performance</div>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-2">
                          <div className="font-semibold text-foreground">Team access</div>
                          <div className="text-muted-foreground">Invite your whole team</div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="py-4 text-muted-foreground text-sm">
                  Select how many brands you manage above to see pricing
                </div>
              )}
            </>
          ) : (
            <>
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
                Monthly GMV: ${demoGmv.toLocaleString()} maps to the {tier.tierName} tier
              </div>
            </>
          )}
        </div>
      </div>

      {/* Annual toggle */}
      {!isEnterprise && (
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
      )}

      <p className="text-xs text-muted-foreground">Plans are reviewed quarterly based on your actual GMV</p>

      {/* Terms checkbox */}
      <div className="flex items-start justify-center gap-2 max-w-md mx-auto">
        <input
          type="checkbox"
          id="terms"
          checked={agreedToTerms}
          onChange={(e) => setAgreedToTerms(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-gray-300 text-[#FF4D8D] focus:ring-[#FF4D8D]/50 accent-[#FF4D8D]"
        />
        <label htmlFor="terms" className="text-sm text-muted-foreground text-left">
          I agree to the{' '}
          <Link href="/terms" className="underline font-medium text-foreground hover:text-[#FF4D8D]">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="underline font-medium text-foreground hover:text-[#FF4D8D]">
            Privacy Policy
          </Link>
        </label>
      </div>

      <div className="flex flex-col items-center gap-3">
        <button
          onClick={onCheckout}
          disabled={isCheckingOut || !agreedToTerms || (isAgency && !agencySize)}
          className="inline-flex items-center gap-2 px-10 py-4 rounded-2xl bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] text-white font-bold text-lg hover:opacity-90 transition-opacity shadow-lg shadow-[#FF4D8D]/20 disabled:opacity-50"
        >
          {isCheckingOut ? 'Redirecting to Stripe...' : isEnterprise ? 'Contact Us' : 'Proceed to Payment'} <ArrowRight className="h-5 w-5" />
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
