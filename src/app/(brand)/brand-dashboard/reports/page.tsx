import { Mail, Sparkles } from 'lucide-react';
import { requireBrandPortalContext } from '@/lib/data/brand-portal';
import { ReportBuilder } from './report-builder';

export const dynamic = 'force-dynamic';

export default async function BrandReportsPage() {
  const ctx = await requireBrandPortalContext();
  const accent = ctx.activeBrand.color || '#FF4D8D';

  return (
    <div className="space-y-6 max-w-[1100px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Reports</h1>
        <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">
          Build a custom report and download it as a spreadsheet.
        </p>
      </div>

      {/* Report builder card */}
      <ReportBuilder accentColor={accent} />

      {/* Recurring reports — placeholder.
          This panel carries its OWN dark gradient in BOTH themes, so everything
          inside it stays white-on-dark and must NOT be migrated to semantic
          tokens: bg-card/10 here would be a dark chip on a dark gradient the
          moment the app is in dark mode. The gradient itself is now the Pulse
          pair (--primary → --pulse-accent-2), matching the avatar in
          brand-shell; it used to be the pre-Pulse navy #1A1B3A/#2D1B69, which
          made this the one surface in the portal from an older brand era. */}
      <div className="bg-gradient-to-br from-[var(--primary)] via-[var(--pulse-accent-2)] to-[var(--primary)] rounded-2xl p-6 sm:p-8 text-white relative overflow-hidden">
        <div
          className="absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4"
          style={{ backgroundColor: `${accent}30` }}
        />
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-[var(--pulse-accent-2)]/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4" />
        <div className="relative z-10 flex items-start gap-4">
          <div className="h-10 w-10 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center flex-shrink-0">
            <Mail className="h-5 w-5 text-white/80" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-base font-semibold">Recurring reports</h2>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-white/15 text-white/70 uppercase tracking-wider">
                Coming soon
              </span>
            </div>
            <p className="text-sm text-white/70 max-w-md">
              Get your roster and posts log emailed automatically every Monday or
              the 1st of the month. We&apos;re building it now — ping your
              account manager if you want early access.
            </p>
          </div>
        </div>
      </div>

      {/* Footer help */}
      <div className="rounded-2xl border border-border bg-card p-5 flex items-start gap-3">
        {/* Uses the BRAND's own accent, not the hardcoded #FF4D8D this was.
            That hex is only the fallback for a brand with no colour set, so a
            blue brand was getting a pink sparkle on its own portal. */}
        <div
          className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${accent}1A` }}
        >
          <Sparkles className="h-4 w-4" style={{ color: accent }} />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Need a custom report?</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Custom date ranges, PDF format, or specific metrics — reach out to your
            account manager and we&apos;ll put it together.
          </p>
        </div>
      </div>
    </div>
  );
}
