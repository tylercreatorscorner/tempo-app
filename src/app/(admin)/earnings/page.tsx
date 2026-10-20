import { redirect } from 'next/navigation';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { currentMonth } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/page-header';
import { EarningsClient } from './earnings-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Earnings — Tempo' };

interface Props {
  searchParams: Promise<{ month?: string; view?: string; year?: string }>;
}

export default async function EarningsPage({ searchParams }: Props) {
  // Finance-enabled Workspace users only; the /api/earnings route scopes the
  // numbers to the caller's brands (managers → their brands only). A brand-scoped
  // member the owner walled off from finance is bounced here + at the API.
  const scope = await getWorkspaceScope();
  if (!scope) redirect('/dashboard');
  if (!scope.canViewFinance) redirect('/dashboard');
  const scoped = scope.brandScope.kind === 'scoped';

  const params = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? '') ? params.month! : currentMonth();
  // ?view=year renders the folded-in YTD lens (the old /ytd page 308s here).
  const view: 'month' | 'year' = params.view === 'year' ? 'year' : 'month';
  const yearParam = parseInt(params.year ?? '', 10);
  const year = Number.isFinite(yearParam) ? yearParam : new Date().getUTCFullYear();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Finance"
        title="Earnings"
        subtitle={
          scoped
            ? 'What your brands owe for the month, and where each invoice stands.'
            : 'What every brand owes for the month, and where its invoice stands.'
        }
      />
      <EarningsClient initialMonth={month} initialView={view} initialYear={year} />
    </div>
  );
}
