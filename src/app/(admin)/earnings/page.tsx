import { redirect } from 'next/navigation';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { currentMonth } from '@/lib/utils/format';
import { EarningsClient } from './earnings-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Earnings — Tempo' };

interface Props {
  searchParams: Promise<{ month?: string }>;
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-[var(--foreground)]">Earnings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {scoped
            ? 'Monthly earnings for your brands — commission + retainers + launch fees.'
            : 'Your monthly take across all brands — commission + retainers + launch fees.'}
        </p>
      </div>
      <EarningsClient initialMonth={month} />
    </div>
  );
}
