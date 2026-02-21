'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Briefcase,
  Upload,
  Check,
  ArrowRight,
  ArrowLeft,
  BarChart3,
  Users,
  MessageSquare,
  Sparkles,
  Music2,
} from 'lucide-react';
import { TempoLogo } from '@/components/ui/tempo-logo';

type Plan = 'brand' | 'agency' | null;

const STEPS = ['Role', 'Brand', 'Connect', 'Ready'] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [plan, setPlan] = useState<Plan>(null);
  const [brandName, setBrandName] = useState('');
  const [brandColor, setBrandColor] = useState('#FF4D8D');
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const goNext = useCallback(() => {
    setDirection('forward');
    setCurrentStep((s) => Math.min(s + 1, 3));
  }, []);

  const goBack = useCallback(() => {
    setDirection('back');
    setCurrentStep((s) => Math.max(s - 1, 0));
  }, []);

  // Trigger confetti on step 4
  useEffect(() => {
    if (currentStep === 3) {
      setShowConfetti(true);
      const t = setTimeout(() => setShowConfetti(false), 4000);
      return () => clearTimeout(t);
    }
  }, [currentStep]);

  function handleLogoDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  }

  function handleLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  }

  function handleConnectTikTok() {
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
      console.log('Onboarding complete:', { plan, brandName, brandColor, logoFile: logoFile?.name });
      goNext();
    }, 3000);
  }

  function handleSkip() {
    console.log('Onboarding complete (skipped TikTok):', { plan, brandName, brandColor, logoFile: logoFile?.name });
    goNext();
  }

  const animClass = direction === 'forward'
    ? 'animate-in fade-in slide-in-from-right-4 duration-300'
    : 'animate-in fade-in slide-in-from-left-4 duration-300';

  return (
    <div className="w-full max-w-2xl mx-auto space-y-8">
      {/* Confetti */}
      {showConfetti && <ConfettiEffect />}

      {/* Toast */}
      {showToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-6 py-4 rounded-xl bg-white border border-gray-200 shadow-xl max-w-md text-center">
          <p className="text-sm font-medium">🎉 TikTok Shop integration coming soon!</p>
          <p className="text-xs text-muted-foreground mt-1">We&apos;ll notify you when it&apos;s ready. Loading sample data so you can explore.</p>
        </div>
      )}

      {/* Logo */}
      <div className="text-center">
        <TempoLogo size="lg" showTagline />
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
          <StepRole plan={plan} setPlan={setPlan} onNext={goNext} />
        )}
        {currentStep === 1 && (
          <StepBrand
            plan={plan}
            brandName={brandName}
            setBrandName={setBrandName}
            brandColor={brandColor}
            setBrandColor={setBrandColor}
            logoPreview={logoPreview}
            fileInputRef={fileInputRef}
            onLogoDrop={handleLogoDrop}
            onLogoSelect={handleLogoSelect}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {currentStep === 2 && (
          <StepConnect onConnect={handleConnectTikTok} onSkip={handleSkip} onBack={goBack} />
        )}
        {currentStep === 3 && (
          <StepReady onGo={() => router.push('/dashboard')} />
        )}
      </div>
    </div>
  );
}

/* ── Step 1: Role ── */
function StepRole({ plan, setPlan, onNext }: { plan: Plan; setPlan: (p: Plan) => void; onNext: () => void }) {
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
          selected={plan === 'brand'}
          onClick={() => setPlan('brand')}
          icon={<Building2 className="h-8 w-8" />}
          title="Brand"
          desc="I manage one brand's TikTok Shop"
        />
        <RoleCard
          selected={plan === 'agency'}
          onClick={() => setPlan('agency')}
          icon={<Briefcase className="h-8 w-8" />}
          title="Agency"
          desc="I manage multiple brands"
        />
      </div>
      <button
        disabled={!plan}
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

/* ── Step 2: Brand ── */
function StepBrand({
  plan, brandName, setBrandName, brandColor, setBrandColor,
  logoPreview, fileInputRef, onLogoDrop, onLogoSelect, onNext, onBack,
}: {
  plan: Plan; brandName: string; setBrandName: (s: string) => void;
  brandColor: string; setBrandColor: (s: string) => void;
  logoPreview: string | null; fileInputRef: React.RefObject<HTMLInputElement | null>;
  onLogoDrop: (e: React.DragEvent) => void; onLogoSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onNext: () => void; onBack: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Set up your brand</h2>
        <p className="text-muted-foreground mt-1">Tell us about your first brand</p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-5">
        {/* Brand name */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Brand name <span className="text-[#FF4D8D]">*</span></label>
          <input
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder="e.g. Glow Cosmetics"
            className="w-full px-4 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/50"
          />
        </div>

        {/* Logo upload */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Brand logo <span className="text-muted-foreground">(optional)</span></label>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onLogoDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-[#FF4D8D]/50 transition-colors"
          >
            {logoPreview ? (
              <img src={logoPreview} alt="Logo" className="h-16 w-16 mx-auto rounded-xl object-cover" />
            ) : (
              <div className="space-y-2 text-muted-foreground">
                <Upload className="h-8 w-8 mx-auto" />
                <p className="text-sm">Drag & drop or click to upload</p>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={onLogoSelect} className="hidden" />
          </div>
        </div>

        {/* Color */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Brand color</label>
          <div className="flex items-center gap-3">
            <input type="color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="h-10 w-10 rounded-lg border-0 cursor-pointer bg-transparent" />
            <span className="text-sm text-muted-foreground font-mono">{brandColor}</span>
          </div>
        </div>

        {plan === 'agency' && (
          <div className="rounded-xl bg-[#FF4D8D]/10 border border-[#FF4D8D]/20 p-3 text-sm text-[#FF4D8D]">
            💡 You can add more brands later from Settings
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <button onClick={onBack} className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <button
          disabled={!brandName.trim()}
          onClick={onNext}
          className="inline-flex items-center gap-2 px-8 py-2.5 rounded-xl bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] text-white font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          Continue <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ── Step 3: Connect TikTok ── */
function StepConnect({ onConnect, onSkip, onBack }: { onConnect: () => void; onSkip: () => void; onBack: () => void }) {
  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto h-24 w-24 rounded-3xl bg-gradient-to-br from-[#00F2EA] via-black to-[#FF0050] flex items-center justify-center shadow-xl">
        <Music2 className="h-12 w-12 text-white" />
      </div>
      <div>
        <h2 className="text-2xl font-bold">Connect TikTok Shop</h2>
        <p className="text-muted-foreground mt-2 max-w-md mx-auto">Connect your TikTok Shop to start seeing real-time data, analytics, and creator performance.</p>
      </div>
      <button
        onClick={onConnect}
        className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-black text-white font-semibold text-lg border border-white/10 hover:bg-black/80 transition-colors shadow-lg"
      >
        <Music2 className="h-5 w-5 text-[#00F2EA]" />
        Connect TikTok Shop
      </button>
      <div>
        <button onClick={onSkip} className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4">
          Skip for now
        </button>
      </div>
      <div>
        <button onClick={onBack} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
      </div>
    </div>
  );
}

/* ── Step 4: Ready ── */
function StepReady({ onGo }: { onGo: () => void }) {
  const features = [
    { icon: <BarChart3 className="h-6 w-6" />, title: 'Analytics', desc: 'Real-time TikTok Shop performance metrics' },
    { icon: <Users className="h-6 w-6" />, title: 'Creator Management', desc: 'Track and manage your creator partnerships' },
    { icon: <MessageSquare className="h-6 w-6" />, title: 'Discord Integration', desc: 'Automated reporting to your team channels' },
  ];

  return (
    <div className="space-y-8 text-center">
      <div>
        <div className="inline-flex h-16 w-16 rounded-full bg-gradient-to-br from-[#FF4D8D] to-[#7C5CFC] items-center justify-center mb-4">
          <Sparkles className="h-8 w-8 text-white" />
        </div>
        <h2 className="text-3xl font-bold">You&apos;re all set! 🎉</h2>
        <p className="text-muted-foreground mt-2">Your dashboard is ready to go</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {features.map((f) => (
          <div key={f.title} className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 space-y-2">
            <div className="text-[#FF4D8D]">{f.icon}</div>
            <h3 className="font-semibold">{f.title}</h3>
            <p className="text-xs text-muted-foreground">{f.desc}</p>
          </div>
        ))}
      </div>

      <button
        onClick={onGo}
        className="inline-flex items-center gap-2 px-10 py-4 rounded-2xl bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] text-white font-bold text-lg hover:opacity-90 transition-opacity shadow-lg shadow-[#FF4D8D]/20"
      >
        Go to Dashboard <ArrowRight className="h-5 w-5" />
      </button>
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
