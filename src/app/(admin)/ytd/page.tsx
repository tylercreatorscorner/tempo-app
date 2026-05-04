import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/require-admin';
import { YtdClient } from './ytd-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Year-to-Date — Tempo' };

interface Props {
  searchParams: Promise<{ year?: string }>;
}

export default async function YtdPage({ searchParams }: Props) {
  const profile = await requireAdmin();
  if (!profile) redirect('/dashboard');

  const params = await searchParams;
  const yearParam = parseInt(params.year ?? '', 10);
  const initialYear = Number.isFinite(yearParam) ? yearParam : new Date().getUTCFullYear();

  return <YtdClient initialYear={initialYear} />;
}
