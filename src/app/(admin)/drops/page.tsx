'use client';

/**
 * Drops — selected Discord post formats, with independent progress and results.
 *
 * Replaces the Create panel's "Creator post" mode, which was a dropdown over
 * three of the seven formats that exist. The other four (Movers, Rookies,
 * Month to Date, Milestones) shipped and were never reachable. Worse, the
 * three that WERE reachable are the three that rank by absolute GMV, so the
 * same creators won every week and the feed read stale.
 *
 * Users choose formats; each selected format shows what it found independently.
 * Growth-ranked formats lead; size-ranked ones sit below them. A format with
 * nothing to say renders an empty card instead of being padded, and a format
 * that THREW renders an error card, because "broke" and "found nothing" must
 * never look the same.
 *
 * Copy only. The Discord bot has been down since March, so nothing here claims
 * to post for you.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, Clipboard, Clock3, Loader2, Sparkles } from 'lucide-react';
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
import { DROP_FORMATS, type DropFormat, type DropFormatId } from '@/lib/data/drop-formats';
import { DROP_SELECTION_KEY, loadDropBoard, parseDropSelection } from '@/lib/data/drop-board-client';
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
  const [selected, setSelected] = useState<DropFormatId[]>(() => DROP_FORMATS.map(f => f.id));
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [active, setActive] = useState<DropFormatId[]>([]);
  const selectedFormats = DROP_FORMATS.filter(f => selected.includes(f.id));

  useEffect(() => {
    try { setSelected(parseDropSelection(localStorage.getItem(DROP_SELECTION_KEY))); } catch { /* Storage may be unavailable. */ }
    setPreferencesReady(true);
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    try { localStorage.setItem(DROP_SELECTION_KEY, JSON.stringify(selected)); } catch { /* Selection still works without storage. */ }
  }, [selected, preferencesReady]);

  const [cards, setCards] = useState<DropCard[] | null>(null);
  const [meta, setMeta] = useState<{ brandName: string; rangeLabel: string; found: number; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A slow board must not repopulate after the operator changed brand or range.
  const runSeq = useRef(0);
  const request = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    if (!selected.length) return;
    const seq = ++runSeq.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);
    setCards([]);
    setMeta(null);
    setActive([]);
    try {
      const params = new URLSearchParams({ brand, period: preset });
      if (preset === 'custom') { params.set('start', startDate); params.set('end', endDate); }
      const completed = new Map<string, DropCard>();
      await loadDropBoard(params, controller.signal, (card, brandName, rangeLabel) => {
        if (seq !== runSeq.current) return;
        completed.set(card.id, card);
        setActive(previous => previous.filter(id => id !== card.id));
        const ordered = DROP_FORMATS.flatMap(f => completed.has(f.id) ? [completed.get(f.id)!] : []);
        setCards(ordered);
        setMeta(previous => ({
          brandName: brandName ?? previous?.brandName ?? brand,
          rangeLabel: rangeLabel ?? previous?.rangeLabel ?? '',
          found: ordered.filter(c => c.text !== null).length,
          total: selected.length,
        }));
      }, {
        formats: selected,
        onStart: id => { if (seq === runSeq.current) setActive(previous => [...previous, id]); },
      });
    } catch (err) {
      if (seq !== runSeq.current) return;
      setError(err instanceof Error ? err.message : 'Failed to build the board');
    } finally {
      if (seq === runSeq.current) setLoading(false);
    }
  }, [brand, preset, startDate, endDate, selected]);

  // Changing the selection invalidates the board it describes.
  useEffect(() => {
    runSeq.current += 1;
    request.current?.abort();
    setLoading(false);
    setActive([]);
    setCards(null);
    setMeta(null);
    setError(null);
    return () => { runSeq.current += 1; request.current?.abort(); };
  }, [brand, preset, startDate, endDate, selected]);

  const readyCount = cards?.filter(c => c.text !== null && !c.error).length ?? 0;
  const failedCount = cards?.filter(c => c.error).length ?? 0;
  const emptyCount = cards?.filter(c => c.text === null && !c.error).length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Creators"
        title="Discord Posts"
        subtitle="Choose the posts you need. Copy each one as soon as it’s ready."
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

          <Button size="lg" onClick={run} disabled={loading || !rangeValid || !selected.length || !preferencesReady}>
            {loading ? <><Loader2 className="animate-spin" />Building {cards?.length ?? 0}/{selected.length}</> : <><Sparkles />Build selected ({selected.length})</>}
          </Button>
        </div>

        <fieldset disabled={loading} className="mt-5 border-t border-border pt-4 disabled:opacity-70">
          <legend className="sr-only">Post formats</legend>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-foreground">Choose post formats</p>
              <p className="text-xs text-muted-foreground">{selected.length} selected · We’ll remember your choices in this browser.</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" type="button" onClick={() => setSelected(DROP_FORMATS.map(f => f.id))}>Select all</Button>
              <Button size="sm" variant="ghost" type="button" onClick={() => setSelected([])}>Clear</Button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {DROP_FORMATS.map(f => (
              <label key={f.id} className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring', selected.includes(f.id) ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-secondary/50', loading && 'cursor-wait')}>
                <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-primary" checked={selected.includes(f.id)}
                  onChange={e => setSelected(previous => e.target.checked ? [...previous, f.id] : previous.filter(id => id !== f.id))} />
                <span>
                  <span className="block text-xs font-semibold text-foreground">{f.label}</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">{f.what}</span>
                  {!f.acceptsWindow && <span className="mt-1 block text-[10px] text-muted-foreground">Uses its own window: {f.ownWindowLabel}</span>}
                </span>
              </label>
            ))}
          </div>
          {!selected.length && <p className="mt-3 text-xs text-muted-foreground">Select at least one format to build your board.</p>}
        </fieldset>

        {!rangeValid && (
          <p className="mt-2 text-[11px] text-[var(--pulse-neg)]">Start date must be on or before the end date.</p>
        )}

        {preset === 'custom' && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Daily Drop, Month to Date and Milestones ignore this range. Their windows are fixed by what they
            mean, and each card says which window it used.
          </p>
        )}

        {meta && <p className="mt-3 text-xs text-muted-foreground">{meta.brandName} · {meta.rangeLabel}</p>}
      </Card>

      {cards !== null && (
        <div role="status" aria-live="polite" className="rounded-xl border border-border bg-secondary/40 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            {loading ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
            {loading ? `Building your board · ${cards.length} of ${selected.length} checked` : 'Board finished'}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {readyCount} ready to copy · {emptyCount} with no results · {failedCount} failed
          </p>
          {loading && <>
            <progress aria-label="Board progress" className="mt-3 h-1.5 w-full accent-primary" value={cards.length} max={selected.length} />
            <p className="mt-2 text-xs text-muted-foreground">Some formats take longer. You can copy ready posts while the rest finish.</p>
          </>}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-[var(--pulse-neg-bg)] px-3 py-2 text-xs text-[var(--pulse-neg)]">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!loading && cards === null && !error && (
        <EmptyState
          icon={<Sparkles className="h-8 w-8" />}
          title="Nothing built yet"
          description="Choose your formats above, then build your board. Only selected formats will load."
        />
      )}

      {cards !== null && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {selectedFormats.map(f => {
            const card = cards.find(c => c.id === f.id);
            return card ? <DropTile key={f.id} card={card} brand={brand} />
              : loading ? <PendingDropTile key={f.id} format={f} active={active.includes(f.id)} /> : null;
          })}
        </div>
      )}
    </div>
  );
}

function PendingDropTile({ format, active }: { format: DropFormat; active: boolean }) {
  return (
    <Card aria-busy="true" className="flex min-h-[280px] flex-col overflow-hidden">
      <div className="space-y-1 border-b border-border px-4 py-3">
        <h3 className="text-sm font-bold text-foreground">{format.label}</h3>
        <p className="text-xs text-muted-foreground">{format.what}</p>
      </div>
      <div className="flex flex-1 flex-col justify-center gap-3 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {active ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Clock3 aria-hidden="true" className="h-4 w-4" />}
          {active ? 'Building this post…' : 'Waiting to start'}
        </div>
        <p className="text-xs text-muted-foreground">{active ? 'We’re gathering the results. Your post will appear here when it’s ready.' : 'This format is queued and will start automatically.'}</p>
        <div aria-hidden="true" className="mt-2 space-y-2"><Skeleton className="h-2 w-4/5" /><Skeleton className="h-2 w-3/5" /></div>
      </div>
    </Card>
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
