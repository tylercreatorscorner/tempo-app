/**
 * Public client report — /r/[token].
 *
 * Renders the FROZEN snapshot from client_reports (never a live query): the
 * numbers a client sees are the numbers that were frozen at create time,
 * re-uploads can't shift them. Access is the opaque token alone (same model
 * as /share/invoice). First non-preview open stamps viewed_at so the outbox
 * can show "Viewed 2h ago"; the operator's own checks use ?preview=1.
 */
import { createAdminClient } from '@/lib/supabase/server';
import { reviveReportDates, type ClientReportSnapshot } from '@/lib/data/client-reports';
import { ReportView } from './report-view';
import { ViewBeacon } from './view-beacon';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ preview?: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { token } = await params;
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from('client_reports')
    .select('brand_name, period_label, revoked_at')
    .eq('token', token)
    .maybeSingle();
  return {
    title: data && !data.revoked_at ? `${data.brand_name} — Performance Report` : 'Report — Tempo',
    robots: { index: false, follow: false },
  };
}

function GonePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fbfbfd] p-6">
      <div className="max-w-sm rounded-2xl border border-[#e7e7f2] bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[#f2f1f8] text-lg text-[#8a8fb0]">
          &#128274;
        </div>
        <h1 className="text-base font-bold text-[#171a33]">This report link is no longer active</h1>
        <p className="mt-2 text-sm leading-relaxed text-[#6b7093]">
          Ask your Creators Corner contact for a fresh link.
        </p>
      </div>
    </div>
  );
}

export default async function ClientReportPage({ params, searchParams }: Props) {
  const { token } = await params;
  const sp = await searchParams;
  if (!token || token.length < 8) return <GonePage />;

  const supabase = await createAdminClient();
  const { data: row } = await supabase
    .from('client_reports')
    .select('id, brand_name, period_label, snapshot, notes, created_at, viewed_at, revoked_at')
    .eq('token', token)
    .maybeSingle();

  if (!row || row.revoked_at) return <GonePage />;

  // viewed_at is stamped by the client-side ViewBeacon, NOT here: pasting the
  // link into Slack/iMessage makes the platform's unfurl bot GET this page
  // immediately, and a server-side stamp would show "Viewed" in the outbox
  // before the client ever opened it. Bots don't run JS.
  const isPreview = sp?.preview === '1';

  const snapshot = row.snapshot as ClientReportSnapshot;
  const report = reviveReportDates(snapshot.report);

  return (
    <>
      <ViewBeacon token={token} preview={isPreview} />
      <ReportView
        token={token}
        report={report}
        snapshot={snapshot}
        notes={row.notes}
        brandName={row.brand_name}
        periodLabel={row.period_label}
      />
    </>
  );
}
