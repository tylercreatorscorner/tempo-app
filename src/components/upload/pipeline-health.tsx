'use client';

/**
 * Top-of-page health — what is current, what needs attention, what is not
 * expected.
 *
 * EVERY NUMBER HERE IS DERIVED FROM THE COVERAGE READ. None of it defaults to
 * an optimistic value: when the coverage fetch has not succeeded, the lanes
 * render "—", not a confident zero. This repo shipped a Settings page that
 * claimed a working TikTok sync for months because a backfilled boolean
 * defaulted to true; a health strip that reads "0 problems" because its fetch
 * died is the same failure wearing a different hat.
 */
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleSlash, PlugZap } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { shortDate, worstStatus, type CoverageResponse } from './coverage-types';

interface ConnectionsPayload {
  connections?: { brandSlug: string; isActive: boolean }[];
}

interface FreshnessPayload {
  futureIssues?: { brand: string; fileType: string; dates: string[] }[];
}

interface Derived {
  current: number;
  expectedBrands: number;
  /** Newest JUDGED day — never the newest rendered one. */
  throughDate: string | null;
  /** Columns rendered but not judged, i.e. inside the publication window. */
  awaitingDays: number;
  attentionDays: number;
  partialDays: number;
  missingDays: number;
  oldestProblem: string | null;
  notExpected: number;
}

/**
 * All of it computed from one coverage payload — no second source to drift.
 *
 * COUNTS ITERATE `days`, NOT `cells`. A day with no rows in any tracked table
 * produces NO cell (the counts come from a GROUP BY, which cannot emit a zero),
 * and it is absent precisely on the newest days. Counting cells would therefore
 * skip the worst gaps entirely and report a confident all-clear — so an absent
 * day is counted as MISSING for any brand that is expected to report.
 */
function derive(data: CoverageResponse): Derived {
  const expected = data.brands.filter((b) => b.expected);
  // Days arrive newest-first. days[0] is the newest RENDERED day, which is
  // inside the publication window and therefore carries no verdict — measuring
  // "current" against it made this strip read "0 of 8 brands" every morning
  // while asserting "Complete through <a day nothing has landed for>". Both
  // numbers hang off the newest JUDGED day instead.
  const judged = data.days.filter((d) => d <= data.judgeThrough);
  const newestJudged = judged[0] ?? null;
  const awaitingDays = data.days.length - judged.length;

  let current = 0;
  let partialDays = 0;
  let missingDays = 0;
  let oldestProblem: string | null = null;

  for (const brand of expected) {
    const byDate = new Map(brand.cells.map((c) => [c.date, c]));
    // Only judged days can contribute to attention counts. An absent day is
    // still MISSING (a GROUP BY cannot emit a zero, so the worst gaps have no
    // cell at all) — but only once it is past the publication window.
    for (const date of judged) {
      const cell = byDate.get(date);
      const w = cell ? worstStatus(cell) : 'missing';
      if (w === 'partial' || w === 'missing') {
        if (w === 'partial') partialDays++;
        else missingDays++;
        if (!oldestProblem || date < oldestProblem) oldestProblem = date;
      }
    }
    // "Current" is a claim about the freshest JUDGED day only — a brand that
    // filled it is current even if an old day is still short. An absent cell is
    // not current: nothing landed.
    const newestCell = newestJudged ? byDate.get(newestJudged) : undefined;
    if (newestCell && worstStatus(newestCell) === 'complete') current++;
  }

  return {
    current,
    expectedBrands: expected.length,
    throughDate: newestJudged,
    awaitingDays,
    attentionDays: partialDays + missingDays,
    partialDays,
    missingDays,
    oldestProblem,
    notExpected: data.brands.length - expected.length,
  };
}

export function PipelineHealth({
  data,
  coverageError,
}: {
  data: CoverageResponse | null;
  /** Non-null when coverage has never loaded successfully — lanes go to "—". */
  coverageError: string | null;
}) {
  const d = data ? derive(data) : null;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <Lane
          tone={d ? (d.current === d.expectedBrands ? 'ok' : 'neutral') : 'neutral'}
          icon={<CheckCircle2 />}
          title="Current"
          value={d ? String(d.current) : '—'}
          unit={d ? `of ${d.expectedBrands} brands` : undefined}
          note={
            d
              ? d.throughDate
                ? `Complete through ${shortDate(d.throughDate)}` +
                  (d.awaitingDays > 0
                    ? ` · ${d.awaitingDays} newer ${d.awaitingDays === 1 ? 'day' : 'days'} awaiting publication.`
                    : '.')
                : 'No judged days in this window.'
              : 'Coverage could not be read, so no brand is being reported as current.'
          }
        />
        <Lane
          tone={d ? (d.attentionDays > 0 ? 'bad' : 'ok') : 'neutral'}
          icon={<AlertTriangle />}
          title="Needs attention"
          value={d ? String(d.attentionDays) : '—'}
          unit={d ? 'brand-days incomplete' : undefined}
          note={
            d
              ? d.attentionDays === 0
                ? 'Every expected report landed and was verified.'
                : `${d.partialDays} partial · ${d.missingDays} missing${
                    d.oldestProblem ? ` · oldest ${shortDate(d.oldestProblem)}` : ''
                  }`
              : 'Unknown — a failed read is not the same as no problems.'
          }
        />
        <Lane
          tone="idle"
          icon={<CircleSlash />}
          title="Not expected"
          value={d ? String(d.notExpected) : '—'}
          unit={d ? (d.notExpected === 1 ? 'brand' : 'brands') : undefined}
          note={
            d
              ? d.notExpected === 0
                ? 'Every brand on the ledger is expected to report daily.'
                : 'Archived or offboarded — no reports are owed, and their empty rows are not failures.'
              : 'Unknown.'
          }
        />
      </div>

      <AutoSyncStrip />
      <FutureDataWarning />

      {coverageError && (
        <p className="text-[11.5px] text-[var(--pulse-neg)]">
          Health above is unavailable because the coverage read failed: {coverageError}
        </p>
      )}
    </div>
  );
}

function Lane({
  tone, icon, title, value, unit, note,
}: {
  tone: 'ok' | 'bad' | 'idle' | 'neutral';
  icon: React.ReactNode;
  title: string;
  value: string;
  unit?: string;
  note: string;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-[var(--pulse-elev-1)]">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-md [&_svg]:h-3.5 [&_svg]:w-3.5',
            tone === 'ok' && 'bg-[var(--pulse-pos-bg)] text-[var(--pulse-pos)]',
            tone === 'bad' && 'bg-[var(--pulse-neg-bg)] text-[var(--pulse-neg)]',
            (tone === 'idle' || tone === 'neutral') && 'bg-muted text-muted-foreground',
          )}
        >
          {icon}
        </span>
        <h2 className="text-[12.5px] font-bold text-muted-foreground">{title}</h2>
      </div>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="text-[26px] font-extrabold leading-none tracking-tight tabular-nums text-foreground">
          {value}
        </span>
        {unit && <span className="text-[12px] font-medium text-muted-foreground">{unit}</span>}
      </p>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">{note}</p>
    </section>
  );
}

// ── Auto-sync reality ──────────────────────────────────────────────────────

/**
 * The honest state of automatic ingestion.
 *
 * The design mock showed a "Live · 11 of 16 shops connected" panel. That was
 * aspirational: no TikTok shop has completed authorization, so nothing syncs on
 * its own and every row in the ledger below arrived because a human uploaded a
 * spreadsheet. This strip reads the real connection count and says exactly
 * that. If the read FAILS it says the count is unknown — it never falls back to
 * a number, because "0 connected" and "couldn't ask" are different facts.
 */
function AutoSyncStrip() {
  const [active, setActive] = useState<number | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tiktok/connections', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as ConnectionsPayload;
      if (!Array.isArray(body.connections)) throw new Error('unexpected shape');
      setActive(body.connections.filter((c) => c.isActive).length);
      setTotal(body.connections.length);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const live = active != null && active > 0;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border px-4 py-2.5 text-[12px]',
        live
          ? 'border-[var(--pulse-pos)]/25 bg-[var(--pulse-pos-bg)]'
          : 'border-border bg-secondary',
      )}
    >
      <PlugZap
        className={cn(
          'h-3.5 w-3.5 shrink-0',
          live ? 'text-[var(--pulse-pos)]' : 'text-muted-foreground',
        )}
      />
      <span className="font-semibold text-foreground">Automatic sync</span>
      {failed ? (
        <span className="text-muted-foreground">
          — couldn&apos;t read shop authorization status, so the ledger&apos;s source cannot be
          confirmed.
        </span>
      ) : active == null ? (
        <span className="text-muted-foreground">— checking…</span>
      ) : active === 0 ? (
        <span className="text-muted-foreground">
          is not active. No TikTok shop has authorized API access
          {total ? ` (${total} recorded, none live)` : ''}, so every row below arrived by manual
          upload.
        </span>
      ) : (
        <span className="text-muted-foreground">
          {active} of {total} shops authorized — those brands ingest without an upload.
        </span>
      )}
      <Link
        href="/settings#tiktok-shop"
        className="ml-auto shrink-0 font-semibold text-primary hover:underline"
      >
        Shop connections
      </Link>
    </div>
  );
}

// ── Future-dated rows ──────────────────────────────────────────────────────

/**
 * Rows dated after yesterday are always invalid — TikTok data lags ~1 day, and
 * the Video List export ships SCHEDULED, unpublished videos with a future post
 * date. Coverage answers "what is absent"; this answers "what is present and
 * wrong", which is a different question, so it keeps its own (already shipped)
 * source. Silent on failure BY DESIGN: this is a secondary signal, and an
 * alarming red banner about a fetch that merely failed would train the operator
 * to ignore the row that matters.
 */
function FutureDataWarning() {
  const [issues, setIssues] = useState<FreshnessPayload['futureIssues']>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/upload/freshness', { cache: 'no-store' });
        if (!res.ok) return;
        const body = (await res.json()) as FreshnessPayload;
        if (!cancelled && Array.isArray(body.futureIssues)) setIssues(body.futureIssues);
      } catch {
        /* secondary signal — stay quiet rather than cry wolf */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!issues || issues.length === 0) return null;

  return (
    <div className="flex items-start gap-2 rounded-xl border border-[var(--pulse-warn)]/30 bg-[var(--pulse-warn-bg)] px-4 py-2.5 text-[11.5px] leading-relaxed">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--pulse-warn)]" />
      <span className="text-foreground">
        <strong>Future-dated rows are in the warehouse.</strong>{' '}
        {issues.slice(0, 3).map((i, idx) => (
          <span key={idx}>
            {idx > 0 && ' · '}
            {i.brand} {i.fileType}: {i.dates.join(', ')}
          </span>
        ))}
        {issues.length > 3 && ` +${issues.length - 3} more`}. TikTok data lags a day, so anything
        dated ahead of yesterday came from a mislabelled file or a scheduled, unpublished video.
      </span>
    </div>
  );
}
