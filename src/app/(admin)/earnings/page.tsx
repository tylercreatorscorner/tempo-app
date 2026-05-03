import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/require-admin';
import { currentMonth } from '@/lib/utils/format';
import { EarningsClient } from './earnings-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Earnings — Tempo' };

interface Props {
  searchParams: Promise<{ month?: string }>;
}

export default async function EarningsPage({ searchParams }: Props) {
  const profile = await requireAdmin();
  if (!profile) redirect('/dashboard');

  const params = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? '') ? params.month! : currentMonth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-[#1A1B3A]">Earnings</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Your monthly take across all brands — commission + retainers + launch fees.
        </p>
      </div>
      <EarningsClient initialMonth={month} />
    </div>
  );
}
