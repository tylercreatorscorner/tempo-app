'use client';

/**
 * Drops — every Discord post format for one brand, run at once.
 *
 * Replaces the Create panel's "Creator post" mode, which was a dropdown over
 * three of the seven formats that exist. The other four (Movers, Rookies,
 * Month to Date, Milestones) shipped and were never reachable. Worse, the
 * three that WERE reachable are the three that rank by absolute GMV, so the
 * same creators won every week and the feed read stale.
 *
 * Running everything and showing what each format FOUND is the whole point.
 * Growth-ranked formats lead; size-ranked ones sit below them. A format with
 * nothing to say renders an empty card instead of being padded, and a format
 * that THREW renders an error card, because "broke" and "found nothing" must
 * never look the same.
 *
 * Copy only. The Discord bot has been down since March, so nothing here claims
 * to post for you.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, Clipboard, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { SegmentedControl } from '@/components/ui/segmented';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { DROP_FORMATS } from '@/lib/data/drop-formats';
import { useBrandSelect, BrandListWarning } from '../reporting/use-report-brands';
import { renderDiscordMarkdown } from '../reporting/message-preview';

interface DropCard {
  id: string;
  label: string;
  what: string;
  growthRanked: boolean;
  acceptsWindow: boolean;
  windowLabel: string;
  text: string | null;
  mentionMap: Record<string, string>;
  qualified: string | null;
  empty: boolean;
  error: string | null;
}

type Preset = '7d' | '30d' | 'custom';

export default function DropsPage() {
  const { brand, setBrand, options: brandOptions, error: brandsError } =
    useBrandSelect({ collapseUmbrella: true });

  const [preset, setPreset] = useState<Preset>('7d');
  const [startDate, setStartDate] = useState(() => new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const today = new Date().toISOString().slice(0, 10);
  const rangeValid = preset !== 'custom' || startDate <= endDate;

  const [cards, setCards] = useState<DropCard[] | null>(null);
  const [meta, setMeta] = useState<{ brandName: string; rangeLabel: string; found: number; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A slow board must not repopulate after the operator changed brand or range.
  const runSeq = useRef(0);

  const run = useCallback(async () => {
    const seq = ++runSeq.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ brand, period: preset });
      if (preset === 'custom') { params.set('start', startDate); params.set('end', endDate); }
      const res = await fetch(`/api/drops?${params.toString()}`);
      const body = await res.json().catch(() => ({}));
      if (seq !== runSeq.current) return;
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setCards(Array.isArray(body.cards) ? body.cards : []);
      setMeta({ brandName: body.brandName ?? '', rangeLabel: body.rangeLabel ?? '', found: body.found ?? 0, total: body.total ?? 0 });
    } catch (err) {
      if (seq !== runSeq.current) return;
      setError(err instanceof Error ? err.message : 'Failed to build the board');
    } finally {
      if (seq === runSeq.current) setLoading(false);
    }
  }, [brand, preset, startDate, endDate]);

  // Changing the selection invalidates the board it describes.
  useEffect(() => {
    runSeq.current += 1;
    setCards(null);
    setMeta(null);
    setError(null);
  }, [brand, preset, startDate, endDate]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Creators"
        title="Drops"
        subtitle="Every format at once. Take the ones that found something good."
      />

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px] flex-1">
            <Label htmlFor="dr-brand">Brand</Label>
            <Select id="dr-brand" value={brand} onChange={e => setBrand(e.target.value)}>
              {brandOptions.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </Select>
            <BrandListWarning show={brandsError} />
          </div>

          <div>
            <Label>Window</Label>
            <SegmentedControl<Preset>
              ariaLabel="Window"
              size="sm"
              options={[
                { value: '7d', label: 'Last 7d' },
                { value: '30d', label: 'Last 30d' },
                { value: 'custom', label: 'Custom' },
              ]}
              value={preset}
              onValueChange={setPreset}
            />
          </div>

          {preset === 'custom' && (
            <div className="flex items-end gap-2">
              <div>
                <Label htmlFor="dr-start">From</Label>
                <Input id="dr-start" type="date" value={startDate} max={endDate}
                  onChange={e => setStartDate(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="dr-end">To</Label>
                <Input id="dr-end" type="date" value={endDate} min={startDate} max={today}
                  onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>
          )}

          <Button size="lg" onClick={run} disabled={loading || !rangeValid}>
            {loading ? <><Loader2 className="animate-spin" />Building…</> : <><Sparkles />Build board</>}
          </Button>
        </div>

        {!rangeValid && (
          <p className="mt-2 text-[11px] text-[var(--pulse-neg)]">Start date must be on or before the end date.</p>
        )}

        {preset === 'custom' && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Daily Drop, Month to Date and Milestones ignore this range. Their windows are fixed by what they
            mean, and each card says which window it used.
          </p>
        )}

        {meta && !loading && (
          <p className="mt-3 text-xs text-muted-foreground">
            {meta.brandName} · {meta.rangeLabel} · <strong className="text-foreground">{meta.found}</strong> of {meta.total} formats found something
          </p>
        )}
      </Card>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-[var(--pulse-neg-bg)] px-3 py-2 text-xs text-[var(--pulse-neg)]">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[340px] rounded-xl" />)}
        </div>
      )}

      {!loading && cards === null && !error && (
        <EmptyState
          icon={<Sparkles className="h-8 w-8" />}
          title="Nothing built yet"
          description="Pick a brand and a window, then build the board. All seven formats run at once."
          action={
            <ul className="grid gap-x-8 gap-y-1.5 text-left sm:grid-cols-2">
              {DROP_FORMATS.map(f => (
                <li key={f.id} className="flex items-baseline gap-2 text-xs">
                  <span className="font-semibold text-foreground">{f.label}</span>
                  <span className="text-muted-foreground">{f.what}</span>
                </li>
              ))}
            </ul>
          }
        />
      )}

      {!loading && cards !== null && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map(c => <DropTile key={c.id} card={c} brand={brand} />)}
        </div>
      )}
    </div>
  );
}

function DropTile({ card, brand }: { card: DropCard; brand: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copyError, setCopyError] = useState(false);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = async () => {
    if (!card.text) return;
    try {
      await navigator.clipboard.writeText(card.text);
    } catch {
      setCopyError(true);
      return;
    }
    setCopyError(false);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);

    // Log the send so it stays in the outbox history. Fire-and-forget: a failed
    // log must never block the copy that just happened.
    fetch('/api/report-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reportType: card.id, format: null, brand,
        periodLabel: card.windowLabel, destination: 'manual',
      }),
    }).catch(() => {});
  };

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="space-y-1 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold tracking-tight text-foreground">{card.label}</h3>
          {card.growthRanked
            ? <Badge variant="positive" size="sm">Ranks by growth</Badge>
            : <Badge variant="neutral" size="sm">Ranks by size</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">{card.what}</p>
        <p className="text-[11px] text-muted-foreground">
          {!card.acceptsWindow && (
            <span className="font-semibold text-foreground">Own window: </span>
          )}
          {card.windowLabel}
          {card.qualified && <> · {card.qualified}</>}
        </p>
      </div>

      {card.error ? (
        // A format that broke must never read as a format that found nothing.
        <div className="flex flex-1 flex-col gap-1.5 bg-[var(--pulse-neg-bg)] px-4 py-5">
          <p className="text-xs font-bold text-[var(--pulse-neg)]">This format failed to build.</p>
          <p className="text-[11px] text-[var(--pulse-neg)]">{card.error}</p>
          <p className="text-[11px] text-muted-foreground">It found nothing because it errored, not because there was nothing.</p>
        </div>
      ) : card.text === null ? (
        <div className="flex flex-1 flex-col gap-1.5 bg-secondary/60 px-4 py-5">
          <p className="text-xs font-bold text-foreground">Nothing qualified this window.</p>
          <p className="text-[11px] text-muted-foreground">
            The card stays empty rather than reaching further back for something to say.
          </p>
        </div>
      ) : (
        <div className="max-h-[300px] flex-1 overflow-auto bg-[#36393f] p-4">
          <div className="whitespace-pre-wrap text-[12.5px] leading-[1.5rem] text-[#dcddde]">
            {renderDiscordMarkdown(card.text, card.mentionMap)}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
        {copyError && <span className="text-[11px] text-[var(--pulse-neg)]">Clipboard blocked, select the text above</span>}
        <span className="flex-1" />
        <Button
          size="sm"
          variant={card.text ? 'primary' : 'outline'}
          disabled={!card.text}
          onClick={copy}
          className={cn(!card.text && 'opacity-50')}
          style={copied ? { backgroundImage: 'none', backgroundColor: 'var(--pulse-pos)' } : undefined}
        >
          {copied ? <><Check />Copied</> : <><Clipboard />{card.text ? 'Copy' : 'Nothing to copy'}</>}
        </Button>
      </div>
    </Card>
  );
}
