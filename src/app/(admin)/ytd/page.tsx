import { redirect } from 'next/navigation';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { YtdClient } from './ytd-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Year-to-Date — Tempo' };

interface Props {
  searchParams: Promise<{ year?: string }>;
}

export default async function YtdPage({ searchParams }: Props) {
  // Any Workspace user; /api/earnings/ytd scopes numbers to their brands.
  const scope = await getWorkspaceScope();
  if (!scope) redirect('/dashboard');

  const params = await searchParams;
  const yearParam = parseInt(params.year ?? '', 10);
  const initialYear = Number.isFinite(yearParam) ? yearParam : new Date().getUTCFullYear();

  return <YtdClient initialYear={initialYear} />;
}
