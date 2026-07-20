'use client';

import { useState } from 'react';
import { ArrowUpRight, Info, Play, Trophy } from 'lucide-react';
import { TableCard, Table, THead, TBody, TR, TH, TD, DataAvatar } from '@/components/ui/table';
import { CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { StandingBand } from '@/components/creator/standing-band';
import { fmtCompactCurrency } from '@/components/charts/format';
import { useTikTokThumbnail } from '@/hooks/use-tiktok-thumbnail';
import { cn } from '@/lib/utils';
import type { BrandStanding, CreatorVideoRow, RankingEntry } from '@/lib/data/creator-portal';

type RowWithDelta = RankingEntry & { priorRank: number | null };

interface Props {
  currentBrand: string | null;
  boardBrandDisplay: string | null;
  rangeLabel: string;
  rankings: RowWithDelta[];
  standing: BrandStanding | null;
  topGmvVideos: CreatorVideoRow[];
  newVideos: CreatorVideoRow[];
  myHandles: string[];
}

export function RankingsClient({
  currentBrand,
  boardBrandDisplay,
  rangeLabel,
  rankings,
  standing,
  topGmvVideos,
  newVideos,
  myHandles,
}: Props) {
  const totalCreators = standing?.creatorCount ?? rankings.length;

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-12">
      {/* Ledger page header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-ledger text-[13px] italic text-primary">Leaderboard</p>
          <h1 className="font-ledger mt-1 text-[26px] font-bold tracking-tight text-foreground">
            {boardBrandDisplay ? `Where you stand on ${boardBrandDisplay}` : 'Where you stand'}
          </h1>
          <p className="mt-1 text-[13.5px] text-muted-foreground">
            {totalCreators > 0 ? `All ${totalCreators.toLocaleString()} creators, ranked by GMV` : 'Ranked by GMV'} ·{' '}
            {rangeLabel}
          </p>
        </div>
        <DateRangePicker defaultPreset="last30" />
      </div>

      {!currentBrand && boardBrandDisplay && (
        <Badge variant="neutral" className="gap-1.5">
          <Info className="h-3.5 w-3.5" />
          Showing {boardBrandDisplay}, your top brand. Use the brand switcher for a different board.
        </Badge>
      )}

      {standing && <StandingBand standing={standing} variant="rank" />}

      {rankings.length === 0 ? (
        <EmptyState
          icon={<Trophy className="h-8 w-8" />}
          title="The leaderboard is warming up"
          description={
            boardBrandDisplay
              ? `No ranked sales for ${boardBrandDisplay} in this period yet. Post something and you could be the first name on the board.`
              : `No ranked sales in this period yet. Keep posting; the board fills as sales land.`
          }
        />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[1.55fr_1fr]">
          <Leaderboard rankings={rankings} />
          <TopVideosPanel
            brandLabel={boardBrandDisplay}
            topGmv={topGmvVideos}
            fresh={newVideos}
            myHandles={myHandles}
          />
        </div>
      )}
    </div>
  );
}

// ---- Leaderboard ----------------------------------------------------------

function Leaderboard({ rankings }: { rankings: RowWithDelta[] }) {
  return (
    <TableCard>
      <CardHeader>
        <CardTitle className="font-ledger text-[15px]">Creator leaderboard</CardTitle>
        <span className="text-xs tabular-nums text-muted-foreground">
          top {rankings.filter((r) => !r.isMe || r.rank <= 50).length}
        </span>
      </CardHeader>
      <div className="overflow-x-auto">
        <Table>
          <THead>
            <TR>
              <TH className="w-14 text-left">Rank</TH>
              <TH className="text-left">Creator</TH>
              <TH>GMV</TH>
              <TH className="hidden sm:table-cell">Orders</TH>
              <TH>Δ</TH>
            </TR>
          </THead>
          <TBody>
            {rankings.map((r, i) => {
              const prev = rankings[i - 1];
              const gap = prev != null && r.rank > prev.rank + 1;
              return [
                gap ? (
                  <TR key={`gap-${r.rank}`}>
                    <TD colSpan={5} className="py-1 text-center text-xs text-muted-foreground/60">
                      ⋯
                    </TD>
                  </TR>
                ) : null,
                <TR
                  key={r.tiktokUsername + r.rank}
                  className={cn('hover:bg-secondary/50', r.isMe && 'bg-primary/5')}
                >
                  <TD className="font-ledger-num text-left text-[15px] font-bold text-muted-foreground">
                    #{r.rank}
                  </TD>
                  <TD className="text-left">
                    <div className="flex items-center gap-3">
                      <DataAvatar
                        color={r.isMe ? undefined : 'var(--secondary)'}
                        className={cn(!r.isMe && 'text-muted-foreground')}
                      >
                        {initials(r)}
                      </DataAvatar>
                      <div className="min-w-0">
                        <p className={cn('truncate font-medium', r.isMe ? 'text-primary' : 'text-foreground')}>
                          {r.isMe ? 'You' : r.realName ?? `@${r.tiktokUsername}`}
                        </p>
                        <p className="truncate font-mono text-xs text-muted-foreground">@{r.tiktokUsername}</p>
                      </div>
                    </div>
                  </TD>
                  <TD className="font-bold tabular-nums text-[var(--pulse-pos)]">{fmtCompactCurrency(r.gmv)}</TD>
                  <TD className="hidden tabular-nums text-foreground sm:table-cell">
                    {r.orders.toLocaleString()}
                  </TD>
                  <TD>
                    <RankDeltaBadge currentRank={r.rank} priorRank={r.priorRank} />
                  </TD>
                </TR>,
              ];
            })}
          </TBody>
        </Table>
      </div>
    </TableCard>
  );
}

/** Rank movement vs the prior window, as a semantic Badge. */
function RankDeltaBadge({ currentRank, priorRank }: { currentRank: number; priorRank: number | null }) {
  if (priorRank === null || priorRank === currentRank) {
    return (
      <Badge variant="neutral" size="sm">
        —
      </Badge>
    );
  }
  const diff = priorRank - currentRank; // positive = climbed
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

/** Two-letter avatar seed from a display name (falls back to the handle). */
function initials(entry: RankingEntry): string {
  const src = (entry.realName ?? entry.tiktokUsername ?? '').trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase() || '@';
}

// ---- Top videos panel -------------------------------------------------------

function TopVideosPanel({
  brandLabel,
  topGmv,
  fresh,
  myHandles,
}: {
  brandLabel: string | null;
  topGmv: CreatorVideoRow[];
  fresh: CreatorVideoRow[];
  myHandles: string[];
}) {
  const [mode, setMode] = useState<'gmv' | 'new'>('gmv');
  const myHandleSet = new Set(myHandles.map((h) => h.toLowerCase()));
  const list = (mode === 'new' ? fresh : topGmv).slice(0, 6);
  const max = Math.max(1, ...list.map((v) => v.gmv));

  return (
    <TableCard>
      <CardHeader className="flex-wrap gap-y-2">
        <div>
          <CardTitle className="font-ledger text-[15px]">Top videos</CardTitle>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {mode === 'new' ? 'Posted in the last 7 days · by GMV' : `Best on ${brandLabel ?? 'the network'} · by GMV`}
          </p>
        </div>
        <div className="inline-flex gap-0.5 rounded-[10px] border border-border bg-secondary p-[3px]">
          <SegBtn on={mode === 'gmv'} onClick={() => setMode('gmv')}>
            Top GMV
          </SegBtn>
          <SegBtn on={mode === 'new'} onClick={() => setMode('new')}>
            New (7)
          </SegBtn>
        </div>
      </CardHeader>
      {list.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">
          {mode === 'new' ? 'Nothing posted in the last 7 days has sold yet.' : 'No videos in this period.'}
        </p>
      ) : (
        <ul className="divide-y divide-border px-2 pb-2">
          {list.map((v, i) => (
            <TopVideoRow
              key={v.videoId}
              video={v}
              rank={i + 1}
              maxGmv={max}
              mine={myHandleSet.has((v.tiktokUsername || '').toLowerCase())}
              showAge={mode === 'new'}
            />
          ))}
        </ul>
      )}
    </TableCard>
  );
}

function SegBtn({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-[7px] px-2.5 py-1 text-[11.5px] font-semibold whitespace-nowrap transition-colors',
        on ? 'bg-card text-primary shadow-[var(--pulse-elev-1)]' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function TopVideoRow({
  video,
  rank,
  maxGmv,
  mine,
  showAge,
}: {
  video: CreatorVideoRow;
  rank: number;
  maxGmv: number;
  mine: boolean;
  showAge: boolean;
}) {
  const { thumbnail, loading } = useTikTokThumbnail(video.videoUrl);
  const age = showAge ? daysAgo(video.postDate) : null;

  const row = (
    <li
      className={cn(
        'group flex items-center gap-3 rounded-xl px-2.5 py-2.5',
        mine && 'bg-primary/5',
      )}
    >
      <span className="w-4 shrink-0 text-center font-mono text-xs text-muted-foreground/60">{rank}</span>

      {/* Thumbnail — real TikTok cover via oEmbed; placeholder tile while loading/on failure. */}
      <span className="relative h-[54px] w-11 shrink-0 overflow-hidden rounded-lg border border-border bg-secondary">
        {thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span
            className={cn(
              'grid h-full w-full place-items-center text-muted-foreground/50',
              loading && 'animate-pulse',
            )}
          >
            <Play className="h-3.5 w-3.5 fill-current" />
          </span>
        )}
        {thumbnail && (
          <span className="absolute bottom-0.5 right-0.5 grid h-4 w-4 place-items-center rounded bg-black/55">
            <Play className="h-2 w-2 fill-white text-white" />
          </span>
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 truncate text-xs font-semibold text-foreground transition-colors group-hover:text-primary">
            {video.videoTitle}
          </span>
          {video.videoUrl && (
            <ArrowUpRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
          )}
          {mine && (
            <span className="shrink-0 font-mono text-[9px] font-bold uppercase tracking-wide text-primary">
              you
            </span>
          )}
        </span>
        <span className="mt-1.5 block h-[5px] overflow-hidden rounded-full bg-secondary">
          <span
            className="bg-pulse-grad block h-full rounded-full"
            style={{ width: `${Math.max(6, Math.round((video.gmv / maxGmv) * 100))}%` }}
          />
        </span>
        <span className="mt-1 flex items-center gap-1.5 font-mono text-[10.5px] text-muted-foreground">
          @{video.tiktokUsername}
          {age != null && (
            <span className="rounded border border-primary/30 px-1 font-semibold text-primary">
              {age}
            </span>
          )}
        </span>
      </span>

      <span className="shrink-0 font-mono text-[13px] font-bold tabular-nums text-[var(--pulse-pos)]">
        {fmtCompactCurrency(video.gmv)}
      </span>
    </li>
  );

  if (video.videoUrl) {
    return (
      <a href={video.videoUrl} target="_blank" rel="noopener noreferrer" className="block">
        {row}
      </a>
    );
  }
  return row;
}

/** "2d" style age chip from a post-date string (date or timestamp format). */
function daysAgo(postDate: string | null): string | null {
  if (!postDate) return null;
  const d = new Date(postDate.slice(0, 10) + 'T12:00:00Z');
  if (isNaN(d.getTime())) return null;
  const days = Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
  return `${days}d`;
}
