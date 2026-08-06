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

/** Bare handle for a TikTok profile URL. Names arrive with or without the @. */
function handleOf(name: string): string {
  return name.trim().replace(/^@+/, '').toLowerCase();
}

// ── Small pieces ───────────────────────────────────────────────────

function Delta({ pct, suffix, abs }: { pct: number | null; suffix?: string; abs?: string }) {
  if (pct === null) {
    return <div className="mt-0.5 text-[11px] font-bold text-[#8a8fb0]">new this period</div>;
  }
  if (Math.abs(pct) < 0.5) {
    return <div className="mt-0.5 text-[11px] font-bold text-[#8a8fb0]">no change</div>;
  }
  const up = pct >= 0;
  return (
    <div className={`mt-0.5 text-[11px] font-bold tabular-nums ${up ? 'text-[#0d9f6e]' : 'text-[#cf3a6e]'}`}>
      {up ? '▲' : '▼'} {abs ? `${abs} ` : ''}({Math.abs(pct).toFixed(1)}%){suffix ? ` ${suffix}` : ''}
    </div>
  );
}

/** Big stat, used in the agency band. */
function HeroStat({ label, value, pct, abs }: { label: string; value: string; pct: number | null; abs?: string }) {
  return (
    <div>
      <div className="text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">{label}</div>
      <div className="mt-0.5 text-[25px] font-extrabold leading-tight tabular-nums text-[#171a33]">{value}</div>
      <Delta pct={pct} abs={abs} />
    </div>
  );
}

/** Smaller stat, used for store context. */
function Mini({ label, value, pct }: { label: string; value: string; pct: number | null }) {
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
                  abs={money(Math.abs(cc.gmv - cc.priorGmv))}
                />
                <HeroStat label="Share of store" value={`${cc.pctOfStoreGmv.toFixed(1)}%`} pct={null} />
                <HeroStat
                  label="Creators active"
                  value={num(cc.activeCreatorCount)}
                  pct={cc.creatorChangePct}
                />
                <HeroStat
                  label="Posts published"
                  value={num(cc.videos)}
                  pct={cc.videoChangePct}
                  abs={num(Math.abs(cc.videos - cc.priorVideos))}
                />
              </div>
            </div>

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
