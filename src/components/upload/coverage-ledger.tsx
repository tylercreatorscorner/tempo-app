'use client';

/**
 * Coverage ledger — the centerpiece of /upload.
 *
 * Brands down, days across. Each cell carries the three reports that make up a
 * complete brand-day (Creator / Video / Product) as three marks, so the eye
 * lands on trouble without reading anything.
 *
 * WHY THIS EXISTS: the old page thought in FILES — a queue you feed, one row
 * per spreadsheet. It had no concept of what SHOULD exist, which is why six
 * brands went dark for ten days while every dashboard rendered confident stale
 * numbers, and why a day stranded at exactly 5,000 rows looked identical to a
 * healthy one. This thinks in COVERAGE: every brand, every day, every report,
 * known-complete or explicitly not.
 *
 * COLOUR IS NEVER THE ONLY CUE. Every state has its own SHAPE, so the grid
 * survives a colourblind reader, a greyscale print and a screenshot:
 *
 *   complete      full-height solid bar
 *   partial       half-height bar sitting in a faint track  (literally partial)
 *   missing       hollow outlined bar                        (literally empty)
 *   unverified    full-height DASHED outline   (all the rows, none of the proof)
 *   awaiting      three small dots             (not owed yet, not a failure)
 *   not expected  short centred dash                         (nothing is owed)
 *
 * `awaiting` and `missing` must never share a shape: one is TikTok's publication
 * window, the other is a hole. Conflating them is what made every healthy brand
 * read "Silent 1d" in red every morning.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TableLoadBar } from '@/components/ui/table-load-bar';
import { useDelayedFlag } from '@/hooks/use-delayed-flag';
import { SegmentedControl } from '@/components/ui/segmented';
import {
  cellStates,
  shortDate,
  worstStatus,
  COVERAGE_TYPES,
  STATUS_LABEL,
  type CellState,
  type CoverageBrand,
  type CoverageCell,
  type CoverageResponse,
  type CoverageStatus,
  type CoverageTypeKey,
  type ExportLayout,
} from './coverage-types';

export interface LedgerSelection {
  brand: string;
  brandLabel: string;
  type: CoverageTypeKey;
  date: string;
  state: CellState;
  /** Carried so the drawer's repair guidance can name the right FILE — split
   *  export brands fetch Video_Data where merged brands fetch Video_List. */
  exportLayout?: ExportLayout;
}

interface CoverageLedgerProps {
  data: CoverageResponse | null;
  loading: boolean;
  /** Set when the LAST fetch failed. With `data` present this is a warm
   *  failure — the grid stays, behind a stale banner. */
  error: string | null;
  hasLoadedOnce: boolean;
  days: number;
  onDaysChange: (days: number) => void;
  selection: LedgerSelection | null;
  onSelect: (selection: LedgerSelection) => void;
  onRetry: () => void;
}

// ── Brand row summary ──────────────────────────────────────────────────────

interface BrandSummary {
  missingDays: number;
  partialDays: number;
  /** Days that landed rows but have no history to judge them against. */
  unverifiedDays: number;
  /** Consecutive most-recent days where every expected report is missing —
   *  the "this brand went dark" signal that took ten days to notice. */
  silentStreak: number;
  label: string;
  tone: 'ok' | 'warn' | 'bad' | 'idle';
}

/** `cells` must be oldest-first (display order). */
function summarize(brand: CoverageBrand, cells: CoverageCell[]): BrandSummary {
  if (!brand.expected) {
    return { missingDays: 0, partialDays: 0, unverifiedDays: 0, silentStreak: 0, label: 'Archived — not expected', tone: 'idle' };
  }
  // Awaiting days are inside TikTok's publication window and carry no verdict,
  // so they must not appear in any tally — otherwise every brand permanently
  // carries phantom missing days and none can ever read 'Current'.
  let missingDays = 0;
  let partialDays = 0;
  let unverifiedDays = 0;
  for (const c of cells) {
    const w = worstStatus(c);
    if (w === 'missing') missingDays++;
    else if (w === 'partial') partialDays++;
    else if (w === 'unverified') unverifiedDays++;
  }

  // Walk backwards from the newest JUDGED day for as long as the day is wholly
  // missing.
  //
  // The skip is load-bearing. This loop breaks on the first day that is not
  // wholly missing, and awaiting cells sit at exactly that end — so without the
  // skip it would break immediately and return 0 for the six brands that have
  // been dark since 2026-07-09. They would drop from 'Silent 17d' to a bland
  // '17 missing' and lose their sort priority to the top of the ledger, which is
  // the precise inverse of what this page is for.
  let silentStreak = 0;
  let i = cells.length - 1;
  while (i >= 0) {
    const s = cellStates(cells[i]).filter((x) => x.state && x.state.status !== 'not_expected');
    if (s.length > 0 && s.every((x) => x.state!.status === 'awaiting')) i--;
    else break;
  }
  for (; i >= 0; i--) {
    const states = cellStates(cells[i]).filter((s) => s.state && s.state.status !== 'not_expected');
    if (states.length > 0 && states.every((s) => s.state!.status === 'missing')) silentStreak++;
    else break;
  }

  if (silentStreak > 0) {
    return { missingDays, partialDays, unverifiedDays, silentStreak, label: `Silent ${silentStreak}d`, tone: 'bad' };
  }
  if (missingDays > 0) {
    return {
      missingDays,
      partialDays,
      unverifiedDays,
      silentStreak,
      label: `${missingDays} missing${partialDays > 0 ? ` · ${partialDays} partial` : ''}`,
      tone: 'bad',
    };
  }
  if (partialDays > 0) {
    return { missingDays, partialDays, unverifiedDays, silentStreak, label: `${partialDays} partial`, tone: 'warn' };
  }
  if (unverifiedDays > 0) {
    return {
      missingDays,
      partialDays,
      unverifiedDays,
      silentStreak,
      label: `${unverifiedDays} unverified`,
      tone: 'warn',
    };
  }
  return { missingDays, partialDays, unverifiedDays, silentStreak, label: 'Current', tone: 'ok' };
}

const TONE_TEXT: Record<BrandSummary['tone'], string> = {
  ok: 'text-muted-foreground',
  warn: 'text-[var(--pulse-warn)]',
  bad: 'text-[var(--pulse-neg)]',
  idle: 'text-muted-foreground/70',
};

// ── Marks ──────────────────────────────────────────────────────────────────

/**
 * One report's state inside a day cell. Shape carries the meaning; colour only
 * reinforces it.
 */
function TypeMark({ state }: { state: CellState | null }) {
  const status: CoverageStatus | 'unknown' = state ? state.status : 'unknown';

  if (status === 'complete') {
    return <span className="h-3 w-[5px] rounded-[1.5px] bg-[var(--pulse-pos)]" />;
  }
  if (status === 'partial') {
    // Half-height fill in a faint full-height track: the bar visibly stops
    // short of where a complete bar ends.
    return (
      <span className="relative h-3 w-[5px] overflow-hidden rounded-[1.5px] bg-[var(--pulse-warn)]/22">
        <span className="absolute inset-x-0 bottom-0 h-1/2 bg-[var(--pulse-warn)]" />
      </span>
    );
  }
  if (status === 'missing') {
    return (
      <span className="h-3 w-[5px] rounded-[1.5px] border border-[var(--pulse-neg)] bg-transparent" />
    );
  }
  if (status === 'unverified') {
    // Full height like complete — the rows ARE all here — but hollow, because
    // nothing checked them. Neutral, never green.
    return (
      <span className="h-3 w-[5px] rounded-[1.5px] border border-dashed border-muted-foreground/70 bg-transparent" />
    );
  }
  if (status === 'awaiting') {
    // A dotted track, distinct from missing's solid outline: the day is not
    // owed YET. It must not be the same shape as a failure and must not be the
    // same shape as "nothing is owed here".
    return (
      <span className="flex h-3 w-[5px] flex-col items-center justify-between py-[1px]">
        <span className="h-[2px] w-[2px] rounded-full bg-muted-foreground/45" />
        <span className="h-[2px] w-[2px] rounded-full bg-muted-foreground/45" />
        <span className="h-[2px] w-[2px] rounded-full bg-muted-foreground/45" />
      </span>
    );
  }
  // not_expected / unknown — a short centred dash: nothing is owed here.
  return (
    <span className="flex h-3 w-[5px] items-center justify-center">
      <span className="h-[2px] w-full rounded-full bg-muted-foreground/35" />
    </span>
  );
}

/**
 * Human description of a cell, one line per report. The API's `reason` is
 * carried VERBATIM — "5,000 rows is an exact chunk multiple; brand median is
 * 40,606" has to reach the operator on hover, not only inside the drawer.
 */
function describeCell(brandLabel: string, cell: CoverageCell): { title: string; aria: string } {
  const parts = cellStates(cell).map(({ label, state }) => {
    if (!state) return `${label}: not reported`;
    const rows = state.rows != null ? ` (${state.rows.toLocaleString()} rows)` : '';
    const reason = state.reason ? ` — ${state.reason}` : '';
    return `${label}: ${STATUS_LABEL[state.status]}${rows}${reason}`;
  });
  const head = `${brandLabel} · ${shortDate(cell.date)}`;
  return {
    title: `${head}\n${parts.join('\n')}`,
    // Screen readers get one flat sentence run. Parts that already end in a
    // full stop (an API reason usually does) must not gain a second one.
    aria: [head, ...parts].map((p) => (/[.!?]$/.test(p) ? p : `${p}.`)).join(' '),
  };
}

// ── Component ──────────────────────────────────────────────────────────────

const DAY_OPTIONS = [
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
];

export function CoverageLedger({
  data,
  loading,
  error,
  hasLoadedOnce,
  days,
  onDaysChange,
  selection,
  onSelect,
  onRetry,
}: CoverageLedgerProps) {
  const showBar = useDelayedFlag(loading);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRight = useRef(false);

  // The API sends days newest-first; the grid reads left-to-right oldest to
  // newest like a calendar. Reversed here rather than in the API so the
  // contract stays as specified.
  const displayDays = useMemo(() => (data ? [...data.days].reverse() : []), [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    const byDate = (b: CoverageBrand) => {
      const map = new Map(b.cells.map((c) => [c.date, c]));

      // WHICH REPORTS THIS BRAND OWES. Derived from the reports it has actually
      // been observed producing, matching how the API decides `expected`. A
      // brand with no cells at all falls back to the full daily set.
      const owed = new Set<CoverageTypeKey>();
      for (const c of b.cells) {
        for (const { key } of COVERAGE_TYPES) if (c.types[key]) owed.add(key);
      }
      if (owed.size === 0) for (const { key } of COVERAGE_TYPES) owed.add(key);

      // A DAY WITH NO ROWS ANYWHERE PRODUCES NO CELL. The counts come from a
      // GROUP BY, which cannot emit a zero, so a totally empty day is simply
      // absent from the response — and it is absent precisely on the newest,
      // most important days. Columns therefore come from `days[]`, never from
      // the cell array, and an absent cell is synthesised as MISSING (or
      // not_expected for an archived brand). Defaulting it to "no state" would
      // paint those days as neutral dashes: a silent all-clear over the exact
      // hole this page exists to show.
      // The newest columns are precisely the ones with no GROUP BY row at all,
      // so this fallback — not classifyCell — is what decides them. It has to
      // know about the publication window or the whole awaiting state is
      // bypassed for exactly the days it was built for.
      const synthesize = (date: string): CoverageCell => {
        const awaiting = b.expected && date > data.judgeThrough;
        const status: CoverageStatus = !b.expected
          ? 'not_expected'
          : awaiting
            ? 'awaiting'
            : 'missing';
        const state: CellState = {
          status,
          rows: null,
          expectedRows: null,
          ...(awaiting
            ? {
                reason:
                  'Not ingested yet. No upload for a given day has ever landed before ~10:00 ET the ' +
                  'following morning, so this day is not judged yet.',
              }
            : b.expected
              ? { reason: 'No rows landed in any tracked table for this day, so the day returned no record at all.' }
              : {}),
        };
        const types: CoverageCell['types'] = {};
        for (const key of owed) types[key] = state;
        return { date, types };
      };

      return displayDays.map<CoverageCell>((d) => map.get(d) ?? synthesize(d));
    };
    return data.brands
      .map((brand) => {
        const cells = byDate(brand);
        return { brand, cells, summary: summarize(brand, cells) };
      })
      // Trouble first: silent brands, then most-missing, then most-partial.
      // Archived brands sink to the bottom — they are not failures and must
      // never sit at the top of a list the operator reads as a to-do.
      .sort((a, b) => {
        if (a.brand.expected !== b.brand.expected) return a.brand.expected ? -1 : 1;
        return (
          b.summary.silentStreak - a.summary.silentStreak ||
          b.summary.missingDays - a.summary.missingDays ||
          b.summary.partialDays - a.summary.partialDays ||
          a.brand.label.localeCompare(b.brand.label)
        );
      });
  }, [data, displayDays]);

  // Land on TODAY. The newest days sit at the right edge, which is off-screen
  // on a 30-day window — so the container starts scrolled to the end. Only on
  // the first data arrival, so a refetch never yanks the operator's scroll
  // position back while they're reading an older week.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !data || pinnedRight.current) return;
    el.scrollLeft = el.scrollWidth;
    pinnedRight.current = true;
  }, [data]);

  // Re-pin when the window length changes — a 14 -> 30 day switch is a new
  // question, and the answer still starts at today.
  useEffect(() => {
    pinnedRight.current = false;
  }, [days]);

  const coldFailure = error && !hasLoadedOnce;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--pulse-elev-1)]">
      <TableLoadBar active={showBar} />

      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-foreground">Coverage ledger</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Every brand, every day, every report. A cell is only complete when its row count was
            verified after the write.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data && displayDays.length > 0 && (
            <span className="hidden rounded-md border border-border bg-secondary px-2.5 py-1 text-[11px] font-semibold text-muted-foreground sm:inline">
              {shortDate(displayDays[0])} – {shortDate(displayDays[displayDays.length - 1])}
            </span>
          )}
          <SegmentedControl
            options={DAY_OPTIONS}
            value={String(days)}
            onValueChange={(v) => onDaysChange(Number(v))}
            size="sm"
            ariaLabel="Coverage window"
          />
        </div>
      </header>

      {/* Warm failure — the grid below is the last good read, and says so. A
          silently stale coverage grid is the exact failure this page exists to
          end, so it is never allowed to look live. */}
      {error && hasLoadedOnce && (
        <div className="flex items-start gap-2 border-b border-border bg-[var(--pulse-warn-bg)] px-5 py-2.5 text-[11.5px] text-[var(--pulse-warn)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Couldn&apos;t refresh coverage ({error}) — showing the last good read from{' '}
            {data ? new Date(data.generatedAt).toLocaleTimeString() : 'earlier'}. It may be out of date.
          </span>
        </div>
      )}

      {/* API-side warnings ride along with the data (e.g. a brand whose
          expected-row baseline is too thin to judge). */}
      {data?.warnings && data.warnings.length > 0 && (
        <ul className="border-b border-border bg-secondary/60 px-5 py-2 text-[11.5px] text-muted-foreground">
          {data.warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--pulse-warn)]" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}

      {coldFailure ? (
        // Cold failure renders as an ERROR, never as an empty grid. An empty
        // coverage ledger reads as "nothing is expected anywhere", which is the
        // one lie this surface must never tell.
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--pulse-neg-bg)]">
            <AlertTriangle className="h-5 w-5 text-[var(--pulse-neg)]" />
          </span>
          <div>
            <p className="text-sm font-bold text-foreground">Couldn&apos;t load coverage</p>
            <p className="mt-1 max-w-md text-xs text-muted-foreground">
              {error} — nothing below is a coverage claim. No brand is being reported as current.
            </p>
          </div>
          <button
            onClick={onRetry}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
          >
            Try again
          </button>
        </div>
      ) : !data ? (
        <LedgerSkeleton />
      ) : rows.length === 0 ? (
        <p className="px-6 py-14 text-center text-sm text-muted-foreground">
          No brands in this window.
        </p>
      ) : (
        <>
          {/* The grid scrolls INSIDE this container so the page body never
              scrolls sideways. */}
          <div
            ref={scrollRef}
            className={cn(
              'overflow-x-auto',
              showBar && 'opacity-60 transition-opacity duration-200',
            )}
          >
            <table className="w-full border-separate border-spacing-0 text-xs tabular-nums">
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 z-20 min-w-[186px] border-b border-border bg-card px-5 py-2 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground"
                  >
                    Brand
                  </th>
                  {displayDays.map((d) => {
                    const dt = new Date(`${d}T12:00:00Z`);
                    return (
                      <th
                        key={d}
                        scope="col"
                        className="border-b border-border px-0 py-2 text-center font-semibold text-muted-foreground"
                      >
                        <span className="block text-[11px] font-bold text-foreground">
                          {dt.getUTCDate()}
                        </span>
                        <span className="block text-[9.5px] uppercase tracking-wider">
                          {dt.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ brand, cells, summary }) => (
                  <tr key={brand.slug} className="group/row">
                    <th
                      scope="row"
                      className={cn(
                        'sticky left-0 z-10 border-b border-border bg-card px-5 py-1.5 text-left align-middle font-normal transition-colors group-hover/row:bg-secondary',
                        !brand.expected && 'opacity-60',
                      )}
                    >
                      <span className="block truncate text-[12.5px] font-semibold text-foreground">
                        {brand.label}
                      </span>
                      <span className={cn('block text-[10.5px]', TONE_TEXT[summary.tone])}>
                        {summary.label}
                      </span>
                    </th>
                    {cells.map((cell) => (
                      <DayCell
                        key={cell.date}
                        brand={brand}
                        cell={cell}
                        selected={
                          selection?.brand === brand.slug && selection?.date === cell.date
                        }
                        onSelect={onSelect}
                      />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Legend />
        </>
      )}
    </section>
  );
}

// ── Day cell ───────────────────────────────────────────────────────────────

function DayCell({
  brand,
  cell,
  selected,
  onSelect,
}: {
  brand: CoverageBrand;
  cell: CoverageCell;
  selected: boolean;
  onSelect: (s: LedgerSelection) => void;
}) {
  const worst = worstStatus(cell);
  const states = cellStates(cell);
  const running = states.some((s) => s.state?.runStatus === 'running');

  // Opening a cell opens the report that is actually in trouble — clicking a
  // red cell and landing on the one report that DID land wastes the click.
  const focus =
    states.find((s) => s.state?.status === 'missing') ??
    states.find((s) => s.state?.status === 'partial') ??
    states.find((s) => s.state) ??
    states[0];

  const disabled = !focus.state;
  const described = describeCell(brand.label, cell);

  return (
    <td className="border-b border-border px-0 py-0 text-center transition-colors group-hover/row:bg-secondary">
      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          focus.state &&
          onSelect({
            brand: brand.slug,
            brandLabel: brand.label,
            type: focus.key,
            date: cell.date,
            state: focus.state,
            exportLayout: brand.exportLayout,
          })
        }
        title={described.title}
        aria-label={described.aria}
        className={cn(
          'mx-auto my-[3px] flex items-center justify-center gap-[2px] rounded-md px-[5px] py-[5px] transition-all',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-card',
          !disabled && 'cursor-pointer hover:ring-1 hover:ring-primary/40',
          disabled && 'cursor-default',
          worst === 'missing' && 'bg-[var(--pulse-neg-bg)] ring-1 ring-[var(--pulse-neg)]/30',
          worst === 'partial' && 'bg-[var(--pulse-warn-bg)]',
          worst === 'not_expected' && 'opacity-45',
          selected && 'ring-2 ring-[var(--primary)]',
          running && 'animate-pulse',
        )}
      >
        {states.map(({ key, state }) => (
          <TypeMark key={key} state={state} />
        ))}
      </button>
    </td>
  );
}

// ── Legend ─────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border px-5 py-3 text-[11px] text-muted-foreground">
      <span className="font-semibold text-foreground">Each cell, left to right:</span>
      <span>Creator · Video · Product</span>
      <span className="hidden flex-1 sm:block" />
      <LegendKey state={{ status: 'complete', rows: null, expectedRows: null }} label="Complete" />
      <LegendKey state={{ status: 'partial', rows: null, expectedRows: null }} label="Partial" />
      <LegendKey state={{ status: 'missing', rows: null, expectedRows: null }} label="Missing" />
      <LegendKey state={null} label="Not expected" />
    </div>
  );
}

function LegendKey({ state, label }: { state: CellState | null; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <TypeMark state={state} />
      {label}
    </span>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function LedgerSkeleton() {
  return (
    <div className="space-y-2 px-5 py-5" aria-hidden>
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="h-6 w-[166px] shrink-0 animate-pulse rounded-md bg-muted" />
          <div className="h-6 flex-1 animate-pulse rounded-md bg-muted" />
        </div>
      ))}
    </div>
  );
}
