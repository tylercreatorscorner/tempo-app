/**
 * The client report page body — renders the frozen snapshot.
 *
 * Rebuilt 2026-08-05, agency-forward. The previous version opened with
 * store-wide GMV and buried the roster mid-page, which read as "here are your
 * shop's numbers, and incidentally we exist". The order is now inverted: what
 * Creators Corner delivered leads, and store totals follow as context,
 * explicitly labelled as all of the brand's activity rather than ours.
 *
 * Also now interactive, which it previously was not at all: the only <a> in
 * the old file was the PDF button. Creator handles link to TikTok profiles,
 * top content plays inline, and the daily chart has real per-day tooltips
 * reachable by both hover and keyboard.
 *
 * Sections are data-gated, so a brand without engagement data, without a
 * signed roster, or without product names simply does not render those
 * blocks rather than showing blanks.
 *
 * Deliberately LIGHT regardless of viewer theme: this is the artifact clients
 * receive — print-adjacent, paper white.
 */
import type { BrandClientReportData } from '@/lib/data/brand-client-report';
import {
  classifySpendWindow,
  estimateDeliveredSpend,
  spendCaveats,
} from '@/lib/data/delivered-spend';
import { extractTikTokVideoId, type ClientReportSnapshot } from '@/lib/data/client-reports';
import { PaginatedCreatorRows } from './creator-rows';

const AGENCY = 'Creators Corner';

// ── Formatting ─────────────────────────────────────────────────────

function money(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

function compactMoney(n: number): string {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2) + 'M';
  if (n >= 10_000) return '$' + Math.round(n / 1000) + 'K';
  return money(n);
}

function compactCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 10_000) return Math.round(n / 1000) + 'K';
  if (n >= 1_000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString('en-US');
}

function num(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

function fmtDay(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function periodWord(days: number): string {
  if (days <= 7) return 'week';
  if (days >= 28 && days <= 31) return 'month';
  return 'period';
}

function pctChange(curr: number, prior: number): number | null {
  if (prior === 0) return null;
  return ((curr - prior) / prior) * 100;
}

/**
 * Snapshots are FROZEN, so a report created before a field existed will never
 * gain it. Every field added to BrandClientReportData after a report shipped
 * is `undefined` on the old rows, and `undefined` flows straight through
 * arithmetic into NaN on the page a client is reading.
 *
 * So nothing reaches the renderer without passing through here: a value that
 * is not a finite number is ABSENT, and absent renders as nothing rather than
 * as a number.
 */
function finite(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Bare handle for a TikTok profile URL. Names arrive with or without the @. */
// Shared table-head classes. Also duplicated in creator-rows.tsx, which is a
// client island and cannot import them from this server component.
const TH_L =
  'px-4 py-2.5 text-left text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]';
const TH_R =
  'px-4 py-2.5 text-right text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]';

function handleOf(name: string): string {
  return name.trim().replace(/^@+/, '').toLowerCase();
}

// ── Small pieces ───────────────────────────────────────────────────

function Delta({ pct, suffix, abs }: { pct?: number | null; suffix?: string; abs?: string | null }) {
  const p = finite(pct);
  // Undefined (an older frozen snapshot) is NOT the same as null ("from
  // zero"): there is no comparison to show, so show nothing at all.
  if (p === null) {
    return pct === null
      ? <div className="mt-0.5 text-[11px] font-bold text-[#8a8fb0]">new this period</div>
      : <div className="mt-0.5 text-[11px] text-[#b3b7d4]">&mdash;</div>;
  }
  if (Math.abs(p) < 0.5) {
    return <div className="mt-0.5 text-[11px] font-bold text-[#8a8fb0]">no change</div>;
  }
  const pct_ = p;
  const up = pct_ >= 0;
  return (
    <div className={`mt-0.5 text-[11px] font-bold tabular-nums ${up ? 'text-[#0d9f6e]' : 'text-[#cf3a6e]'}`}>
      {up ? '▲' : '▼'} {abs ? `${abs} ` : ''}({Math.abs(pct_).toFixed(1)}%){suffix ? ` ${suffix}` : ''}
    </div>
  );
}

/**
 * WHY the headline moved, in one sentence.
 *
 * 🚨 THE REPORT HAD NO "WHY" ANYWHERE. It said roster GMV fell 11.7% and that
 * we lost share, and left the reader to conclude we had a bad week. On Dr.
 * Dent 2026-08-23 the truth was the opposite: ONE creator's prior-week viral
 * post not repeating was $5,869 of the $9,609 that came off, while $3,508 was
 * added elsewhere and posts rose 50%. A brand reading alone could not get
 * there from the numbers on the page.
 *
 * 🚨 EXPRESSED AGAINST GROSS DOWN, NEVER AGAINST NET. "One creator explains
 * 96% of the decline" divides by the NET (-$6,101) and so hides the $3,508
 * that grew. The gross halves are reported separately for exactly this reason
 * and the driver sentence must not undo that.
 *
 * Returns null unless one creator genuinely dominates, because a sentence that
 * fires on every report stops being read.
 */
function moveDriver(movers: NonNullable<ClientReportSnapshot['movers']> | null | undefined) {
  if (!movers || !Array.isArray(movers.list) || movers.list.length === 0) return null;
  const down = movers.list.filter((m) => m.change < 0).sort((a, b) => a.change - b.change);
  const up = movers.list.filter((m) => m.change > 0).sort((a, b) => b.change - a.change);
  const grossDown = Math.abs(finite(movers.lost) ?? 0);
  const grossUp = finite(movers.gained) ?? 0;

  // The single biggest faller, and only when it carries most of the fall.
  const top = down[0];
  if (top && grossDown > 0 && Math.abs(top.change) / grossDown >= 0.5) {
    return {
      kind: 'fall' as const,
      handle: top.handle,
      amount: Math.abs(top.change),
      share: (Math.abs(top.change) / grossDown) * 100,
      grossDown,
      grossUp,
    };
  }
  const topUp = up[0];
  if (topUp && grossUp > 0 && topUp.change / grossUp >= 0.5) {
    return {
      kind: 'rise' as const,
      handle: topUp.handle,
      amount: topUp.change,
      share: (topUp.change / grossUp) * 100,
      grossDown,
      grossUp,
    };
  }
  return null;
}

/**
 * Change in a figure that is ITSELF a percentage, in percentage POINTS.
 *
 * ⚠️ Never render a relative % change on a share. Dr. Dent's share of shop went
 * 14.4% -> 12.6%; that is 1.8 POINTS, but 12.5% relative. Printing "down 12.5%"
 * beside a value reading "12.6%" invites the reader to subtract them.
 */
function PointsDelta({ points }: { points: number | null }) {
  if (points === null) return <div className="mt-0.5 text-[11px] text-[#b3b7d4]">&mdash;</div>;
  if (Math.abs(points) < 0.05) {
    return <div className="mt-0.5 text-[11px] font-bold text-[#8a8fb0]">no change</div>;
  }
  const up = points >= 0;
  return (
    <div className={`mt-0.5 text-[11px] font-bold tabular-nums ${up ? 'text-[#0d9f6e]' : 'text-[#cf3a6e]'}`}>
      {up ? '▲' : '▼'} {Math.abs(points).toFixed(1)} pts
    </div>
  );
}

/** Big stat, used in the agency band. */
function HeroStat({
  label,
  value,
  pct,
  abs,
  points,
}: {
  label: string;
  value: string;
  pct?: number | null;
  abs?: string | null;
  /** For values that are themselves a percentage. Wins over `pct`. */
  points?: number | null;
}) {
  return (
    <div>
      <div className="text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">{label}</div>
      <div className="mt-0.5 text-[25px] font-extrabold leading-tight tabular-nums text-[#171a33]">{value}</div>
      {points !== undefined ? <PointsDelta points={points} /> : <Delta pct={pct} abs={abs} />}
    </div>
  );
}

/** Smaller stat, used for store context. */
function Mini({
  label,
  value,
  pct,
  note,
}: {
  label: string;
  value: string;
  pct?: number | null;
  /** Hangs our share under a store-wide figure, so the comparison sits in the
   *  same tile rather than in a separate section the reader has to hold. */
  note?: React.ReactNode;
}) {
  return (
    <div className="rounded-[12px] border border-[#e7e7f2] bg-white px-3.5 py-3">
      <div className="text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">{label}</div>
      <div className="mt-0.5 text-[18px] font-extrabold tabular-nums text-[#171a33]">{value}</div>
      {note ? <div className="mt-1 text-[11px] leading-tight text-[#8a8fb0]">{note}</div> : <Delta pct={pct} />}
    </div>
  );
}

function SectionLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2.5 mt-8 flex items-center gap-3 text-[10px] font-extrabold uppercase tracking-[0.15em] text-[#8a8fb0]">
      <span className="shrink-0">{children}</span>
      <span className="h-px flex-1 bg-[#e7e7f2]" />
    </div>
  );
}

/**
 * Daily chart with a real per-bar tooltip. CSS-only on hover, and every bar is
 * tabbable so the numbers are reachable without a mouse — the previous chart
 * exposed no values at all.
 */
function HoverBars({
  title,
  bars,
  labels,
  peakNoun = 'day',
  subLabel,
}: {
  title: string;
  /**
   * `sub` is a portion OF `value`, not a second series beside it: it is drawn
   * inside the same bar, so the bar's height still reads as the store total
   * and the filled part reads as our share of it.
   */
  bars: { value: number; sub?: number; orders?: number; isPeak: boolean; caption: string }[];
  labels: string[];
  /** What one bar IS. The 12-week chart was calling its peak "best day". */
  peakNoun?: string;
  /** What the filled portion means. Required reading wherever `sub` is set. */
  subLabel?: string;
}) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div className="rounded-[14px] border border-[#e7e7f2] bg-white px-4 py-3.5">
      <div className="mb-2.5 text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">{title}</div>
      <div className="flex h-[130px] items-end gap-[7px]">
        {bars.map((b, i) => (
          <div
            key={i}
            tabIndex={0}
            aria-label={`${b.caption}: ${money(b.value)}${b.orders !== undefined ? `, ${num(b.orders)} orders` : ''}`}
            className="group relative flex h-full flex-1 flex-col justify-end rounded-[6px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b5ee8] focus-visible:ring-offset-2"
          >
            <div
              className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-10 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-[9px] bg-[#171a33] px-2.5 py-2 text-[11.5px] leading-[1.45] text-white opacity-0 shadow-[0_8px_22px_-8px_rgba(0,0,0,.5)] transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
            >
              <b className="tabular-nums">{money(b.value)}</b>
              {b.isPeak && <span className="text-white/70"> · best {peakNoun}</span>}
              <br />
              {b.sub !== undefined && (
                <>
                  <span className="tabular-nums">
                    {money(b.sub)} ours
                    {b.value > 0 && <span className="text-white/70"> · {((b.sub / b.value) * 100).toFixed(0)}%</span>}
                  </span>
                  <br />
                </>
              )}
              <span className="tabular-nums text-white/70">
                {b.orders !== undefined ? `${num(b.orders)} orders · ` : ''}{b.caption}
              </span>
            </div>
            {/* A split bar reserves the accent for OUR portion, so the peak
                gradient would compete with the only distinction that matters
                here. On an unsplit chart the peak keeps its highlight. */}
            <div
              className="flex flex-col justify-end overflow-hidden rounded-t-[5px] transition-[filter] group-hover:brightness-110"
              style={{
                height: `${Math.max(3, (b.value / max) * 100)}%`,
                background:
                  b.sub !== undefined
                    ? '#e6e4f4'
                    : b.isPeak
                      ? 'linear-gradient(180deg,#5b5ee8,#8b5cf6)'
                      : '#dedcf2',
              }}
            >
              {b.sub !== undefined && b.value > 0 && (
                <div
                  style={{
                    height: `${Math.min(100, (b.sub / b.value) * 100)}%`,
                    background: 'linear-gradient(180deg,#5b5ee8,#8b5cf6)',
                  }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[7px]">
        {labels.map((l, i) => (
          <span key={i} className="flex-1 text-center text-[9.5px] tabular-nums text-[#8a8fb0]">
            {l}
          </span>
        ))}
      </div>
      {subLabel && (
        <div className="mt-2 flex items-center gap-3 border-t border-[#f0eff7] pt-2 text-[10px] text-[#8a8fb0]">
          <span className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-[3px]"
              style={{ background: 'linear-gradient(180deg,#5b5ee8,#8b5cf6)' }}
            />
            {subLabel}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-[#e6e4f4]" />
            everyone else
          </span>
        </div>
      )}
    </div>
  );
}

/** Roster table. Every handle opens that creator's TikTok profile. */
/**
 * Roster composition + what the brand is committing to it.
 *
 * ⚠️ "142 signed creators" alone overstates the commitment on both sides: only
 * 57 are on a retainer, and the other 85 are AFFILIATE-ONLY — they take
 * commission and carry no post obligation at all. Saying so is not a caveat,
 * it is the difference between a number the brand can act on and one it can't.
 *
 * The retainer figure is MONTHLY and labelled as such. It is never divided
 * across the report window; a weekly slice of a monthly commitment is an
 * estimate, and this report does not make those.
 */
/**
 * What the agency did against what the whole shop did.
 *
 * REPLACES "Signed creators vs the rest of your shop", which argued the same
 * point with an AOV gap of $1-6 that ran BACKWARDS on some brands (catakor:
 * roster $43.44 against everyone else at $44.09).
 *
 * ⚠️ NOT a bar chart. Four bars at wildly different scales made the strongest
 * fact — that a 2% sliver of creators produces 38% of the sales — render as
 * the SHORTEST bar on the page, which argues against us. The whole point is
 * the gap between a small input and a large output, and a bar per metric
 * shows each metric in isolation, never the gap.
 *
 * So: the leverage is computed and stated in words, then each metric is a
 * card carrying its own share with the denominator printed under it. Nothing
 * is left for the reader to infer from a length.
 */
function VsShop({
  rows,
  brandName,
}: {
  rows: { label: string; ours: string; theirs: string; pct: number; live?: boolean }[];
  brandName: string;
}) {
  const gmvRow = rows.find((r) => r.label === 'GMV');
  const creatorRow = rows.find((r) => r.label === 'Creators posting');
  // Leverage only means something when the input share is genuinely small and
  // the output share genuinely larger. Below 1.5x it is not a story, and at a
  // near-zero denominator the multiple explodes into nonsense.
  const leverage =
    gmvRow && creatorRow && creatorRow.pct >= 0.05 && gmvRow.pct / creatorRow.pct >= 1.5
      ? gmvRow.pct / creatorRow.pct
      : null;

  return (
    <>
      {leverage !== null && gmvRow && creatorRow && (
        <div className="rounded-[14px] border border-[#e7e7f2] border-l-[3px] border-l-[#4b45ff] bg-white px-5 py-4">
          <p className="max-w-[70ch] text-[15px] font-semibold leading-[1.6] text-[#33375c]">
            We are <b className="text-[#4b45ff]">{creatorRow.pct.toFixed(1)}%</b> of the creators posting
            on your shop, and we produced <b className="text-[#4b45ff]">{gmvRow.pct.toFixed(1)}%</b> of its
            sales &mdash; <b className="text-[#171a33]">{leverage.toFixed(1)}&times;</b> the sales share you
            would expect from our share of creators.
          </p>
        </div>
      )}

      <div className={`mt-3 grid grid-cols-2 gap-3.5 ${rows.length >= 4 ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
        {rows.map((r) => (
          <div
            key={r.label}
            className="rounded-[14px] border border-[#e7e7f2] bg-white px-4 py-3.5"
            style={r.live ? { borderColor: '#f0cfe4' } : undefined}
          >
            <div className="text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">
              {r.label}
            </div>
            <div
              className="mt-1 text-[26px] font-extrabold leading-none tabular-nums"
              style={{ color: r.live ? '#c74f9e' : '#4b45ff' }}
            >
              {r.pct.toFixed(1)}%
            </div>
            {/* The denominator is printed, so the percentage is checkable. */}
            <div className="mt-2 text-[12.5px] leading-snug text-[#33375c]">
              <b className="tabular-nums text-[#171a33]">{r.ours}</b>
              <span className="text-[#8a8fb0]"> of {r.theirs}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 text-[10.5px] leading-relaxed text-[#8a8fb0]">
        Each card is our share of a shop-wide total, with that total shown beneath it. &ldquo;Your
        shop&rdquo; is all of {brandName}&rsquo;s TikTok Shop activity, including creators we do not
        manage.
      </div>
    </>
  );
}

/** One labelled proportional bar. */
function SplitBar({ parts }: { parts: { label: string; value: string; pct: number; color: string }[] }) {
  return (
    <>
      <div className="mt-3 flex h-[11px] overflow-hidden rounded-[6px] bg-[#f2f1f8]">
        {parts.map((p) => (
          <span key={p.label} style={{ width: `${p.pct}%`, background: p.color }} />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[12px] text-[#33375c]">
        {parts.map((p) => (
          <span key={p.label} className="flex items-center gap-1.5">
            <i className="h-[9px] w-[9px] flex-none rounded-[3px]" style={{ background: p.color }} />
            {p.label} <b className="tabular-nums text-[#171a33]">{p.value}</b>
          </span>
        ))}
      </div>
    </>
  );
}

/**
 * Where the roster's GMV came from, two ways: by what you pay for, and by the
 * surface it sold on.
 *
 * The channel split is computed inside the same RPC and on the same time-aware
 * membership rule as the roster GMV above it, so video + live + card equals
 * that total EXACTLY. If it ever stops adding up, the copy says so rather than
 * letting the difference vanish into a bucket.
 */
function SourceSplit({
  agreement,
  channels,
  topLive,
  rosterGmv,
  storeLiveGmv,
}: {
  agreement: BrandClientReportData['agreementSplit'];
  channels: BrandClientReportData['channels'];
  topLive: BrandClientReportData['topLive'];
  rosterGmv: number;
  storeLiveGmv: number;
}) {
  const agTotal = agreement ? agreement.retainerGmv + agreement.affiliateGmv : 0;
  const chTotal = channels ? channels.rosterVideoGmv + channels.rosterLiveGmv + channels.rosterCardGmv : 0;
  const share = (v: number, total: number) => (total > 0 ? (v / total) * 100 : 0);
  const liveShareOfShop = channels && storeLiveGmv > 0 ? (channels.rosterLiveGmv / storeLiveGmv) * 100 : null;

  if (agTotal <= 0 && chTotal <= 0) return null;

  return (
    <div className="mt-3 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
      {agreement && agTotal > 0 && (
        <div className="rounded-[14px] border border-[#e7e7f2] bg-white px-4 py-3.5">
          <div className="text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">
            Retainer roster vs affiliate-only
          </div>
          <SplitBar
            parts={[
              { label: 'Retainer', value: money(agreement.retainerGmv), pct: share(agreement.retainerGmv, agTotal), color: '#4b45ff' },
              { label: 'Affiliate-only', value: money(agreement.affiliateGmv), pct: share(agreement.affiliateGmv, agTotal), color: '#9a95e8' },
            ]}
          />
          <p className="mt-2.5 text-[12.5px] leading-[1.6] text-[#33375c]">
            {agreement.affiliateGmv > agreement.retainerGmv ? (
              <>
                Your affiliate-only creators, who carry no retainer and no post requirement, out-earned
                the creators you pay for this period.
              </>
            ) : (
              <>
                The creators you pay a retainer produced the larger share, from{' '}
                {num(agreement.retainerCreators)} who earned against {num(agreement.affiliateCreators)}{' '}
                affiliate-only.
              </>
            )}
          </p>
          {/* Never absorbed into a bucket: if the creator list cannot account
              for all of the roster's GMV, the gap is stated. */}
          {/* Do NOT assert a single cause here. The gap is roster GMV the
              current creator list cannot account for: creators who left during
              the period AND accounts not mapped to a person. On catakor it is
              14% of the total, far too large to explain away with a guess. */}
          {Math.abs(agreement.unattributedGmv) >= 1 && (
            <p className="mt-1.5 text-[11px] leading-tight text-[#8a8fb0]">
              {money(Math.abs(agreement.unattributedGmv))} is not attributed to a row below, from creators
              who left during the period or accounts not yet linked to a creator.
            </p>
          )}
        </div>
      )}

      {channels && chTotal > 0 && (
        <div className="rounded-[14px] border border-[#e7e7f2] bg-white px-4 py-3.5">
          <div className="text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">
            Video vs live vs product card
          </div>
          <SplitBar
            parts={[
              { label: 'Video', value: money(channels.rosterVideoGmv), pct: share(channels.rosterVideoGmv, chTotal), color: '#4b45ff' },
              { label: 'Live', value: money(channels.rosterLiveGmv), pct: share(channels.rosterLiveGmv, chTotal), color: '#c74f9e' },
              { label: 'Card', value: money(channels.rosterCardGmv), pct: share(channels.rosterCardGmv, chTotal), color: '#c7c9de' },
            ]}
          />
          <p className="mt-2.5 text-[12.5px] leading-[1.6] text-[#33375c]">
            {num(channels.rosterLiveStreams)} live stream{channels.rosterLiveStreams === 1 ? '' : 's'} from your
            roster
            {liveShareOfShop !== null && liveShareOfShop > 0 && (
              <>
                , earning <b className="text-[#171a33]">{liveShareOfShop.toFixed(1)}%</b> of all the live GMV on
                your shop
              </>
            )}
            . The three add to {money(chTotal)}
            {Math.abs(chTotal - rosterGmv) < 1 ? ' exactly' : ''}.
            {/* A zero next to a non-zero stream count reads as a failure. It is
                not: live sells in the room, and these creators are contracted
                for video. Saying so is better than leaving the client to guess. */}
            {channels.rosterLiveStreams > 0 && channels.rosterLiveGmv === 0 && (
              <>
                {' '}Those streams sold nothing directly. Your roster is contracted for video, and
                live is used for reach rather than as a sales channel here.
              </>
            )}
          </p>
        </div>
      )}

      {topLive && topLive.length > 0 && (
        <div className="rounded-[14px] border border-[#e7e7f2] bg-white px-4 py-3.5 sm:col-span-2">
          <div className="text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">
            Who goes live for you
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-2.5">
            {topLive.map((l) => (
              <div key={l.handle} className="min-w-0">
                <div className="truncate text-[13px] font-bold text-[#171a33]">@{l.handle}</div>
                <div className="text-[11.5px] tabular-nums text-[#8a8fb0]">
                  {money(l.liveGmv)} &middot; {num(l.lives)} live{l.lives === 1 ? '' : 's'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InvestmentStrip({ g }: { g: NonNullable<BrandClientReportData['granular']> }) {
  const budget = finite(g.roster.monthlyRetainerBudget);
  return (
    <div className="mt-3 rounded-[14px] border border-[#e7e7f2] bg-white px-5 py-4">
      {/* ⚠️ NO "Signed creators" and NO "Posts published" here, deliberately.
          Both already appear earlier in the report from a DIFFERENT source and
          at a DIFFERENT grain, and showing a second value under the same name
          is the exact defect this pass exists to remove. Seen live on Lemme:
          the headline said 159 posts while this strip said 193, and Roster
          coverage said 218 signed creators while this said 142. Only figures
          that appear nowhere else belong in this strip. */}
      <div className="flex flex-wrap items-baseline gap-x-7 gap-y-2.5">
        <MiniStat label="On retainer" value={num(g.roster.onRetainer)} />
        <MiniStat
          label="Affiliate-only"
          value={num(g.roster.affiliateOnly)}
          note="commission, no post requirement"
        />
        {budget !== null && budget > 0 && (
          <MiniStat
            label="Retainer budget"
            value={`${money(budget)}/mo`}
            /* Only claim "as agreed for this period" when a record actually
               covers it. Otherwise this is the current agreement carried back,
               and saying so is the difference between a figure and a guess. */
            note={
              g.roster.retainerHistoryExact === false
                ? 'current agreement'
                : 'monthly commitment'
            }
          />
        )}
        <MiniStat
          label="Videos earning"
          value={num(g.videoCounts.videosEarning)}
          note="including earlier posts"
        />
      </div>
    </div>
  );
}

function MiniStat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">{label}</div>
      <div className="mt-0.5 text-[17px] font-extrabold tabular-nums leading-none text-[#171a33]">{value}</div>
      {note && <div className="mt-1 text-[11px] leading-tight text-[#8a8fb0]">{note}</div>}
    </div>
  );
}

/**
 * Where the period's sales actually came from, by the month each video was
 * POSTED.
 *
 * Measured on Lemme (week of 2026-08-04): July's posts carried 45.6% of the
 * week while August's carried 26.5%. A "new video GMV" headline scoped to the
 * report window alone would have reported 3.1% and been read as the roster
 * doing nothing, when the truth is that content earns for roughly 90 days and
 * the previous month is usually the peak.
 */
function VintageSection({
  g,
  word,
}: {
  g: NonNullable<BrandClientReportData['granular']>;
  word: string;
}) {
  const total = finite(g.newVideo.totalGmv) ?? 0;
  const gmv30 = finite(g.newVideo.gmv30d) ?? 0;
  const pct30 = total > 0 ? (gmv30 / total) * 100 : null;
  const unknown = finite(g.newVideo.unknownPostDateGmv) ?? 0;
  const rows = [
    // ⚠️ Skip zero-GMV months. An August report was listing "SEP 2026 $0 ·
    // 3 videos": a bucket outside the window, contributing nothing.
    ...g.vintage.filter((v) => v.gmv > 0).map((v) => ({ label: v.label, videos: v.videos, gmv: v.gmv, isOlder: false })),
    ...(g.vintageOlder.videos > 0 || g.vintageOlder.gmv > 0
      ? [{ label: 'Earlier', videos: g.vintageOlder.videos, gmv: g.vintageOlder.gmv, isOlder: true }]
      : []),
  ];
  // The share carried by content posted before the three months listed. Stated
  // as a number because it is usually the most persuasive figure in the report
  // and it was previously left for the reader to infer from bar lengths.
  const olderPct =
    total > 0 && g.vintageOlder.gmv > 0 ? (g.vintageOlder.gmv / total) * 100 : null;
  /** Share of roster revenue from content published since CC started. */
  const nn = g.netNew;
  const netNewPct =
    nn && finite(nn.totalGmv) && nn.totalGmv > 0 ? (nn.netNewGmv / nn.totalGmv) * 100 : null;

  return (
    <div className="rounded-[14px] border border-[#e7e7f2] bg-white px-5 py-5">
      <h2 className="text-[20px] font-extrabold leading-snug tracking-tight text-[#171a33]">
        Every month of posting keeps earning
      </h2>
      <p className="mt-1.5 max-w-[68ch] text-[14.5px] leading-[1.65] text-[#33375c]">
        {total > 0 ? (
          <>
            {/* The net-new share used to be its own section further up the page.
                It answers "is this OUR work" and belongs beside the months that
                answer "when was it made", not in a separate place where the two
                read as competing claims. */}
            {netNewPct !== null && (
              <>
                <b className="text-[#171a33]">{netNewPct.toFixed(1)}%</b> of your roster&rsquo;s revenue
                this {word} came from videos published after we started with each creator; the rest is
                their earlier content, still selling.{' '}
              </>
            )}
            {olderPct !== null && olderPct >= 15 ? (
              <>
                And it keeps earning long after it goes up:{' '}
                <b className="text-[#171a33]">{olderPct.toFixed(1)}%</b> of this {word}&rsquo;s sales
                came from posts older than the months below. That back catalogue is what the work
                compounds into.
              </>
            ) : (
              <>Content published earlier is still selling, which is why posting consistently compounds.</>
            )}
          </>
        ) : (
          <>No roster sales in this {word}, so there is no split to show.</>
        )}
      </p>

      {/* Cards, not bars. Each month is a share of one total, and the point
          is the share — which a card states and a bar length only implies. */}
      <div className="mt-5 grid grid-cols-2 gap-3.5 md:grid-cols-4">
        {rows.map((r) => {
          const share = total > 0 ? (r.gmv / total) * 100 : null;
          return (
            <div
              key={r.label}
              className="rounded-[12px] border bg-white px-3.5 py-3"
              style={{ borderColor: r.isOlder ? '#4b45ff' : '#e7e7f2' }}
            >
              <div className="text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">
                {r.isOlder ? 'Earlier posts' : r.label}
              </div>
              <div className="mt-0.5 text-[19px] font-extrabold tabular-nums text-[#171a33]">
                {money(r.gmv)}
              </div>
              <div className="mt-1 text-[11.5px] tabular-nums text-[#8a8fb0]">
                {share !== null ? `${share.toFixed(1)}%` : '—'}
                {r.videos > 0 && <> &middot; {num(r.videos)} videos</>}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[11.5px] leading-[1.6] text-[#8a8fb0]">
        Grouped by the month each video was posted, counting only sales made during this {word}.
        {/* It is NOT in "neither": get_brand_client_report_granular puts null
            post_date into vintageOlder (`posted_month is null or ...`), which is
            why the buckets already sum to video GMV exactly. The old wording
            claimed money was missing from a total it was actually in. */}
        {unknown > 0 && (
          <> {money(unknown)} came from videos with no recorded post date and is counted in the
          oldest group.</>
        )}
      </p>
    </div>
  );
}

/**
 * Every signed creator — the ones who did something, in full; the rest
 * summarised and available behind a disclosure.
 *
 * Measured on Lemme for the week of 2026-08-02: 142 rows, of which 94 had no
 * posts and no GMV, and the top 10 carried 98.8% of roster GMV. Printing 94
 * blank rows does not make a report more transparent, it makes the 48 rows
 * that matter harder to find. Nothing is hidden — the full list is one click
 * away and the dormant count is stated, with its retainer split, because "24
 * of them are on retainer" is the part a brand is entitled to know.
 *
 * ⚠️ `quota` is null for affiliate-only creators and renders as absence. All
 * 85 of Lemme's affiliate-only rows carry a non-zero monthly_post_requirement
 * in the database and it is phantom — they never agreed to one.
 */
function FullRosterTable({
  g,
  judgeQuota,
  token,
}: {
  g: NonNullable<BrandClientReportData['granular']>;
  /** Whether the window is the month the monthly quota was written for. */
  judgeQuota: boolean;
  /** For the CSV export, which is public by this same opaque token. */
  token: string;
}) {
  /**
   * Show the level column only where enough of the roster actually carries
   * one. Below half and the column is mostly dashes, which reads as missing
   * data on a page whose whole point is that the numbers are trustworthy.
   */
  const showLevel = (g.roster.roleCoverage ?? 0) >= 50;
  const rows = g.creators;
  const active = rows.filter((c) => c.gmv > 0 || c.postsPublished > 0);
  const dormant = rows.filter((c) => c.gmv === 0 && c.postsPublished === 0);
  const dormantRetained = dormant.filter((c) => !c.isAffiliate).length;
  const dormantAffiliate = dormant.length - dormantRetained;

  return (
    <div className="overflow-hidden rounded-[14px] border border-[#e7e7f2] bg-white">
      <div className="border-b border-[#eeedf5] px-4 py-3">
        {/* Deliberately does NOT restate posted / sold / signed: those are the
            tiles immediately above, derived from THIS array, and printing them
            twice is how the page ended up with 259 next to 293. */}
        <p className="text-[13px] leading-[1.6] text-[#33375c]">
          Every creator we run for you, sorted by what they earned this period.{' '}
          <b className="text-[#171a33]">{num(g.roster.affiliateOnly)}</b> of your roster are
          affiliate-only &mdash; commission, with no post requirement, so they carry no posting target.
        </p>
        {/* Downloads the FULL list, including the dormant rows folded behind
            the disclosure below. Hiding them is a density decision, not a
            privacy one, and a spreadsheet missing its tail is worse than none. */}
        <a
          href={`/api/report-csv/${token}`}
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-[9px] border border-[#e7e7f2] bg-[#fbfbfd] px-3 py-1.5 text-[12px] font-bold text-[#4b45ff] transition-colors hover:bg-[#f2f1fb]"
        >
          &#8595; Download all {num(rows.length)} as CSV
        </a>
      </div>

      <PaginatedCreatorRows rows={active} judgeQuota={judgeQuota} showLevel={showLevel} />

      {dormant.length > 0 && (
        <details className="group border-t border-[#eeedf5]">
          <summary className="cursor-pointer list-none px-4 py-3 text-[12.5px] text-[#6b7093] hover:bg-[#fbfbfd]">
            <span className="font-semibold text-[#4b45ff] underline decoration-[#4b45ff]/30 underline-offset-2">
              Show the other {num(dormant.length)}
            </span>{' '}
            with no posts or sales this period
            {dormantRetained > 0 && (
              <>
                {' '}&mdash; {num(dormantAffiliate)} affiliate-only, {num(dormantRetained)} on retainer
              </>
            )}
          </summary>
          <PaginatedCreatorRows rows={dormant} judgeQuota={judgeQuota} showLevel={showLevel} muted />
        </details>
      )}
    </div>
  );
}

/**
 * Monthly commitments, judged over the month, inside a report about a week.
 *
 * 🚨 THIS SECTION EXISTS BECAUSE THE UNITS DID NOT MATCH. Post targets and
 * retainers are monthly; a weekly report measured them over 7 days, so Dr.
 * Dent's week of 2026-08-23 showed 15 retained creators at "0 / 30" and read
 * as an idle roster. Nothing was wrong with the counts, only with what they
 * were divided by.
 *
 * ⚠️ NOTHING HERE IS PRO-RATED. The target stays the full monthly count and
 * the retainer stays the full monthly retainer; the days elapsed are printed
 * beside them as a fact the reader can weigh. Scaling either to the elapsed
 * days would invent a cadence nobody agreed to, and nothing here projects a
 * month-end total.
 */
function MonthToDate({
  mtd,
  signings,
}: {
  mtd: NonNullable<BrandClientReportData['monthToDate']>;
  signings?: BrandClientReportData['signings'];
}) {
  const g = mtd.granular;
  const contracted = g.creators.filter((c) => !c.isAffiliate && !c.departed && (c.quota ?? 0) > 0);
  if (contracted.length === 0) return null;

  const owed = contracted.reduce((s, c) => s + (c.quota ?? 0), 0);
  const delivered = contracted.reduce((s, c) => s + c.postsPublished, 0);
  const met = contracted.filter((c) => c.postsPublished >= (c.quota ?? 0)).length;

  // The window is month-to-date BY CONSTRUCTION here, so classify it rather
  // than assuming: a report whose end date lands on the last of the month
  // makes this a complete month, and the wording has to follow.
  const spend = estimateDeliveredSpend(g.creators, classifySpendWindow(mtd.start, mtd.end));
  const caveats = spend
    ? spendCaveats(spend.defaultQuotaShare, g.roster.retainerHistoryExact !== false)
    : [];
  const monthName = mtd.end.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  /**
   * Retained creators who published NOTHING this month. Not "sold nothing":
   * selling depends on the algorithm, publishing is the thing they agreed to
   * and the thing CC can actually chase.
   */
  const silent = contracted
    .filter((c) => c.postsPublished === 0)
    .sort((a, b) => b.retainer - a.retainer);
  const silentRetainer = silent.reduce((s, c) => s + c.retainer, 0);
  const complete = mtd.daysElapsed >= mtd.daysInMonth;

  const postPct = owed > 0 ? (delivered / owed) * 100 : null;

  return (
    <div className="mt-3.5 rounded-[14px] border border-[#e7e7f2] bg-white px-5 py-4">
      <div className="text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">
        {complete ? `All of ${monthName}` : `${monthName} so far`}
      </div>
      <p className="mt-1 max-w-[70ch] text-[12.5px] leading-[1.6] text-[#8a8fb0]">
        Post targets and retainers are monthly, so they are measured here over the month rather
        than the period above.
      </p>

      {/* Tiles, not paragraphs. Every other section on this page leads with
          numbers you can scan; this one shipped as four stacked blocks of
          prose and read as a wall. */}
      <div className="mt-3 grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <Mini
          label="Days elapsed"
          value={`${num(mtd.daysElapsed)} of ${num(mtd.daysInMonth)}`}
          note={complete ? 'complete month' : 'month still running'}
        />
        <Mini
          label="Contracted posts"
          value={`${num(delivered)} of ${num(owed)}`}
          note={postPct !== null ? `${postPct.toFixed(0)}% delivered` : undefined}
        />
        <Mini
          label="Met their commitment"
          value={`${num(met)} of ${num(contracted.length)}`}
          note="retained creators, full monthly count"
        />
        {spend && (
          <Mini
            label={complete ? 'Retainer spend' : 'Retainer earned'}
            value={money(spend.earned)}
            note={
              spend.pctOfBudget !== null
                ? `${spend.pctOfBudget.toFixed(0)}% of ${money(spend.budget)}`
                : undefined
            }
          />
        )}
      </div>

      {/* 🚨 THE ACTION ITEMS. Without this a brand has to hand-scan 154 rows
          to find the creators worth a conversation, so nobody does, and the
          report stays a thing to read rather than a thing to act on.
          MONTH grain, because a retainer is monthly: judging it over a week is
          the unit mismatch this whole section exists to correct. */}
      {silent.length > 0 && (
        <div className="mt-3 border-t border-[#eeedf5] pt-3">
          <div className="text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">
            Worth a conversation
          </div>
          <p className="mt-1.5 max-w-[70ch] text-[15px] font-semibold leading-[1.6] text-[#33375c]">
            <b className="text-[#171a33]">{num(silent.length)}</b> of your{' '}
            {num(contracted.length)} retained creators have published nothing at all in{' '}
            {monthName}
            {silentRetainer > 0 && (
              <>
                , carrying <b className="text-[#171a33]">{money(silentRetainer)}/mo</b> of committed
                retainer between them
              </>
            )}
            .
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] leading-[1.6] text-[#6b7093]">
            {silent.slice(0, 8).map((c) => (
              <li key={c.handle ?? c.name} className="tabular-nums">
                @{(c.handle ?? c.name).replace(/^@+/, '')}
                {c.retainer > 0 && <span className="text-[#8a8fb0]"> {money(c.retainer)}/mo</span>}
              </li>
            ))}
            {silent.length > 8 && <li className="text-[#8a8fb0]">and {num(silent.length - 8)} more</li>}
          </ul>
          <p className="mt-2 text-[11.5px] leading-[1.6] text-[#8a8fb0]">
            These are the ones we are chasing. Their retainer is only earned against posts
            delivered, so an empty month costs you less than the committed figure suggests.
          </p>
        </div>
      )}

      {/* New signings. MONTH grain on purpose: Dr. Dent's August signings
          landed on 8 separate days (2, 7, 1, 2, 1, 7, 41, 2), so a weekly count
          reads zero most weeks and makes a live pipeline look dead.
          🚨 Suppressed in a brand's FIRST month, where the whole opening roster
          shares one cc_start_date and would read as a recruiting spree. */}
      {signings && !signings.isFirstMonth && (
        <div className="mt-3 border-t border-[#eeedf5] pt-3">
          <div className="text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">
            New creators signed
          </div>
          <p className="mt-1.5 max-w-[70ch] text-[15px] font-semibold leading-[1.6] text-[#33375c]">
            <b className="text-[#171a33]">{num(signings.signed)}</b> new creator
            {signings.signed === 1 ? '' : 's'} joined your roster in {signings.monthLabel}
            {signings.signedRetained > 0 && (
              <>
                , <b className="text-[#171a33]">{num(signings.signedRetained)}</b> of them on a
                retainer
              </>
            )}
            .
            {signings.priorComparable && (
              <> That compares with {num(signings.signedPrior)} in {signings.priorMonthLabel}.</>
            )}
          </p>
          <p className="mt-1.5 max-w-[70ch] text-[12.5px] leading-[1.6] text-[#8a8fb0]">
            Counted by the date each creator signed with us for your brand, including any who have
            since left, so this figure does not change after the fact.
          </p>
        </div>
      )}

      {spend && (
        <div className="mt-3.5 border-t border-[#eeedf5] pt-3">
          <p className="max-w-[70ch] text-[12.5px] leading-[1.6] text-[#8a8fb0]">
            <b className="text-[#33375c]">How the spend figure works.</b> Each creator&rsquo;s
            retainer is scaled by what they actually published: deliver the full count and it earns
            in full, deliver half and it earns half. Nobody is counted above 100%, so overdelivery
            does not raise it.
            {!complete && ' This is what published posts have earned, not a forecast.'}
          </p>
          {caveats.length > 0 && (
            <p className="mt-2 rounded-[10px] bg-[#f6f6fb] px-3 py-2 text-[11.5px] leading-[1.6] text-[#8a8fb0]">
              An estimate, not a payment record: {caveats.join('; ')}. Treat the gap as an
              indication of delivery, not as money unspent.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The roster's best-selling posts.
 *
 * Was three thumbnail cards with inline playback. A list carries five rows in
 * less vertical space, puts orders and views on the same line as the GMV they
 * produced, and is scannable — a card grid makes you read each card to compare
 * any two. The title links out to the post itself.
 *
 * ⚠️ There is deliberately NO "type" column. Lives are recorded at
 * creator-day grain (live_gmv / live_streams on creator_performance) and there
 * is no per-stream row anywhere, so every row here is necessarily a video and
 * the column would read "Video" all the way down. Live selling has its own
 * block, under "Where our GMV came from".
 */
function TopPosts({
  rows,
}: {
  rows: { title: string; creator: string; gmv: number; orders: number; videoUrl: string | null; viewsLabel: string | null }[];
}) {
  return (
    <>
      <div className="overflow-x-auto rounded-[14px] border border-[#e7e7f2] bg-white">
        <table className="w-full min-w-[620px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-[#eeedf5]">
              <th className={TH_L}>Post</th>
              <th className={`${TH_L} whitespace-nowrap`}>Creator</th>
              <th className={`${TH_R} whitespace-nowrap`}>Views</th>
              <th className={`${TH_R} whitespace-nowrap`}>Orders</th>
              <th className={`${TH_R} whitespace-nowrap`}>GMV</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v, i) => {
              const handle = v.creator ? handleOf(v.creator) : '';
              return (
                <tr key={i} className="border-b border-[#f2f1f8] last:border-b-0">
                  <td className="max-w-[300px] px-4 py-2.5">
                    <div className="truncate font-semibold text-[#171a33]" title={v.title}>
                      {v.videoUrl ? (
                        <a
                          href={v.videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#4b45ff] underline decoration-[#4b45ff]/30 underline-offset-2 hover:decoration-[#4b45ff]"
                        >
                          {v.title}
                        </a>
                      ) : (
                        v.title
                      )}
                    </div>
                  </td>
                  <td className="max-w-[170px] px-4 py-2.5">
                    <div className="truncate">
                      {handle ? (
                        <a
                          href={`https://www.tiktok.com/@${handle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-[#4b45ff] underline decoration-[#4b45ff]/30 underline-offset-2 hover:decoration-[#4b45ff]"
                        >
                          @{handle}
                        </a>
                      ) : (
                        <span className="text-[#b9bcd0]">&mdash;</span>
                      )}
                    </div>
                  </td>
                  {/* Views come from a separate lookup and are genuinely
                      absent for some posts — an em dash, never a 0. */}
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-[#33375c]">
                    {v.viewsLabel ?? <span className="text-[#b9bcd0]">&mdash;</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-[#33375c]">
                    {num(v.orders)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right font-extrabold tabular-nums text-[#171a33]">
                    {money(v.gmv)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-[10.5px] text-[#8a8fb0]">
        Titles link to the post on TikTok. Figures are frozen at preparation and do not shift after
        sending.
      </div>
    </>
  );
}




/**
 * What was committed against what was delivered.
 *
 * The month-in-review question is not "how did we do" but "what did my money
 * buy", and this is the answer: contracted posts against posts actually
 * published, per creator and in total.
 *
 * ⚠️ RETAINED CREATORS ONLY. Affiliate-only creators carry NO post commitment —
 * roughly 63% of the roster — and counting them here would invent a shortfall
 * against a target nobody agreed to. That is the same phantom
 * monthly_post_requirement that once had the roster reporting 85 Lemme creators
 * as missing a quota they never had.
 *
 * ⚠️ ACTUAL SPEND RENDERS AS ABSENCE. Creator payouts run on a spreadsheet
 * outside Tempo, and the invoice figure is CC's management fee plus commission,
 * not creator cost.
 *
 * DELIVERY-WEIGHTED spend IS now shown, because CC's actual payment rule is
 * retainer x (delivered / agreed) capped at 100%, which is arithmetic on known
 * inputs rather than an apportionment invented to fill a gap.
 *
 * It reads two ways and the window decides which: over a COMPLETE month it
 * estimates what CC owes, and MONTH TO DATE it is what already-published posts
 * have earned so far, which is a different sentence and must be written as
 * one. Neither pro-rates the target or the retainer to the elapsed days, and
 * neither projects a month-end total. See lib/data/delivered-spend.ts.
 */
function MonthlyDelivery({
  g,
  budget,
  actualSpend,
  start,
  end,
}: {
  g: NonNullable<BrandClientReportData['granular']>;
  budget: number | null;
  /** Null until payouts are ingested. NEVER derived. */
  actualSpend: number | null;
  start: Date;
  end: Date;
}) {
  const contracted = g.creators.filter((c) => !c.isAffiliate && !c.departed && (c.quota ?? 0) > 0);
  if (contracted.length === 0) return null;

  const owed = contracted.reduce((s, c) => s + (c.quota ?? 0), 0);
  const delivered = contracted.reduce((s, c) => s + c.postsPublished, 0);
  const met = contracted.filter((c) => c.postsPublished >= (c.quota ?? 0)).length;
  // Null unless the window starts on the 1st and stays inside one month.
  const spendWindow = classifySpendWindow(start, end);
  const spend = estimateDeliveredSpend(g.creators, spendWindow);
  const mtd = spend?.partial ?? null;
  const caveats = spend
    ? spendCaveats(spend.defaultQuotaShare, g.roster.retainerHistoryExact !== false)
    : [];
  const short = contracted.length - met;
  const pct = owed > 0 ? (delivered / owed) * 100 : null;

  /**
   * ⚠️ THE QUOTA IS MONTHLY. Measuring a PART of a month against it makes every
   * creator look short: jiyu 01-26 August read 830 of 1,731 (48%) purely
   * because four days had not happened yet.
   *
   * The window is NOT pro-rated — inventing a partial target would be the same
   * apportionment this report refuses everywhere else. Instead the shortfall is
   * stated as what it is, and an incomplete month says so, so 48% is never read
   * as failure.
   */
  const lastOfMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0));
  const wholeMonth = spendWindow.kind === 'month';
  const daysCovered = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const daysInMonth = lastOfMonth.getUTCDate();

  return (
    <>
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <Mini
          label="Posts contracted"
          value={num(owed)}
          note={`across ${num(contracted.length)} creator${contracted.length === 1 ? '' : 's'}`}
        />
        <Mini
          label="Posts delivered"
          value={num(delivered)}
          note={pct !== null ? `${pct.toFixed(0)}% of contracted` : undefined}
        />
        <Mini
          label="Met their commitment"
          value={num(met)}
          note={short > 0 ? `${num(short)} fell short` : 'everyone delivered'}
        />
        <Mini
          label="Retainer committed"
          value={budget !== null && budget > 0 ? `${money(budget)}/mo` : '—'}
          note={
            actualSpend !== null
              ? `${money(actualSpend)} actually paid`
              : 'committed before delivery'
          }
        />
      </div>
      {!wholeMonth && (
        <div className="mt-2 rounded-[12px] bg-[#fbf1dc] px-4 py-3 text-[12.5px] leading-[1.6] text-[#8a5a08]">
          <b>This period covers {num(daysCovered)} of {num(daysInMonth)} days.</b> The post targets above
          are monthly, so a part-month will always read short against them. Delivery is only comparable
          to the commitment over a complete month.
        </div>
      )}
      {spend && (
        <div className="mt-3.5 rounded-[14px] border border-[#e7e7f2] bg-white px-5 py-4">
          <div className="text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">
            {mtd ? 'Retainer earned so far' : 'Estimated retainer spend'}
          </div>
          <p className="mt-1.5 max-w-[70ch] text-[15px] font-semibold leading-[1.6] text-[#33375c]">
            <b className="text-[#171a33]">{money(spend.earned)}</b> of the{' '}
            {money(spend.budget)} committed
            {spend.pctOfBudget !== null && (
              <>, or <b className="text-[#171a33]">{spend.pctOfBudget.toFixed(0)}%</b></>
            )}
            , once each creator&rsquo;s retainer is scaled by what they actually published.
          </p>
          {/* Month to date the SAME arithmetic answers a different question,
              so the day count is not a footnote: without it this reads as a
              shortfall rather than as progress through a month still running. */}
          {mtd && (
            <p className="mt-1.5 max-w-[70ch] text-[12.5px] leading-[1.6] text-[#8a8fb0]">
              This is what posts already published have earned, not a forecast and not a final
              figure. The remaining{' '}
              <b className="text-[#33375c]">
                {num(mtd.daysInMonth - mtd.daysElapsed)} days of the month
              </b>{' '}
              are still open for the rest to be earned.
            </p>
          )}
          <p className="mt-1.5 max-w-[70ch] text-[12.5px] leading-[1.6] text-[#8a8fb0]">
            {num(spend.fullyDelivered)} of {num(spend.creators)} retained creators
            {mtd ? ' have already delivered' : ' delivered'} their full monthly count and are
            counted at 100%; nobody is counted above it, so overdelivery does not raise the figure.
          </p>
          {caveats.length > 0 && (
            <p className="mt-2 rounded-[10px] bg-[#f6f6fb] px-3 py-2 text-[11.5px] leading-[1.6] text-[#8a8fb0]">
              An estimate, not a payment record: {caveats.join('; ')}. Treat the gap as an
              indication of delivery, not as money unspent.
            </p>
          )}
        </div>
      )}
      <div className="mt-2 text-[10.5px] leading-relaxed text-[#8a8fb0]">
        Counts only creators on a retainer with an agreed monthly post target. Affiliate-only creators
        take commission and carry no post commitment, so they are not measured against one.
      </div>
    </>
  );
}

/**
 * How much of the month's revenue is content Creator's Corner started.
 *
 * Some brands worked with a creator before CC did and credit CC only with
 * revenue from content posted after the relationship began.
 *
 * ⚠️ ADDITIVE. The roster total above is unchanged and still counts everything;
 * this splits it. netNew + preCc === the roster total, and the copy says which
 * is which rather than leaving the reader to assume the smaller number is a
 * correction.
 */
function NetNewSplit({ n }: { n: NonNullable<NonNullable<BrandClientReportData['granular']>['netNew']> }) {
  const total = n.totalGmv;
  if (total <= 0) return null;
  const pct = (n.netNewGmv / total) * 100;
  return (
    <div className="rounded-[14px] border border-[#e7e7f2] bg-white px-5 py-4">
      <div className="text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">
        Content we started vs content that predates us
      </div>
      <SplitBar
        parts={[
          { label: 'Posted since we started', value: money(n.netNewGmv), pct, color: '#4b45ff' },
          {
            label: 'Posted before we started',
            value: money(n.preCcGmv),
            pct: 100 - pct,
            color: '#c7c9de',
          },
        ]}
      />
      <p className="mt-2.5 max-w-[70ch] text-[12.5px] leading-[1.6] text-[#33375c]">
        <b className="text-[#171a33]">{pct.toFixed(1)}%</b> of your roster&rsquo;s revenue this month came
        from videos published after we began working with each creator. The rest is their earlier
        content, still selling.
      </p>
    </div>
  );
}

/**
 * What moved, week over week.
 *
 * The standing report can say "roster GMV down 5.7%". It cannot say WHY,
 * because every prior-window figure it holds is an aggregate. This is the
 * per-creator movement behind that delta.
 *
 * ⚠️ GROSS UP AND GROSS DOWN ARE SHOWN SEPARATELY, never collapsed into "N
 * creators explain X% of the change". A net figure is the residue of two
 * opposing forces and one percentage against it hides their size: jiyu's week
 * was $6,169 gained against $9,098 lost, netting -$2,930. Reporting "95%
 * explained" would have been true and useless.
 *
 * ⚠️ A creator who went from nothing to something is NEW, not "up ∞%". The
 * percentage of zero does not exist and inventing one is how a report starts
 * lying at the edges.
 */
function Movers({
  m,
  word,
}: {
  m: NonNullable<ClientReportSnapshot['movers']>;
  word: string;
}) {
  if (m.list.length === 0) return null;
  const up = m.netChange >= 0;
  return (
    <>
      <div className="rounded-[14px] border border-[#e7e7f2] border-l-[3px] border-l-[#4b45ff] bg-white px-5 py-4">
        <p className="max-w-[70ch] text-[15px] font-semibold leading-[1.6] text-[#33375c]">
          Creators added <b className="text-[#0d9f6e]">{money(Math.abs(m.gained))}</b> against{' '}
          <b className="text-[#cf3a6e]">{money(Math.abs(m.lost))}</b> given back, for a net{' '}
          <b className="text-[#171a33]">
            {up ? 'gain' : 'fall'} of {money(Math.abs(m.netChange))}
          </b>{' '}
          on the {word} before.
        </p>
        {(m.started > 0 || m.stopped > 0) && (
          <p className="mt-1.5 text-[12.5px] leading-[1.6] text-[#8a8fb0]">
            {m.started > 0 && (
              <>
                <b className="text-[#171a33]">{num(m.started)}</b> creator
                {m.started === 1 ? '' : 's'} sold for the first time this {word}
              </>
            )}
            {m.started > 0 && m.stopped > 0 && ' · '}
            {m.stopped > 0 && (
              <>
                <b className="text-[#171a33]">{num(m.stopped)}</b> who sold last {word} did not this
                one
              </>
            )}
            .
          </p>
        )}
      </div>

      <div className="mt-3 overflow-x-auto rounded-[14px] border border-[#e7e7f2] bg-white">
        <table className="w-full min-w-[520px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-[#eeedf5]">
              <th className={TH_L}>Creator</th>
              <th className={`${TH_R} whitespace-nowrap`}>Last {word}</th>
              <th className={`${TH_R} whitespace-nowrap`}>This {word}</th>
              <th className={`${TH_R} whitespace-nowrap`}>Change</th>
            </tr>
          </thead>
          <tbody>
            {m.list.map((c) => {
              const h = handleOf(c.handle);
              return (
                <tr key={c.handle} className="border-b border-[#f2f1f8] last:border-b-0">
                  <td className="max-w-[220px] px-4 py-2.5">
                    <div className="truncate font-semibold text-[#171a33]">
                      {c.name?.trim() ? c.name : `@${h}`}
                    </div>
                    {c.name?.trim() && (
                      <a
                        href={`https://www.tiktok.com/@${h}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-[11.5px] font-semibold text-[#4b45ff] underline decoration-[#4b45ff]/30 underline-offset-2"
                      >
                        @{h}
                      </a>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-[#33375c]">
                    {c.prior > 0 ? money(c.prior) : <span className="text-[#b9bcd0]">&mdash;</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-[#33375c]">
                    {c.cur > 0 ? money(c.cur) : <span className="text-[#b9bcd0]">&mdash;</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    {c.movement === 'new' ? (
                      <span className="rounded-[5px] bg-[#e7f7f0] px-1.5 py-0.5 text-[11px] font-bold text-[#0d9f6e]">
                        NEW
                      </span>
                    ) : c.movement === 'stopped' ? (
                      <span className="rounded-[5px] bg-[#fbeef1] px-1.5 py-0.5 text-[11px] font-bold text-[#cf3a6e]">
                        STOPPED
                      </span>
                    ) : (
                      <span
                        className={`font-extrabold tabular-nums ${
                          c.change >= 0 ? 'text-[#0d9f6e]' : 'text-[#cf3a6e]'
                        }`}
                      >
                        {c.change >= 0 ? '+' : '\u2212'}
                        {money(Math.abs(c.change))}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-[10.5px] text-[#8a8fb0]">
        The {num(m.list.length)} largest movements by dollar change. Every signed creator who sold in
        either {word} is counted in the totals above.
      </div>
    </>
  );
}

/** Which template renders a link. Stored on client_reports.report_type. */
export type ReportType = 'performance' | 'weekly' | 'monthly';

// ── The page ───────────────────────────────────────────────────────

export function ReportView({
  token,
  report: r,
  snapshot: s,
  notes,
  plan,
  brandName,
  periodLabel,
  reportType = 'performance',
}: {
  token: string;
  report: BrandClientReportData;
  snapshot: ClientReportSnapshot;
  notes: string | null;
  /** Forward commitment, hand-written. Absent renders nothing. */
  plan: string | null;
  brandName: string;
  periodLabel: string;
  reportType?: ReportType;
}) {
  /**
   * MONTH IN REVIEW is a different question from the standing report, not the
   * same one over 30 days: "what did my money buy" rather than "how did we
   * do". So it ADDS two sections — what was committed against what was
   * delivered, and how much of the revenue is content we started — and leaves
   * the rest of the report alone.
   */
  const isMonthly = reportType === 'monthly';
  const isWeekly = reportType === 'weekly';
  const word = periodWord(r.periodLengthDays);
  const reportKind =
    word === 'week' ? 'Weekly Performance Report' : word === 'month' ? 'Monthly Performance Report' : 'Performance Report';
  const frozen = new Date(s.generatedAt);
  const cc = r.creatorsCorner;
  const hasRoster = cc.signedCreatorCount > 0;
  // Absent on every snapshot frozen before migration 152. Its presence IS the
  // gate for the granular sections — an older report renders exactly as it
  // always did rather than showing empty tables or NaN.
  const gran = r.granular;
  // Whether the report window IS the month the monthly quota was written for.
  // Drives both the creator table's denominator and whether the month-to-date
  // block is needed at all.
  const windowIsMonth = classifySpendWindow(r.startDate, r.endDate).kind === 'month';

  // Fields added after older reports were frozen. priorVideos / videoChangePct
  // simply are not there and cannot be recovered, so they render as absent.
  // creatorChangePct CAN be recovered: priorCreatorCount predates it.
  const priorGmv = finite(cc.priorGmv);
  const priorVideos = finite(cc.priorVideos);
  const videoPct = finite(cc.videoChangePct) ?? (priorVideos !== null ? pctChange(cc.videos, priorVideos) : undefined);
  const priorCreators = finite(cc.priorCreatorCount);
  const creatorPct =
    finite(cc.creatorChangePct) ?? (priorCreators !== null ? pctChange(cc.activeCreatorCount, priorCreators) : undefined);

  /**
   * ACTIVE IS NOT ONE NUMBER (migration 165).
   *
   * `cc.activeCreatorCount` is posted OR sold, and it hid two different facts
   * behind one word. A creator who sold this period without posting once is
   * earning off content from months ago; counting them as active overstates
   * the work we did. Activation is measured on POSTING; sales sit beside it.
   *
   * `act` is undefined on every snapshot frozen before 165 — those reports keep
   * rendering the single number they were built with, because inventing a
   * split we never computed would be worse than the ambiguity.
   */
  const act = r.activity;

  /**
   * ⚠️ ONE SOURCE for every roster-creator count on this page.
   *
   * The page was printing two different numbers for the same fact, five
   * sections apart. Live on JiYu (week of 2026-08-17):
   *
   *     Roster coverage   "Signed creators 259"   "Active this period 78"
   *     Creator table     "77 of 293 signed creators posted or sold"
   *
   * Both were defensible and that is exactly the problem. get_..._counts
   * counts people on the roster TODAY (employment_status active AND not
   * archived); the granular creator list counts people who were on it DURING
   * the window, which is the right rule for a period report and the one used
   * for membership everywhere else.
   *
   * So when the creator list is present, every roster count is derived FROM
   * that list. The tiles and the table then cannot disagree, because they are
   * the same array.
   */
  const rosterAct = gran
    ? {
        signed: gran.creators.length,
        posted: gran.creators.filter((c) => c.postsPublished > 0).length,
        sold: gran.creators.filter((c) => c.gmv > 0).length,
        soldNotPosted: gran.creators.filter((c) => c.gmv > 0 && c.postsPublished === 0).length,
        departed: gran.creators.filter((c) => c.departed === true).length,
        /** Whether a period-over-period delta may be drawn on `posted`. The
         *  creator list is single-window, so there is no prior figure on the
         *  same basis — and a delta computed across two definitions is worse
         *  than no delta. */
        canCompare: false,
      }
    : act
      ? {
          signed: cc.signedCreatorCount,
          posted: act.rosterPosted,
          sold: act.rosterSold,
          soldNotPosted: act.rosterSoldNotPosted,
          departed: act.rosterDeparted,
          canCompare: act.rosterPostedPrior > 0,
        }
      : null;

  /**
   * The creator list is single-window, so `canCompare` is false whenever the
   * granular block drives the tile. But the ACTIVITY block carries a prior on
   * its own definition, and when the two definitions agree on the CURRENT
   * period they are measuring the same thing, so the prior is safe to use.
   * When they disagree, show nothing rather than a delta across definitions.
   */
  const postedDefinitionsAgree =
    !!rosterAct && !!act && act.rosterPosted === rosterAct.posted;
  const postedPct =
    rosterAct && act && act.rosterPostedPrior > 0 && (rosterAct.canCompare || postedDefinitionsAgree)
      ? pctChange(rosterAct.posted, act.rosterPostedPrior)
      : undefined;

  /**
   * Share of the shop, in percentage POINTS, from figures the snapshot already
   * carries. This tile showed a bare "—" and so hid the direction entirely:
   * Dr. Dent's week of 2026-08-23 fell 14.4% -> 12.6% while the page said only
   * "12.6%". A brand's core question is whether the agency is gaining or losing
   * ground on their shop, and the answer was being withheld by omission.
   */
  const priorStoreGmv = finite(r.priorTotalGmv);
  const priorShare =
    priorGmv !== null && priorStoreGmv !== null && priorStoreGmv > 0
      ? (priorGmv / priorStoreGmv) * 100
      : null;
  const sharePoints = priorShare !== null ? cc.pctOfStoreGmv - priorShare : null;

  // Share of the whole shop, on the same two definitions. `r.activeCreators`
  // is NOT used: it counts handles present in the TikTok export, which read
  // 40,954 on jiyu against 4,216 who posted.
  const vsShopRows = act && rosterAct
    ? [
        {
          label: 'GMV',
          ours: money(cc.gmv),
          theirs: money(r.totalGmv),
          pct: cc.pctOfStoreGmv,
        },
        {
          label: 'Creators posting',
          ours: num(rosterAct.posted),
          theirs: num(act.storeCreatorsPosted),
          pct: act.storeCreatorsPosted > 0 ? (rosterAct.posted / act.storeCreatorsPosted) * 100 : 0,
        },
        {
          label: 'Posts published',
          ours: num(cc.videos),
          theirs: num(r.totalVideos),
          pct: r.totalVideos > 0 ? (cc.videos / r.totalVideos) * 100 : 0,
        },
        // ⚠️ Gated on MATERIALITY, not existence. Dr. Dent's whole shop did
        // $919 of live GMV in a $367,178 week; a card reading "0.0% of $919"
        // earns its space on no page. 1% of store GMV is the bar.
        ...(r.channels && r.channels.storeLiveGmv > 0 && r.totalGmv > 0
        && r.channels.storeLiveGmv / r.totalGmv >= 0.01
          ? [
              {
                label: 'Live GMV',
                ours: money(r.channels.rosterLiveGmv),
                theirs: money(r.channels.storeLiveGmv),
                pct: (r.channels.rosterLiveGmv / r.channels.storeLiveGmv) * 100,
                live: true,
              },
            ]
          : []),
      ]
    : [];

  const viewsDelta = s.views !== null && s.priorViews !== null ? pctChange(s.views, s.priorViews) : null;

  // The honest case: our roster fell while the store rose. Stating it plainly
  // is the point — a report that only ever looks good stops being read.
  /**
   * "We fell while the shop did not."
   *
   * ⚠️ WAS GATED ON THE STORE RISING MORE THAN 2%, which is the wrong test and
   * stayed silent in the exact week it was written for: Dr. Dent 2026-08-23,
   * roster -11.7% against a store at +1.0%. The client sees that gap whether or
   * not the report mentions it, and a report that only volunteers good news
   * stops being read.
   *
   * Keyed on lost SHARE instead, which is the thing that actually happened, and
   * is what the tile above now prints.
   */
  /**
   * Return on retainer: roster GMV over the retainer those creators actually
   * earned this month.
   *
   * 🚨 THE REPORT NEVER ANSWERED THE FIRST QUESTION A CLIENT ASKS. It stated
   * what the roster produced at the top and what the retainer earned twelve
   * sections later, and left the division to the reader.
   *
   * ⚠️ WHOLE CALENDAR MONTHS ONLY, and for the same reason the spend figure is:
   * a retainer is monthly, so dividing a week of GMV by a month of retainer, or
   * by a part-month's earned figure, is a ratio of two different periods.
   *
   * ⚠️ Retainer only. Affiliate commission is not held in Tempo, so this is
   * return on the RETAINER spend, which is what the label says.
   */
  const monthSpend = windowIsMonth && gran
    ? estimateDeliveredSpend(gran.creators, classifySpendWindow(r.startDate, r.endDate))
    : null;
  const retainerReturn =
    monthSpend && monthSpend.earned > 0 && cc.gmv > 0 ? cc.gmv / monthSpend.earned : null;

  /**
   * 🚨 "17.0% of signed" WAS THE WRONG DENOMINATOR AND IT UNDERSOLD THE WORK.
   * It measured 75 posters against all 440 signed creators, 389 of whom are
   * affiliate-only and carry no posting obligation. Among the 51 RETAINED
   * creators, 37 posted — 73%, not 17%. Count only the people who agreed to
   * post, the same rule the delivery and spend sections already use.
   */
  const retainedPosted = gran
    ? (() => {
        const retained = gran.creators.filter((c) => !c.isAffiliate && !c.departed && c.retainer > 0);
        return retained.length > 0
          ? { posted: retained.filter((c) => c.postsPublished > 0).length, total: retained.length }
          : null;
      })()
    : null;

  const driver = moveDriver(s.movers);

  const divergence =
    hasRoster &&
    cc.gmvChangePct !== null &&
    cc.gmvChangePct < -2 &&
    sharePoints !== null &&
    sharePoints < -0.5;

  // Concentration: how much of the roster's GMV came from its top creator.
  const topManaged = cc.topCreators[0] ?? null;
  const topShare = topManaged && cc.gmv > 0 ? (topManaged.gmv / cc.gmv) * 100 : 0;
  /**
   * ⚠️ WAS 40%, which missed Dr. Dent's 37.3% by under three points and so
   * hid the largest single risk on the account. Concentration is a risk long
   * before one creator is nearly half the book.
   */
  /**
   * 🚨 CHECKING ONLY THE TOP CREATOR MISSED REAL CONCENTRATION. Cata-Kor's
   * biggest creator is 23.4% of roster GMV, under the old 30% bar, while the
   * top THREE are 48.3% and the top five 62.8%. The risk is not one person, it
   * is how few people the revenue rests on.
   *
   * ⚠️ Gated on having enough earners for the ratio to mean anything: on a
   * roster where three people earned at all, "the top three are 100%" is
   * arithmetic, not a finding. Measured across the twelve live reports, top-3
   * at 50% with 8+ earners flags seven and skips the small rosters.
   */
  const earners = cc.topCreators.filter((c) => c.gmv > 0);
  const top3 = cc.topCreators.slice(0, 3);
  const top3Gmv = top3.reduce((s, c) => s + c.gmv, 0);
  const top3Share = cc.gmv > 0 ? (top3Gmv / cc.gmv) * 100 : 0;
  const concentrated = topShare >= 30 || (earners.length >= 8 && top3Share >= 50);

  const weekly = s.weekly;
  const weeklyMax = Math.max(1, ...weekly.map((w) => w.gmv));
  const priorWasSpike =
    word === 'week' &&
    weekly.length >= 3 &&
    weekly[weekly.length - 2].gmv === weeklyMax &&
    weekly[weekly.length - 2].gmv > weekly[weekly.length - 1].gmv * 1.5;

  /**
   * Whether the trend chart can show our half at all.
   *
   * ⚠️ EVERY bucket has to carry the roster figure, not most of them. A
   * partially split chart would draw some weeks as store-only bars and read as
   * "we did nothing those weeks" — the exact misreading a chart is supposed to
   * prevent. All twelve or none.
   */
  const weeklySplit = weekly.length >= 3 && weekly.every((w) => w.rosterGmv !== undefined);

  /**
   * The sentence under the chart: where our share started and where it ended.
   *
   * ⚠️ Only weeks the store actually sold in. A dead week divides by zero, and
   * a near-dead one produces a share that swings on a handful of dollars.
   *
   * "Climbing in most weeks" is a claim about the SHAPE, so it is gated on the
   * shape: it needs a genuine rise and a majority of the steps going the same
   * way. Without that the sentence states the two endpoints and stops, because
   * a share that ended higher after falling for two months is not a climb.
   */
  const weeklyShare = (() => {
    if (!weeklySplit) return null;
    const pts = weekly
      .filter((w) => w.gmv > 0 && w.rosterGmv !== undefined)
      .map((w) => ({ week: w.weekEnd, pct: ((w.rosterGmv as number) / w.gmv) * 100 }));
    if (pts.length < 4) return null;
    const first = pts[0];
    const last = pts[pts.length - 1];
    let up = 0;
    for (let i = 1; i < pts.length; i++) if (pts[i].pct > pts[i - 1].pct) up++;
    const steps = pts.length - 1;
    return {
      first: first.pct,
      firstWeek: first.week,
      last: last.pct,
      lastWeek: last.week,
      monotonic: last.pct - first.pct >= 5 && up / steps >= 0.6,
    };
  })();

  const daily = r.dailyPerformance;
  const dailyLabels = daily.map((d, i) => {
    if (daily.length <= 10) return d.weekday.slice(0, 3);
    return i % 5 === 0 || i === daily.length - 1 ? fmtDay(d.date) : '';
  });

  // 5, not 3: the RPC has always returned five and the report showed three.
  const watchVideos = (cc.topVideos.length > 0 ? cc.topVideos : r.topVideos).slice(0, 5).map((v) => {
    const id = extractTikTokVideoId(v.videoUrl);
    const views = id !== null ? s.videoViews[id] : undefined;
    return { ...v, videoId: id, viewsLabel: views !== undefined ? compactCount(views) : null };
  });

  const lifetimeSince = s.lifetime.firstDate
    ? new Date(s.lifetime.firstDate + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="min-h-screen bg-[#fbfbfd] pb-10 text-[#171a33]">
      {/* Masthead */}
      <div
        className="px-5 pb-7 pt-8 text-white sm:px-11"
        style={{ background: 'linear-gradient(135deg,#141633 0%,#3b2f7d 55%,#8a2f80 100%)' }}
      >
        <div className="mx-auto flex max-w-[1000px] flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[10.5px] font-extrabold uppercase tracking-[0.2em] text-white/65">
              {AGENCY} &middot; {reportKind}
            </div>
            <h1 className="mb-0.5 mt-2 text-[28px] font-extrabold tracking-tight">{brandName}</h1>
            <div className="text-[13.5px] text-white/80">
              {periodLabel} &middot; prepared {fmtDay(frozen)}
            </div>
          </div>
          <a
            href={`/api/report-pdf/${token}`}
            className="rounded-[9px] border border-white/25 bg-white/15 px-3.5 py-1.5 text-xs font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/25"
          >
            &#8595; Download PDF
          </a>
        </div>
      </div>

      <div className="mx-auto max-w-[1000px] px-5 sm:px-11">
        {/* ── 1. What we delivered. The agency leads. ────────────── */}
        {hasRoster && (
          <>
            <SectionLine>What we delivered</SectionLine>
            <div className="rounded-[14px] border border-[#e7e7f2] border-l-[3px] border-l-[#4b45ff] bg-white px-5 py-5">
              <h2 className="text-[20px] font-extrabold leading-snug tracking-tight text-[#171a33]">
                Your signed roster produced {money(cc.gmv)} this {word}
              </h2>
              <p className="mt-1.5 max-w-[68ch] text-[14.5px] leading-[1.65] text-[#33375c]">
                That is <b className="text-[#171a33]">{cc.pctOfStoreGmv.toFixed(1)}% of {brandName}&rsquo;s total store GMV</b>,
                from{' '}
                <b className="text-[#171a33]">
                  {num(rosterAct ? rosterAct.posted : cc.activeCreatorCount)} signed creators
                </b>{' '}
                who published <b className="text-[#171a33]">{num(cc.videos)} posts</b>
                {rosterAct && rosterAct.sold > 0 && (
                  <>
                    {' '}
                    &mdash; and <b className="text-[#171a33]">{num(rosterAct.sold)}</b> of your roster made sales
                  </>
                )}
                {cc.newlyActivatedCount > 0 && (
                  <>, including {cc.newlyActivatedCount} who activated for the first time</>
                )}
                .
              </p>
              <div className="mt-5 grid grid-cols-2 gap-5 md:grid-cols-4">
                <HeroStat
                  label="Roster GMV"
                  value={money(cc.gmv)}
                  pct={cc.gmvChangePct}
                  abs={priorGmv !== null ? money(Math.abs(cc.gmv - priorGmv)) : null}
                />
                <HeroStat
                  label="Share of store"
                  value={`${cc.pctOfStoreGmv.toFixed(1)}%`}
                  points={sharePoints}
                />
                <HeroStat
                  label={rosterAct ? 'Creators who posted' : 'Creators active'}
                  value={num(rosterAct ? rosterAct.posted : cc.activeCreatorCount)}
                  pct={rosterAct ? postedPct : creatorPct}
                />
                <HeroStat
                  label="Posts published"
                  value={num(cc.videos)}
                  pct={videoPct}
                  abs={priorVideos !== null ? num(Math.abs(cc.videos - priorVideos)) : null}
                />
              </div>
            </div>

            {/* The answer to "what did I get for my money", next to the
                figure it is derived from rather than twelve sections away. */}
            {retainerReturn !== null && monthSpend && (
              <p className="mt-3 max-w-[70ch] text-[14.5px] leading-[1.65] text-[#33375c]">
                Against <b className="text-[#171a33]">{money(monthSpend.earned)}</b> of retainer
                earned this month, that is{' '}
                <b className="text-[#171a33]">{retainerReturn.toFixed(1)}x</b> back on what the
                retained creators were paid.
              </p>
            )}

            {gran && <InvestmentStrip g={gran} />}

            {/* The WHY, before any warning about the WHAT. */}
            {driver && (
              <div className="mt-3 rounded-[12px] border border-[#e7e7f2] bg-white px-4 py-3.5 text-[13.5px] leading-[1.65] text-[#33375c]">
                {driver.kind === 'fall' ? (
                  <>
                    <b className="text-[#171a33]">
                      Most of the fall is one creator, not the roster.
                    </b>{' '}
                    @{driver.handle.replace(/^@+/, '')} came off {money(driver.amount)}, which is{' '}
                    {driver.share.toFixed(0)}% of the {money(driver.grossDown)} that dropped this{' '}
                    {word}
                    {driver.grossUp > 0 && (
                      <>
                        , while {money(driver.grossUp)} was added across other creators
                      </>
                    )}
                    . A single post that runs hot one {word} and cools the next moves the total
                    more than the rest of the roster does.
                  </>
                ) : (
                  <>
                    <b className="text-[#171a33]">Most of the gain is one creator.</b>{' '}
                    @{driver.handle.replace(/^@+/, '')} added {money(driver.amount)}, which is{' '}
                    {driver.share.toFixed(0)}% of the {money(driver.grossUp)} gained this {word}
                    {driver.grossDown > 0 && (
                      <>
                        , against {money(driver.grossDown)} that came off elsewhere
                      </>
                    )}
                    .
                  </>
                )}
              </div>
            )}

            {divergence && (
              <div className="mt-3 rounded-[12px] bg-[#fbf1dc] px-4 py-3.5 text-[13.5px] leading-[1.65] text-[#8a5a08]">
                <b>We lost ground on your shop this {word}.</b> Roster GMV fell{' '}
                {Math.abs(cc.gmvChangePct!).toFixed(1)}%
                {finite(r.gmvChangePct) !== null && (
                  <>
                    {' '}against a store that{' '}
                    {r.gmvChangePct! >= 0
                      ? `grew ${r.gmvChangePct!.toFixed(1)}%`
                      : `fell only ${Math.abs(r.gmvChangePct!).toFixed(1)}%`}
                  </>
                )}
                , taking our share from {(cc.pctOfStoreGmv - sharePoints!).toFixed(1)}% to{' '}
                {cc.pctOfStoreGmv.toFixed(1)}%.
                {cc.priorCreatorCount === cc.activeCreatorCount
                  ? ` The same ${num(cc.activeCreatorCount)} creators were active in both periods, so this is output per creator, not roster size.`
                  : ` Active creators went from ${num(cc.priorCreatorCount)} to ${num(cc.activeCreatorCount)}.`}
              </div>
            )}

            {concentrated && topManaged && (
              <div className="mt-3 rounded-[12px] bg-[#fbf1dc] px-4 py-3.5 text-[13.5px] leading-[1.65] text-[#8a5a08]">
                {/* Lead with whichever framing is the sharper truth: one
                    creator carrying the account, or a handful carrying it. */}
                {topShare >= 30 ? (
                  <>
                    <b>
                      @{handleOf(topManaged.name)} produced {topShare.toFixed(1)}% of roster GMV
                    </b>{' '}
                    this {word}
                    {top3.length === 3 && (
                      <>, and your top three creators {top3Share.toFixed(0)}% between them</>
                    )}
                    .
                  </>
                ) : (
                  <>
                    <b>
                      Your top three creators produced {top3Share.toFixed(1)}% of roster GMV
                    </b>{' '}
                    this {word}, led by @{handleOf(topManaged.name)} at {topShare.toFixed(1)}%.
                  </>
                )}{' '}
                Concentration at that level is the main risk to {word}-to-{word} stability, and
                broadening it is an active priority for this account.
              </div>
            )}
          </>
        )}

        {/* ── 1a. The account lead's voice, directly under the number.
               Five sections used to stand between the headline and any human
               framing of it, so the evidence argued before anyone said what it
               meant. A report should read: here is the number, here is what we
               think about it, now here is why. The forward plan travels with
               the notes because a client reads "how did it go" and "what
               happens next" as one thought. ─── */}
        {/* Either half is enough: a report can carry a forward plan with no
            retrospective commentary, and gating on notes alone would silently
            drop it. */}
        {(notes?.trim() || plan?.trim()) && (
          <>
            <SectionLine>From your account lead</SectionLine>
            <div className="rounded-[14px] border border-[#e3e0f5] border-l-[3px] border-l-[#5b5ee8] bg-white px-[18px] py-[15px]">
              <div className="mb-2 flex items-center gap-2.5">
                <span
                  className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-[11px] font-extrabold text-white"
                  style={{ background: 'linear-gradient(135deg,#5b5ee8,#a855f7)' }}
                >
                  CC
                </span>
                <div>
                  <b className="text-[13px]">Notes for this {word}</b>
                  <div className="text-[10.5px] text-[#8a8fb0]">{AGENCY}</div>
                </div>
              </div>
              {notes?.trim() && (
                <p className="whitespace-pre-line text-[13.5px] leading-[1.65] text-[#33375c]">{notes}</p>
              )}
              {/* 🚨 THE ONLY FORWARD-LOOKING THING ON THE PAGE. Everything else
                  is retrospective, which is why a brand could read the whole
                  report and still not know what happens next. Kept in its own
                  column (mig 190) rather than merged into notes, so a
                  commitment made this {word} is still identifiable next {word}
                  and can actually be checked. */}
              {plan?.trim() && (
                <div className="mt-3.5 border-t border-[#eeedf5] pt-3.5">
                  <div className="text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">
                    What we are doing next
                  </div>
                  <p className="mt-1.5 whitespace-pre-line text-[13.5px] leading-[1.65] text-[#33375c]">
                    {plan}
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── 1a-weekly. What moved. On a comparison report the CHANGE is
               the subject, so it leads rather than trailing the tables. ─── */}
        {isWeekly && s.movers && (
          <>
            <SectionLine>What moved this {word}</SectionLine>
            <Movers m={s.movers} word={word} />
          </>
        )}

        {/* ── 1b. What we did against what the whole shop did. ───── */}
        {hasRoster && vsShopRows.length > 0 && (
          <>
            <SectionLine>{AGENCY} vs your whole shop</SectionLine>
            <VsShop rows={vsShopRows} brandName={brandName} />
          </>
        )}

        {/* ── 1c. Where the roster's GMV came from. ──────────────── */}
        {hasRoster && (r.agreementSplit || r.channels) && (
          <>
            <SectionLine>Where our GMV came from</SectionLine>
            <SourceSplit
              agreement={r.agreementSplit}
              channels={r.channels}
              topLive={r.topLive}
              rosterGmv={cc.gmv}
              storeLiveGmv={r.channels?.storeLiveGmv ?? 0}
            />
            {/* ⚠️ The net-new split USED to render here as its own block. It
                answers "is this our work" while the vintage section answers
                "when was it made", and side by side the two read as competing
                claims about the same thing (89.4% "since we started" against
                58.6% "older than three months"). Its number now opens the
                vintage section instead, so there is ONE place the client reads
                about where the revenue came from. */}
          </>
        )}

        {/* ⚠️ CUT: "The creators we run for you" (top 5). It was literally
               the first five rows of "Every creator we run for you" below,
               rendered a second time with different columns. The full table
               now carries the whole story, adjacent to roster coverage. ─── */}

        {/* ── 2b. Month in review: committed against delivered. ────── */}
        {isMonthly && gran && (
          <>
            <SectionLine>What you committed, what we delivered</SectionLine>
            <MonthlyDelivery
              g={gran}
              budget={finite(gran.roster.monthlyRetainerBudget)}
              /* Not tracked yet — see MonthlyDelivery. Never derived. */
              actualSpend={null}
              start={r.startDate}
              end={r.endDate}
            />
          </>
        )}

        {/* ── 3. Roster coverage, now adjacent to the table it describes. ── */}
        {hasRoster && (
          <>
            <SectionLine>Roster coverage</SectionLine>
            {rosterAct ? (
              <>
                <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
                  <Mini
                    label="Signed"
                    value={num(rosterAct.signed)}
                    note={
                      gran
                        ? `${num(gran.roster.onRetainer)} on retainer, ${num(gran.roster.affiliateOnly)} affiliate-only`
                        : undefined
                    }
                  />
                  <Mini
                    label="Posted"
                    value={num(rosterAct.posted)}
                    note={
                      rosterAct.signed > 0
                        ? retainedPosted !== null
                          ? `${retainedPosted.posted} of ${retainedPosted.total} retained creators`
                          : `${((rosterAct.posted / rosterAct.signed) * 100).toFixed(1)}% of signed`
                        : undefined
                    }
                  />
                  <Mini
                    label="Made sales"
                    value={num(rosterAct.sold)}
                    note={
                      rosterAct.soldNotPosted > 0
                        ? `${num(rosterAct.soldNotPosted)} sold without posting`
                        : undefined
                    }
                  />
                  <Mini
                    label="Left the roster"
                    value={num(rosterAct.departed)}
                    note={rosterAct.departed === 0 ? 'nobody left this period' : 'archived this period'}
                  />
                </div>
                {/* Activation is measured on POSTING, deliberately. A creator
                    still earning from content posted months ago is revenue, but
                    it is not work done this period, and merging the two is what
                    let one number stand for both. */}
                <div className="mt-2 text-[10.5px] leading-relaxed text-[#8a8fb0]">
                  Posted counts creators who published at least once this period. Made sales counts
                  creators who earned, which includes earnings from posts made earlier.
                  {cc.newlyActivatedCount > 0 && (
                    <> {num(cc.newlyActivatedCount)} became active for the first time.</>
                  )}
                </div>
              </>
            ) : (
              /* Snapshots frozen before migration 165 carry only the combined
                 figure. They keep rendering what they were built with. */
              <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
                <Mini label="Signed creators" value={num(cc.signedCreatorCount)} />
                <Mini label="Active this period" value={num(cc.activeCreatorCount)} />
                <Mini
                  label="Activation rate"
                  value={`${cc.signedCreatorCount > 0 ? ((cc.activeCreatorCount / cc.signedCreatorCount) * 100).toFixed(1) : '0'}%`}
                />
                <Mini label="First-time active" value={num(cc.newlyActivatedCount)} />
              </div>
            )}
          </>
        )}

        {/* ── 3b. The month. Monthly commitments judged over the month,
            promoted ABOVE the roster table: this is the accountability the
            reader came for, and it used to sit underneath ~55 rows of names. */}
        {!windowIsMonth && r.monthToDate && (
          <>
            <SectionLine>The month so far</SectionLine>
            <MonthToDate mtd={r.monthToDate} signings={r.signings} />
          </>
        )}

        {/* ── 4. What they made. ─────────────────────────────────── */}
        {watchVideos.length > 0 && (
          <>
            <SectionLine>Content that sold</SectionLine>
            <TopPosts rows={watchVideos} />
          </>
        )}

        {/* ── 4b. Video vintage: which posts are carrying the period ── */}
        {gran && gran.vintage.length > 0 && (
          <>
            <SectionLine>Where our sales came from</SectionLine>
            <VintageSection g={gran} word={word} />
          </>
        )}

        {/* ⚠️ CUT: "Signed creators vs the rest of your shop". It compared
               AOV and GMV-per-creator against everyone else, and measured
               across seven brands the AOV gap was $1-6 — on catakor the
               roster read WORSE ($43.44 against $44.09). The agency-vs-shop
               block in Act 1 makes the same argument honestly, with shares
               of a denominator that is printed beside it. ─────────────── */}

        {/* ── 6b. Every creator, in full. REFERENCE, not narrative.
            Deliberately after the story: it is a lookup table, and in the
            middle of the page it buried everything below it. The CSV does the
            heavy lifting for anyone who wants all of them. */}
        {gran && gran.creators.length > 0 && (
          <>
            <SectionLine>Every creator we run for you</SectionLine>
            <FullRosterTable g={gran} judgeQuota={windowIsMonth} token={token} />
          </>
        )}

        {/* ── 7. Store context, secondary ────────────────────────── */}
        <SectionLine>Your store overall</SectionLine>
        <p className="mb-3 max-w-[68ch] text-[13.5px] leading-[1.65] text-[#33375c]">
          Context for the numbers above. This is all of {brandName}&rsquo;s TikTok Shop activity, not only the
          creators we run.
        </p>
        {/* Literal class strings: Tailwind scans source text, so an
            interpolated `md:grid-cols-${n}` would never be generated. */}
        <div
          className={`grid grid-cols-2 gap-3.5 ${
            ['md:grid-cols-3', 'md:grid-cols-4', 'md:grid-cols-5'][
              (s.views !== null ? 1 : 0) + (act ? 1 : 0)
            ]
          }`}
        >
          <Mini
            label="Store GMV"
            value={money(r.totalGmv)}
            pct={r.gmvChangePct}
            /* Share of store is stated twice already: the hero rail (with its
               change) and the vs-shop card. A third is noise. */
            note={undefined}
          />
          {s.views !== null && <Mini label="Views" value={compactCount(s.views)} pct={viewsDelta} />}
          <Mini label="Orders" value={num(r.totalOrders)} pct={r.orderChangePct} />
          <Mini
            label="Videos posted"
            value={num(r.totalVideos)}
            pct={r.videoChangePct}
            note={hasRoster ? `${num(cc.videos)} are ours` : undefined}
          />
          {/* ⚠️ NOT r.activeCreators. That is count(distinct handle) over the
              TikTok export with no gmv filter, so it counts every creator who
              appears in the file at all — 40,954 on jiyu 2026-08 against 4,216
              who posted and 930 who sold. Migration 165 added the two real
              counts; where they are absent the tile is omitted rather than
              printed wrong. */}
          {act && (
            <Mini
              label="Creators posting"
              value={num(act.storeCreatorsPosted)}
              note={`${num(rosterAct ? rosterAct.posted : act.rosterPosted)} are ours`}
            />
          )}
        </div>

        {daily.length > 0 && (
          <div className="mt-3.5">
            <HoverBars
              title={`Daily store GMV`}
              bars={daily.map((d) => ({
                value: d.gmv,
                orders: d.orders,
                isPeak: d.isPeak,
                caption: fmtDay(d.date),
              }))}
              labels={dailyLabels}
              peakNoun="day"
            />
          </div>
        )}

        {/* ── 12-week trend, with OUR half drawn inside each bar ──────────
               🚨 THE ONE QUESTION THE REPORT ASKED THE READER TO TAKE ON TRUST.
               Both charts were store-level, so a client could see their shop's
               trajectory and only two point-in-time numbers for us — Cata-Kor
               August read "59.6% -> 68.0%" with nothing between the endpoints.
               A share can climb steadily, spike once, or recover from a dip,
               and those are three different accounts of whether this is
               working. Migration 193 supplies the roster half on the same
               seven-day buckets under the same membership rule as the
               headline, so the segment and the number above it cannot
               disagree.

               ⚠️ Absent on snapshots frozen before migration 193, which render
               as the store-only chart they always were. ─── */}
        {weekly.length >= 3 && (
          <div className="mt-3.5">
            <HoverBars
              title={weeklySplit ? '12-week GMV trend, ours inside the store' : '12-week store GMV trend'}
              bars={weekly.map((w) => ({
                value: w.gmv,
                sub: w.rosterGmv,
                isPeak: w.gmv === weeklyMax,
                caption: `week ending ${fmtDay(new Date(w.weekEnd + 'T12:00:00Z'))}`,
              }))}
              labels={weekly.map((w, i) =>
                i === 0 || i === weekly.length - 1 ? fmtDay(new Date(w.weekEnd + 'T12:00:00Z')) : '',
              )}
              peakNoun="week"
              subLabel={weeklySplit ? 'creators we run' : undefined}
            />
            {weeklyShare && (
              <div className="mt-2 text-[11.5px] leading-[1.6] text-[#5c6183]">
                Our share of the store went from{' '}
                <b className="text-[#171a33]">{weeklyShare.first.toFixed(0)}%</b> in the week ending{' '}
                {fmtDay(new Date(weeklyShare.firstWeek + 'T12:00:00Z'))} to{' '}
                <b className="text-[#171a33]">{weeklyShare.last.toFixed(0)}%</b> in the week ending{' '}
                {fmtDay(new Date(weeklyShare.lastWeek + 'T12:00:00Z'))}
                {weeklyShare.monotonic
                  ? ', climbing in most weeks along the way rather than on any single one.'
                  : '.'}
              </div>
            )}
            {priorWasSpike && (
              <div className="mt-2 text-[10.5px] text-[#8a8fb0]">
                Last week was the strongest in this 12-week window, so the comparison above is a steep one.
              </div>
            )}
          </div>
        )}

        {/* ── 8. Since we started ────────────────────────────────── */}
        {s.lifetime.gmv > 0 && lifetimeSince && (
          <>
            <SectionLine>Since we started</SectionLine>
            <div className="rounded-[14px] border border-[#e7e7f2] bg-white px-5 py-4 text-[14px] leading-[1.7] text-[#33375c]">
              Since <b className="text-[#171a33]">{lifetimeSince}</b>, {brandName} has generated{' '}
              <b className="text-[#171a33]">{compactMoney(s.lifetime.gmv)}</b> on TikTok Shop
              {s.lifetime.videos !== null && (
                <> across <b className="text-[#171a33]">{num(s.lifetime.videos)}</b> videos</>
              )}
              {s.lifetime.bestWeek !== null && (
                <>, with a best week of <b className="text-[#171a33]">{compactMoney(s.lifetime.bestWeek)}</b></>
              )}
              .
            </div>
          </>
        )}

        <div className="mt-10 text-[11.5px] leading-[1.7] text-[#8a8fb0]">
          Prepared by {AGENCY} for {brandName}. Every figure is frozen as of {fmtDay(frozen)} and will not
          change after sending. Questions go to your account lead.
        </div>
      </div>
    </div>
  );
}
