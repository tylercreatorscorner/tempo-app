'use client';

/**
 * Contests — the engine's home. Grouped list (Live / Upcoming / Settled) per
 * the approved mockup, with the builder and standings as slide-overs.
 *
 * Fetch discipline (house rules): every fetch checks res.ok; a cold failure
 * renders an error surface (never a confident fake-empty), a warm refetch
 * failure keeps last-good rows behind a stale banner.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Pencil, Plus, Rocket, Trash2, Trophy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { PageHeader } from '@/components/ui/page-header';
import { TableLoadBar } from '@/components/ui/table-load-bar';
import { useDelayedFlag } from '@/hooks/use-delayed-flag';
import { useBrandList } from '@/hooks/use-brand-list';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import type { ContestRow } from '@/lib/contests/types';
import { ContestBuilderSheet, type SegmentOption } from './contest-builder-sheet';
import { ContestDetailSheet } from './contest-detail-sheet';
import {
  closesIn,
  groupOf,
  prizeSummary,
  raffleRuleLabel,
  SCORING_META,
  todayIso,
  windowEnded,
  windowLabel,
  type ContestGroup,
} from './contest-meta';

const GROUP_ORDER: Array<{ key: ContestGroup; label: string; hint: string }> = [
  { key: 'live', label: 'Live', hint: 'Window active, or ended and awaiting settle' },
  { key: 'upcoming', label: 'Upcoming', hint: 'Drafts and launched contests whose window hasn’t opened' },
  { key: 'settled', label: 'Settled', hint: 'Winners locked, prizes written to the ledger' },
];

export function ContestsClient() {
  const brandMeta = useBrandMeta();
  const { brands } = useBrandList();

  const [contests, setContests] = useState<ContestRow[]>([]);
  const [segments, setSegments] = useState<SegmentOption[]>([]);
  const [segmentsFailed, setSegmentsFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  // View-as-manager mode: the middleware blocks mutations, so the UI hides its
  // create/edit/launch/delete/settle controls to match (the segments pattern).
  const [readOnly, setReadOnly] = useState(false);
  const showBar = useDelayedFlag(loading);

  // null = closed; {} = create; { contest } = edit that draft.
  const [builder, setBuilder] = useState<{ contest?: ContestRow } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [launchTarget, setLaunchTarget] = useState<ContestRow | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/contests', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setContests((json.contests ?? []) as ContestRow[]);
      setReadOnly(!!json.readOnly);
      setLoadError(false);
      setHasLoadedOnce(true);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // Segment names for scope chips + the builder's segment picker. Non-fatal:
  // a failure degrades labels and flags the picker, it doesn't block the page.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/segments');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        setSegments(
          ((json.segments ?? []) as Array<{ id: string; name: string }>).map((s) => ({ id: s.id, name: s.name })),
        );
        setSegmentsFailed(false);
      } catch {
        if (!cancelled) setSegmentsFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const segmentName = useCallback(
    (id: string | null) => segments.find((s) => s.id === id)?.name ?? 'Segment',
    [segments],
  );

  const today = todayIso();
  const groups = useMemo(() => {
    const byGroup: Record<ContestGroup, ContestRow[]> = { live: [], upcoming: [], settled: [] };
    for (const c of contests) byGroup[groupOf(c, today)].push(c);
    byGroup.live.sort((a, b) => a.window_end.localeCompare(b.window_end));
    byGroup.upcoming.sort((a, b) => a.window_start.localeCompare(b.window_start));
    byGroup.settled.sort((a, b) => (b.settled_at ?? '').localeCompare(a.settled_at ?? ''));
    return byGroup;
  }, [contests, today]);

  async function deleteDraft(id: string) {
    setConfirmingDelete(null);
    const prev = contests;
    setContests((c) => c.filter((x) => x.id !== id));
    try {
      const res = await fetch(`/api/contests/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Delete failed (${res.status})`);
      }
    } catch (e) {
      setContests(prev); // revert — the delete didn't stick
      window.alert(e instanceof Error ? e.message : 'Failed to delete the contest');
    }
  }

  function renderRow(contest: ContestRow) {
    const group = groupOf(contest, today);
    const ended = group === 'live' && windowEnded(contest, today);
    const isDraft = contest.status === 'draft';
    const remaining = group === 'live' && !ended ? closesIn(contest.window_end) : null;
    const scoringMeta = SCORING_META[contest.scoring];
    const raffleRule = contest.scoring === 'raffle' ? raffleRuleLabel(contest) : null;

    const openRow = () => {
      // Read-only viewers get the detail view for drafts too — never the builder.
      if (isDraft && !readOnly) setBuilder({ contest });
      else setDetailId(contest.id);
    };

    return (
      <div key={contest.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
        <button
          onClick={openRow}
          className="min-w-0 flex-1 text-left"
          title={isDraft && !readOnly ? 'Edit draft' : 'View standings'}
        >
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-extrabold text-foreground">{contest.name}</span>
            {isDraft ? (
              <Badge variant="accent" size="sm">Draft</Badge>
            ) : contest.status === 'settled' ? (
              <Badge variant="neutral" size="sm">Settled</Badge>
            ) : ended ? (
              <Badge variant="warning" size="sm" dot>Ended — settle</Badge>
            ) : group === 'upcoming' ? (
              <Badge variant="accent" size="sm">Upcoming</Badge>
            ) : (
              <Badge variant="positive" size="sm" dot>Live</Badge>
            )}
            {contest.scoring === 'raffle' && <Badge variant="warning" size="sm">Raffle</Badge>}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted-foreground">
            {contest.scope_kind === 'brand' ? (
              <Chip dotColor={brandMeta.color(contest.brand_slug)} className="px-2 py-0.5 text-[11px]">
                {brandMeta.label(contest.brand_slug)}
              </Chip>
            ) : contest.scope_kind === 'segment' ? (
              <Chip className="px-2 py-0.5 text-[11px]">{segmentName(contest.segment_id)}</Chip>
            ) : (
              <Chip className="px-2 py-0.5 text-[11px]">All creators</Chip>
            )}
            <span>{raffleRule ?? scoringMeta.label}</span>
            <span>· {windowLabel(contest.window_start, contest.window_end)}</span>
            {typeof contest.entrant_count === 'number' && (
              <span>
                · {contest.entrant_count} {contest.entrant_count === 1 ? 'entrant' : 'entrants'}
              </span>
            )}
            {remaining && <span className="font-semibold text-[var(--pulse-pos)]">· closes in {remaining}</span>}
          </span>
        </button>

        <span className="text-[13px] font-extrabold tabular-nums text-[var(--pulse-warn)]">
          {prizeSummary(contest.prizes)}
        </span>

        <span className="flex shrink-0 items-center gap-1.5">
          {readOnly ? (
            // View-as mode: mutations are middleware-blocked — only offer the view.
            <Button variant="ghost" size="sm" onClick={() => setDetailId(contest.id)}>
              {contest.status === 'settled' ? 'Results' : isDraft ? 'View' : 'Standings'}
            </Button>
          ) : isDraft ? (
            confirmingDelete === contest.id ? (
              <>
                <Button variant="danger" size="sm" onClick={() => deleteDraft(contest.id)}>
                  Delete
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(null)}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => setBuilder({ contest })}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setLaunchTarget(contest)}>
                  <Rocket className="h-3.5 w-3.5" /> Launch
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setConfirmingDelete(contest.id)}
                  aria-label="Delete draft"
                  className="hover:text-[var(--pulse-neg)]"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )
          ) : contest.status === 'settled' ? (
            <Button variant="ghost" size="sm" onClick={() => setDetailId(contest.id)}>
              Results
            </Button>
          ) : ended ? (
            <Button size="sm" onClick={() => setDetailId(contest.id)}>
              Settle
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setDetailId(contest.id)}>
              Standings
            </Button>
          )}
        </span>
      </div>
    );
  }

  const coldFailure = loadError && !hasLoadedOnce;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Creators"
        title="Contests"
        subtitle="Run the competition. Standings score themselves from the same data as everything else."
        actions={
          readOnly ? (
            <p className="text-xs text-muted-foreground">Viewing read-only</p>
          ) : (
            <Button onClick={() => setBuilder({})}>
              <Plus className="h-4 w-4" /> New Contest
            </Button>
          )
        }
      />

      {/* Warm refetch failed: keep last-good rows, say the data is stale. */}
      {loadError && hasLoadedOnce && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--pulse-warn)]/30 bg-[var(--pulse-warn)]/10 px-4 py-2.5 text-[13px] text-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--pulse-warn)]" />
          <span>Couldn&rsquo;t refresh — showing the last loaded contests.</span>
          <button onClick={load} className="ml-auto font-semibold text-primary hover:underline">
            Retry
          </button>
        </div>
      )}

      {coldFailure ? (
        <EmptyState
          icon={<AlertTriangle className="h-8 w-8" />}
          title="Couldn't load contests"
          description="This is a load error, not an empty list. Retry, or reload the page."
          action={
            <Button variant="outline" onClick={load}>
              Retry
            </Button>
          }
        />
      ) : !loading && contests.length === 0 ? (
        <EmptyState
          icon={<Trophy className="h-8 w-8" />}
          title="No contests yet"
          description="A contest is a leaderboard with a window and a prize — GMV sprint, posting streak, raffle, or a judged pick. Standings score themselves from uploaded data."
          action={
            !readOnly && (
              <Button onClick={() => setBuilder({})}>
                <Plus className="h-4 w-4" /> New Contest
              </Button>
            )
          }
        />
      ) : (
        GROUP_ORDER.map(({ key, label, hint }) => {
          const rows = groups[key];
          if (rows.length === 0 && key !== 'live') return null;
          return (
            <section key={key} className="space-y-2">
              <div className="flex items-baseline gap-2">
                <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</h2>
                <span className="text-[11px] text-muted-foreground/60">{hint}</span>
              </div>
              <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-[var(--pulse-elev-1)]">
                <TableLoadBar active={showBar} />
                <div className={showBar && rows.length > 0 ? 'opacity-60 transition-opacity duration-200' : ''}>
                  {rows.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-muted-foreground">
                      {loading ? 'Loading…' : 'Nothing live right now.'}
                    </p>
                  ) : (
                    <div className="divide-y divide-border">{rows.map(renderRow)}</div>
                  )}
                </div>
              </div>
            </section>
          );
        })
      )}

      {builder && (
        <ContestBuilderSheet
          contest={builder.contest}
          brands={brands}
          segments={segments}
          segmentsFailed={segmentsFailed}
          onClose={() => setBuilder(null)}
          onSaved={(saved) => {
            setContests((prev) => {
              const idx = prev.findIndex((c) => c.id === saved.id);
              if (idx === -1) return [saved, ...prev];
              return prev.map((c) => (c.id === saved.id ? saved : c));
            });
          }}
        />
      )}

      {detailId && (
        <ContestDetailSheet
          contestId={detailId}
          segmentName={segmentName}
          readOnly={readOnly}
          onClose={() => setDetailId(null)}
          onChanged={load}
        />
      )}

      {launchTarget && (
        <LaunchConfirmModal
          contest={launchTarget}
          scopeLabel={
            launchTarget.scope_kind === 'brand'
              ? brandMeta.label(launchTarget.brand_slug)
              : launchTarget.scope_kind === 'segment'
                ? `Segment: ${segmentName(launchTarget.segment_id)}`
                : 'All creators'
          }
          onClose={() => setLaunchTarget(null)}
          onLaunched={() => {
            setLaunchTarget(null);
            load();
          }}
        />
      )}
    </div>
  );
}

/** Launching freezes the entrant list — that's the whole reason this confirm exists. */
function LaunchConfirmModal({
  contest,
  scopeLabel,
  onClose,
  onLaunched,
}: {
  contest: ContestRow;
  scopeLabel: string;
  onClose: () => void;
  onLaunched: () => void;
}) {
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function launch() {
    setLaunching(true);
    setError(null);
    try {
      const res = await fetch(`/api/contests/${contest.id}/launch`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      // A 400 here is usually "zero entrants" — surface the server's message.
      if (!res.ok) throw new Error(json.error || `Launch failed (${res.status})`);
      onLaunched();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to launch the contest');
      setLaunching(false);
    }
  }

  return (
    <ModalOverlay onClose={launching ? () => {} : onClose}>
      <div className="absolute inset-0 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl"
        >
          <h3 className="text-base font-extrabold text-foreground">Launch {contest.name}?</h3>
          <div className="mt-3 space-y-2 text-[13px] text-muted-foreground">
            <p>
              <b className="text-foreground">{scopeLabel}</b> · {SCORING_META[contest.scoring].label} ·{' '}
              {windowLabel(contest.window_start, contest.window_end)}
            </p>
            <p>
              Launching <b className="text-foreground">freezes the entrant list</b> — creators who join the
              audience after launch are not added to this contest.
            </p>
          </div>
          {error && <p className="mt-3 text-[13px] font-medium text-[var(--pulse-neg)]">{error}</p>}
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={launching}>
              Cancel
            </Button>
            <Button onClick={launch} disabled={launching}>
              <Rocket className="h-4 w-4" /> {launching ? 'Launching…' : 'Launch contest'}
            </Button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}
