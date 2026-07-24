/**
 * The client report page body — renders the frozen snapshot to the approved
 * v3 mockup: masthead gradient, executive summary, account-lead notes, KPI
 * band (+ Views when engagement data exists), 12-week trend, highlights,
 * Creators Corner band, daily + day-of-week charts, watchable top content,
 * leaderboards, the since-we-started strip, and the frozen-date footer.
 *
 * Deliberately LIGHT regardless of viewer theme: this is the artifact
 * clients receive — print-adjacent, paper white (same call as the mockup).
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

// ── Small pieces ───────────────────────────────────────────────────

function Delta({ pct, suffix }: { pct: number | null; suffix?: string }) {
  if (pct === null) return <div className="mt-0.5 text-[11px] font-bold text-[#8a8fb0]">new</div>;
  const up = pct >= 0;
  return (
    <div className={`mt-0.5 text-[11px] font-bold ${up ? 'text-[#0d9f6e]' : 'text-[#cf3a6e]'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(0)}%{suffix ? ` ${suffix}` : ''}
    </div>
  );
}

function Kpi({ label, value, pct, suffix }: { label: string; value: string; pct: number | null; suffix?: string }) {
  return (
    <div className="rounded-[14px] border border-[#e7e7f2] bg-white px-4 py-3">
      <div className="text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">{label}</div>
      <div className="mt-1 text-[21px] font-extrabold tabular-nums text-[#171a33]">{value}</div>
      <Delta pct={pct} suffix={suffix} />
    </div>
  );
}

function SectionLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2.5 mt-7 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#8a8fb0]">
      {children}
    </div>
  );
}

function BarChart({
  title,
  bars,
  labels,
}: {
  title: string;
  bars: { value: number; isPeak: boolean }[];
  labels: string[];
}) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div className="rounded-[14px] border border-[#e7e7f2] bg-white px-4 py-3.5">
      <div className="mb-2.5 text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">{title}</div>
      <div className="flex h-[110px] items-end gap-[7px]">
        {bars.map((b, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-[5px]"
            style={{
              height: `${Math.max(3, (b.value / max) * 100)}%`,
              background: b.isPeak ? 'linear-gradient(180deg,#5b5ee8,#8b5cf6)' : '#dedcf2',
            }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex gap-[7px]">
        {labels.map((l, i) => (
          <span key={i} className="flex-1 text-center text-[9.5px] text-[#8a8fb0]">
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

function Leaderboard({ title, rows }: { title: string; rows: { name: string; gmv: number }[] }) {
  const top = rows[0]?.gmv ?? 0;
  return (
    <div className="overflow-hidden rounded-[14px] border border-[#e7e7f2] bg-white">
      <div className="border-b border-[#eeedf5] px-4 py-2.5 text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">
        {title}
      </div>
      {rows.map((r, i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b border-[#f2f1f8] px-4 py-2 text-[12.5px] last:border-b-0"
        >
          <span className="w-4 text-[11px] font-extrabold text-[#b3b7d4]">{i + 1}</span>
          <span className="min-w-0 flex-1 truncate font-semibold text-[#171a33]">{r.name}</span>
          <span className="hidden h-1.5 flex-[1.2] overflow-hidden rounded-full bg-[#efeef7] sm:block">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${top > 0 ? Math.max(4, (r.gmv / top) * 100) : 0}%`,
                background: 'linear-gradient(90deg,#5b5ee8,#a855f7)',
              }}
            />
          </span>
          <span className="font-extrabold tabular-nums text-[#171a33]">{money(r.gmv)}</span>
        </div>
      ))}
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

  const viewsDelta = s.views !== null && s.priorViews !== null ? pctChange(s.views, s.priorViews) : null;

  // 12-week trend context: flag the prior bucket when it was the strongest in
  // the window (the "down 50% vs a viral spike" honesty note).
  const weekly = s.weekly;
  const weeklyMax = Math.max(1, ...weekly.map((w) => w.gmv));
  const priorWasSpike =
    weekly.length >= 3 &&
    weekly[weekly.length - 2].gmv === weeklyMax &&
    weekly[weekly.length - 2].gmv > weekly[weekly.length - 1].gmv * 1.5;

  // Daily chart labels: every bar for a week, every 5th day for a month.
  const daily = r.dailyPerformance;
  const dailyLabels = daily.map((d, i) => {
    if (daily.length <= 10) return d.weekday.slice(0, 3);
    return i % 5 === 0 || i === daily.length - 1 ? fmtDay(d.date) : '';
  });

  const watchVideos = r.topVideos.slice(0, 3).map((v) => {
    const id = extractTikTokVideoId(v.videoUrl);
    const views = id !== null ? s.videoViews[id] : undefined;
    return { ...v, videoId: id, viewsLabel: views !== undefined ? compactCount(views) : null };
  });

  const lifetimeSince = s.lifetime.firstDate
    ? new Date(s.lifetime.firstDate + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="min-h-screen bg-[#fbfbfd] pb-9 text-[#171a33]">
      {/* Masthead */}
      <div
        className="px-5 pb-7 pt-8 text-white sm:px-11"
        style={{ background: 'linear-gradient(135deg,#141633 0%,#3b2f7d 55%,#8a2f80 100%)' }}
      >
        <div className="mx-auto flex max-w-[980px] flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[10.5px] font-extrabold uppercase tracking-[0.2em] text-white/65">
              {AGENCY} &middot; {reportKind}
            </div>
            <h1 className="mb-0.5 mt-2 text-[27px] font-extrabold tracking-tight">{brandName}</h1>
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

      <div className="mx-auto max-w-[980px] px-5 sm:px-11">
        {/* Executive summary */}
        <SectionLine>Executive summary</SectionLine>
        <p className="max-w-[68ch] text-[14.5px] leading-[1.65] text-[#33375c]">
          {brandName} generated <b className="text-[#171a33]">{money(r.totalGmv)}</b> across{' '}
          {r.totalVideos.toLocaleString('en-US')} posts from {r.activeCreators.toLocaleString('en-US')} active
          creators this {word}
          {s.views !== null && (
            <>
              , reaching <b className="text-[#171a33]">{compactCount(s.views)} views</b>
            </>
          )}
          .{' '}
          {cc.gmv > 0 && (
            <>
              {AGENCY}&rsquo;s signed roster delivered{' '}
              <b className="text-[#171a33]">
                {money(cc.gmv)}, {Math.round(cc.pctOfStoreGmv)}% of store GMV
              </b>
              {cc.newlyActivatedCount > 0 && <>, with {cc.newlyActivatedCount} creators newly activated</>}.{' '}
            </>
          )}
          {r.bestDay && (
            <>
              {r.bestDay.weekday} was the strongest day at {money(r.bestDay.gmv)}.
            </>
          )}
        </p>

        {/* Notes from the account lead */}
        {notes && (
          <div className="mt-3.5 rounded-xl border border-[#e3e0f5] border-l-[3px] border-l-[#5b5ee8] bg-white px-[18px] py-[15px]">
            <div className="mb-2 flex items-center gap-2.5">
              <span
                className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-[11px] font-extrabold text-white"
                style={{ background: 'linear-gradient(135deg,#5b5ee8,#a855f7)' }}
              >
                CC
              </span>
              <div>
                <b className="text-[13px]">Notes from your account lead</b>
                <div className="text-[10.5px] text-[#8a8fb0]">{AGENCY}</div>
              </div>
            </div>
            <p className="whitespace-pre-line text-[13.5px] leading-[1.65] text-[#33375c]">{notes}</p>
          </div>
        )}

        {/* KPI band */}
        <SectionLine>The {word} in numbers</SectionLine>
        <div className={`grid grid-cols-2 gap-3 ${s.views !== null ? 'md:grid-cols-5' : 'md:grid-cols-4'}`}>
          <Kpi label="GMV" value={money(r.totalGmv)} pct={r.gmvChangePct} suffix={`vs prior ${r.periodLengthDays}d`} />
          {s.views !== null && <Kpi label="Views" value={compactCount(s.views)} pct={viewsDelta} />}
          <Kpi label="Orders" value={r.totalOrders.toLocaleString('en-US')} pct={r.orderChangePct} />
          <Kpi label="Active creators" value={r.activeCreators.toLocaleString('en-US')} pct={r.creatorChangePct} />
          <Kpi label="Posts" value={r.totalVideos.toLocaleString('en-US')} pct={r.videoChangePct} />
        </div>

        {/* 12-week trend */}
        {weekly.length >= 4 && (
          <div className="mt-3 rounded-[14px] border border-[#e7e7f2] bg-white px-4 py-3.5">
            <div className="mb-2.5 text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">
              The last {weekly.length} weeks &middot; weekly GMV
            </div>
            <div className="flex h-[72px] items-end gap-[5px]">
              {weekly.map((w, i) => {
                const isNow = i === weekly.length - 1;
                const isSpike = priorWasSpike && i === weekly.length - 2;
                return (
                  <div
                    key={w.weekEnd}
                    className="flex-1 rounded-t"
                    style={{
                      height: `${Math.max(3, (w.gmv / weeklyMax) * 100)}%`,
                      background: isNow
                        ? 'linear-gradient(180deg,#5b5ee8,#8b5cf6)'
                        : isSpike
                          ? '#c9c6ea'
                          : '#dedcf2',
                    }}
                    title={`Week ending ${w.weekEnd}: ${money(w.gmv)}`}
                  />
                );
              })}
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-[#8a8fb0]">
              <span>{fmtDay(new Date(weekly[0].weekEnd + 'T12:00:00Z'))}</span>
              {priorWasSpike && <span className="italic text-[#b3b7d4]">last {word}&rsquo;s spike</span>}
              <span>this {word}</span>
            </div>
          </div>
        )}

        {/* Highlights */}
        {(r.topCreator || r.topVideo || r.bestDay) && (
          <>
            <SectionLine>Highlights</SectionLine>
            <div className="grid gap-3 md:grid-cols-3">
              {r.topCreator && (
                <div className="rounded-[14px] border border-[#e7e7f2] bg-white px-4 py-3.5">
                  <div className="text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">
                    Top creator
                  </div>
                  <div className="mt-1.5 text-sm font-extrabold">{r.topCreator.name}</div>
                  <div className="mt-0.5 text-xs text-[#6b7093]">
                    {r.topCreator.videos} posts &middot; {r.topCreator.orders.toLocaleString('en-US')} orders
                  </div>
                  <div className="mt-1.5 text-[17px] font-extrabold tabular-nums text-[#5b5ee8]">
                    {money(r.topCreator.gmv)}
                  </div>
                </div>
              )}
              {r.topVideo && (
                <div className="rounded-[14px] border border-[#e7e7f2] bg-white px-4 py-3.5">
                  <div className="text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">
                    Top video
                  </div>
                  <div className="mt-1.5 line-clamp-2 text-sm font-extrabold leading-snug">
                    &ldquo;{r.topVideo.title}&rdquo;
                  </div>
                  <div className="mt-0.5 text-xs text-[#6b7093]">
                    {r.topVideo.creator} &middot; watch below
                  </div>
                  <div className="mt-1.5 text-[17px] font-extrabold tabular-nums text-[#5b5ee8]">
                    {money(r.topVideo.gmv)}
                  </div>
                </div>
              )}
              {r.bestDay && (
                <div className="rounded-[14px] border border-[#e7e7f2] bg-white px-4 py-3.5">
                  <div className="text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">
                    Best day
                  </div>
                  <div className="mt-1.5 text-sm font-extrabold">
                    {r.bestDay.weekday}, {fmtDay(r.bestDay.date)}
                  </div>
                  <div className="mt-0.5 text-xs text-[#6b7093]">
                    {r.bestDay.orders.toLocaleString('en-US')} orders &middot;{' '}
                    {r.bestDay.creators.toLocaleString('en-US')} creators
                  </div>
                  <div className="mt-1.5 text-[17px] font-extrabold tabular-nums text-[#5b5ee8]">
                    {money(r.bestDay.gmv)}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Creators Corner band */}
        {cc.gmv > 0 && (
          <>
            <SectionLine>What {AGENCY} delivered</SectionLine>
            <div
              className="rounded-2xl border border-[#e3e0f5] px-5 py-[18px]"
              style={{ background: 'linear-gradient(135deg, rgba(91,94,232,.07), rgba(217,70,170,.06))' }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h3 className="text-base font-extrabold">
                  {Math.round(cc.pctOfStoreGmv)}% of store GMV came from the signed roster
                </h3>
                <span className="text-[13px] text-[#6b7093]">
                  <b className="text-base text-[#5b5ee8]">{money(cc.gmv)}</b> managed &middot;{' '}
                  {money(r.organic.gmv)} organic
                </span>
              </div>
              <div className="mt-3.5 h-2.5 overflow-hidden rounded-full bg-[#ecebf6]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, Math.max(2, cc.pctOfStoreGmv))}%`,
                    background: 'linear-gradient(90deg,#5b5ee8,#a855f7)',
                  }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] text-[#8a8fb0]">
                <span>Managed ({cc.activeCreatorCount.toLocaleString('en-US')} creators)</span>
                <span>Organic ({r.organic.creatorCount.toLocaleString('en-US')} creators)</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-4">
                <div className="rounded-[11px] border border-[#e7e7f2] bg-white px-3 py-2.5">
                  <div className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#8a8fb0]">
                    Signed roster
                  </div>
                  <div className="mt-1 text-base font-extrabold tabular-nums">
                    {cc.signedCreatorCount.toLocaleString('en-US')}
                  </div>
                </div>
                <div className="rounded-[11px] border border-[#e7e7f2] bg-white px-3 py-2.5">
                  <div className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#8a8fb0]">
                    Active this {word}
                  </div>
                  <div className="mt-1 text-base font-extrabold tabular-nums">
                    {cc.activeCreatorCount.toLocaleString('en-US')}
                  </div>
                </div>
                <div className="rounded-[11px] border border-[#e7e7f2] bg-white px-3 py-2.5">
                  <div className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#8a8fb0]">
                    Newly activated
                  </div>
                  <div className="mt-1 text-base font-extrabold tabular-nums">{cc.newlyActivatedCount}</div>
                </div>
                <div className="rounded-[11px] border border-[#e7e7f2] bg-white px-3 py-2.5">
                  <div className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#8a8fb0]">
                    Managed AOV vs organic
                  </div>
                  <div className="mt-1 text-base font-extrabold tabular-nums">
                    ${Math.round(cc.managedAov)} vs ${Math.round(cc.organicAov)}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Daily performance */}
        <SectionLine>Daily performance</SectionLine>
        <div className="grid gap-3 md:grid-cols-[1.6fr_1fr]">
          <BarChart
            title="GMV by day"
            bars={daily.map((d) => ({ value: d.gmv, isPeak: d.isPeak }))}
            labels={dailyLabels}
          />
          <BarChart
            title="Best days of the week"
            bars={r.dayOfWeek.map((d) => ({ value: d.gmv, isPeak: d.isPeak }))}
            labels={['S', 'M', 'T', 'W', 'T', 'F', 'S']}
          />
        </div>

        {/* Watchable top content */}
        {watchVideos.length > 0 && (
          <>
            <SectionLine>Watch the top content &middot; plays right here</SectionLine>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {watchVideos.map((v, i) => (
                <WatchCard
                  key={`${v.videoId ?? v.title}-${i}`}
                  videoUrl={v.videoUrl}
                  videoId={v.videoId}
                  title={v.title}
                  creator={v.creator}
                  gmv={v.gmv}
                  viewsLabel={v.viewsLabel}
                  index={i}
                />
              ))}
            </div>
          </>
        )}

        {/* Leaderboards */}
        <SectionLine>Leaderboards</SectionLine>
        <div className="grid gap-3 md:grid-cols-2">
          <Leaderboard
            title="Top creators"
            rows={r.topCreators.slice(0, 5).map((c) => ({ name: c.name, gmv: c.gmv }))}
          />
          <Leaderboard
            title="Top products"
            rows={r.topProducts.slice(0, 5).map((p) => ({ name: p.name, gmv: p.gmv }))}
          />
        </div>

        {/* Since-we-started strip */}
        <div className="mt-7 flex flex-wrap items-center gap-x-7 gap-y-4 rounded-[14px] bg-[#171a33] px-5 py-4 text-white">
          <div className="mr-auto max-w-[26ch] text-[12.5px] text-white/75">
            The partnership so far{lifetimeSince ? `, since ${AGENCY} came on in ${lifetimeSince}` : ''}:
          </div>
          <div>
            <div className="text-[9.5px] font-extrabold uppercase tracking-[0.13em] text-white/55">Lifetime GMV</div>
            <div className="mt-0.5 text-[19px] font-extrabold tabular-nums">{compactMoney(s.lifetime.gmv)}</div>
          </div>
          {s.lifetime.videos !== null && s.lifetime.videos > 0 && (
            <div>
              <div className="text-[9.5px] font-extrabold uppercase tracking-[0.13em] text-white/55">
                Videos produced
              </div>
              <div className="mt-0.5 text-[19px] font-extrabold tabular-nums">
                {s.lifetime.videos.toLocaleString('en-US')}
              </div>
            </div>
          )}
          {cc.signedCreatorCount > 0 && (
            <div>
              <div className="text-[9.5px] font-extrabold uppercase tracking-[0.13em] text-white/55">
                Creators signed
              </div>
              <div className="mt-0.5 text-[19px] font-extrabold tabular-nums">
                {cc.signedCreatorCount.toLocaleString('en-US')}
              </div>
            </div>
          )}
          {s.lifetime.bestWeek !== null && s.lifetime.bestWeek > 0 && (
            <div>
              <div className="text-[9.5px] font-extrabold uppercase tracking-[0.13em] text-white/55">Best week</div>
              <div className="mt-0.5 text-[19px] font-extrabold tabular-nums">
                {compactMoney(s.lifetime.bestWeek)}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 flex flex-wrap justify-between gap-3.5 border-t border-[#e7e7f2] pt-4 text-[11.5px] text-[#8a8fb0]">
          <span>
            Prepared by {AGENCY} for {brandName}
          </span>
          <span>Private link &middot; numbers frozen as of {fmtDay(frozen)}, {frozen.getFullYear()}</span>
        </div>
      </div>
    </div>
  );
}
