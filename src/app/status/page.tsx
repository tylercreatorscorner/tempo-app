import type { Metadata } from 'next';
import { TempoLogo } from '@/components/ui/tempo-logo';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Status',
  description: 'Live status of Tempo and its sub-systems.',
  alternates: { canonical: '/status' },
};

export const dynamic = 'force-dynamic';

type SystemStatus = {
  name: string;
  description: string;
  state: 'operational' | 'degraded' | 'outage';
};

// Hardcoded for v1. Wire to real uptime checks (Vercel deploy status,
// Supabase health endpoint, etc.) when traffic justifies it.
const SYSTEMS: SystemStatus[] = [
  { name: 'Web app', description: 'app.tempoapp.ai', state: 'operational' },
  { name: 'API & data sync', description: 'TikTok Shop ingestion + dashboard data', state: 'operational' },
  { name: 'Database', description: 'Supabase (Postgres + RLS)', state: 'operational' },
  { name: 'Tempo Bot', description: 'Discord integration', state: 'operational' },
  { name: 'Email & invoicing', description: 'Outbound email via Resend', state: 'operational' },
];

const STATE_COPY: Record<SystemStatus['state'], { label: string; color: string; ring: string }> = {
  operational: { label: 'Operational', color: '#10B981', ring: 'rgba(16,185,129,0.15)' },
  degraded:    { label: 'Degraded',    color: '#F59E0B', ring: 'rgba(245,158,11,0.15)' },
  outage:      { label: 'Outage',      color: '#EF4444', ring: 'rgba(239,68,68,0.15)' },
};

function lastDeploy() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  const ts = process.env.VERCEL_DEPLOYMENT_ID ? new Date() : null; // approximation
  return { sha: sha?.slice(0, 7) ?? null, deployedAt: ts };
}

export default function StatusPage() {
  const overall: SystemStatus['state'] = SYSTEMS.some((s) => s.state === 'outage')
    ? 'outage'
    : SYSTEMS.some((s) => s.state === 'degraded')
      ? 'degraded'
      : 'operational';

  const overallStyle = STATE_COPY[overall];
  const deploy = lastDeploy();

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <header className="bg-white/75 backdrop-blur-xl border-b border-[#E5E7EB]/50">
        <div className="max-w-3xl mx-auto px-5 h-16 flex items-center justify-between">
          <a href="/" aria-label="Tempo home">
            <TempoLogo size="md" animated={false} />
          </a>
          <a
            href="/"
            className="text-sm text-[#6B7280] hover:text-[#1A1B3A] transition-colors flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Home
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-16 md:py-24">
        <ScrollReveal>
          <div className="text-center mb-10 md:mb-14">
            <p className="text-sm font-semibold text-[#FF4D8D] uppercase tracking-wider mb-3">Status</p>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-[#1A1B3A] leading-[1.1]">
              All systems{' '}
              <span style={{ color: overallStyle.color }}>{overallStyle.label.toLowerCase()}</span>
            </h1>
          </div>
        </ScrollReveal>

        {/* Overall pill */}
        <ScrollReveal delay={100}>
          <div
            className="rounded-2xl border p-5 flex items-center gap-4 mb-6"
            style={{ borderColor: overallStyle.ring, backgroundColor: overallStyle.ring }}
          >
            <span className="relative flex h-3 w-3 flex-shrink-0">
              <span
                className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
                style={{ backgroundColor: overallStyle.color }}
              />
              <span
                className="relative inline-flex h-3 w-3 rounded-full"
                style={{ backgroundColor: overallStyle.color }}
              />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#1A1B3A]">{overallStyle.label}</p>
              <p className="text-xs text-[#6B7280] mt-0.5">
                Updated {new Date().toLocaleString('en-US', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })} UTC
              </p>
            </div>
          </div>
        </ScrollReveal>

        {/* Systems list */}
        <ScrollReveal delay={150}>
          <div className="rounded-2xl border border-[#E5E7EB] bg-white overflow-hidden">
            {SYSTEMS.map((sys, i) => {
              const style = STATE_COPY[sys.state];
              return (
                <div
                  key={sys.name}
                  className={`flex items-center gap-4 px-5 py-4 ${
                    i !== SYSTEMS.length - 1 ? 'border-b border-[#F3F4F6]' : ''
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: style.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1A1B3A]">{sys.name}</p>
                    <p className="text-xs text-[#6B7280] mt-0.5">{sys.description}</p>
                  </div>
                  <span
                    className="text-xs font-semibold uppercase tracking-wider"
                    style={{ color: style.color }}
                  >
                    {style.label}
                  </span>
                </div>
              );
            })}
          </div>
        </ScrollReveal>

        {/* Deploy info */}
        <ScrollReveal delay={200}>
          <div className="mt-6 text-center text-xs text-[#9CA3AF]">
            {deploy.sha ? (
              <>Last deployed: <span className="font-mono text-[#6B7280]">{deploy.sha}</span></>
            ) : (
              <>Local development environment</>
            )}
          </div>
        </ScrollReveal>

        {/* Footer note */}
        <ScrollReveal delay={250}>
          <div className="mt-12 text-center">
            <p className="text-sm text-[#6B7280]">
              Reporting an issue?{' '}
              <a
                href="mailto:hello@tempoapp.ai"
                className="font-semibold text-[#FF4D8D] hover:text-[#7C5CFC] transition-colors"
              >
                Email us →
              </a>
            </p>
          </div>
        </ScrollReveal>
      </main>
    </div>
  );
}
