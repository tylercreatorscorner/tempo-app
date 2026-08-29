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
    ...g.vintage.map((v) => ({ label: v.label, videos: v.videos, gmv: v.gmv, isOlder: false })),
    ...(g.vintageOlder.videos > 0 || g.vintageOlder.gmv > 0
      ? [{ label: 'Earlier', videos: g.vintageOlder.videos, gmv: g.vintageOlder.gmv, isOlder: true }]
      : []),
  ];
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

const TH_L =
  'px-4 py-2.5 text-left text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]';
const TH_R =
  'px-4 py-2.5 text-right text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]';

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
          {/* Every column but the two identity ones is nowrap. "19 / 30" was
              breaking across two lines, and a wrapped number reads as two
              numbers. The identity columns truncate instead: a long name gets
              an ellipsis rather than pushing the numeric columns around. */}
          <tr className="border-b border-[#eeedf5]">
            <th className={TH_L}>Creator</th>
            <th className={TH_L}>TikTok</th>
            <th className={`${TH_L} whitespace-nowrap`}>Agreement</th>
            <th className={`${TH_R} whitespace-nowrap`}>Agreed</th>
            <th className={`${TH_R} whitespace-nowrap`}>Posts</th>
            <th className={`${TH_R} whitespace-nowrap`}>Orders</th>
            <th className={`${TH_R} whitespace-nowrap`}>GMV</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => {
            const h = c.handle ? handleOf(c.handle) : handleOf(c.name);
            // Every OTHER known handle for this person. Deduped against the
            // primary because the account_ columns and tiktok_accounts often
            // both carry it.
            const extras = (c.handles ?? [])
              .map((x) => handleOf(x))
              .filter((x) => x && x !== h);
            return (
              <tr key={i} className={`border-b border-[#f2f1f8] last:border-b-0 ${muted ? 'opacity-70' : ''}`}>
                {/* Identity: the person's name, falling back to the handle
                    for the 9% who have no real_name — never an empty cell. */}
                <td className="max-w-[190px] truncate px-4 py-2.5 font-semibold text-[#171a33]">
                  {c.realName?.trim() ? (
                    <span title={c.realName}>{c.realName}</span>
                  ) : (
                    <span className="text-[#6b7191]" title={`@${h}`}>@{h}</span>
                  )}
                </td>
                {/* 191 active roster rows have a real name but NO handle in
                    any source — mostly a 2025-11-29 bulk import that never
                    captured them. They are real signed creators, so they stay
                    in the table, but linking @TheirName would point at a
                    profile that does not exist. */}
                <td className="max-w-[210px] px-4 py-2.5 align-top">
                  <div className="truncate">
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
                  </div>
                  {/* The extras were a title="" tooltip, which cannot be
                      clicked. A hover popover is not an option either: the
                      table sits in an overflow-x-auto wrapper, which clips
                      absolutely-positioned children. <details> expands in
                      flow, is keyboard reachable, and every handle is a real
                      link to the profile. */}
                  {extras.length > 0 && (
                    <details className="group mt-0.5">
                      <summary className="inline-flex cursor-pointer list-none items-center gap-0.5 text-[11px] font-semibold text-[#8a8fb0] hover:text-[#4b45ff]">
                        +{extras.length} more
                        <span className="transition-transform group-open:rotate-90">&rsaquo;</span>
                      </summary>
                      <div className="mt-1 flex flex-col gap-0.5">
                        {extras.map((x) => (
                          <a
                            key={x}
                            href={`https://www.tiktok.com/@${x}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="truncate text-[12px] font-semibold text-[#4b45ff] underline decoration-[#4b45ff]/30 underline-offset-2 hover:decoration-[#4b45ff]"
                          >
                            @{x}
                          </a>
                        ))}
                      </div>
                    </details>
                  )}
                </td>
                {/* Agreement is the TYPE only. The money moved to its own
                    column so a retainer figure is never mistaken for earnings. */}
                <td className="whitespace-nowrap px-4 py-2.5 text-[12px] text-[#33375c]">
                  {c.departed ? (
                    <span className="whitespace-nowrap rounded-[5px] bg-[#f2f3f7] px-1.5 py-0.5 font-semibold text-[#6b7191]">
                      Left
                    </span>
                  ) : c.isAffiliate ? (
                    /* "Affiliate-only" wrapped, dropping "only" to its own
                        line. The meaning (commission, no post requirement) is
                        already stated above the table, so the tag is short. */
                    <span className="whitespace-nowrap rounded-[5px] bg-[#f0eefb] px-1.5 py-0.5 font-semibold text-[#5b4bb8]">
                      Affiliate
                    </span>
                  ) : (
                    <span className="whitespace-nowrap font-semibold">Retainer</span>
                  )}
                </td>
                {/* Blank for affiliate-only: there is no agreed amount, and a
                    $0 would read as "we agreed zero" rather than "n/a". */}
                <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-[#33375c]">
                  {!c.departed && !c.isAffiliate && c.retainer > 0
                    ? <>{money(c.retainer)}<span className="text-[#8a8fb0]">/mo</span></>
                    : <span className="text-[#b9bcd0]">&mdash;</span>}
                </td>
                {/* Quota tracking lives here now, next to the number it judges. */}
                <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-[#33375c]">
                  {num(c.postsPublished)}
                  {c.quota != null && <span className="text-[#8a8fb0]">&nbsp;/&nbsp;{num(c.quota)}</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-[#33375c]">{num(c.orders)}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right font-extrabold tabular-nums text-[#171a33]">{money(c.gmv)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
 * not creator cost. Deriving "actual" from "contracted minus underdelivery"
 * would be an apportionment rule dressed as a measurement, so until the payout
 * data lands this says so plainly rather than showing a number.
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
  const wholeMonth =
    start.getUTCDate() === 1 &&
    end.getUTCDate() === lastOfMonth.getUTCDate() &&
    start.getUTCMonth() === end.getUTCMonth();
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
              : 'actual spend not yet tracked'
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
  brandName,
  periodLabel,
  reportType = 'performance',
}: {
  token: string;
  report: BrandClientReportData;
  snapshot: ClientReportSnapshot;
  notes: string | null;
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
        ...(r.channels && r.channels.storeLiveGmv > 0
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
            {isMonthly && gran?.netNew && (
              <div className="mt-3.5">
                <NetNewSplit n={gran.netNew} />
              </div>
            )}
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
