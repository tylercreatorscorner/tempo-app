'use client';

import { Trophy, Info } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { TableCard, Table, THead, TBody, TR, TH, TD, DataAvatar } from '@/components/ui/table';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { NumberTicker } from '@/components/ui/number-ticker';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { Gauge } from '@/components/charts/gauge';
import { fmtCompactCurrency } from '@/components/charts/format';
import { cn } from '@/lib/utils';
import type { RankingEntry } from '@/lib/data/creator-portal';

type RowWithDelta = RankingEntry & { priorRank: number | null };

interface Props {
  currentBrand: string | null;
  currentBrandDisplay: string | null;
  rangeLabel: string;
  rankings: RowWithDelta[];
}

const MEDALS = ['🥇', '🥈', '🥉'];

export function RankingsClient({ currentBrand, currentBrandDisplay, rangeLabel, rankings }: Props) {
  const myEntries = rankings.filter((r) => r.isMe);
  const myBest = myEntries.length > 0 ? myEntries.reduce((a, b) => (a.rank < b.rank ? a : b)) : null;

  const top3 = rankings.slice(0, 3);
  const totalShown = rankings.length;

  // Position within the shown leaderboard, drawn as a ring. Honest because the
  // sublabel says "of N shown" — it never implies a percentile of the full field.
  const gaugeFraction = myBest && totalShown > 0 ? Math.max(0, (totalShown - myBest.rank + 1) / totalShown) : 0;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <PageHeader
        eyebrow="Leaderboard"
        title="Rankings"
        subtitle={
          currentBrandDisplay ? (
            <>
              Where you stack up on <span className="font-medium text-foreground">{currentBrandDisplay}</span> ·{' '}
              {rangeLabel}
            </>
          ) : (
            <>{rangeLabel} · all brands</>
          )
        }
        actions={<DateRangePicker defaultPreset="last30" />}
      />

      {!currentBrand && (
        <Badge variant="warning" className="gap-1.5">
          <Info className="h-3.5 w-3.5" />
          Pick a brand from the switcher for brand-specific rankings.
        </Badge>
      )}

      {rankings.length === 0 ? (
        <EmptyState
          icon={<Trophy className="h-8 w-8" />}
          title="The leaderboard is warming up"
          description={
            currentBrandDisplay
              ? `No ranked sales for ${currentBrandDisplay} in this period yet. Post something and you could be the first name on the board.`
              : `No ranked sales in this period yet. Keep posting; the board fills as sales land.`
          }
        />
      ) : (
        <>
          {/* Your position — canonical hero StatCard beside a standing ring. */}
          {myBest && (
            <section className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-stretch">
              <Card className="flex flex-col items-center justify-center gap-3 p-5">
                <Gauge
                  fraction={gaugeFraction}
                  size={132}
                  thickness={11}
                  color="var(--pulse-accent-2)"
                  label={
                    <span className="tabular-nums">
                      #
                      <NumberTicker
                        value={myBest.rank}
                        className="text-foreground dark:text-foreground tracking-tight"
                      />
                    </span>
                  }
                  sublabel={`of ${totalShown} shown`}
                />
                <RankDeltaBadge currentRank={myBest.rank} priorRank={myBest.priorRank} />
              </Card>

              <StatCard
                hero
                label="Your rank"
                value={`#${myBest.rank}`}
                subValue={`${fmtCompactCurrency(myBest.gmv)} GMV`}
                trendLabel={`@${myBest.tiktokUsername} · of ${totalShown}+ creators`}
              />
            </section>
          )}

          {myEntries.length > 1 && (
            <p className="-mt-2 text-xs text-muted-foreground">
              You also have {myEntries.length - 1} other handle{myEntries.length - 1 === 1 ? '' : 's'} on this
              leaderboard.
            </p>
          )}

          {/* Podium — the one intentional custom flourish, rebuilt from kit atoms. */}
          {top3.length === 3 && (
            <div className="flex items-end justify-center gap-3 sm:gap-6">
              <PodiumCard entry={top3[1]} rank={2} height="h-24" />
              <PodiumCard entry={top3[0]} rank={1} height="h-32" highlight />
              <PodiumCard entry={top3[2]} rank={3} height="h-20" />
            </div>
          )}

          {/* Full leaderboard */}
          <TableCard>
            <CardHeader>
              <CardTitle>Leaderboard</CardTitle>
              <span className="text-xs text-muted-foreground tabular-nums">
                {totalShown} creator{totalShown === 1 ? '' : 's'}
              </span>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH className="w-16 text-left">Rank</TH>
                    <TH className="text-left">Creator</TH>
                    <TH>GMV</TH>
                    <TH className="hidden sm:table-cell">Orders</TH>
                    <TH className="hidden md:table-cell">Videos</TH>
                    <TH>Δ</TH>
                  </TR>
                </THead>
                <TBody>
                  {rankings.map((r, i) => {
                    const isMe = r.isMe;
                    return (
                      <TR
                        key={r.tiktokUsername + i}
                        className={cn('hover:bg-secondary/50', isMe && 'bg-primary/5')}
                      >
                        <TD className="text-left font-bold text-muted-foreground">
                          {i < 3 ? <span className="text-base">{MEDALS[i]}</span> : `#${r.rank}`}
                        </TD>
                        <TD className="text-left">
                          <div className="flex items-center gap-3">
                            <DataAvatar
                              color={isMe ? undefined : 'var(--secondary)'}
                              className={cn(!isMe && 'text-muted-foreground')}
                            >
                              {initials(r)}
                            </DataAvatar>
                            <div className="min-w-0">
                              <p className={cn('truncate font-medium', isMe ? 'text-primary' : 'text-foreground')}>
                                {r.realName ?? `@${r.tiktokUsername}`}
                                {isMe && <span className="ml-1 text-xs text-primary">(you)</span>}
                              </p>
                              {r.realName && (
                                <p className="truncate text-xs text-muted-foreground">@{r.tiktokUsername}</p>
                              )}
                            </div>
                          </div>
                        </TD>
                        <TD className="font-bold text-[var(--pulse-pos)]">{fmtCompactCurrency(r.gmv)}</TD>
                        <TD className="hidden sm:table-cell text-foreground">{r.orders.toLocaleString()}</TD>
                        <TD className="hidden md:table-cell">{r.videos}</TD>
                        <TD>
                          <RankDeltaBadge currentRank={r.rank} priorRank={r.priorRank} />
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
          </TableCard>
        </>
      )}
    </div>
  );
}

/** Rank movement vs the prior window, as a semantic Badge. */
function RankDeltaBadge({ currentRank, priorRank }: { currentRank: number; priorRank: number | null }) {
  if (priorRank === null) {
    return (
      <Badge variant="neutral" size="sm">
        —
      </Badge>
    );
  }
  const diff = priorRank - currentRank; // positive = climbed
  if (diff === 0) {
    return (
      <Badge variant="neutral" size="sm">
        —
      </Badge>
    );
  }
  if (diff > 0) {
    return (
      <Badge variant="positive" size="sm">
        ▲ {diff}
      </Badge>
    );
  }
  return (
    <Badge variant="negative" size="sm">
      ▼ {Math.abs(diff)}
    </Badge>
  );
}

function PodiumCard({
  entry,
  rank,
  height,
  highlight,
}: {
  entry: RankingEntry;
  rank: number;
  height: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex w-24 flex-col items-center sm:w-32">
      <DataAvatar
        color={highlight ? undefined : 'var(--secondary)'}
        className={cn(
          'mb-2 h-12 w-12 text-lg',
          highlight ? 'shadow-[var(--pulse-elev-2)]' : 'shadow-[var(--pulse-elev-1)]',
        )}
      >
        {MEDALS[rank - 1]}
      </DataAvatar>
      <Badge variant={highlight ? 'accent' : 'neutral'} size="sm" className="mb-1">
        #{rank}
      </Badge>
      <p className="w-full truncate text-center text-xs font-semibold text-foreground">
        {entry.realName ?? `@${entry.tiktokUsername}`}
      </p>
      <p className="text-xs font-bold tabular-nums text-[var(--pulse-pos)]">{fmtCompactCurrency(entry.gmv)}</p>
      <div className={cn('mt-2 w-full rounded-t-xl', height, highlight ? 'bg-pulse-grad' : 'bg-secondary')} />
    </div>
  );
}

/** Two-letter avatar seed from a display name (falls back to the handle). */
function initials(entry: RankingEntry): string {
  const src = (entry.realName ?? entry.tiktokUsername ?? '').trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase() || '@';
}
