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
import { Check, Clipboard, Link2, Loader2, Wand2, ExternalLink } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChoiceMenu } from '@/components/ui/choice-menu';
import { BrandIdentity } from '@/components/creators/brand-identity';
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
    <Card className="overflow-hidden shadow-none">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-base font-bold tracking-tight text-foreground">
          {lockedBrand && lockedBrandName ? <BrandIdentity brand={lockedBrand} label={lockedBrandName} /> : 'New client report'}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Review the figures and your commentary before creating a share link.
        </p>
      </div>
      <div className="space-y-4 p-5">
        <ClientReportForm onSent={onSent} lockedBrand={lockedBrand} />
      </div>
    </Card>
  );
}

// ── Client report — prepare, edit notes, create link ────────────────
type PeriodPreset = 'last-week' | 'this-week' | 'custom';

type ReportKind = 'performance' | 'weekly' | 'monthly';
type SelectableKind = ReportKind;

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

/** Calendar weeks use the same UTC date boundaries as report snapshots. */
export function reportingWeek(now: Date, current = false) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - (today.getUTCDay() + 6) % 7 - (current ? 0 : 7));
  const end = current ? today : new Date(monday.getTime() + 6 * 86400000);
  return { start: monday.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function ClientReportForm({ onSent, lockedBrand }: { onSent: () => void; lockedBrand?: string }) {
  const { brand: pickedBrand, setBrand, options: brandOptions, error: brandsError } =
    useBrandSelect({ collapseUmbrella: true, initial: lockedBrand });
  const brand = lockedBrand ?? pickedBrand;

  const [preset, setPreset] = useState<PeriodPreset>('last-week');
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
  const rangeValid = reportKind !== 'performance' || Boolean(startDate && endDate && startDate <= endDate && endDate <= today);

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
    setPreviewLoading(false);
    setCreated(null);
    setError(null);
  }, [brand, preset, startDate, endDate, reportKind, monthKey]);

  // '7d' | '30d' go up as-is; a custom range goes up as { start, end }.
  /**
   * ⚠️ A monthly report ALWAYS sends explicit dates. The 7d/30d presets are
   * rolling windows ending today, and "last 30 days" is not a calendar month,
   * which is the whole reason the month picker exists.
   */
  const periodPayload =
    reportKind === 'monthly'
      ? { start: month.start, end: month.end }
      : reportKind === 'performance'
        ? { start: startDate, end: endDate }
        : reportingWeek(new Date(), preset === 'this-week');

  const prepare = async () => {
    if (previewLoading || creating || !rangeValid) return;
    const seq = ++prepareSeq.current;
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
    if (!preview || creating || !rangeValid) return;
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
      <ol aria-label="Report preparation progress" className="flex items-center gap-3 border-b border-border pb-3 text-xs">
        {['Select period', 'Review', 'Share'].map((label, step) => {
          const current = created ? 2 : preview ? 1 : 0;
          return <li key={label} aria-current={step === current ? 'step' : undefined} className={step === current ? 'font-semibold text-primary' : 'text-muted-foreground'}><span className="mr-1.5 tabular-nums">{step + 1}.</span>{label}</li>;
        })}
      </ol>
      <fieldset disabled={creating} className="min-w-0 space-y-4 disabled:opacity-60">
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
            { value: 'performance', label: 'Custom report' },
          ]}
          value={reportKind}
          onValueChange={(v) => {
            setReportKind(v);
            // Weekly gets the 7-day window back if the operator had wandered
            // off it. Monthly needs no preset at all: it picks a MONTH below
            // and always sends explicit first/last dates.
            if (v === 'weekly') setPreset('last-week');
          }}
        />
        {/* Say what the choice actually buys, because the two differ by one
            section each and nothing in the label conveys that. */}
        <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
          {reportKind === 'weekly'
            ? 'Performance changes and the creators driving them. '
            : reportKind === 'monthly' ? 'Monthly performance and contracted versus delivered posts.' : 'Performance across your chosen dates; no calendar-month delivery comparison.'}
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
            <ChoiceMenu compact label="Reporting month" value={monthKey} disabled={creating} onChange={setMonthKey} options={months.map(m => ({ value: m.key, label: `${m.label}${m.partial ? ' (so far)' : ''}` }))} />
            <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
              {month.partial
                ? `${month.start} to ${month.end}, the month so far. The report says so and states the days elapsed; post targets are not pro-rated.`
                : `${month.start} to ${month.end}, a complete month.`}
            </p>
          </>
        ) : reportKind === 'weekly' ? (
        <SegmentedControl<PeriodPreset>
          ariaLabel="Reporting period"
          size="sm"
          className={SEG_FULL}
          options={[
            { value: 'last-week', label: 'Last complete week' },
            { value: 'this-week', label: 'This week so far' },
          ]}
          value={preset}
          onValueChange={setPreset}
        />
        ) : null}
        {reportKind === 'weekly' && <p className="mt-2 text-xs text-muted-foreground">{periodPayload.start} – {periodPayload.end} · Monday–Sunday{preset === 'this-week' ? ' (partial week)' : ''}</p>}
        {reportKind === 'performance' && (
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

      <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={prepare} disabled={previewLoading || !rangeValid}>
        {previewLoading ? <><Loader2 className="animate-spin" />Preparing…</> : <><Wand2 />Prepare preview</>}
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
          <p className="text-xs text-muted-foreground">Saved as a snapshot. No message has been sent to the client.</p>
          <a href={`${created.url}?preview=1`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary"><ExternalLink className="h-3.5 w-3.5" />Review saved report</a>
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

      </fieldset>
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

