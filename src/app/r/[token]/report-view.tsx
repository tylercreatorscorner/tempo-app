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
import { extractTikTokVideoId, type ClientReportSnapshot } from '@/lib/data/client-reports';
import { WatchCard } from './watch-card';

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

/** Big stat, used in the agency band. */
function HeroStat({ label, value, pct, abs }: { label: string; value: string; pct?: number | null; abs?: string | null }) {
  return (
    <div>
      <div className="text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">{label}</div>
      <div className="mt-0.5 text-[25px] font-extrabold leading-tight tabular-nums text-[#171a33]">{value}</div>
      <Delta pct={pct} abs={abs} />
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
}: {
  title: string;
  bars: { value: number; orders?: number; isPeak: boolean; caption: string }[];
  labels: string[];
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
              {b.isPeak && <span className="text-white/70"> · best day</span>}
              <br />
              <span className="tabular-nums text-white/70">
                {b.orders !== undefined ? `${num(b.orders)} orders · ` : ''}{b.caption}
              </span>
            </div>
            <div
              className="rounded-t-[5px] transition-[filter] group-hover:brightness-110"
              style={{
                height: `${Math.max(3, (b.value / max) * 100)}%`,
                background: b.isPeak ? 'linear-gradient(180deg,#5b5ee8,#8b5cf6)' : '#dedcf2',
              }}
            />
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
 * roster $43.44 against everyone else at $44.09). Measured on jiyu 2026-08 this
 * says it properly: 2.1% of the creators and 9.5% of the posts produced 37.9%
 * of the GMV.
 *
 * Every row is a share of a store-wide denominator printed right beside it, so
 * the reader never has to take the percentage on trust.
 */
function VsShop({
  rows,
}: {
  rows: { label: string; ours: string; theirs: string; pct: number; live?: boolean }[];
}) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-[#e7e7f2] bg-white">
      {rows.map((r, i) => (
        <div
          key={r.label}
          className={`grid grid-cols-1 items-center gap-2 px-4 py-3.5 sm:grid-cols-[140px_1fr_78px] sm:gap-4 ${
            i > 0 ? 'border-t border-[#f2f1f8]' : ''
          }`}
        >
          <div className="text-[13px] font-bold text-[#171a33]">{r.label}</div>
          <div className="relative h-[26px] overflow-hidden rounded-[6px] bg-[#f2f1f8]">
            <div
              className="absolute inset-y-0 left-0 rounded-[6px]"
              style={{
                width: `${Math.max(0.6, Math.min(100, r.pct))}%`,
                background: r.live ? '#c74f9e' : '#4b45ff',
              }}
            />
            <div className="absolute inset-0 flex items-center justify-between px-2.5 text-[11.5px] font-bold tabular-nums">
              {/* Under ~18% the fill is too narrow to seat text on, so the value
                  sits off it rather than being clipped against the bar edge. */}
              <span className={r.pct >= 18 ? 'text-white' : 'text-[#33375c]'}>{r.ours}</span>
              <span className="text-[#33375c]">{r.theirs}</span>
            </div>
          </div>
          <div
            className="text-[19px] font-extrabold tabular-nums sm:text-right"
            style={{ color: r.live ? '#c74f9e' : '#4b45ff' }}
          >
            {r.pct.toFixed(1)}%
          </div>
        </div>
      ))}
    </div>
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
          {Math.abs(agreement.unattributedGmv) >= 1 && (
            <p className="mt-1.5 text-[11px] leading-tight text-[#8a8fb0]">
              {money(Math.abs(agreement.unattributedGmv))} is not attributed to a current roster row, from
              creators who left part-way through the period.
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
          <MiniStat label="Retainer budget" value={`${money(budget)}/mo`} note="monthly commitment" />
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
    ...g.vintage.map((v) => ({ label: v.label, videos: v.videos, gmv: v.gmv, isOlder: false })),
    ...(g.vintageOlder.videos > 0 || g.vintageOlder.gmv > 0
      ? [{ label: 'Earlier', videos: g.vintageOlder.videos, gmv: g.vintageOlder.gmv, isOlder: true }]
      : []),
  ];
  const max = Math.max(...rows.map((r) => r.gmv), 1);
  // The share carried by content posted before the three months listed. Stated
  // as a number because it is usually the most persuasive figure in the report
  // and it was previously left for the reader to infer from bar lengths.
  const olderPct =
    total > 0 && g.vintageOlder.gmv > 0 ? (g.vintageOlder.gmv / total) * 100 : null;

  return (
    <div className="rounded-[14px] border border-[#e7e7f2] bg-white px-5 py-5">
      <h2 className="text-[20px] font-extrabold leading-snug tracking-tight text-[#171a33]">
        {money(gmv30)} of this {word}&rsquo;s roster sales came from videos posted in the last 30 days
      </h2>
      <p className="mt-1.5 max-w-[68ch] text-[14.5px] leading-[1.65] text-[#33375c]">
        {pct30 !== null ? (
          <>
            That is <b className="text-[#171a33]">{pct30.toFixed(1)}% of roster GMV</b> from{' '}
            <b className="text-[#171a33]">{num(g.newVideo.videos30d)} recent posts</b>.
            {olderPct !== null && olderPct >= 15 ? (
              <>
                {' '}
                Another <b className="text-[#171a33]">{olderPct.toFixed(1)}%</b> &mdash;{' '}
                <b className="text-[#171a33]">{money(g.vintageOlder.gmv)}</b> &mdash; came from posts older
                than the three months below and is still selling. That back catalogue is what the work
                compounds into.
              </>
            ) : (
              <>
                {' '}
                The rest comes from content published earlier that is still selling &mdash; which is why
                posting consistently compounds.
              </>
            )}
          </>
        ) : (
          <>No roster sales in this {word}, so there is no split to show.</>
        )}
      </p>

      <div className="mt-5 space-y-2.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3">
            <div className="w-[74px] shrink-0 text-[12px] font-bold text-[#33375c]">{r.label}</div>
            <div className="h-[22px] flex-1 overflow-hidden rounded-[5px] bg-[#f4f3fa]">
              <div
                className="h-full rounded-[5px]"
                style={{
                  width: `${Math.max(1.5, (r.gmv / max) * 100)}%`,
                  background: r.isOlder
                    ? 'linear-gradient(90deg,#c9c8dd,#b3b7d4)'
                    : 'linear-gradient(90deg,#5b5ee8,#a855f7)',
                }}
              />
            </div>
            <div className="w-[96px] shrink-0 text-right text-[13px] font-extrabold tabular-nums text-[#171a33]">
              {money(r.gmv)}
            </div>
            <div className="w-[86px] shrink-0 text-right text-[12px] tabular-nums text-[#8a8fb0]">
              {num(r.videos)} videos
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[11.5px] leading-[1.6] text-[#8a8fb0]">
        Grouped by the month each video was posted, counting only sales made during this {word}.
        {unknown > 0 && (
          <> {money(unknown)} came from videos with no recorded post date and sits in neither group.</>
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
function FullRosterTable({ g }: { g: NonNullable<BrandClientReportData['granular']> }) {
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
      </div>

      <CreatorRows rows={active} />

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
          <CreatorRows rows={dormant} muted />
        </details>
      )}
    </div>
  );
}

function CreatorRows({
  rows,
  muted = false,
}: {
  rows: NonNullable<BrandClientReportData['granular']>['creators'];
  muted?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-[#eeedf5]">
            <th className="px-4 py-2.5 text-left text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">Creator</th>
            <th className="px-4 py-2.5 text-left text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">TikTok</th>
            <th className="px-4 py-2.5 text-left text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">Agreement</th>
            <th className="px-4 py-2.5 text-right text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">Agreed amount</th>
            <th className="px-4 py-2.5 text-right text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">Posts</th>
            <th className="px-4 py-2.5 text-right text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">Orders</th>
            <th className="px-4 py-2.5 text-right text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">GMV</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => {
            const h = c.handle ? handleOf(c.handle) : handleOf(c.name);
            return (
              <tr key={i} className={`border-b border-[#f2f1f8] last:border-b-0 ${muted ? 'opacity-70' : ''}`}>
                {/* Identity: the person's name, falling back to the handle
                    for the 9% who have no real_name — never an empty cell. */}
                <td className="px-4 py-2.5 font-semibold text-[#171a33]">
                  {c.realName?.trim() ? c.realName : <span className="text-[#6b7191]">@{h}</span>}
                </td>
                {/* 191 active roster rows have a real name but NO handle in
                    any source — mostly a 2025-11-29 bulk import that never
                    captured them. They are real signed creators, so they stay
                    in the table, but linking @TheirName would point at a
                    profile that does not exist. */}
                <td className="px-4 py-2.5">
                  {c.handle ? (
                  <a
                    href={`https://www.tiktok.com/@${h}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-[#4b45ff] underline decoration-[#4b45ff]/30 underline-offset-2 hover:decoration-[#4b45ff]"
                  >
                    @{h}
                  </a>
                  ) : (
                    <span className="text-[#b9bcd0]">&mdash;</span>
                  )}
                  {(c.handleCount ?? 0) > 1 && (
                    <span
                      className="ml-1.5 cursor-help text-[11px] text-[#8a8fb0]"
                      title={(c.handles ?? []).map((x) => `@${x}`).join('\n')}
                    >
                      +{(c.handleCount ?? 1) - 1}
                    </span>
                  )}
                </td>
                {/* Agreement is the TYPE only. The money moved to its own
                    column so a retainer figure is never mistaken for earnings. */}
                <td className="px-4 py-2.5 text-[12px] text-[#33375c]">
                  {c.departed ? (
                    <span className="rounded-[5px] bg-[#f2f3f7] px-1.5 py-0.5 font-semibold text-[#6b7191]">
                      Left this period
                    </span>
                  ) : c.isAffiliate ? (
                    <span className="rounded-[5px] bg-[#f0eefb] px-1.5 py-0.5 font-semibold text-[#5b4bb8]">
                      Affiliate-only
                    </span>
                  ) : (
                    <span className="font-semibold">Retainer</span>
                  )}
                </td>
                {/* Blank for affiliate-only: there is no agreed amount, and a
                    $0 would read as "we agreed zero" rather than "n/a". */}
                <td className="px-4 py-2.5 text-right tabular-nums text-[#33375c]">
                  {!c.departed && !c.isAffiliate && c.retainer > 0
                    ? <>{money(c.retainer)}<span className="text-[#8a8fb0]">/mo</span></>
                    : <span className="text-[#b9bcd0]">&mdash;</span>}
                </td>
                {/* Quota tracking lives here now, next to the number it judges. */}
                <td className="px-4 py-2.5 text-right tabular-nums text-[#33375c]">
                  {num(c.postsPublished)}
                  {c.quota != null && <span className="text-[#8a8fb0]"> / {num(c.quota)}</span>}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-[#33375c]">{num(c.orders)}</td>
                <td className="px-4 py-2.5 text-right font-extrabold tabular-nums text-[#171a33]">{money(c.gmv)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── The page ───────────────────────────────────────────────────────

export function ReportView({
  token,
  report: r,
  snapshot: s,
  notes,
  brandName,
  periodLabel,
}: {
  token: string;
  report: BrandClientReportData;
  snapshot: ClientReportSnapshot;
  notes: string | null;
  brandName: string;
  periodLabel: string;
}) {
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

  const postedPct =
    rosterAct && rosterAct.canCompare && act && act.rosterPostedPrior > 0
      ? pctChange(rosterAct.posted, act.rosterPostedPrior)
      : undefined;

  // Share of the whole shop, on the same two definitions. `r.activeCreators`
  // is NOT used: it counts handles present in the TikTok export, which read
  // 40,954 on jiyu against 4,216 who posted.
  const vsShopRows = act && rosterAct
    ? [
        {
          label: 'GMV',
          ours: money(cc.gmv),
          theirs: `${money(r.totalGmv)} shop`,
          pct: cc.pctOfStoreGmv,
        },
        {
          label: 'Creators posting',
          ours: num(rosterAct.posted),
          theirs: `${num(act.storeCreatorsPosted)} shop`,
          pct: act.storeCreatorsPosted > 0 ? (rosterAct.posted / act.storeCreatorsPosted) * 100 : 0,
        },
        {
          label: 'Posts published',
          ours: num(cc.videos),
          theirs: `${num(r.totalVideos)} shop`,
          pct: r.totalVideos > 0 ? (cc.videos / r.totalVideos) * 100 : 0,
        },
        ...(r.channels && r.channels.storeLiveGmv > 0
          ? [
              {
                label: 'Live GMV',
                ours: money(r.channels.rosterLiveGmv),
                theirs: `${money(r.channels.storeLiveGmv)} shop`,
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
  const divergence =
    hasRoster &&
    cc.gmvChangePct !== null &&
    r.gmvChangePct !== null &&
    cc.gmvChangePct < -2 &&
    r.gmvChangePct > 2;

  // Concentration: how much of the roster's GMV came from its top creator.
  const topManaged = cc.topCreators[0] ?? null;
  const topShare = topManaged && cc.gmv > 0 ? (topManaged.gmv / cc.gmv) * 100 : 0;
  const concentrated = topShare >= 40;

  const weekly = s.weekly;
  const weeklyMax = Math.max(1, ...weekly.map((w) => w.gmv));
  const priorWasSpike =
    word === 'week' &&
    weekly.length >= 3 &&
    weekly[weekly.length - 2].gmv === weeklyMax &&
    weekly[weekly.length - 2].gmv > weekly[weekly.length - 1].gmv * 1.5;

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
                <HeroStat label="Share of store" value={`${cc.pctOfStoreGmv.toFixed(1)}%`} />
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

            {gran && <InvestmentStrip g={gran} />}

            {divergence && (
              <div className="mt-3 rounded-[12px] bg-[#fbf1dc] px-4 py-3.5 text-[13.5px] leading-[1.65] text-[#8a5a08]">
                <b>We were down this {word} while the store was up.</b> Roster GMV fell{' '}
                {Math.abs(cc.gmvChangePct!).toFixed(1)}% against a store that grew {r.gmvChangePct!.toFixed(1)}%.
                {cc.priorCreatorCount === cc.activeCreatorCount
                  ? ` The same ${num(cc.activeCreatorCount)} creators were active in both periods, so this is output per creator, not roster size.`
                  : ` Active creators went from ${num(cc.priorCreatorCount)} to ${num(cc.activeCreatorCount)}.`}
              </div>
            )}

            {concentrated && topManaged && (
              <div className="mt-3 rounded-[12px] bg-[#fbf1dc] px-4 py-3.5 text-[13.5px] leading-[1.65] text-[#8a5a08]">
                <b>
                  @{handleOf(topManaged.name)} produced {topShare.toFixed(1)}% of roster GMV
                </b>{' '}
                this {word}. Concentration at that level is the main risk to {word}-to-{word} stability, and
                broadening it is an active priority for this account.
              </div>
            )}
          </>
        )}

        {/* ── 1b. What we did against what the whole shop did. ───── */}
        {hasRoster && vsShopRows.length > 0 && (
          <>
            <SectionLine>{AGENCY} vs your whole shop</SectionLine>
            <VsShop rows={vsShopRows} />
            <div className="mt-2 text-[10.5px] leading-relaxed text-[#8a8fb0]">
              Every bar is our share of a shop-wide total, shown beside it. &ldquo;Shop&rdquo; is all of{' '}
              {brandName}&rsquo;s TikTok Shop activity, including creators we do not manage.
            </div>
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
          </>
        )}

        {/* ── 2. Account lead notes. MOVED: these used to sit between
               the headline and its evidence, splitting the argument. ─── */}
        {notes && (
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
              <p className="whitespace-pre-line text-[13.5px] leading-[1.65] text-[#33375c]">{notes}</p>
            </div>
          </>
        )}

        {/* ⚠️ CUT: "The creators we run for you" (top 5). It was literally
               the first five rows of "Every creator we run for you" below,
               rendered a second time with different columns. The full table
               now carries the whole story, adjacent to roster coverage. ─── */}

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
                        ? `${((rosterAct.posted / rosterAct.signed) * 100).toFixed(1)}% of signed`
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

        {/* ── 3b. Every creator, in full. ─────────────────────────── */}
        {gran && gran.creators.length > 0 && (
          <>
            <SectionLine>Every creator we run for you</SectionLine>
            <FullRosterTable g={gran} />
          </>
        )}

        {/* ── 4. What they made. ─────────────────────────────────── */}
        {watchVideos.length > 0 && (
          <>
            <SectionLine>Content that sold</SectionLine>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
              {watchVideos.map((v, i) => (
                <WatchCard
                  key={i}
                  index={i}
                  videoUrl={v.videoUrl}
                  videoId={v.videoId}
                  title={v.title}
                  creator={v.creator}
                  gmv={v.gmv}
                  viewsLabel={v.viewsLabel}
                />
              ))}
            </div>
            <div className="mt-2 text-[10.5px] text-[#8a8fb0]">
              Tap to play inline. Figures are frozen at preparation and do not shift after sending.
            </div>
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
            note={hasRoster ? `${cc.pctOfStoreGmv.toFixed(1)}% of it is ours` : undefined}
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
            />
          </div>
        )}

        {weekly.length >= 3 && (
          <div className="mt-3.5">
            <HoverBars
              title="12-week store GMV trend"
              bars={weekly.map((w) => ({
                value: w.gmv,
                isPeak: w.gmv === weeklyMax,
                caption: `week ending ${fmtDay(new Date(w.weekEnd + 'T12:00:00Z'))}`,
              }))}
              labels={weekly.map((w, i) =>
                i === 0 || i === weekly.length - 1 ? fmtDay(new Date(w.weekEnd + 'T12:00:00Z')) : '',
              )}
            />
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
