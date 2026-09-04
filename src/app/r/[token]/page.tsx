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
import { ReportView, type ReportType } from './report-view';
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
    .select('brand_name, period_label, revoked_at, report_type')
    .eq('token', token)
    .maybeSingle();
  /**
   * ⚠️ THE TITLE SAID "Performance Report" WHATEVER THE REPORT WAS. This is
   * the browser tab, the bookmark, and the unfurl card in Slack or an email
   * — so a month-in-review arrived in a client's inbox labelled as something
   * else, next to a period label reading the whole month. Same defect the PDF
   * running head had.
   *
   * The period label is part of the title because an unfurl shows it alone:
   * "Cata-Kor — Month in Review · Aug 1 – Aug 31, 2026" identifies WHICH
   * report was sent, which matters when a client has several links.
   */
  const kind =
    data?.report_type === 'monthly' ? 'Month in Review'
      : data?.report_type === 'weekly' ? 'Weekly Report'
        : 'Performance Report';
  return {
    title:
      data && !data.revoked_at
        ? `${data.brand_name} — ${kind}${data.period_label ? ` · ${data.period_label}` : ''}`
        : 'Report — Tempo',
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
    .select('id, brand_slug, brand_name, period_label, snapshot, notes, plan, created_at, viewed_at, revoked_at, report_type')
    .eq('token', token)
    .maybeSingle();

  if (!row || row.revoked_at) return <GonePage />;

  /**
   * The client's own mark, read LIVE rather than from the frozen snapshot.
   *
   * ⚠️ Deliberately not frozen: a logo is branding, not a figure. Freezing it
   * would leave every already-sent link permanently unbranded, and a brand that
   * changed its mark would keep showing the old one on reports nobody had
   * opened yet. Reading it here means the live links pick it up with no
   * regeneration.
   *
   * Non-fatal by the same rule as everything else on this page: a failed read
   * renders the wordmark alone rather than 500ing a page a client is opening.
   */
  let logoUrl: string | null = null;
  if (row.brand_slug && row.brand_slug !== 'all') {
    const { data: brandRow, error: brandErr } = await supabase
      .from('brands_v2')
      .select('logo_url')
      .eq('slug', row.brand_slug)
      .maybeSingle();
    if (brandErr) console.error('[report] brand logo read failed:', brandErr.message);
    else logoUrl = (brandRow?.logo_url as string | null) ?? null;
  }

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
        plan={row.plan}
        brandName={row.brand_name}
        periodLabel={row.period_label}
        /* Reports issued before report_type existed default to 'performance'
           at the column level, so this is only ever null on a row read through
           an older client. Treat absence as the standing report. */
        reportType={(row.report_type as ReportType | null) ?? 'performance'}
        logoUrl={logoUrl}
      />
    </>
  );
}
