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
import type { ReportType } from './report-view';
import { StudioReportView as ReportView } from './studio-report-view';
import { ViewBeacon } from './view-beacon';
import { loadClientReportHistoryResult } from '@/lib/data/client-report-history';
import { LockKeyhole } from 'lucide-react';
import { redirect } from 'next/navigation';
import { loadCanonicalForReport } from '@/lib/data/client-report-canonical';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ preview?: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { token } = await params;
  const supabase = await createAdminClient();
  const { data: source } = await supabase
    .from('client_reports')
    .select('id,tenant_id,brand_slug,period_start,period_end,brand_name,period_label,revoked_at,report_type')
    .eq('token', token)
    .maybeSingle();
  let data = source;
  if (source && !source.revoked_at) {
    try { data = await loadCanonicalForReport(source, supabase) ?? source; }
    catch { data = null; }
  }
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
        ? `${data.brand_name} · ${kind}${data.period_label ? ` · ${data.period_label}` : ''}`
        : 'Report · Tempo',
    robots: { index: false, follow: false },
  };
}

function GonePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f5f1] p-6 text-[#191a1c]">
      <div className="max-w-sm rounded-xl border border-[#dddcd7] bg-white p-8 text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#ede7fa] text-[#6e4bcc]">
          <LockKeyhole size={22} aria-hidden="true" />
        </div>
        <h1 className="text-lg font-semibold">This report link is no longer active</h1>
        <p className="mt-2 text-sm leading-relaxed text-[#66666c]">
          Ask your Creators Corner contact for a fresh link.
        </p>
      </div>
    </main>
  );
}

export default async function ClientReportPage({ params, searchParams }: Props) {
  const { token } = await params;
  const sp = await searchParams;
  if (!token || token.length < 8) return <GonePage />;

  const supabase = await createAdminClient();
  const { data: row } = await supabase
    .from('client_reports')
    .select('tenant_id, id, brand_slug, brand_name, period_start, period_end, period_label, snapshot, notes, plan, created_at, viewed_at, revoked_at, report_type')
    .eq('token', token)
    .maybeSingle();

  if (!row || row.revoked_at) return <GonePage />;
  const canonical = await loadCanonicalForReport(row, supabase);
  if (canonical && canonical.token !== token) {
    redirect(`/r/${encodeURIComponent(canonical.token)}${sp?.preview === '1' ? '?preview=1' : ''}`);
  }
  const historyPromise = row.snapshot?.reconciliation
    ? Promise.resolve({ items: [], unavailable: false }) : loadClientReportHistoryResult(supabase, { ...row, token });

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
  if (row.tenant_id && row.brand_slug && row.brand_slug !== 'all') {
    const { data: brandRow, error: brandErr } = await supabase
      .from('brands_v2')
      .select('logo_url')
      .eq('tenant_id', row.tenant_id).eq('slug', row.brand_slug)
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
  const history = await historyPromise;

  return (
    <>
      <ViewBeacon token={token} preview={isPreview} />
      <ReportView
        token={token}
        preview={isPreview}
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
        history={history.items}
        historyUnavailable={history.unavailable}
      />
    </>
  );
}
