'use client';

/**
 * Contest builder — slide-over for creating a draft contest or editing an
 * existing draft. Save is deliberately a DRAFT save (POST /api/contests);
 * launching is a separate explicit action from the list, because launch
 * freezes the entrant list and deserves its own confirm.
 *
 * Mirrors the mockup's four steps: name & prizes, who competes, how it's
 * scored, window & announcements. Announce toggles persist now; delivery
 * arrives with the Discord bot revival (no delivery is built here).
 */

import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SegmentedControl } from '@/components/ui/segmented';
import { Switch } from '@/components/ui/switch';
import type { BrandListItem } from '@/hooks/use-brand-list';
import type { ContestRow } from '@/lib/contests/types';
import { placeLabel, RAFFLE_RULE_OPTIONS, SCORING_META, sortedPrizes } from './contest-meta';

export interface SegmentOption {
  id: string;
  name: string;
}

interface PlaceDraft {
  label: string;
  amount: string; // raw input; converted (or null) on save
}

type ScopeKind = ContestRow['scope_kind'];
type Scoring = ContestRow['scoring'];
type RaffleRule = NonNullable<ContestRow['raffle_entry_rule']>;

const SCORING_ORDER: Scoring[] = ['gmv', 'posts', 'raffle', 'manual'];

export function ContestBuilderSheet({
  contest,
  brands,
  segments,
  segmentsFailed,
  onClose,
  onSaved,
}: {
  /** Present = editing this draft; absent = creating a new one. */
  contest?: ContestRow;
  brands: BrandListItem[];
  segments: SegmentOption[];
  /** The segments fetch failed — the picker says so instead of listing nothing. */
  segmentsFailed: boolean;
  onClose: () => void;
  onSaved: (saved: ContestRow) => void;
}) {
  const [name, setName] = useState(contest?.name ?? '');
  const [scopeKind, setScopeKind] = useState<ScopeKind>(contest?.scope_kind ?? 'brand');
  const [brandSlug, setBrandSlug] = useState(contest?.brand_slug ?? '');
  const [segmentId, setSegmentId] = useState(contest?.segment_id ?? '');
  const [scoring, setScoring] = useState<Scoring>(contest?.scoring ?? 'gmv');
  const [raffleRule, setRaffleRule] = useState<RaffleRule>(contest?.raffle_entry_rule ?? 'per_posting_day');
  const [gmvStep, setGmvStep] = useState(String(contest?.raffle_gmv_step ?? 100));
  const [windowStart, setWindowStart] = useState(contest?.window_start?.slice(0, 10) ?? '');
  const [windowEnd, setWindowEnd] = useState(contest?.window_end?.slice(0, 10) ?? '');
  const [places, setPlaces] = useState<PlaceDraft[]>(() => {
    const existing = contest ? sortedPrizes(contest.prizes) : [];
    if (existing.length === 0) return [{ label: '', amount: '' }];
    return existing.map((p) => ({ label: p.label, amount: p.amount != null ? String(p.amount) : '' }));
  });
  const [announceDiscord, setAnnounceDiscord] = useState(contest?.announce_discord ?? false);
  const [announceWins, setAnnounceWins] = useState(contest?.announce_wins ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Full-draft snapshot for the unsaved-changes guard: captured once on mount
  // (the sheet unmounts on close, so mount = open) and compared on every close.
  const snapshot = () =>
    JSON.stringify({
      name, scopeKind, brandSlug, segmentId, scoring, raffleRule, gmvStep,
      windowStart, windowEnd, places, announceDiscord, announceWins,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-time baseline, deliberately frozen
  const initial = useMemo(snapshot, []);
  const dirty = snapshot() !== initial;

  const requestClose = () => {
    if (saving) return;
    if (dirty && !confirm('Discard this contest draft?')) return;
    onClose();
  };

  const setPlace = (i: number, patch: Partial<PlaceDraft>) =>
    setPlaces((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const addPlace = () => setPlaces((prev) => [...prev, { label: '', amount: '' }]);
  // Removal keeps places contiguous from 1 — position is derived from index.
  const removePlace = (i: number) => setPlaces((prev) => prev.filter((_, idx) => idx !== i));

  function validate(): string | null {
    if (!name.trim()) return 'Give the contest a name.';
    if (scopeKind === 'brand' && !brandSlug) return 'Pick the brand that competes.';
    if (scopeKind === 'segment' && !segmentId) return 'Pick the segment that competes.';
    if (!windowStart || !windowEnd) return 'Set the contest window (start and end).';
    if (windowEnd < windowStart) return 'The window ends before it starts.';
    for (let i = 0; i < places.length; i++) {
      if (!places[i].label.trim()) return `Give the ${placeLabel(i + 1)} place a prize label.`;
      if (places[i].amount.trim() && !Number.isFinite(Number(places[i].amount))) {
        return `The ${placeLabel(i + 1)} place cash amount isn't a number.`;
      }
    }
    if (scoring === 'raffle' && raffleRule === 'per_gmv_step') {
      const step = Number(gmvStep);
      if (!Number.isFinite(step) || step <= 0) return 'The GMV step must be a positive dollar amount.';
    }
    return null;
  }

  async function save() {
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    setError(null);
    const body = {
      name: name.trim(),
      scope_kind: scopeKind,
      brand_slug: scopeKind === 'brand' ? brandSlug : null,
      segment_id: scopeKind === 'segment' ? segmentId : null,
      scoring,
      raffle_entry_rule: scoring === 'raffle' ? raffleRule : null,
      raffle_gmv_step: scoring === 'raffle' && raffleRule === 'per_gmv_step' ? Number(gmvStep) : null,
      window_start: windowStart,
      window_end: windowEnd,
      prizes: places.map((p, i) => ({
        place: i + 1,
        label: p.label.trim(),
        amount: p.amount.trim() ? Number(p.amount) : null,
      })),
      announce_discord: announceDiscord,
      announce_wins: announceWins,
    };
    try {
      const res = await fetch(contest ? `/api/contests/${contest.id}` : '/api/contests', {
        method: contest ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Save failed (${res.status})`);
      onSaved(json.contest as ContestRow);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save the contest');
    } finally {
      setSaving(false);
    }
  }

  const stepCls = 'text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground';
  const hintCls = 'text-[11px] text-muted-foreground';

  return (
    <ModalOverlay onClose={requestClose} closeOnBackdropClick={false}>
      <div className="absolute inset-0 flex">
        <button aria-label="Close" className="flex-1 bg-black/30 backdrop-blur-sm" onClick={requestClose} />

        <div className="flex w-full max-w-md animate-in slide-in-from-right flex-col bg-card shadow-2xl duration-300">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-5">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                {contest ? 'Edit draft' : 'New contest'}
              </p>
              <h2 className="truncate text-lg font-extrabold text-foreground">
                {contest ? contest.name : 'Set up a contest'}
              </h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Saves as a draft — launching is a separate step and freezes the entrant list.
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={requestClose} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Form */}
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
            {/* ── 1 · Name & prizes ── */}
            <section className="space-y-3">
              <p className={stepCls}>1 · Name &amp; prizes</p>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. August GMV Sprint"
                autoFocus={!contest}
              />
              <div className="space-y-2">
                {places.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-8 shrink-0 text-xs font-bold tabular-nums text-muted-foreground">
                      {placeLabel(i + 1)}
                    </span>
                    <Input
                      value={p.label}
                      onChange={(e) => setPlace(i, { label: e.target.value })}
                      placeholder={i === 0 ? 'Prize label, e.g. $1,000' : 'e.g. $250'}
                      className="flex-1"
                    />
                    <div className="relative w-28 shrink-0">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">
                        $
                      </span>
                      <Input
                        value={p.amount}
                        onChange={(e) => setPlace(i, { amount: e.target.value })}
                        inputMode="decimal"
                        placeholder="cash"
                        aria-label={`${placeLabel(i + 1)} place cash amount`}
                        className="pl-6"
                      />
                    </div>
                    {places.length > 1 ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removePlace(i)}
                        aria-label={`Remove ${placeLabel(i + 1)} place`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      // Keep the row grid aligned when the remove button is hidden.
                      <span className="w-[34px] shrink-0" aria-hidden />
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addPlace}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> Add place
                </button>
                <p className={hintCls}>
                  Label is what creators see; the optional cash amount is what settling writes to the prize
                  ledger as owed.
                </p>
              </div>
            </section>

            {/* ── 2 · Who competes ── */}
            <section className="space-y-3">
              <p className={stepCls}>2 · Who competes</p>
              <SegmentedControl<ScopeKind>
                options={[
                  { value: 'brand', label: 'Brand' },
                  { value: 'segment', label: 'Segment' },
                  { value: 'all', label: 'Everyone' },
                ]}
                value={scopeKind}
                onValueChange={setScopeKind}
                ariaLabel="Contest audience"
              />
              {scopeKind === 'brand' && (
                <Select value={brandSlug} onChange={(e) => setBrandSlug(e.target.value)}>
                  <option value="">Pick a brand…</option>
                  {brands.map((b) => (
                    <option key={b.slug} value={b.slug}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              )}
              {scopeKind === 'segment' && (
                <>
                  <Select value={segmentId} onChange={(e) => setSegmentId(e.target.value)}>
                    <option value="">
                      {segmentsFailed ? 'Segments failed to load' : 'Pick a segment…'}
                    </option>
                    {segments.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                  {segmentsFailed && (
                    <p className="text-[11px] text-[var(--pulse-warn)]">
                      Couldn&apos;t load your segments — close and reopen to retry, or scope by brand.
                    </p>
                  )}
                </>
              )}
              {scopeKind === 'all' && <p className={hintCls}>Every managed creator across all brands competes.</p>}
            </section>

            {/* ── 3 · How it's scored ── */}
            <section className="space-y-3">
              <p className={stepCls}>3 · How it&apos;s scored</p>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Scoring mode">
                {SCORING_ORDER.map((mode) => {
                  const active = scoring === mode;
                  return (
                    <label
                      key={mode}
                      className={cn(
                        'block cursor-pointer rounded-xl border-2 p-2.5 transition-colors',
                        active ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/40',
                      )}
                    >
                      <input
                        type="radio"
                        className="sr-only"
                        name="scoring"
                        value={mode}
                        checked={active}
                        onChange={() => setScoring(mode)}
                      />
                      <span className={cn('block text-xs font-bold', active ? 'text-primary' : 'text-foreground')}>
                        {SCORING_META[mode].label}
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">
                        {SCORING_META[mode].description}
                      </span>
                    </label>
                  );
                })}
              </div>

              {scoring === 'raffle' && (
                <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
                  <p className="text-xs font-bold text-foreground">Entry rule</p>
                  <div className="space-y-1.5" role="radiogroup" aria-label="Raffle entry rule">
                    {RAFFLE_RULE_OPTIONS.map((opt) => {
                      const active = raffleRule === opt.value;
                      return (
                        <label key={opt.value} className="flex cursor-pointer items-center gap-2 text-[13px]">
                          <input
                            type="radio"
                            name="raffle_rule"
                            value={opt.value}
                            checked={active}
                            onChange={() => setRaffleRule(opt.value)}
                            className="h-3.5 w-3.5 accent-[var(--primary)]"
                          />
                          {opt.value === 'per_gmv_step' ? (
                            <span className="flex items-center gap-1.5">
                              1 entry per
                              <span className="relative inline-flex w-24">
                                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                  $
                                </span>
                                <Input
                                  value={gmvStep}
                                  onChange={(e) => setGmvStep(e.target.value)}
                                  inputMode="numeric"
                                  disabled={!active}
                                  aria-label="GMV dollars per entry"
                                  className="py-1 pl-5 pr-2 text-xs"
                                />
                              </span>
                              of GMV
                            </span>
                          ) : (
                            <span>{opt.label}</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                  <p className="rounded-lg border border-[var(--pulse-warn)]/30 bg-[var(--pulse-warn)]/10 px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">
                    Raffle contests launch and count entries now. The provable draw ships next phase — settle
                    stays disabled until it lands.
                  </p>
                </div>
              )}
            </section>

            {/* ── 4 · Window & announcements ── */}
            <section className="space-y-3">
              <p className={stepCls}>4 · Window &amp; announcements</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground" htmlFor="contest-window-start">
                    Starts
                  </label>
                  <Input
                    id="contest-window-start"
                    type="date"
                    value={windowStart}
                    onChange={(e) => setWindowStart(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground" htmlFor="contest-window-end">
                    Ends
                  </label>
                  <Input
                    id="contest-window-end"
                    type="date"
                    value={windowEnd}
                    onChange={(e) => setWindowEnd(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2.5 rounded-xl border border-border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">Discord announcement</p>
                    <p className="text-[11px] text-muted-foreground">Standings posts for this contest.</p>
                  </div>
                  <Switch
                    checked={announceDiscord}
                    onCheckedChange={setAnnounceDiscord}
                    aria-label="Discord announcement"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">#wins post</p>
                    <p className="text-[11px] text-muted-foreground">Winner announce in the brand&apos;s #wins channel.</p>
                  </div>
                  <Switch checked={announceWins} onCheckedChange={setAnnounceWins} aria-label="#wins post" />
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground/80">
                  These settings persist now; delivery arrives with the Discord bot revival.
                </p>
              </div>
            </section>

            {error && <p className="text-sm font-medium text-[var(--pulse-neg)]">{error}</p>}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
            <Button variant="ghost" onClick={requestClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : contest ? 'Save changes' : 'Save draft'}
            </Button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}
