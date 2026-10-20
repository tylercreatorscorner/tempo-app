/**
 * The internal weekly manager report.
 *
 * Sits beside /reporting rather than inside it. That page is client-facing and
 * says so in its own header; this one carries the manager's candid read on the
 * relationship and the renewal risk, which never go in front of a client. They
 * share a nav section and nothing else: separate table, separate route, no
 * shared render path, and never the public /r/[token] renderer.
 *
 * The Monday question this page answers is "who has not filed", so unfiled
 * brands sort to the top and the count leads the header.
 */
import styles from './workspace.module.css';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { getWeeklyReportRows, resolveWeek } from '@/lib/data/weekly-manager-report';
import { ReportForm } from './report-form';

export const dynamic = 'force-dynamic';

/** Roles that see the whole portfolio. Everyone else sees only what they own. */
const FULL_VIEW = new Set(['owner', 'admin', 'viewer']);

function shiftWeek(weekEnding: string, weeks: number): string {
  const d = new Date(`${weekEnding}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

function fmt(d: string): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default async function WeeklyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const sp = await searchParams;
  const scope = await getWorkspaceScope();
  if (!scope) redirect('/login');

  const { weekStart, weekEnd } = resolveWeek(sp.week);
  const seeAll = FULL_VIEW.has(scope.role);

  const rows = await getWeeklyReportRows(weekStart, weekEnd, scope.userId, seeAll);
  const filed = rows.filter((r) => r.submission).length;

  // The most recently completed week. Never offer a "next" past it: the current
  // part-week is not what Monday's meeting is about.
  const latest = resolveWeek().weekEnd;
  const canGoForward = weekEnd < latest;

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Internal"
        title="Weekly manager report"
        subtitle={
          rows.length === 0
            ? 'Due before the Monday brand manager meeting.'
            : `${filed} of ${rows.length} filed for the week of ${fmt(weekStart)} to ${fmt(weekEnd)}. Due before the Monday meeting.`
        }
        actions={
          <div className="flex items-center gap-1">
            <Link
              href={`/reporting/weekly?week=${shiftWeek(weekEnd, -1)}`}
              className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
              aria-label="Previous week"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground">
              <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
              {fmt(weekStart)} to {fmt(weekEnd)}
            </span>
            {canGoForward ? (
              <Link
                href={`/reporting/weekly?week=${shiftWeek(weekEnd, 1)}`}
                className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
                aria-label="Next week"
              >
                <ChevronRight className="h-4 w-4" />
              </Link>
            ) : (
              <span
                className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-md border border-border text-muted-foreground/30"
                aria-hidden
              >
                <ChevronRight className="h-4 w-4" />
              </span>
            )}
          </div>
        }
      />

      <div className={styles.layout}><div className={styles.forms}>
      {rows.length === 0 ? (
        <EmptyState
          title="No brands assigned to you"
          description={
            seeAll
              ? 'No brand has an accountable manager yet. Assignments live in brand_manager_assignments, and a brand with no owner has nobody to chase for a report.'
              : 'You are not the accountable manager for any brand yet. Ask the Director of Brands to assign you.'
          }
        />
      ) : (
        <div className={styles.forms}>
          {rows.map((row) => (
            <ReportForm key={row.brandId} row={row} weekEnding={weekEnd} />
          ))}
        </div>
      )}

      </div><aside className={styles.aside}><div><h2>Submission progress</h2><p className="mt-2"><strong className="text-foreground">{filed} of {rows.length}</strong> filed · {rows.length-filed} remaining</p><div className={styles.progress} aria-hidden="true"><span style={{width:rows.length?`${filed/rows.length*100}%`:'0%'}}/></div></div><nav className={styles.queue} aria-label="Manager report brands">{rows.map(row=><Link key={row.brandId} href={`#report-${row.brandSlug}`}><span>{row.brandLabel}</span><small>{row.submission?'Filed':'Not filed'}</small></Link>)}</nav><p>Internal only. Client health and renewal risk never appear in client reports. Submissions are due before the Monday meeting.</p><p>GMV, managed GMV, capture rate and posts are calculated from Tempo. Review coverage alongside each brand’s figures.</p></aside></div>
    </div>
  );
}
