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
    <div className="space-y-6">
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
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
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
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
                aria-label="Next week"
              >
                <ChevronRight className="h-4 w-4" />
              </Link>
            ) : (
              <span
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground/30"
                aria-hidden
              >
                <ChevronRight className="h-4 w-4" />
              </span>
            )}
          </div>
        }
      />

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
        <div className="space-y-2">
          {rows.map((row) => (
            <ReportForm key={row.brandId} row={row} weekEnding={weekEnd} />
          ))}
        </div>
      )}

      <p className="max-w-[70ch] text-xs leading-relaxed text-muted-foreground">
        Internal only. Client health and renewal risk are never shown to a brand, and this report is
        not the client-facing one: those go out per brand on their own cadence, while this lands the
        same day every week so the weeks are comparable. GMV, managed GMV, capture rate and posts are
        calculated from Tempo and cannot be typed.
      </p>
    </div>
  );
}
