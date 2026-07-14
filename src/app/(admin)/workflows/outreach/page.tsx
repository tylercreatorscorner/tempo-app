import { Megaphone, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';

export const dynamic = 'force-dynamic';

export default async function OutreachPage() {
  // Mass-send (email/SMS blasts) is owner/admin only in v1. This page had
  // no gate — a manager direct-navigating must be bounced.
  const scope = await getWorkspaceScope();
  if (!scope || scope.brandScope.kind === 'scoped') redirect('/workflows/automations');

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Outreach</h1>
        <p className="text-sm text-muted-foreground mt-1">
          User-initiated campaigns — mass email or SMS to a creator segment, brand-client recap blasts,
          renewal reminders. Each campaign uses one or more Integrations.
        </p>
      </div>

      <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
        <div className="h-14 w-14 mx-auto rounded-2xl bg-purple-50 flex items-center justify-center mb-4">
          <Megaphone className="h-7 w-7 text-purple-500" />
        </div>
        <h2 className="text-base font-bold text-[var(--foreground)] mb-1">Outreach Campaigns — coming soon</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto mb-5">
          Today, outreach happens through ad-hoc Discord DMs, the bulk-message modal on Roster, and
          one-off emails. Here you&apos;ll be able to compose a campaign, pick a segment, schedule it,
          and see open / reply / opt-out stats.
        </p>
        <Link
          href="/messages"
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
        >
          Use Messages for now
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Available today (ad-hoc)
        </p>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
            <div>
              <span className="font-medium">Discord bulk message modal</span>
              <span className="text-muted-foreground"> — Roster → multi-select → message</span>
            </div>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
            <div>
              <span className="font-medium">Email an invoice</span>
              <span className="text-muted-foreground"> — Invoicing → invoice detail → Email button</span>
            </div>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
            <div>
              <span className="font-medium">Renewal Discord blasts</span>
              <span className="text-muted-foreground"> — Roster → Renewals tab → Cut/Watch/Keep copy buttons</span>
            </div>
          </li>
        </ul>
      </div>
    </div>
  );
}
