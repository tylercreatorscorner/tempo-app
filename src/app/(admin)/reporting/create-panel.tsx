'use client';

/**
 * Create panel for the reporting page — one job: mint a client report link.
 *
 * Prepare builds a preview (headline numbers + drafted notes) via
 * POST /api/client-reports/preview, then POST /api/client-reports freezes the
 * snapshot and returns a share link.
 *
 * Two things used to live here and no longer do. Creator posts moved to
 * /drops, which runs all seven Discord formats at once. And a "Weekly KPI"
 * mode produced a Slack paste, which was the wrong artifact entirely: the
 * client-facing deliverable is the report link, so the five KPIs that client
 * asked for are part of the report itself now, not a separate text blob.
 *
 * Every fetch is res.ok-guarded; failures render inline pulse-neg text, never
 * a silently-empty success state.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clipboard, Link2, Loader2, Wand2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SegmentedControl } from '@/components/ui/segmented';
import { useBrandSelect, BrandListWarning } from './use-report-brands';

/** Small tinted error line used under panel controls. */
function InlineError({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-[var(--pulse-neg-bg)] px-3 py-2 text-xs text-[var(--pulse-neg)]">
      {children}
    </div>
  );
}

// Full-width segmented controls inside the narrow panel column.
const SEG_FULL = 'flex w-full [&>button]:flex-1';

/**
 * `lockedBrand` is set when the operator started from a brand row in the
 * table. The brand picker then disappears: the brand is already chosen, and
 * re-picking it is both redundant and the one way to send brand A's numbers
 * under brand B's name.
 */
export function CreatePanel({
  onSent, lockedBrand, lockedBrandName,
}: {
  onSent: () => void;
  lockedBrand?: string;
  lockedBrandName?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-base font-bold tracking-tight text-foreground">
          {lockedBrandName ? `Report for ${lockedBrandName}` : 'New client report'}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          A share link the client opens. Numbers freeze when you create it.
        </p>
      </div>
      <div className="space-y-4 p-5">
        <ClientReportForm onSent={onSent} lockedBrand={lockedBrand} />
      </div>
    </Card>
  );
}

// ── Client report — prepare, edit notes, create link ────────────────
type PeriodPreset = '7d' | '30d' | 'custom';

/**
 * Which template the link renders.
 *
 *   weekly    everything below, PLUS "What moved this period": the creators
 *             who gained and lost, named.
 *   monthly   everything below, PLUS contracted posts against delivered, and
 *             the net-new GMV split.
 *
 * Everything else is identical across types: the headline, the driver
 * sentence, the month-to-date block, signings, worth-a-conversation, the
 * roster table and its CSV, vintage, and store context.
 *
 * 🚨 'performance' IS RETIRED FROM THIS PICKER. It is a strict SUBSET of both
 * of the others: it adds nothing and omits the movers section, so there was
 * never a reason to choose it. Every report CC has sent was 'performance',
 * which means every weekly send went out without the movement section.
 *
 * ⚠️ NOT removed from the type, the API, or the DB constraint. Every report
 * issued before the templates existed is stored as 'performance' and must keep
 * rendering; the API still accepts it, and an absent reportType still defaults
 * to it. This is a change to what an operator can CHOOSE, nothing else.
 *
 * ⚠️ monthly is not "comparison over 30 days": its content is accountability
 * WITHIN the month, not movement between months.
 */
type ReportKind = 'performance' | 'weekly' | 'monthly';

/** What an operator may pick for a NEW report. See the note above. */
type SelectableKind = Exclude<ReportKind, 'performance'>;

interface PreviewData {
  periodLabel: string;
  headline: { gmv: number; activeCreators: number; managedPct: number };
  draftNotes: string;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

interface MonthChoice {
  /** yyyy-MM, the value carried in state. */
  key: string;
  label: string;
  start: string;
  end: string;
  /** True for the month still running, whose end is capped at today. */
  partial: boolean;
}

/**
 * The months a month-in-review report can cover, newest first.
 *
 * 🚨 A CALENDAR MONTH, NOT A ROLLING 30 DAYS. "Last 30d" ends today and starts
 * 29 days earlier, which straddles two months; the monthly report compares
 * delivery against a MONTHLY post target, so anything but a real month reads
 * as failure. That mismatch is why the panel used to carry a note telling the
 * operator to build the dates by hand.
 *
 * The current month is offered but marked partial: it is a legitimate thing to
 * send mid-month (the report says "August so far" and states the days elapsed),
 * it is just not the finished article.
 */
function monthChoices(now: Date, count = 6): MonthChoice[] {
  const today = now.toISOString().slice(0, 10);
  const out: MonthChoice[] = [];
  for (let i = 0; i < count; i++) {
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
    const startStr = first.toISOString().slice(0, 10);
    const lastStr = last.toISOString().slice(0, 10);
    // The running month stops at today; a future end date has no data behind it.
    const partial = lastStr > today;
    out.push({
      key: startStr.slice(0, 7),
      label: first.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      start: startStr,
      end: partial ? today : lastStr,
      partial,
    });
  }
  return out;
}

function ClientReportForm({ onSent, lockedBrand }: { onSent: () => void; lockedBrand?: string }) {
  const { brand: pickedBrand, setBrand, options: brandOptions, error: brandsError } =
    useBrandSelect({ collapseUmbrella: true, initial: lockedBrand });
  const brand = lockedBrand ?? pickedBrand;

  const [preset, setPreset] = useState<PeriodPreset>('7d');
  // Weekly is the common send and is never worse than the retired default.
  const [reportKind, setReportKind] = useState<SelectableKind>('weekly');
  // The months a monthly report can cover. Computed once per mount; the panel
  // is not open long enough for the month to turn over underneath it.
  const months = useMemo(() => monthChoices(new Date()), []);
  // Defaults to the most recently COMPLETED month, which is what a month in
  // review usually means. Falls back to the running month in the first days of
  // a new month before any complete one exists in the list.
  const [monthKey, setMonthKey] = useState<string>(
    () => (months.find((m) => !m.partial) ?? months[0]).key,
  );
  const month = months.find((m) => m.key === monthKey) ?? months[0];
  const [startDate, setStartDate] = useState(() => new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const today = new Date().toISOString().slice(0, 10);
  // A month is always a valid range by construction; only the custom inputs
  // can be put the wrong way round.
  const rangeValid = reportKind === 'monthly' || preset !== 'custom' || startDate <= endDate;

  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [notes, setNotes] = useState('');
  /**
   * 🚨 THE PLAN COULD NEVER BE SET. client_reports.plan has existed since
   * migration 190, the API accepts it, and both the web report and the PDF
   * render it, but no UI anywhere sent it, so the only forward-looking section
   * of a client report was unreachable. Reports that had one got it written in
   * by hand against the database.
   *
   * ⚠️ Not drafted for you, on purpose. Notes describe a period that already
   * happened and can be generated from it; a commitment about next month
   * cannot, and a machine-written one would be a promise nobody made.
   */
  const [plan, setPlan] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ url: string } | null>(null);
  const [copiedFlash, setCopiedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Staleness guard: Prepare takes seconds (the snapshot build), so a response
  // can land AFTER the operator changed brand/period. Each selection change
  // bumps the sequence; a resolving fetch that no longer matches is dropped —
  // otherwise brand A's headline and notes silently reappear under brand B.
  const prepareSeq = useRef(0);

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  // Changing brand or period invalidates a prepared preview (its headline and
  // drafted notes describe the old selection) — force a fresh Prepare.
  useEffect(() => {
    prepareSeq.current += 1;
    setPreview(null);
    setCreated(null);
    setError(null);
  }, [brand, preset, startDate, endDate]);

  // '7d' | '30d' go up as-is; a custom range goes up as { start, end }.
  /**
   * ⚠️ A monthly report ALWAYS sends explicit dates. The 7d/30d presets are
   * rolling windows ending today, and "last 30 days" is not a calendar month,
   * which is the whole reason the month picker exists.
   */
  const periodPayload =
    reportKind === 'monthly'
      ? { start: month.start, end: month.end }
      : preset === 'custom'
        ? { start: startDate, end: endDate }
        : preset;

  const prepare = async () => {
    const seq = prepareSeq.current;
    setPreviewLoading(true);
    setError(null);
    setCreated(null);
    try {
      const res = await fetch('/api/client-reports/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, period: periodPayload }),
      });
      const data = await res.json().catch(() => ({}));
      if (seq !== prepareSeq.current) return; // selection changed mid-flight
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setPreview({
        periodLabel: data.periodLabel ?? '',
        headline: data.headline ?? {},
        draftNotes: typeof data.draftNotes === 'string' ? data.draftNotes : '',
      });
      setNotes(typeof data.draftNotes === 'string' ? data.draftNotes : '');
    } catch (err) {
      if (seq !== prepareSeq.current) return;
      setError(err instanceof Error ? err.message : 'Failed to prepare the report');
    } finally {
      if (seq === prepareSeq.current) setPreviewLoading(false);
    }
  };

  const copyUrl = async (url: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedFlash(true);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setCopiedFlash(false), 2000);
      return true;
    } catch {
      return false;
    }
  };

  const createLink = async () => {
    if (!preview) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/client-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, period: periodPayload, notes, plan, reportType: reportKind }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (typeof data.url !== 'string' || !data.url) throw new Error('The server did not return a link URL.');
      setCreated({ url: data.url });
      const copiedOk = await copyUrl(data.url);
      if (!copiedOk) setError('Link created, but clipboard access was blocked. Copy it from the box below.');
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create the report link');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      {!lockedBrand && (
        <div>
          <Label htmlFor="cr-brand">Brand</Label>
          <Select id="cr-brand" value={brand} onChange={e => setBrand(e.target.value)}>
            {brandOptions.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
          </Select>
          <BrandListWarning show={brandsError} />
        </div>
      )}

      <div>
        <Label>Report</Label>
        <SegmentedControl<SelectableKind>
          ariaLabel="Report type"
          size="sm"
          className={SEG_FULL}
          options={[
            { value: 'weekly', label: 'Week in review' },
            { value: 'monthly', label: 'Month in review' },
          ]}
          value={reportKind}
          onValueChange={(v) => {
            setReportKind(v);
            // Weekly gets the 7-day window back if the operator had wandered
            // off it. Monthly needs no preset at all: it picks a MONTH below
            // and always sends explicit first/last dates.
            if (v === 'weekly') setPreset('7d');
          }}
        />
        {/* Say what the choice actually buys, because the two differ by one
            section each and nothing in the label conveys that. */}
        <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
          {reportKind === 'weekly'
            ? 'Adds “What moved this period”: the creators who gained and lost, named. Everything else is the same in both.'
            : 'Adds contracted posts against delivered, and the net-new GMV split. Everything else is the same in both.'}
        </p>

      </div>

      <div>
        <Label>{reportKind === 'monthly' ? 'Month' : 'Reporting period'}</Label>
        {/* 🚨 A monthly report picks a MONTH, not a rolling window. Post
            targets and retainers are monthly, so measuring them over 7 or 30
            rolling days compares delivery against a target the window does not
            cover and reads as failure. */}
        {reportKind === 'monthly' ? (
          <>
            <select
              aria-label="Month"
              className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm text-foreground"
              value={monthKey}
              onChange={(e) => setMonthKey(e.target.value)}
            >
              {months.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}{m.partial ? ' (so far)' : ''}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
              {month.partial
                ? `${month.start} to ${month.end}, the month so far. The report says so and states the days elapsed; post targets are not pro-rated.`
                : `${month.start} to ${month.end}, a complete month.`}
            </p>
          </>
        ) : (
        <SegmentedControl<PeriodPreset>
          ariaLabel="Reporting period"
          size="sm"
          className={SEG_FULL}
          options={[
            { value: '7d', label: 'Last 7d' },
            { value: '30d', label: 'Last 30d' },
            { value: 'custom', label: 'Custom' },
          ]}
          value={preset}
          onValueChange={setPreset}
        />
        )}
        {reportKind !== 'monthly' && preset === 'custom' && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Input
              type="date" value={startDate} max={endDate} aria-label="Start date"
              onChange={e => setStartDate(e.target.value)}
            />
            <Input
              type="date" value={endDate} min={startDate} max={today} aria-label="End date"
              onChange={e => setEndDate(e.target.value)}
            />
          </div>
        )}
        {!rangeValid && (
          <p className="mt-1 text-[11px] text-[var(--pulse-neg)]">Start date must be on or before the end date.</p>
        )}
      </div>

      <Button variant="outline" size="lg" className="w-full" onClick={prepare} disabled={previewLoading || !rangeValid}>
        {previewLoading ? <><Loader2 className="animate-spin" />Preparing…</> : <><Wand2 />Prepare</>}
      </Button>

      {preview && (
        <>
          <HeadlineLine periodLabel={preview.periodLabel} headline={preview.headline} />

          <div>
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="cr-notes" className="mb-0">Your notes</Label>
              <span className="text-[10.5px] text-muted-foreground">drafted for you, edit freely</span>
            </div>
            <Textarea
              id="cr-notes"
              className="mt-1.5"
              rows={5}
              maxLength={2000}
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          {/* Optional, and empty renders nothing on the report rather than an
              empty heading. A monthly with no plan is the report's only
              non-retrospective section missing, which is worth the field. */}
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="cr-plan" className="mb-0">What happens next</Label>
              <span className="text-[10.5px] text-muted-foreground">optional, your words</span>
            </div>
            <Textarea
              id="cr-plan"
              className="mt-1.5"
              rows={3}
              maxLength={2000}
              placeholder="What you are committing to for the coming period."
              value={plan}
              onChange={e => setPlan(e.target.value)}
            />
          </div>

          <Button size="lg" className="w-full" onClick={createLink} disabled={creating || !rangeValid}>
            {creating ? <><Loader2 className="animate-spin" />Creating…</> : <><Link2 />Create link + copy</>}
          </Button>
        </>
      )}

      {created && (
        <div className="space-y-2 rounded-xl border border-[var(--pulse-pos)]/25 bg-[var(--pulse-pos-bg)] px-3.5 py-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--pulse-pos)]">
            <Check className="h-3.5 w-3.5" />
            {copiedFlash ? 'Link copied to clipboard' : 'Link created'}
          </div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-card/70 px-2 py-1.5 text-[11px] text-foreground">
              {created.url}
            </code>
            <Button variant="outline" size="sm" className="shrink-0" onClick={() => copyUrl(created.url)}>
              {copiedFlash ? <Check /> : <Clipboard />}
              {copiedFlash ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
      )}

      {error && <InlineError>{error}</InlineError>}
    </div>
  );
}

/** Headline numbers from the prepare step. Fields are guarded at runtime —
 *  a malformed payload renders "—", never a fake $0 (silent-zero rule). */
function HeadlineLine({ periodLabel, headline }: { periodLabel: string; headline: PreviewData['headline'] }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/60 px-3.5 py-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        {periodLabel}
      </div>
      <div className="mt-1 text-sm text-foreground">
        <strong>{isNum(headline.gmv) ? formatCurrency(headline.gmv) : '—'}</strong> GMV
        <span className="text-muted-foreground"> · </span>
        <strong>{isNum(headline.activeCreators) ? headline.activeCreators.toLocaleString('en-US') : '—'}</strong>{' '}
        creators made sales
        <span className="text-muted-foreground"> · </span>
        <strong>{isNum(headline.managedPct) ? `${Math.round(headline.managedPct)}%` : '—'}</strong> managed
      </div>
    </div>
  );
}

