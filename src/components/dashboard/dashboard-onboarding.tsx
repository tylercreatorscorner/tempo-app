interface Props {
  tiktokConnected: boolean;
  planActive: boolean;
  creatorsAdded: boolean;
  discordConnected: boolean;
}

/**
 * Empty-state replacement for the dashboard when a tenant has no brands yet.
 * Walks new clients through the two required setup steps (TikTok Shop, plan)
 * plus two optional ones (creators, Discord).
 */
export function DashboardOnboarding({
  tiktokConnected,
  planActive,
  creatorsAdded,
  discordConnected,
}: Props) {
  const requiredDone = tiktokConnected && planActive;
  const requiredCompleted = [tiktokConnected, planActive].filter(Boolean).length;
  const progressPct = Math.round((requiredCompleted / 2) * 100);

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-8">
      {/* Hero welcome */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1A1B3A] via-[#2D1B69] to-[#1A1B3A] p-8 md:p-12 text-white">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-[var(--primary)]/20 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-[var(--pulse-accent-2)]/20 to-transparent rounded-full blur-3xl translate-y-1/2 -translate-x-1/4" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center">
              <span className="text-xl">{requiredDone ? '🎉' : '🚀'}</span>
            </div>
            <span className="text-sm font-medium text-white/60 uppercase tracking-wider">
              {requiredDone ? 'Almost there' : 'Getting Started'}
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-3">
            {requiredDone ? 'Great progress!' : 'Welcome to Tempo'}
          </h1>
          <p className="text-lg text-white/70 max-w-xl">
            {requiredDone
              ? 'Your plan is active! Connect your TikTok Shop to start syncing performance data.'
              : "Let's get your TikTok Shop data flowing. Complete the steps below to unlock your dashboard."}
          </p>
          <div className="mt-6 max-w-md">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-white/80">{requiredCompleted} of 2 required steps complete</span>
              <span className="text-sm font-bold text-white">{progressPct}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--pulse-accent-2)] transition-all duration-700" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Required steps */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Step 1: Connect TikTok */}
        {tiktokConnected ? (
          <DoneCard title="TikTok Shop Connected" subtitle="Your data is syncing automatically." />
        ) : (
          <a href="/settings" className="group rounded-2xl border-2 border-[var(--primary)]/30 bg-gradient-to-br from-[var(--primary)]/5 to-white p-6 hover:border-[var(--primary)]/60 hover:shadow-lg hover:shadow-[var(--primary)]/10 transition-all duration-300 block">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary)]/80 flex items-center justify-center flex-shrink-0 shadow-lg shadow-[var(--primary)]/20">
                <span className="text-2xl">🎵</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-900">Connect TikTok Shop</h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[var(--primary)]/10 text-[var(--primary)]">Required</span>
                </div>
                <p className="text-sm text-gray-500">Add Tempo as a sub-account to start syncing your creator and sales data automatically.</p>
              </div>
            </div>
            <div className="mt-5 w-full py-2.5 rounded-xl bg-gradient-to-r from-[var(--primary)] to-[var(--primary)]/90 text-white text-sm font-semibold text-center hover:opacity-90 transition-opacity shadow-md shadow-[var(--primary)]/20">
              Connect TikTok Shop
            </div>
          </a>
        )}

        {/* Step 2: Choose Plan */}
        {planActive ? (
          <DoneCard title="Plan Active" subtitle="Your subscription is active. Full access unlocked." />
        ) : (
          <a href="/settings" className="group rounded-2xl border-2 border-[var(--pulse-accent-2)]/30 bg-gradient-to-br from-[var(--pulse-accent-2)]/5 to-white p-6 hover:border-[var(--pulse-accent-2)]/60 hover:shadow-lg hover:shadow-[var(--pulse-accent-2)]/10 transition-all duration-300 block">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[var(--pulse-accent-2)] to-[var(--pulse-accent-2)]/80 flex items-center justify-center flex-shrink-0 shadow-lg shadow-[var(--pulse-accent-2)]/20">
                <span className="text-2xl">💎</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-900">Choose Your Plan</h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[var(--pulse-accent-2)]/10 text-[var(--pulse-accent-2)]">Required</span>
                </div>
                <p className="text-sm text-gray-500">Subscribe to unlock your full analytics dashboard, creator rankings, and daily performance briefs.</p>
              </div>
            </div>
            <div className="mt-5 w-full py-2.5 rounded-xl bg-gradient-to-r from-[var(--pulse-accent-2)] to-[var(--pulse-accent-2)]/90 text-white text-sm font-semibold text-center hover:opacity-90 transition-opacity shadow-md shadow-[var(--pulse-accent-2)]/20">
              View Plans
            </div>
          </a>
        )}
      </div>

      {/* Optional steps */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Optional</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {creatorsAdded ? (
            <DoneCardCompact title="Creators Added" subtitle="Your managed roster is being tracked." />
          ) : (
            <a href="/roster" className="group rounded-2xl border border-gray-200 bg-white p-5 hover:border-gray-300 hover:shadow-md transition-all duration-300 flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[var(--pulse-accent-2)] to-[var(--pulse-accent-2)]/80 flex items-center justify-center flex-shrink-0">
                <span className="text-lg">👥</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 text-sm">Add Your Creators</h3>
                <p className="text-xs text-gray-500">Upload your managed roster for performance and ROI tracking.</p>
              </div>
              <span className="px-3 py-1.5 rounded-lg border border-[var(--pulse-accent-2)]/30 text-xs font-semibold text-[var(--pulse-accent-2)] group-hover:bg-[var(--pulse-accent-2)]/5 transition-colors flex-shrink-0">Set up</span>
            </a>
          )}

          {discordConnected ? (
            <DoneCardCompact title="Discord Connected" subtitle="Tempo Bot is active in your server." />
          ) : (
            <a href="/settings" className="group rounded-2xl border border-gray-200 bg-white p-5 hover:border-gray-300 hover:shadow-md transition-all duration-300 flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#5865F2] to-[#5865F2]/80 flex items-center justify-center flex-shrink-0">
                <span className="text-lg">💬</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 text-sm">Connect Discord</h3>
                <p className="text-xs text-gray-500">Enable Tempo Bot for messaging, alerts, and creator communication.</p>
              </div>
              <span className="px-3 py-1.5 rounded-lg border border-[#5865F2]/30 text-xs font-semibold text-[#5865F2] group-hover:bg-[#5865F2]/5 transition-colors flex-shrink-0">Set up</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function DoneCard({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="rounded-2xl border-2 border-green-200 bg-gradient-to-br from-green-50 to-white p-6 flex items-center gap-4">
      <div className="h-12 w-12 rounded-xl bg-green-500 flex items-center justify-center flex-shrink-0">
        <Checkmark className="h-6 w-6" />
      </div>
      <div>
        <h3 className="font-semibold text-green-900">{title}</h3>
        <p className="text-sm text-green-700/70 mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

function DoneCardCompact({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="rounded-2xl border border-green-200 bg-green-50/50 p-5 flex items-center gap-4">
      <div className="h-10 w-10 rounded-xl bg-green-500 flex items-center justify-center flex-shrink-0">
        <Checkmark className="h-5 w-5" />
      </div>
      <div>
        <h3 className="font-semibold text-green-900 text-sm">{title}</h3>
        <p className="text-xs text-green-700/70">{subtitle}</p>
      </div>
    </div>
  );
}

function Checkmark({ className }: { className?: string }) {
  return (
    <svg className={`text-white ${className ?? ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}
