'use client';

/**
 * Create panel for the Outbox — the one place reports get made. Three modes:
 *
 *  - Client report: prepare a preview (headline numbers + drafted notes) via
 *    POST /api/client-reports/preview, then POST /api/client-reports to mint
 *    a share link, copy it, and refresh the sent feed.
 *  - Creator post: the Daily Drop / What's Cooking / Who's Cooking generator
 *    (GET /api/discord-posts) with the Discord/Slack preview. Copying the text
 *    logs a manual send to POST /api/report-log (fire-and-forget) so it lands
 *    in the feed.
 *  - Weekly KPI: the client-requested five-section weekly report
 *    (GET /api/weekly-kpi). Numbers are generated; the two narrative sections
 *    are typed by the operator before copying. Deliberately manual — there is
 *    no schedule behind it, because sections 4 and 5 have no data source.
 *
 * Every fetch is res.ok-guarded; failures render inline pulse-neg text, never
 * a silently-empty success state.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Clipboard, Link2, Loader2, Wand2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SegmentedControl } from '@/components/ui/segmented';
import {
  buildWeeklyKpiSlack,
  buildWeeklyKpiDiscord,
  incompleteWindowNote,
  money as kpiMoney,
  type WeeklyKpiData,
  type Delta,
} from '@/lib/data/weekly-kpi-format';
import { useBrandSelect, BrandListWarning } from './use-report-brands';
import { MessagePreview, toSlackFormat } from './message-preview';

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

type CreateMode = 'client' | 'post' | 'weekly';

export function CreatePanel({ onSent }: { onSent: () => void }) {
  const [mode, setMode] = useState<CreateMode>('client');

  // All three forms stay mounted so switching modes never throws away a
  // prepared preview, a generated post, or half-typed narrative sections —
  // only visibility toggles.
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-base font-bold tracking-tight text-foreground">Create</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Share a report link, drop a post for your creators, or write the weekly client update.
        </p>
      </div>
      <div className="space-y-4 p-5">
        <SegmentedControl<CreateMode>
          ariaLabel="What to create"
          className={SEG_FULL}
          options={[
            { value: 'client', label: 'Client report' },
            { value: 'post', label: 'Creator post' },
            { value: 'weekly', label: 'Weekly KPI' },
          ]}
          value={mode}
          onValueChange={setMode}
        />
        <div className={mode === 'client' ? undefined : 'hidden'}>
          <ClientReportForm onSent={onSent} />
        </div>
        <div className={mode === 'post' ? undefined : 'hidden'}>
          <CreatorPostForm onSent={onSent} />
        </div>
        <div className={mode === 'weekly' ? undefined : 'hidden'}>
          <WeeklyKpiForm onSent={onSent} />
        </div>
      </div>
    </Card>
  );
}

// ── Client report — prepare, edit notes, create link ────────────────
type PeriodPreset = '7d' | '30d' | 'custom';

interface PreviewData {
  periodLabel: string;
  headline: { gmv: number; activeCreators: number; managedPct: number };
  draftNotes: string;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function ClientReportForm({ onSent }: { onSent: () => void }) {
  const { brand, setBrand, options: brandOptions, error: brandsError } =
    useBrandSelect({ collapseUmbrella: true });

  const [preset, setPreset] = useState<PeriodPreset>('7d');
  const [startDate, setStartDate] = useState(() => new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const today = new Date().toISOString().slice(0, 10);
  const rangeValid = preset !== 'custom' || startDate <= endDate;

  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [notes, setNotes] = useState('');
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
  const periodPayload = preset === 'custom' ? { start: startDate, end: endDate } : preset;

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
        body: JSON.stringify({ brand, period: periodPayload, notes }),
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
      <div>
        <Label htmlFor="cr-brand">Brand</Label>
        <Select id="cr-brand" value={brand} onChange={e => setBrand(e.target.value)}>
          {brandOptions.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
        </Select>
        <BrandListWarning show={brandsError} />
      </div>

      <div>
        <Label>Reporting period</Label>
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
        {preset === 'custom' && (
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
        <strong>{isNum(headline.activeCreators) ? headline.activeCreators.toLocaleString('en-US') : '—'}</strong> active creators
        <span className="text-muted-foreground"> · </span>
        <strong>{isNum(headline.managedPct) ? `${Math.round(headline.managedPct)}%` : '—'}</strong> managed
      </div>
    </div>
  );
}

// ── Creator post — Daily Drop / What's Cooking / Who's Cooking ──────
type PostType = 'daily-drop' | 'whats-cooking' | 'whos-cooking';

const POST_TYPE_OPTIONS: { value: PostType; label: string }[] = [
  { value: 'daily-drop', label: 'Daily Drop' },
  { value: 'whats-cooking', label: "What's Cooking?" },
  { value: 'whos-cooking', label: "Who's Cooking?" },
];

const POST_TYPE_HINTS: Record<PostType, string> = {
  'daily-drop': "Yesterday's numbers at a glance.",
  'whats-cooking': 'Top performing videos of the period.',
  'whos-cooking': 'Top creators leaderboard.',
};

function CreatorPostForm({ onSent }: { onSent: () => void }) {
  const { brand, setBrand, options: brandOptions, error: brandsError } =
    useBrandSelect({ collapseUmbrella: true });

  const [type, setType] = useState<PostType>('daily-drop');
  const [period, setPeriod] = useState<'7d' | '30d'>('7d');
  const [destination, setDestination] = useState<'discord' | 'slack'>('discord');
  const [boardFormat, setBoardFormat] = useState<'highlights' | 'classic'>('highlights');

  const [text, setText] = useState<string | null>(null);
  // Server-built Slack rendition (real @handles, Slack link syntax). The
  // client-side toSlackFormat fallback is LOSSY — it turns every Discord
  // mention into the literal '@user' — so it's only used for post types the
  // API doesn't return slackText for yet (whats-cooking).
  const [slackText, setSlackText] = useState<string | null>(null);
  const [stats, setStats] = useState<{ totalGmv: number; videoCount: number; creatorCount: number } | null>(null);
  const [mentionMap, setMentionMap] = useState<Record<string, string>>({});
  // What the current preview was generated FOR — the copy log records these,
  // never the live selects (a mid-flight selection change must not misfile
  // the feed row).
  const [generated, setGenerated] = useState<{ type: PostType; brand: string; period: '7d' | '30d'; format: 'highlights' | 'classic' } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Staleness guard, same reason as the client-report form: a slow generate
  // must not repopulate the pane after the operator switched selections.
  const genSeq = useRef(0);

  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  // A generated preview describes one (type, brand, period, board) combo —
  // changing any of them invalidates it. Destination is display-only (both
  // renditions come from the same generate), so it does NOT reset.
  useEffect(() => {
    genSeq.current += 1;
    setText(null);
    setSlackText(null);
    setStats(null);
    setGenerated(null);
    setError(null);
  }, [type, brand, period, boardFormat]);

  const showPeriod = type !== 'daily-drop';
  const displayText = text === null
    ? null
    : destination === 'slack' ? (slackText ?? toSlackFormat(text, mentionMap)) : text;

  const generate = async () => {
    const seq = genSeq.current;
    setGenerating(true);
    setError(null);
    try {
      const params = new URLSearchParams({ type, brand, period });
      if (type === 'whos-cooking') params.set('format', boardFormat);
      const res = await fetch(`/api/discord-posts?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (seq !== genSeq.current) return; // selection changed mid-flight
      setText(data.text);
      setSlackText(typeof data.slackText === 'string' ? data.slackText : null);
      setStats(data.stats ?? null);
      setMentionMap(data.mentionMap || {});
      setGenerated({ type, brand, period, format: boardFormat });
    } catch (err) {
      if (seq !== genSeq.current) return;
      setError(err instanceof Error ? err.message : 'Failed to generate post');
    } finally {
      if (seq === genSeq.current) setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!displayText) return;
    try {
      await navigator.clipboard.writeText(displayText);
    } catch {
      setError('Copy failed: clipboard access blocked. Select and copy manually from the preview.');
      return;
    }
    setError(null);
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);

    // Log the manual send so it lands in the sent feed. Fire-and-forget: a
    // failed log write must never block the copy the user just made. Logs the
    // GENERATED selection, not the live selects.
    const g = generated ?? { type, brand, period, format: boardFormat };
    const periodLabel = g.type === 'daily-drop'
      ? 'Yesterday'
      : g.period === '7d' ? 'Last 7 days' : 'Last 30 days';
    fetch('/api/report-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reportType: g.type,
        format: g.type === 'whos-cooking' ? g.format : null,
        brand: g.brand,
        periodLabel,
        destination: 'manual',
      }),
    })
      .then((res) => { if (res.ok) onSent(); })
      .catch(() => {});
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="cp-type">Post</Label>
        <Select id="cp-type" value={type} onChange={e => setType(e.target.value as PostType)}>
          {POST_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <p className="mt-1.5 text-[11px] text-muted-foreground">{POST_TYPE_HINTS[type]}</p>
      </div>

      <div>
        <Label htmlFor="cp-brand">Brand</Label>
        <Select id="cp-brand" value={brand} onChange={e => setBrand(e.target.value)}>
          {brandOptions.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
        </Select>
        <BrandListWarning show={brandsError} />
      </div>

      {showPeriod && (
        <div>
          <Label>Period</Label>
          <SegmentedControl<'7d' | '30d'>
            ariaLabel="Post period"
            size="sm"
            className={SEG_FULL}
            options={[{ value: '7d', label: 'Last 7d' }, { value: '30d', label: 'Last 30d' }]}
            value={period}
            onValueChange={setPeriod}
          />
        </div>
      )}

      {type === 'whos-cooking' && (
        <div>
          <Label>Board format</Label>
          <SegmentedControl<'highlights' | 'classic'>
            ariaLabel="Board format"
            size="sm"
            className={SEG_FULL}
            options={[
              { value: 'highlights', label: 'Highlights' },
              { value: 'classic', label: 'Classic board' },
            ]}
            value={boardFormat}
            onValueChange={setBoardFormat}
          />
        </div>
      )}

      <div>
        <Label>Send to</Label>
        <SegmentedControl<'discord' | 'slack'>
          ariaLabel="Message format"
          size="sm"
          className={SEG_FULL}
          options={[{ value: 'discord', label: 'Discord' }, { value: 'slack', label: 'Slack' }]}
          value={destination}
          onValueChange={setDestination}
        />
      </div>

      <Button size="lg" className="w-full" onClick={generate} disabled={generating}>
        {generating ? <><Loader2 className="animate-spin" />Generating…</> : 'Generate'}
      </Button>

      {stats && (
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span><strong className="text-foreground">{formatCurrency(stats.totalGmv)}</strong> GMV</span>
          <span><strong className="text-foreground">{stats.videoCount}</strong> videos</span>
          <span><strong className="text-foreground">{stats.creatorCount}</strong> creators</span>
        </div>
      )}

      {displayText && (
        <MessagePreview
          destination={destination}
          text={displayText}
          mentionMap={mentionMap}
          copied={copied}
          onCopy={handleCopy}
        />
      )}

      {error && <InlineError>{error}</InlineError>}

      {displayText && (
        <Button
          size="lg"
          className="w-full"
          onClick={handleCopy}
          // The primary gradient is a background-image; flip to the solid pos
          // token via inline style for the copied confirmation flash.
          style={copied ? { backgroundImage: 'none', backgroundColor: 'var(--pulse-pos)' } : undefined}
        >
          {copied ? <><Check />Copied</> : <><Clipboard />Copy to Clipboard</>}
        </Button>
      )}
    </div>
  );
}

// ── Weekly KPI — the client-requested five-section weekly report ────
//
// Sections 1-3 are generated. Sections 4 and 5 are typed here before copying:
// creator complaints and campaign blockers have no source table, so the panel
// asks for them rather than emitting a confident "none".

/** Arrow + percentage for a period-over-period move. A null pct means the
 *  prior window was zero, so there is no percentage to state. */
function DeltaChip({ d }: { d: Delta }) {
  if (d.pct === null) {
    return <span className="text-[var(--pulse-pos)]">new</span>;
  }
  if (d.abs === 0 && d.pct === 0) {
    return <span className="text-muted-foreground">flat</span>;
  }
  const up = d.abs >= 0;
  return (
    <span className={up ? 'text-[var(--pulse-pos)]' : 'text-[var(--pulse-neg)]'}>
      {up ? '▲' : '▼'} {Math.abs(d.pct).toFixed(1)}%
    </span>
  );
}

/** One "Store / Creators Corner" metric row in the generated summary. When the
 *  brand has nobody signed, the managed side says so instead of showing a $0
 *  that would read as a performance result. */
function KpiRow({
  label, storeValue, storeDelta, managedValue, managedDelta, noRoster,
}: {
  label: string;
  storeValue: string;
  storeDelta: Delta;
  managedValue: string;
  managedDelta: Delta;
  noRoster: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted-foreground">Store</span>
        <span className="flex items-baseline gap-1.5">
          <strong className="text-foreground">{storeValue}</strong>
          <span className="text-[11px]"><DeltaChip d={storeDelta} /></span>
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted-foreground">Creators Corner</span>
        {noRoster ? (
          <span className="text-[11px] text-muted-foreground">no signed creators</span>
        ) : (
          <span className="flex items-baseline gap-1.5">
            <strong className="text-foreground">{managedValue}</strong>
            <span className="text-[11px]"><DeltaChip d={managedDelta} /></span>
          </span>
        )}
      </div>
    </div>
  );
}

function WeeklyKpiForm({ onSent }: { onSent: () => void }) {
  const { brand, setBrand, options: brandOptions, error: brandsError } =
    useBrandSelect({ collapseUmbrella: true });

  const [preset, setPreset] = useState<PeriodPreset>('7d');
  const [startDate, setStartDate] = useState(() => new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const today = new Date().toISOString().slice(0, 10);
  const rangeValid = preset !== 'custom' || startDate <= endDate;

  const [data, setData] = useState<WeeklyKpiData | null>(null);
  const [creatorUpdates, setCreatorUpdates] = useState('');
  const [campaignBlockers, setCampaignBlockers] = useState('');
  const [destination, setDestination] = useState<'slack' | 'discord'>('slack');
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Same staleness guard as the other two forms: a slow generate must not
  // repopulate the pane (and overwrite typed notes) after the operator
  // switched brand or period.
  const genSeq = useRef(0);

  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  // Changing brand or period invalidates the generated numbers AND the drafted
  // creator-updates text, which describes the old selection. Blockers are
  // cleared too rather than silently carried onto a different brand's report.
  useEffect(() => {
    genSeq.current += 1;
    setData(null);
    setCreatorUpdates('');
    setCampaignBlockers('');
    setError(null);
  }, [brand, preset, startDate, endDate]);

  const generate = async () => {
    const seq = genSeq.current;
    setGenerating(true);
    setError(null);
    try {
      const params = new URLSearchParams({ brand, period: preset });
      if (preset === 'custom') { params.set('start', startDate); params.set('end', endDate); }
      const res = await fetch(`/api/weekly-kpi?${params.toString()}`);
      const body = await res.json().catch(() => ({}));
      if (seq !== genSeq.current) return; // selection changed mid-flight
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      if (!body.data) throw new Error('The server did not return report data.');
      setData(body.data as WeeklyKpiData);
      setCreatorUpdates(typeof body.prefill?.creatorUpdates === 'string' ? body.prefill.creatorUpdates : '');
    } catch (err) {
      if (seq !== genSeq.current) return;
      setError(err instanceof Error ? err.message : 'Failed to generate the weekly report');
    } finally {
      if (seq === genSeq.current) setGenerating(false);
    }
  };

  const windowNote = useMemo(() => (data ? incompleteWindowNote(data) : null), [data]);

  const emptySections = useMemo(() => {
    const empty: string[] = [];
    if (!creatorUpdates.trim()) empty.push('Creator updates');
    if (!campaignBlockers.trim()) empty.push('Campaign blockers');
    return empty;
  }, [creatorUpdates, campaignBlockers]);

  // Rebuilt locally as the operator types, using the same builders the server
  // uses, so the preview is exactly what lands on the clipboard.
  const messageText = useMemo(() => {
    if (!data) return null;
    const notes = { creatorUpdates, campaignBlockers };
    return destination === 'slack'
      ? buildWeeklyKpiSlack(data, notes)
      : buildWeeklyKpiDiscord(data, notes);
  }, [data, creatorUpdates, campaignBlockers, destination]);

  const handleCopy = async () => {
    if (!messageText || !data) return;
    try {
      await navigator.clipboard.writeText(messageText);
    } catch {
      setError('Copy failed: clipboard access blocked. Select and copy manually from the preview.');
      return;
    }
    setError(null);
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);

    // Log the manual send so it lands in the sent feed. Fire-and-forget: a
    // failed log write must never block the copy the operator just made.
    fetch('/api/report-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reportType: 'weekly-kpi',
        format: null,
        brand: data.brandSlug,
        periodLabel: data.periodLabel,
        destination: 'manual',
      }),
    })
      .then((res) => { if (res.ok) onSent(); })
      .catch(() => {});
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="wk-brand">Brand</Label>
        <Select id="wk-brand" value={brand} onChange={e => setBrand(e.target.value)}>
          {brandOptions.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
        </Select>
        <BrandListWarning show={brandsError} />
      </div>

      <div>
        <Label>Reporting period</Label>
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
        {preset === 'custom' && (
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
        {preset !== 'custom' && (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Anchored to the latest uploaded day, not to today. The exact window shows below once generated.
          </p>
        )}
      </div>

      <Button size="lg" className="w-full" onClick={generate} disabled={generating || !rangeValid}>
        {generating ? <><Loader2 className="animate-spin" />Generating…</> : <><Wand2 />Generate</>}
      </Button>

      {data && windowNote && (
        <div className="flex items-start gap-2 rounded-lg bg-[var(--pulse-warn-bg)] px-3 py-2 text-xs text-[var(--pulse-warn)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{windowNote}</span>
        </div>
      )}

      {data && (
        <>
          <div className="space-y-3 rounded-xl border border-border bg-secondary/60 px-3.5 py-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
              {data.periodLabel} · vs {data.priorLabel}
            </div>
            <KpiRow
              label="Total GMV"
              storeValue={formatCurrency(data.gmv.store)}
              storeDelta={data.gmv.storeDelta}
              managedValue={formatCurrency(data.gmv.managed)}
              managedDelta={data.gmv.managedDelta}
              noRoster={data.rosterSize === 0}
            />
            <KpiRow
              label="Total SV (videos posted)"
              storeValue={data.sv.store.toLocaleString('en-US')}
              storeDelta={data.sv.storeDelta}
              managedValue={data.sv.managed.toLocaleString('en-US')}
              managedDelta={data.sv.managedDelta}
              noRoster={data.rosterSize === 0}
            />
            <div className="border-t border-border pt-2 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-muted-foreground">Added to roster</span>
                <strong className="text-foreground">
                  {data.rosterAdds.count.toLocaleString('en-US')}
                  {data.rosterAdds.retainerBudget > 0 && (
                    <span className="ml-1.5 font-semibold text-muted-foreground">
                      {kpiMoney(data.rosterAdds.retainerBudget)}/mo
                    </span>
                  )}
                </strong>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="wk-updates" className="mb-0">4. Creator updates</Label>
              <span className="text-[10.5px] text-muted-foreground">drafted, edit freely</span>
            </div>
            <Textarea
              id="wk-updates"
              className="mt-1.5"
              rows={5}
              maxLength={4000}
              value={creatorUpdates}
              onChange={e => setCreatorUpdates(e.target.value)}
            />
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="wk-blockers" className="mb-0">5. Campaign blockers</Label>
              <span className="text-[10.5px] text-muted-foreground">yours to write</span>
            </div>
            <Textarea
              id="wk-blockers"
              className="mt-1.5"
              rows={4}
              maxLength={4000}
              value={campaignBlockers}
              onChange={e => setCampaignBlockers(e.target.value)}
              placeholder="Brand, management, operational or organizational issues that could affect performance. Nothing in the data knows about these."
            />
          </div>

          <div>
            <Label>Send to</Label>
            <SegmentedControl<'slack' | 'discord'>
              ariaLabel="Message format"
              size="sm"
              className={SEG_FULL}
              options={[{ value: 'slack', label: 'Slack' }, { value: 'discord', label: 'Discord' }]}
              value={destination}
              onValueChange={setDestination}
            />
          </div>
        </>
      )}

      {/* An empty narrative section renders as "nothing to report", which is a
          claim the operator is making, not one the data supports. Say so before
          it goes to a client rather than letting the default pass silently. */}
      {data && emptySections.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-[var(--pulse-warn-bg)] px-3 py-2 text-xs text-[var(--pulse-warn)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {emptySections.join(' and ')} {emptySections.length === 1 ? 'is' : 'are'} empty, so the
            report will tell the client there is nothing to report. Fill in anything that belongs there.
          </span>
        </div>
      )}

      {messageText && (
        <MessagePreview
          destination={destination}
          text={messageText}
          mentionMap={{}}
          copied={copied}
          onCopy={handleCopy}
        />
      )}

      {error && <InlineError>{error}</InlineError>}

      {messageText && (
        <Button
          size="lg"
          className="w-full"
          onClick={handleCopy}
          style={copied ? { backgroundImage: 'none', backgroundColor: 'var(--pulse-pos)' } : undefined}
        >
          {copied ? <><Check />Copied</> : <><Clipboard />Copy to Clipboard</>}
        </Button>
      )}
    </div>
  );
}
