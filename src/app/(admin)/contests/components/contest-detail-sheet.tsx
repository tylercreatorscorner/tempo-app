'use client';

/**
 * Contest detail — slide-over with live standings and the settle flow.
 *
 * Honesty rule (mockup): standings are only as fresh as the last data upload,
 * so the "Scored through {date}'s upload" line renders whenever standings do,
 * and the settle confirm restates the cutoff before anything is written.
 *
 * Settle paths:
 *  - gmv/posts: confirm restates cutoff + winners + prize dollars written as
 *    OWED to the prize ledger; a 409 (tie straddling the last prize) opens a
 *    tie-resolution picker and re-settles with an explicit winners array.
 *  - manual: the operator picks a winner per place from the entrant list.
 *  - raffle: settle is disabled — the provable draw ships next phase.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Trophy, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/format';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { TableLoadBar } from '@/components/ui/table-load-bar';
import { useDelayedFlag } from '@/hooks/use-delayed-flag';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import type { ContestDetail, ContestRow, StandingRow } from '@/lib/contests/types';
import {
  closesIn,
  displayDate,
  formatScore,
  placeLabel,
  raffleRuleLabel,
  sortedPrizes,
  todayIso,
  totalPrizeCash,
  windowEnded,
  windowLabel,
} from './contest-meta';

/** An entrant that can actually be submitted as a winner (id present). */
interface TieEntrant {
  creator_id: string;
  display_name: string;
  score: number;
}

interface TieState {
  /** The tied entrants competing for the ambiguous place(s). */
  tied: TieEntrant[];
  /** The prize places the tie left ambiguous — the ONLY places we override;
   *  the server assigns every other place from standings itself. */
  places: number[];
}

interface EntrantLite {
  creator_id: string | null;
  display_name: string;
  handles: string[];
}

type WinnerPick = { place: number; creator_id: string };

function rowKey(row: StandingRow): string {
  return row.creator_id ?? `${row.rank}:${row.display_name}`;
}

export function ContestDetailSheet({
  contestId,
  segmentName,
  onClose,
  onChanged,
}: {
  contestId: string;
  /** Resolves a segment id to its name (list already fetched by the caller). */
  segmentName: (id: string | null) => string;
  onClose: () => void;
  /** The contest changed server-side (settled) — caller should refetch its list. */
  onChanged: () => void;
}) {
  const brandMeta = useBrandMeta();
  const [detail, setDetail] = useState<ContestDetail | null>(null);
  // Manual-mode entrant identities, if the detail payload carries them (the
  // contract leaves manual standings null; probe an `entrants` field so the
  // winner picker lights up as soon as the API exposes one).
  const [extraEntrants, setExtraEntrants] = useState<EntrantLite[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const showBar = useDelayedFlag(loading);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [settling, setSettling] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);
  const [tie, setTie] = useState<TieState | null>(null);
  const [tiePicks, setTiePicks] = useState<string[]>([]);
  // Manual mode: place number -> creator_id.
  const [manualPicks, setManualPicks] = useState<Record<number, string>>({});

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/contests/${contestId}`, { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Load failed (${res.status})`);
      setDetail(json as ContestDetail);
      const probe = (
        json as { entrants?: Array<{ creator_id?: string | null; display_name?: string | null; handles?: string[] | null }> }
      ).entrants;
      setExtraEntrants(
        Array.isArray(probe)
          ? probe.map((e) => ({
              creator_id: e.creator_id ?? null,
              display_name: e.display_name || (e.handles?.[0] ? `@${e.handles[0]}` : 'Unknown creator'),
              handles: e.handles ?? [],
            }))
          : null,
      );
    } catch (e) {
      // Never render a load failure as an empty leaderboard — flag it.
      setLoadError(e instanceof Error ? e.message : 'Failed to load the contest');
    } finally {
      setLoading(false);
    }
  }, [contestId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const contest = detail?.contest ?? null;
  const prizes = useMemo(() => (contest ? sortedPrizes(contest.prizes) : []), [contest]);
  const standings = detail?.standings ?? null;
  const topScore = standings && standings.length > 0 ? Math.max(...standings.map((r) => r.score), 0) : 0;
  const today = todayIso();
  const ended = contest ? windowEnded(contest, today) : false;
  const isSettled = contest?.status === 'settled';
  const isDraft = contest?.status === 'draft';
  const isRaffle = contest?.scoring === 'raffle';
  const isManual = contest?.scoring === 'manual';

  // Manual winner picker source: standings when the API returns them for
  // manual, else the probed entrants field. Empty = the picker can't run yet.
  const manualEntrants: EntrantLite[] = useMemo(() => {
    if (!isManual) return [];
    if (standings && standings.length > 0) {
      return standings.map((r) => ({ creator_id: r.creator_id, display_name: r.display_name, handles: r.handles ?? [] }));
    }
    return extraEntrants ?? [];
  }, [isManual, standings, extraEntrants]);

  const scopeLabel = !contest
    ? ''
    : contest.scope_kind === 'brand'
      ? brandMeta.label(contest.brand_slug)
      : contest.scope_kind === 'segment'
        ? `Segment: ${segmentName(contest.segment_id)}`
        : 'All creators';

  // Auto winners (gmv/posts): the top N standings mapped onto the prize places.
  const autoWinners: Array<{ prize: ContestRow['prizes'][number]; row: StandingRow }> = useMemo(() => {
    if (!standings || isManual) return [];
    return prizes
      .map((prize, i) => ({ prize, row: standings[i] }))
      .filter((w): w is { prize: ContestRow['prizes'][number]; row: StandingRow } => !!w.row);
  }, [standings, prizes, isManual]);

  /**
   * Fallback tie detection when the 409 body doesn't carry usable data: the
   * boundary score is the one at the last prize place; every place holding it
   * is ambiguous. Rows without a creator_id can't be submitted as winners, so
   * they're excluded from the picker.
   */
  const computeTie = useCallback((): TieState | null => {
    const n = prizes.length;
    if (!standings || standings.length <= n || n === 0) return null;
    const boundaryScore = standings[n].score;
    if (standings[n - 1].score !== boundaryScore) return null;
    const places: number[] = [];
    for (let p = 1; p <= n; p++) {
      if (standings[p - 1].score === boundaryScore) places.push(p);
    }
    const tied = standings
      .filter((r) => r.score === boundaryScore)
      .map((r): TieEntrant | null =>
        r.creator_id ? { creator_id: r.creator_id, display_name: r.display_name, score: r.score } : null,
      )
      .filter((t): t is TieEntrant => t !== null);
    if (places.length === 0 || tied.length === 0) return null;
    return { tied, places };
  }, [standings, prizes]);

  const settle = useCallback(
    async (winners?: WinnerPick[]) => {
      setSettling(true);
      setSettleError(null);
      try {
        const res = await fetch(`/api/contests/${contestId}/settle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(winners && winners.length > 0 ? { winners } : {}),
        });
        const json = await res.json().catch(() => ({}));
        if (res.status === 409) {
          // Tie straddling the last prize. The body carries { places, tied };
          // fall back to computing both from the standings on screen.
          const computed = computeTie();
          const respTied: TieEntrant[] | null = Array.isArray(json.tied)
            ? (json.tied as Array<{ creator_id?: unknown; display_name?: unknown; score?: unknown }>)
                .filter((t) => t && typeof t.creator_id === 'string')
                .map((t) => ({
                  creator_id: t.creator_id as string,
                  display_name: typeof t.display_name === 'string' ? t.display_name : 'Unknown creator',
                  score: typeof t.score === 'number' ? t.score : Number(t.score ?? 0),
                }))
            : null;
          const respPlaces: number[] | null = Array.isArray(json.places)
            ? (json.places as unknown[]).filter((p): p is number => typeof p === 'number')
            : null;
          const tied = respTied && respTied.length > 0 ? respTied : computed?.tied ?? [];
          const places = respPlaces && respPlaces.length > 0 ? respPlaces : computed?.places ?? [];
          if (tied.length > 0 && places.length > 0) {
            setTie({ tied, places });
            setTiePicks([]);
            return;
          }
          throw new Error(json.error || 'A tie needs resolving, but the tied entrants could not be determined.');
        }
        if (!res.ok) throw new Error(json.error || `Settle failed (${res.status})`);
        setConfirmOpen(false);
        setTie(null);
        onChanged();
        await fetchDetail();
      } catch (e) {
        setSettleError(e instanceof Error ? e.message : 'Failed to settle the contest');
      } finally {
        setSettling(false);
      }
    },
    [contestId, computeTie, fetchDetail, onChanged],
  );

  const settleWithTiePicks = () => {
    if (!tie) return;
    // Override ONLY the ambiguous places — the server assigns every other
    // place from standings itself. Picked entrants keep their standings order.
    const pickedInOrder = tie.tied.filter((t) => tiePicks.includes(t.creator_id));
    const winners: WinnerPick[] = [];
    tie.places.forEach((place, i) => {
      const pick = pickedInOrder[i];
      if (pick) winners.push({ place, creator_id: pick.creator_id });
    });
    settle(winners);
  };

  const manualReady =
    prizes.length > 0 &&
    prizes.every((p) => manualPicks[p.place]) &&
    new Set(prizes.map((p) => manualPicks[p.place])).size === prizes.length;

  // The inner confirm/tie layer intercepts the sheet's close (Esc included) so
  // Esc peels one layer at a time instead of tearing the whole sheet down.
  const requestClose = () => {
    if (settling) return;
    if (tie) {
      setTie(null);
      return;
    }
    if (confirmOpen) {
      setConfirmOpen(false);
      return;
    }
    onClose();
  };

  const prizeCash = contest ? totalPrizeCash(contest.prizes) : 0;

  return (
    <ModalOverlay onClose={requestClose} closeOnBackdropClick={false}>
      <div className="absolute inset-0 flex">
        <button aria-label="Close" className="flex-1 bg-black/30 backdrop-blur-sm" onClick={requestClose} />

        <div className="relative flex w-full max-w-xl animate-in slide-in-from-right flex-col bg-card shadow-2xl duration-300">
          <TableLoadBar active={showBar} />

          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-5">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--pulse-warn)]/15 text-[var(--pulse-warn)]">
                <Trophy className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-extrabold text-foreground">
                  {contest ? contest.name : 'Contest'}
                </h2>
                {contest && (
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                    {scopeLabel} · {windowLabel(contest.window_start, contest.window_end)}
                    {!isSettled && !isDraft && (
                      ended ? (
                        <span className="font-semibold text-[var(--pulse-warn)]"> · ended — settle</span>
                      ) : (
                        closesIn(contest.window_end) && (
                          <span className="font-semibold text-[var(--pulse-pos)]">
                            {' '}· closes in {closesIn(contest.window_end)}
                          </span>
                        )
                      )
                    )}
                    {typeof contest.entrant_count === 'number' && ` · ${contest.entrant_count} entrants`}
                  </p>
                )}
                {isRaffle && contest && raffleRuleLabel(contest) && (
                  <p className="text-[11px] text-muted-foreground">{raffleRuleLabel(contest)}</p>
                )}
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={requestClose} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Body */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadError ? (
              <div className="p-6">
                <EmptyState
                  icon={<AlertTriangle className="h-8 w-8" />}
                  title="Couldn't load this contest"
                  description="This is a load error, not an empty leaderboard. Retry, or close and reopen."
                  action={
                    <Button variant="outline" onClick={fetchDetail}>
                      Retry
                    </Button>
                  }
                />
              </div>
            ) : !contest ? (
              <div className="space-y-2 p-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-9 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : (
              <>
                {/* Prize band */}
                <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3">
                  {prizes.map((p) => (
                    <Badge key={p.place} variant="warning" size="sm">
                      {placeLabel(p.place)} · {p.label}
                    </Badge>
                  ))}
                  {prizes.length === 0 && <span className="text-xs text-muted-foreground">No prizes attached</span>}
                </div>

                {/* Settled: final winners */}
                {isSettled && (
                  <div className="space-y-3 px-6 py-5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      Final winners
                    </p>
                    {(detail?.winners ?? []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">No winners were recorded.</p>
                    ) : (
                      <div className="divide-y divide-border rounded-xl border border-border">
                        {(detail?.winners ?? []).map((w) => {
                          const prize = prizes.find((p) => p.place === w.place);
                          return (
                            <div key={w.place} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                              <span className="w-8 shrink-0 font-extrabold tabular-nums text-[var(--pulse-warn)]">
                                {placeLabel(w.place)}
                              </span>
                              <span className="min-w-0 flex-1 truncate font-semibold text-foreground">
                                {w.display_name}
                              </span>
                              {w.score != null && (
                                <span className="tabular-nums text-muted-foreground">
                                  {formatScore(contest.scoring, w.score)}
                                </span>
                              )}
                              {prize && (
                                <Badge variant="warning" size="sm">
                                  {prize.label}
                                  {prize.amount != null && ` · ${formatCurrency(prize.amount)} owed`}
                                </Badge>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <p className="text-[11.5px] text-muted-foreground">
                      Settled{contest.settled_at ? ` ${displayDate(contest.settled_at)}` : ''}
                      {contest.settled_through && ` · scored through ${displayDate(contest.settled_through)}'s upload`}
                      {prizeCash > 0 && ` · ${formatCurrency(prizeCash)} written to the prize ledger as owed`}
                    </p>
                  </div>
                )}

                {/* Live/draft: standings (or the manual entrant picker) */}
                {!isSettled && (
                  <div className="px-6 py-5">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        {isManual ? 'Entrants & winner picker' : isRaffle ? 'Entries' : 'Standings'}
                      </p>
                      {/* The honesty line — whenever standings show, say the cutoff. */}
                      {!isDraft && detail?.scoredThrough && (
                        <p className="text-[11px] font-medium text-muted-foreground">
                          Scored through {displayDate(detail.scoredThrough)}&apos;s upload
                        </p>
                      )}
                    </div>

                    {isDraft ? (
                      <p className="text-sm text-muted-foreground">
                        Draft — standings appear once the contest is launched.
                      </p>
                    ) : isManual ? (
                      manualEntrants.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          The entrant list isn&apos;t available for this contest yet, so winners can&apos;t be
                          picked. Retry once the entrant read lands.
                        </p>
                      ) : (
                        <ManualPicker
                          entrants={manualEntrants}
                          prizes={prizes}
                          picks={manualPicks}
                          onPick={(place, creatorId) =>
                            setManualPicks((prev) => ({ ...prev, [place]: creatorId }))
                          }
                        />
                      )
                    ) : !standings || standings.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {detail?.scoredThrough
                          ? 'No scored activity in the window yet.'
                          : 'No upload has landed in this window yet — standings appear after the first data upload.'}
                      </p>
                    ) : (
                      <div className="divide-y divide-border rounded-xl border border-border">
                        {standings.map((row, i) => {
                          const prize = prizes[i];
                          const width = topScore > 0 ? Math.max((row.score / topScore) * 100, 2) : 2;
                          return (
                            <div key={rowKey(row)} className="flex items-center gap-3 px-4 py-2 text-[13px]">
                              <span
                                className={cn(
                                  'w-6 shrink-0 font-extrabold tabular-nums',
                                  prize ? 'text-[var(--pulse-warn)]' : 'text-muted-foreground/60',
                                )}
                              >
                                {row.rank}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-semibold text-foreground">
                                  {row.display_name}
                                </span>
                                {(row.handles ?? []).length > 0 && (
                                  <span className="block truncate text-[11px] text-muted-foreground">
                                    {(row.handles ?? []).map((h) => `@${h}`).join(' · ')}
                                  </span>
                                )}
                              </span>
                              {prize && (
                                <Badge variant="warning" size="sm" className="shrink-0">
                                  {prize.label}
                                </Badge>
                              )}
                              <span className="hidden h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-muted sm:block">
                                <span className="block h-full rounded-full bg-pulse-grad" style={{ width: `${width}%` }} />
                              </span>
                              <span className="w-24 shrink-0 text-right font-bold tabular-nums text-foreground">
                                {formatScore(contest.scoring, row.score)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer: the settle flow (live contests only) */}
          {contest && !isSettled && !isDraft && (
            <div className="border-t border-border px-6 py-4">
              {isRaffle ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11.5px] leading-snug text-muted-foreground">
                    Entries are counting now. The provable raffle draw ships next phase — settling a raffle is
                    disabled until then.
                  </p>
                  <Button disabled title="Raffle draw ships next phase">
                    Close &amp; settle
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11.5px] leading-snug text-muted-foreground">
                    {ended
                      ? 'The window has ended — settling confirms the winners and writes prize cash as owed to the prize ledger.'
                      : `Runs through ${displayDate(contest.window_end)} — settling now is early and final.`}
                  </p>
                  <Button
                    onClick={() => {
                      setSettleError(null);
                      setConfirmOpen(true);
                    }}
                    disabled={isManual ? !manualReady : autoWinners.length === 0}
                    variant={ended ? 'primary' : 'outline'}
                    title={
                      isManual && !manualReady
                        ? 'Pick a distinct winner for every place first'
                        : undefined
                    }
                  >
                    Close &amp; settle
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Confirm / tie overlay — layered inside the sheet, not a second portal. */}
          {contest && (confirmOpen || tie) && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 p-5 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
                {tie ? (
                  <TiePicker
                    contest={contest}
                    tie={tie}
                    picks={tiePicks}
                    onToggle={(id) =>
                      setTiePicks((prev) =>
                        prev.includes(id)
                          ? prev.filter((p) => p !== id)
                          : prev.length < tie.places.length
                            ? [...prev, id]
                            : prev,
                      )
                    }
                    error={settleError}
                    settling={settling}
                    onCancel={() => setTie(null)}
                    onConfirm={settleWithTiePicks}
                  />
                ) : (
                  <>
                    <h3 className="text-base font-extrabold text-foreground">Close &amp; settle {contest.name}?</h3>
                    <div className="mt-3 space-y-2 text-[13px] text-muted-foreground">
                      {!ended && (
                        <p className="flex items-start gap-2 rounded-lg border border-[var(--pulse-warn)]/30 bg-[var(--pulse-warn)]/10 px-3 py-2 text-foreground">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--pulse-warn)]" />
                          <span>
                            Early settle: the window runs through {displayDate(contest.window_end)}. Settling now is
                            final and later uploads won&apos;t count.
                          </span>
                        </p>
                      )}
                      <p>
                        Scores through{' '}
                        <b className="text-foreground">
                          {detail?.scoredThrough ? `${displayDate(detail.scoredThrough)}'s upload` : 'the latest upload'}
                        </b>
                        . Winners lock as:
                      </p>
                      <div className="divide-y divide-border rounded-xl border border-border">
                        {(isManual
                          ? prizes.map((prize) => ({
                              prize,
                              name:
                                manualEntrants.find((r) => r.creator_id === manualPicks[prize.place])
                                  ?.display_name ?? '—',
                              score: null as number | null,
                            }))
                          : autoWinners.map(({ prize, row }) => ({
                              prize,
                              name: row.display_name,
                              score: row.score as number | null,
                            }))
                        ).map(({ prize, name, score }) => (
                          <div key={prize.place} className="flex items-center gap-2 px-3 py-2">
                            <span className="w-8 shrink-0 font-extrabold tabular-nums text-[var(--pulse-warn)]">
                              {placeLabel(prize.place)}
                            </span>
                            <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{name}</span>
                            {score != null && (
                              <span className="tabular-nums">{formatScore(contest.scoring, score)}</span>
                            )}
                            <span className="shrink-0 font-bold text-[var(--pulse-warn)]">
                              {prize.label}
                              {prize.amount != null && ` (${formatCurrency(prize.amount)})`}
                            </span>
                          </div>
                        ))}
                      </div>
                      <p>
                        {prizeCash > 0 ? (
                          <>
                            Writes <b className="text-foreground">{formatCurrency(prizeCash)}</b> as{' '}
                            <b className="text-foreground">owed</b> to the prize ledger.
                          </>
                        ) : (
                          'No cash amounts are attached to the prizes — nothing is written to the prize ledger.'
                        )}
                        {contest.announce_wins && ' The #wins announce is saved and posts when the bot revival lands.'}
                      </p>
                    </div>
                    {settleError && (
                      <p className="mt-3 text-[13px] font-medium text-[var(--pulse-neg)]">{settleError}</p>
                    )}
                    <div className="mt-4 flex items-center justify-end gap-2">
                      <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={settling}>
                        Cancel
                      </Button>
                      <Button
                        onClick={() =>
                          settle(
                            isManual
                              ? prizes.map((p) => ({ place: p.place, creator_id: manualPicks[p.place] }))
                              : undefined,
                          )
                        }
                        disabled={settling}
                      >
                        {settling ? 'Settling…' : 'Settle contest'}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}

function ManualPicker({
  entrants,
  prizes,
  picks,
  onPick,
}: {
  entrants: EntrantLite[];
  prizes: ContestRow['prizes'];
  picks: Record<number, string>;
  onPick: (place: number, creatorId: string) => void;
}) {
  const chosen = new Set(Object.values(picks).filter(Boolean));
  // Only entrants with a creator identity can be written as winners.
  const selectable = entrants.filter((e): e is EntrantLite & { creator_id: string } => !!e.creator_id);
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {prizes.map((prize) => (
          <div key={prize.place} className="flex items-center gap-3">
            <span className="w-8 shrink-0 text-xs font-extrabold tabular-nums text-[var(--pulse-warn)]">
              {placeLabel(prize.place)}
            </span>
            <Select
              value={picks[prize.place] ?? ''}
              onChange={(e) => onPick(prize.place, e.target.value)}
              aria-label={`${placeLabel(prize.place)} place winner`}
            >
              <option value="">Pick the {placeLabel(prize.place)}-place winner…</option>
              {selectable.map((row) => (
                <option
                  key={row.creator_id}
                  value={row.creator_id}
                  disabled={chosen.has(row.creator_id) && picks[prize.place] !== row.creator_id}
                >
                  {row.display_name}
                  {row.handles.length > 0 ? ` (@${row.handles[0]})` : ''}
                </option>
              ))}
            </Select>
            <span className="shrink-0 text-xs font-bold text-[var(--pulse-warn)]">{prize.label}</span>
          </div>
        ))}
      </div>
      <div className="divide-y divide-border rounded-xl border border-border">
        {entrants.map((row, i) => (
          <div key={row.creator_id ?? `e${i}`} className="flex items-center gap-3 px-4 py-2 text-[13px]">
            <span
              className={cn(
                'min-w-0 flex-1 truncate font-semibold',
                row.creator_id && chosen.has(row.creator_id) ? 'text-primary' : 'text-foreground',
              )}
            >
              {row.display_name}
            </span>
            {row.handles.length > 0 && (
              <span className="truncate text-[11px] text-muted-foreground">
                {row.handles.map((h) => `@${h}`).join(' · ')}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TiePicker({
  contest,
  tie,
  picks,
  onToggle,
  error,
  settling,
  onCancel,
  onConfirm,
}: {
  contest: ContestRow;
  tie: TieState;
  picks: string[];
  onToggle: (creatorId: string) => void;
  error: string | null;
  settling: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const slots = tie.places.length;
  const ready = picks.length === slots;
  const placeList = tie.places.map(placeLabel).join(', ');
  return (
    <>
      <h3 className="text-base font-extrabold text-foreground">Tie at the last prize</h3>
      <p className="mt-2 text-[13px] text-muted-foreground">
        {tie.tied.length} creators are tied at{' '}
        <b className="text-foreground">{formatScore(contest.scoring, tie.tied[0]?.score ?? 0)}</b> for{' '}
        {slots === 1 ? `the ${placeList} place` : `places ${placeList}`}. Pick{' '}
        {slots === 1 ? 'who takes it' : `the ${slots} who take them`}.
      </p>
      <div className="mt-3 divide-y divide-border rounded-xl border border-border">
        {tie.tied.map((t) => {
          const checked = picks.includes(t.creator_id);
          return (
            <label key={t.creator_id} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-[13px]">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(t.creator_id)}
                className="h-3.5 w-3.5 accent-[var(--primary)]"
              />
              <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{t.display_name}</span>
              <span className="tabular-nums text-muted-foreground">{formatScore(contest.scoring, t.score)}</span>
            </label>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {picks.length} of {slots} picked.
      </p>
      {error && <p className="mt-2 text-[13px] font-medium text-[var(--pulse-neg)]">{error}</p>}
      <div className="mt-4 flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={settling}>
          Cancel
        </Button>
        <Button onClick={onConfirm} disabled={!ready || settling}>
          {settling ? 'Settling…' : 'Settle with these winners'}
        </Button>
      </div>
    </>
  );
}
