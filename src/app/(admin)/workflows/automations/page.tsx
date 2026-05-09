import { Zap, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function AutomationsPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-[#1A1B3A]">Automations</h1>
        <p className="text-sm text-gray-500 mt-1">
          Scheduled and triggered workflows that use your Integrations to do work — daily Discord drops,
          GMV milestone alerts, weekly recap emails, at-risk creator pings.
        </p>
      </div>

      <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
        <div className="h-14 w-14 mx-auto rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
          <Zap className="h-7 w-7 text-amber-500" />
        </div>
        <h2 className="text-base font-bold text-[#1A1B3A] mb-1">Automations Builder — coming soon</h2>
        <p className="text-sm text-gray-500 max-w-md mx-auto mb-5">
          Right now, automations live in a few different places (Discord performance posts, scheduled
          reports, system cron jobs). We&apos;re unifying them into one builder where you can pick a
          trigger, choose actions, and watch the run history.
        </p>
        <Link
          href="/workflows/integrations"
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-[#FF4D8D] text-white hover:bg-[#E91E8C] transition-colors"
        >
          Set up Integrations first
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
          Already running today
        </p>
        <ul className="space-y-2 text-sm text-gray-600">
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
            <div>
              <span className="font-medium">Daily TikTok Shop scrape</span>
              <span className="text-gray-400"> — pulls per-brand affiliate data each morning</span>
            </div>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
            <div>
              <span className="font-medium">Discord performance posts</span>
              <span className="text-gray-400"> — daily drop / rankings / milestone alerts (run on demand)</span>
            </div>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
            <div>
              <span className="font-medium">System health checks</span>
              <span className="text-gray-400"> — session health, freshness, alert generation</span>
            </div>
          </li>
        </ul>
      </div>
    </div>
  );
}
