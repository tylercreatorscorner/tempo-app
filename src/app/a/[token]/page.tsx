/**
 * /a/[token] — the agency's own portfolio report.
 *
 * Deliberately parallel to /r/[token] rather than folded into it: the audience,
 * the questions and the grain are all different, and merging them would mean a
 * client route that can render internal figures if a flag is wrong.
 *
 * ⚠️ Internal, but token-served, because the head of agency has no Tempo login.
 * It carries no creator names, no handles and no client contacts, so a leaked
 * link exposes portfolio totals and nothing a person could be identified by.
 * `robots: noindex` for the same reason the client reports have it.
 */
export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/server';
import type { AgencySnapshot } from '@/lib/data/agency-report';
import { AgencyView } from './agency-view';

interface Props {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { token } = await params;
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from('agency_reports')
    .select('period_label, revoked_at')
    .eq('token', token)
    .maybeSingle();
  return {
    title:
      data && !data.revoked_at
        ? `Creators Corner — Agency Performance · ${data.period_label}`
        : 'Report — Tempo',
    robots: { index: false, follow: false },
  };
}

function GonePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fbfbfd] p-6">
      <div className="max-w-sm rounded-2xl border border-[#e7e7f2] bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[#f2f1f8] text-lg text-[#8a8fb0]">
          🔒
        </div>
        <h1 className="text-[15px] font-bold text-[#171a33]">This report link is no longer active</h1>
        <p className="mt-1.5 text-[13px] text-[#8a8fb0]">Ask your Tempo admin for a fresh link.</p>
      </div>
    </div>
  );
}

export default async function AgencyReportPage({ params }: Props) {
  const { token } = await params;
  if (!token || token.length < 8) return <GonePage />;

  const supabase = await createAdminClient();
  const { data: row } = await supabase
    .from('agency_reports')
    .select('id, snapshot, revoked_at')
    .eq('token', token)
    .maybeSingle();

  if (!row || row.revoked_at) return <GonePage />;

  return <AgencyView snapshot={row.snapshot as AgencySnapshot} />;
}
