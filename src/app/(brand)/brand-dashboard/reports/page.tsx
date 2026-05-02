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
        <h1 className="text-2xl font-bold text-[#1A1B3A]">Reports</h1>
        <p className="text-sm text-gray-500 mt-0.5 max-w-2xl">
          Build a custom report and download it as a spreadsheet.
        </p>
      </div>

      {/* Report builder card */}
      <ReportBuilder accentColor={accent} />

      {/* Recurring reports — placeholder */}
      <div className="bg-gradient-to-br from-[#1A1B3A] via-[#2D1B69] to-[#1A1B3A] rounded-2xl p-6 sm:p-8 text-white relative overflow-hidden">
        <div
          className="absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4"
          style={{ backgroundColor: `${accent}30` }}
        />
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-[#7C5CFC]/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4" />
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
      <div className="rounded-2xl border border-gray-100 bg-white p-5 flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-[#FF4D8D]/10 flex items-center justify-center flex-shrink-0">
          <Sparkles className="h-4 w-4 text-[#FF4D8D]" />
        </div>
        <div>
          <p className="text-sm font-semibold text-[#1A1B3A]">Need a custom report?</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Custom date ranges, PDF format, or specific metrics — reach out to your
            account manager and we&apos;ll put it together.
          </p>
        </div>
      </div>
    </div>
  );
}
