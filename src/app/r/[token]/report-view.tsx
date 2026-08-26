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
function Mini({ label, value, pct }: { label: string; value: string; pct?: number | null }) {
  return (
    <div className="rounded-[12px] border border-[#e7e7f2] bg-white px-3.5 py-3">
      <div className="text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">{label}</div>
      <div className="mt-0.5 text-[18px] font-extrabold tabular-nums text-[#171a33]">{value}</div>
      <Delta pct={pct} />
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

  return (
    <div className="rounded-[14px] border border-[#e7e7f2] bg-white px-5 py-5">
      <h2 className="text-[20px] font-extrabold leading-snug tracking-tight text-[#171a33]">
        {money(gmv30)} of this {word}&rsquo;s roster sales came from videos posted in the last 30 days
      </h2>
      <p className="mt-1.5 max-w-[68ch] text-[14.5px] leading-[1.65] text-[#33375c]">
        {pct30 !== null ? (
          <>
            That is <b className="text-[#171a33]">{pct30.toFixed(1)}% of roster GMV</b> from{' '}
            <b className="text-[#171a33]">{num(g.newVideo.videos30d)} recent posts</b>. The rest comes from
            content published earlier that is still selling — which is why posting consistently compounds.
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
 * Every signed creator, including those who did nothing this period.
 *
 * ⚠️ `quota` is null for affiliate-only creators and renders as an em dash.
 * All 85 of Lemme's affiliate-only rows carry a non-zero
 * monthly_post_requirement in the database, and it is phantom — they never
 * agreed to one. Rendering it would tell the brand that 85 of its creators
 * missed a target that does not exist.
 */
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
        <p className="text-[13px] leading-[1.6] text-[#33375c]">
          <b className="text-[#171a33]">{num(active.length)}</b> of{' '}
          <b className="text-[#171a33]">{num(rows.length)}</b> signed creators posted or sold this
          period. <b className="text-[#171a33]">{num(g.roster.affiliateOnly)}</b> of your roster are
          affiliate-only — commission, with no post requirement.
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

function RosterTable({
  rows,
  totalGmv,
  periodLabel,
}: {
  rows: { name: string; gmv: number; orders: number; videos: number }[];
  totalGmv: number;
  periodLabel: string;
}) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-[#e7e7f2] bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-[#eeedf5]">
              <th className="px-4 py-2.5 text-left text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">Creator</th>
              <th className="px-4 py-2.5 text-right text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">GMV</th>
              <th className="px-4 py-2.5 text-right text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">Orders</th>
              <th className="px-4 py-2.5 text-right text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">Posts</th>
              <th className="w-[132px] px-4 py-2.5 text-left text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c, i) => {
              const share = totalGmv > 0 ? (c.gmv / totalGmv) * 100 : 0;
              const h = handleOf(c.name);
              return (
                <tr key={i} className="border-b border-[#f2f1f8] last:border-b-0">
                  <td className="px-4 py-2.5">
                    <a
                      href={`https://www.tiktok.com/@${h}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-[#4b45ff] underline decoration-[#4b45ff]/30 underline-offset-2 hover:decoration-[#4b45ff]"
                    >
                      @{h}
                    </a>
                    <span aria-hidden="true" className="ml-0.5 text-[10px] text-[#8a8fb0]">↗</span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-extrabold tabular-nums text-[#171a33]">{money(c.gmv)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[#33375c]">{num(c.orders)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[#33375c]">{num(c.videos)}</td>
                  <td className="px-4 py-2.5">
                    <span className="block h-1.5 overflow-hidden rounded-full bg-[#efeef7]">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${Math.max(2, share)}%`, background: 'linear-gradient(90deg,#5b5ee8,#a855f7)' }}
                      />
                    </span>
                    <span className="mt-1 block text-[10.5px] tabular-nums text-[#8a8fb0]">{share.toFixed(1)}%</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-[#eeedf5] px-4 py-2 text-[10.5px] text-[#8a8fb0]">
        {periodLabel}. Handles open the creator&rsquo;s TikTok profile. 0 posts means they sold from earlier content.
      </div>
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

  const watchVideos = (cc.topVideos.length > 0 ? cc.topVideos : r.topVideos).slice(0, 3).map((v) => {
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
                from <b className="text-[#171a33]">{num(cc.activeCreatorCount)} active signed creators</b> who published{' '}
                <b className="text-[#171a33]">{num(cc.videos)} posts</b>
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
                  label="Creators active"
                  value={num(cc.activeCreatorCount)}
                  pct={creatorPct}
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

        {/* ── 2. Account lead notes ──────────────────────────────── */}
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

        {/* ── 3. The creators we run ─────────────────────────────── */}
        {hasRoster && cc.topCreators.length > 0 && (
          <>
            <SectionLine>The creators we run for you</SectionLine>
            <RosterTable
              rows={cc.topCreators}
              totalGmv={cc.gmv}
              periodLabel={`Top ${cc.topCreators.length} of ${num(cc.activeCreatorCount)} active signed creators`}
            />
          </>
        )}

        {/* ── 4. Content ─────────────────────────────────────────── */}
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
            <SectionLine>Where this {word}&rsquo;s sales came from</SectionLine>
            <VintageSection g={gran} word={word} />
          </>
        )}

        {/* ── 5. Efficiency: signed vs the rest of the shop ──────── */}
        {hasRoster && cc.organicAov > 0 && cc.managedAov > 0 && (
          <>
            <SectionLine>Signed creators vs the rest of your shop</SectionLine>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div className="rounded-[14px] border border-[#e7e7f2] bg-white px-4 py-3.5">
                <div className="text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">
                  Average order value
                </div>
                <div className="mt-2 flex items-baseline gap-3">
                  <div>
                    <div className="text-[21px] font-extrabold tabular-nums text-[#171a33]">{money(cc.managedAov)}</div>
                    <div className="text-[11px] font-bold text-[#4b45ff]">Signed roster</div>
                  </div>
                  <div className="text-[#c7c9de]">vs</div>
                  <div>
                    <div className="text-[21px] font-extrabold tabular-nums text-[#8a8fb0]">{money(cc.organicAov)}</div>
                    <div className="text-[11px] font-bold text-[#8a8fb0]">Everyone else</div>
                  </div>
                </div>
              </div>
              <div className="rounded-[14px] border border-[#e7e7f2] bg-white px-4 py-3.5">
                <div className="text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">
                  GMV per active creator
                </div>
                <div className="mt-2 flex items-baseline gap-3">
                  <div>
                    <div className="text-[21px] font-extrabold tabular-nums text-[#171a33]">
                      {compactMoney(cc.managedGmvPerCreator)}
                    </div>
                    <div className="text-[11px] font-bold text-[#4b45ff]">Signed roster</div>
                  </div>
                  <div className="text-[#c7c9de]">vs</div>
                  <div>
                    <div className="text-[21px] font-extrabold tabular-nums text-[#8a8fb0]">
                      {compactMoney(cc.organicGmvPerCreator)}
                    </div>
                    <div className="text-[11px] font-bold text-[#8a8fb0]">Everyone else</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-2 text-[10.5px] text-[#8a8fb0]">
              &ldquo;Everyone else&rdquo; is every other creator selling your products on TikTok Shop, whom we do not manage.
            </div>
          </>
        )}

        {/* ── 6. Roster coverage ─────────────────────────────────── */}
        {hasRoster && (
          <>
            <SectionLine>Roster coverage</SectionLine>
            <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
              <Mini label="Signed creators" value={num(cc.signedCreatorCount)} pct={null} />
              <Mini label="Active this period" value={num(cc.activeCreatorCount)} pct={null} />
              <Mini
                label="Activation rate"
                value={`${cc.signedCreatorCount > 0 ? ((cc.activeCreatorCount / cc.signedCreatorCount) * 100).toFixed(1) : '0'}%`}
                pct={null}
              />
              <Mini label="First-time active" value={num(cc.newlyActivatedCount)} pct={null} />
            </div>
          </>
        )}

        {/* ── 6b. Every creator, in full ─────────────────────────── */}
        {gran && gran.creators.length > 0 && (
          <>
            <SectionLine>Every creator we run for you</SectionLine>
            <FullRosterTable g={gran} />
          </>
        )}

        {/* ── 7. Store context, secondary ────────────────────────── */}
        <SectionLine>Your store overall</SectionLine>
        <p className="mb-3 max-w-[68ch] text-[13.5px] leading-[1.65] text-[#33375c]">
          Context for the numbers above. This is all of {brandName}&rsquo;s TikTok Shop activity, not only the
          creators we run.
        </p>
        <div className={`grid grid-cols-2 gap-3.5 ${s.views !== null ? 'md:grid-cols-5' : 'md:grid-cols-4'}`}>
          <Mini label="Store GMV" value={money(r.totalGmv)} pct={r.gmvChangePct} />
          {s.views !== null && <Mini label="Views" value={compactCount(s.views)} pct={viewsDelta} />}
          <Mini label="Orders" value={num(r.totalOrders)} pct={r.orderChangePct} />
          <Mini label="Videos posted" value={num(r.totalVideos)} pct={r.videoChangePct} />
          <Mini label="Active creators" value={num(r.activeCreators)} pct={r.creatorChangePct} />
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
