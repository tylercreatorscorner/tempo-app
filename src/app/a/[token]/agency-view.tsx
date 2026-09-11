/**
 * The agency's portfolio report, for leadership.
 *
 * A client report is persuasive by design: it leads with contribution because
 * the reader is deciding whether to keep paying. This reader needs the
 * opposite, so the page is ordered around decisions: is the business growing
 * on a comparable basis, which accounts need attention, and what moved.
 *
 * ── v2 ordering, and why ──────────────────────────────────────────────────────
 *
 *   1. The answer, with the comparable trend named, not the blended share.
 *   2. Six months: our GMV per month, and SAME-STORE share as the line.
 *   3. Watchlist: accounts under 1.0x, or losing share while their store grew.
 *   4. What moved, with each client's own store beside it.
 *   5. Concentration, every client, invoiced, cost, caveats.
 *
 * ⚠️ Every v2 section is optional in the snapshot. A report frozen under v1
 * renders exactly as it did, without the sections it never had.
 *
 * ⚠️ INTERNAL but token-served, because the head of agency has no Tempo login.
 * No creator names, no handles, no client contacts.
 */
import type { AgencySnapshot, AgencyBrandRow, AgencyTrendPoint } from '@/lib/data/agency-report';

/** "+1.9 pts" for a change in a percentage. Never a relative %, see below. */
function pts(n: number): string {
  return (n >= 0 ? '+' : '') + n.toFixed(1) + ' pts';
}

const AGENCY = 'Creators Corner';

function money(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}
function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M';
  if (a >= 1_000) return '$' + Math.round(n / 1_000) + 'K';
  return money(n);
}
function num(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
function pct(n: number, dp = 1): string {
  return n.toFixed(dp) + '%';
}
function signed(n: number, dp = 1): string {
  return (n >= 0 ? '+' : '') + n.toFixed(dp) + '%';
}
/**
 * Relative change in our share of a client's store, in percent.
 *
 * 🚨 POINTS ALONE UNDER-READ SMALL SHARES. M3 went from 2.5% to 1.6%:
 * only 0.9 points, so a points rule called it "held share", while in fact we
 * lost over a third of our position in a store that grew 36.5%. Judging the
 * relative change as well is what stops a small account's decline hiding
 * behind its small absolute numbers.
 */
function relShare(b: AgencyBrandRow): number | null {
  if (b.sharePct === null || b.priorSharePct === null || b.priorSharePct === undefined) return null;
  if (b.priorSharePct <= 0 || b.priorRosterGmv <= 0) return null;
  return (b.sharePct / b.priorSharePct - 1) * 100;
}

/** Placeholder for a value that does not exist. Not a dash: see the no-dash rule. */
const NONE = <span className="text-[#b9bcd0]">n/a</span>;

function Delta({ v }: { v: number | null | undefined }) {
  if (v === null || v === undefined) return <span className="text-[12px] text-[#9aa0bf]">new</span>;
  return (
    <span className={`text-[12.5px] font-bold tabular-nums ${v >= 0 ? 'text-[#0b8a5f]' : 'text-[#c0392b]'}`}>
      {signed(v)}
    </span>
  );
}

/**
 * Did we gain or lose ground against the client's own store?
 *
 * Either test is enough: a move of at least one point, OR at least 15% of the
 * share we held. The points test catches a large account's meaningful slide;
 * the relative test catches a small account losing a third of its position.
 * Under both thresholds reads as held, because a 0.4 point wobble on a large
 * store is noise and calling it a gain is the over-reading this page exists
 * to prevent.
 */
function verdict(b: AgencyBrandRow): { label: string; tone: 'good' | 'bad' | 'flat' } | null {
  const p = b.sharePts;
  const r = relShare(b);
  if (p === null || p === undefined || r === null) return null;
  if (p >= 1 || r >= 15) return { label: 'Gained ground', tone: 'good' };
  if (p <= -1 || r <= -15) return { label: 'Lost ground', tone: 'bad' };
  return { label: 'Held share', tone: 'flat' };
}

function Chip({ tone, children }: { tone: 'good' | 'bad' | 'flat' | 'warn'; children: React.ReactNode }) {
  const cls =
    tone === 'good' ? 'bg-[#e6f5ef] text-[#0b7a55]'
      : tone === 'bad' ? 'bg-[#fbeceb] text-[#b3261e]'
        : tone === 'warn' ? 'bg-[#fdf3e1] text-[#8a5a08]'
          : 'bg-[#f1f1f6] text-[#5c6183]';
  return (
    <span className={`inline-flex whitespace-nowrap rounded-[6px] px-2 py-0.5 text-[11.5px] font-semibold ${cls}`}>
      {children}
    </span>
  );
}

/**
 * Why a client is on the watchlist. Exact arithmetic on figures already on the
 * page; nothing estimated, nothing weighted.
 */
function watchReasons(b: AgencyBrandRow): string[] {
  const out: string[] = [];
  if (b.returnX !== null && b.returnX !== undefined && b.returnX < 1) {
    out.push(
      `Returns ${b.returnX.toFixed(2)}x: ${money(b.committedRetainer)}/mo committed for ${money(b.rosterGmv)} of GMV`,
    );
  }
  const v = verdict(b);
  const from = b.priorSharePct;
  const to = b.sharePct;
  if (v?.tone === 'bad' && from !== null && from !== undefined && to !== null) {
    // ⚠️ Every share row carries BOTH directions. This used to say "while its
    // store grew" only when true, and the intro copied that clause as the rule,
    // so three of six rows read as failing the list's own criterion.
    const store = b.storeMomPct;
    const ours = b.momPct;
    const dir = (n: number) => `${n >= 0 ? 'grew' : 'fell'} ${Math.abs(n).toFixed(1)}%`;
    out.push(
      store !== null && store !== undefined && ours !== null
        ? `Share fell from ${pct(from)} to ${pct(to)}: its store ${dir(store)}, we ${dir(ours)}`
        : `Share fell from ${pct(from)} to ${pct(to)}`,
    );
  }
  return out;
}

export function AgencyView({ snapshot: s }: { snapshot: AgencySnapshot }) {
  const t = s.totals;
  const isV2 = s.v === 2;
  const rosterMom = t.priorRosterGmv > 0 ? ((t.rosterGmv - t.priorRosterGmv) / t.priorRosterGmv) * 100 : null;
  const storeMom = t.priorStoreGmv > 0 ? ((t.storeGmv - t.priorStoreGmv) / t.priorStoreGmv) * 100 : null;
  const share = t.storeGmv > 0 ? (t.rosterGmv / t.storeGmv) * 100 : 0;
  const priorShare = t.priorStoreGmv > 0 ? (t.priorRosterGmv / t.priorStoreGmv) * 100 : null;

  const earners = s.brands.filter((b) => b.rosterGmv > 0);
  const ranked = [...earners].sort((a, b) => b.rosterGmv - a.rosterGmv);
  // ⚠️ A client that went to $0 this period is still a client this period:
  // its loss belongs in "came off" and its row belongs in the table. Only
  // earners were counted before, so a churned client would have vanished and
  // the halves would no longer have added back to the headline change.
  const active = s.brands.filter((b) => b.rosterGmv > 0 || b.priorRosterGmv > 0);
  const rankedAll = [...active].sort((a, b) => b.rosterGmv - a.rosterGmv);
  const top1 = ranked[0];
  const top3 = ranked.slice(0, 3);
  const top3Share = t.rosterGmv > 0 ? (top3.reduce((x, b) => x + b.rosterGmv, 0) / t.rosterGmv) * 100 : 0;
  const top1Share = t.rosterGmv > 0 && top1 ? (top1.rosterGmv / t.rosterGmv) * 100 : 0;

  // A brand with no prior is new money, counted at full value, so the two
  // halves add back to the headline change exactly.
  const moved = active.map((b) => ({
    ...b,
    swing: b.priorRosterGmv > 0 ? b.rosterGmv - b.priorRosterGmv : b.rosterGmv,
    isNew: b.priorRosterGmv <= 0,
  }));
  const gained = moved.filter((b) => b.swing > 0).reduce((x, b) => x + b.swing, 0);
  const lost = moved.filter((b) => b.swing < 0).reduce((x, b) => x + b.swing, 0);
  const upCount = moved.filter((b) => b.swing > 0).length;
  const downCount = moved.filter((b) => b.swing < 0).length;
  // New money is stated on its own: "came on across 9 accounts" read as nine
  // existing accounts growing when one of them did not exist last period.
  const newOnes = moved.filter((b) => b.isNew && b.swing > 0);
  const newMoney = newOnes.reduce((x, b) => x + b.swing, 0);
  const gainedExisting = gained - newMoney;
  const upExisting = upCount - newOnes.length;

  /**
   * Like-for-like: only the clients that existed in both periods. The blended
   * pair leans on new clients, and the readers who tried to strip them out by
   * hand got the store side wrong because the page gave them no way to do it.
   * Stated beside the blended figures, never instead of them.
   */
  const lfl = s.brands.filter((b) => b.priorRosterGmv > 0);
  const lflPrior = lfl.reduce((x, b) => x + b.priorRosterGmv, 0);
  const lflStorePrior = lfl.reduce((x, b) => x + b.priorStoreGmv, 0);
  const lflOursPct = newOnes.length > 0 && lflPrior > 0
    ? ((lfl.reduce((x, b) => x + b.rosterGmv, 0) - lflPrior) / lflPrior) * 100 : null;
  const lflStorePct = newOnes.length > 0 && lflStorePrior > 0
    ? ((lfl.reduce((x, b) => x + b.storeGmv, 0) - lflStorePrior) / lflStorePrior) * 100 : null;

  // v2: grouped by verdict (lost, held, gained, new), largest dollar move
  // first inside each group. The relative-share sort this replaces put a
  // $1,635 loss at the top of a table whose lead said "dollars".
  const groupOf = (b: (typeof moved)[number]) => {
    const v = b.isNew ? null : verdict(b);
    return v === null ? 3 : v.tone === 'bad' ? 0 : v.tone === 'flat' ? 1 : 2;
  };
  const byShare = [...moved].sort((a, b) => groupOf(a) - groupOf(b) || Math.abs(b.swing) - Math.abs(a.swing));

  const perDollar = t.committedRetainer > 0 ? t.rosterGmv / t.committedRetainer : null;

  const watch = isV2
    ? s.brands
        .map((b) => ({ b, reasons: watchReasons(b) }))
        .filter((x) => x.reasons.length > 0)
        .sort((a, z) => z.b.committedRetainer - a.b.committedRetainer)
    : [];
  // The largest dollar decline that did NOT qualify. A share-filtered list can
  // never surface a client whose whole store is sinking under us (Physicians
  // Choice: largest commitment, -$97,956, held share), so it is named here.
  const watchSet = new Set(watch.map((w) => w.b.slug));
  const alsoWatching = isV2
    ? [...moved].filter((b) => b.swing < 0 && !watchSet.has(b.slug)).sort((a, b) => a.swing - b.swing)[0] ?? null
    : null;

  const trend = s.trend;
  const tFirst = trend?.points[0];
  const tLast = trend?.points[trend.points.length - 1];
  const ssFirst = tFirst && tFirst.sameStoreStore > 0 ? (tFirst.sameStoreRoster / tFirst.sameStoreStore) * 100 : null;
  const ssLast = tLast && tLast.sameStoreStore > 0 ? (tLast.sameStoreRoster / tLast.sameStoreStore) * 100 : null;
  const tPrev = trend && trend.points.length > 1 ? trend.points[trend.points.length - 2] : undefined;
  const ssPrev = tPrev && tPrev.sameStoreStore > 0 ? (tPrev.sameStoreRoster / tPrev.sameStoreStore) * 100 : null;
  const ssGmvChange =
    tFirst && tLast && tFirst.sameStoreRoster > 0
      ? ((tLast.sameStoreRoster - tFirst.sameStoreRoster) / tFirst.sameStoreRoster) * 100
      : null;
  const ssStoreChange =
    tFirst && tLast && tFirst.sameStoreStore > 0
      ? ((tLast.sameStoreStore - tFirst.sameStoreStore) / tFirst.sameStoreStore) * 100
      : null;
  const ssNames = trend
    ? trend.sameStore.map((slug) => s.brands.find((b) => b.slug === slug)?.name ?? slug)
    : [];

  return (
    <div className="min-h-screen bg-[#fbfbfd] pb-12 text-[#171a33]">
      <div
        className="px-5 pb-7 pt-8 text-white sm:px-11"
        style={{ background: 'linear-gradient(135deg,#141633 0%,#3b2f7d 55%,#8a2f80 100%)' }}
      >
        <div className="mx-auto max-w-[1000px]">
          <div className="text-[10.5px] font-extrabold uppercase tracking-[0.2em] text-white/65">
            {AGENCY} &middot; Agency performance
          </div>
          <h1 className="mb-0.5 mt-2 text-[28px] font-extrabold tracking-tight">{s.periodLabel}</h1>
          <div className="text-[13.5px] text-white/80">
            Internal &middot; {t.clients} client{t.clients === 1 ? '' : 's'} &middot; against {s.priorLabel} &middot; prepared{' '}
            {new Date(s.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1000px] px-5 sm:px-11">
        {/* ── 1. The answer ───────────────────────────────────────── */}
        <div className="mt-6 rounded-[14px] border border-[#e7e7f2] bg-white px-5 py-5">
          <h2 className="text-[21px] font-extrabold leading-snug tracking-tight">
            Our creators produced {compact(t.rosterGmv)} across {t.clients} client stores
          </h2>
          <p className="mt-1.5 max-w-[72ch] text-[14.5px] leading-[1.65] text-[#33375c]">
            {rosterMom !== null && (
              <>
                That is <b className="text-[#171a33]">{signed(rosterMom)}</b> on {s.priorLabel}
                {storeMom !== null && (
                  <>
                    , while the client stores themselves moved <b className="text-[#171a33]">{signed(storeMom)}</b>
                  </>
                )}
                .{' '}
              </>
            )}
            {/* 🚨 v1 closed this paragraph with "we took a larger share of a
                smaller market". True for one month, and it read as a win in the
                middle of a six-month same-store decline. The comparable series
                is named here instead. */}
            {isV2 && ssFirst !== null && ssLast !== null && tFirst && tLast && trend ? (
              <>
                In the <b className="text-[#171a33]">{trend.sameStore.length}</b> clients we have held for all six
                months, our share went from <b className="text-[#171a33]">{pct(ssFirst)}</b> in {tFirst.label} to{' '}
                <b className="text-[#171a33]">{pct(ssLast)}</b> in {tLast.label}
                {ssGmvChange !== null && ssStoreChange !== null && (
                  <>
                    , with our GMV there <b className="text-[#171a33]">{signed(ssGmvChange, 0)}</b> since {tFirst.label}{' '}
                    against their stores <b className="text-[#171a33]">{signed(ssStoreChange, 0)}</b> over the same six months
                  </>
                )}
                .
                {lflOursPct !== null && lflStorePct !== null && (
                  <>
                    {' '}Excluding {newOnes.map((b) => b.name).join(' and ')}, new this period, our GMV is{' '}
                    <b className="text-[#171a33]">{signed(lflOursPct)}</b> on {s.priorLabel} against client stores at{' '}
                    <b className="text-[#171a33]">{signed(lflStorePct)}</b> on the same clients.
                  </>
                )}
              </>
            ) : (
              priorShare !== null && (
                <>
                  Our share of all client stores was <b className="text-[#171a33]">{pct(share)}</b>, against{' '}
                  {pct(priorShare)} in {s.priorLabel}.
                </>
              )
            )}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3.5 md:grid-cols-4">
            <Stat label="Our GMV" value={compact(t.rosterGmv)} delta={rosterMom} />
            <Stat label="Client store GMV" value={compact(t.storeGmv)} delta={storeMom} />
            {isV2 && ssLast !== null && trend ? (
              <Stat
                label="Same-store share"
                value={pct(ssLast)}
                note={
                  (ssPrev !== null ? `${pts(ssLast - ssPrev)} on ${s.priorLabel.split(' ')[0]}. ` : '') +
                  `${trend.sameStore.length} clients held all six months; blended share is ${pct(share)}`
                }
              />
            ) : (
              <Stat
                label="Share of stores"
                value={pct(share)}
                note={priorShare !== null ? `${pct(priorShare)} in ${s.priorLabel}` : undefined}
              />
            )}
            <Stat label="Retainer committed" value={money(t.committedRetainer) + '/mo'} note={`${num(t.retained)} creators`} />
          </div>
        </div>

        {/* ── 2. Six months ───────────────────────────────────────── */}
        {isV2 && trend && trend.points.length > 1 && (
          <>
            <SectionLine>Six months</SectionLine>
            <div className="rounded-[14px] border border-[#e7e7f2] bg-white px-5 py-5">
              <p className="max-w-[72ch] text-[14.5px] leading-[1.65] text-[#33375c]">
                Bars are our GMV across every client that month. The line is our share of the stores we have held
                for all six months, which is the comparable one: the number of clients changes month to month, so a
                blended share mostly measures who we signed.
              </p>
              <TrendChart points={trend.points} hasSameStore={trend.sameStore.length > 0} />
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-[12.5px]">
                  <thead>
                    <tr className="border-b border-[#eeedf5]">
                      <th className={TH_L}>Month</th>
                      <th className={TH_R}>Our GMV</th>
                      <th className={TH_R}>Clients</th>
                      <th className={TH_R}>Blended share</th>
                      <th className={TH_R}>Same-store share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trend.points.map((p) => (
                      <tr key={p.month} className="border-b border-[#f2f1f8] last:border-b-0">
                        <td className="px-4 py-2 text-[#33375c]">{p.label}</td>
                        <td className="px-4 py-2 text-right font-bold tabular-nums text-[#171a33]">{money(p.rosterGmv)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-[#5c6183]">{p.clients}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-[#8a8fb0]">
                          {p.storeGmv > 0 ? pct((p.rosterGmv / p.storeGmv) * 100) : NONE}
                        </td>
                        <td className="px-4 py-2 text-right font-semibold tabular-nums text-[#4b45ff]">
                          {p.sameStoreStore > 0 ? pct((p.sameStoreRoster / p.sameStoreStore) * 100) : NONE}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {ssNames.length > 0 && (
                <p className="mt-2.5 text-[11.5px] leading-[1.6] text-[#8a8fb0]">
                  Same-store clients: {ssNames.join(', ')}.
                  {trend.sameStore.length < 5 &&
                    ' A small base, so read the direction of the line more than its level.'}
                </p>
              )}
              {/* Who moved the line. Four clients is few enough that the
                  answer to "which of them" fits in four rows. */}
              {trend.byClient && trend.byClient.length > 0 && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[560px] border-collapse text-[12.5px]">
                    <thead>
                      <tr className="border-b border-[#eeedf5]">
                        <th className={TH_L}>Same-store share by client</th>
                        {trend.points.map((p) => (
                          <th key={p.month} className={TH_R}>{p.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {trend.byClient.map((c) => {
                        const b = s.brands.find((x) => x.slug === c.slug);
                        return (
                          <tr key={c.slug} className="border-b border-[#f2f1f8] last:border-b-0">
                            <td className="px-4 py-2">
                              <span className="flex items-center gap-2">
                                <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: b?.color || '#c7c9de' }} />
                                <span className="font-semibold text-[#171a33]">{b?.name ?? c.slug}</span>
                              </span>
                            </td>
                            {c.months.map((m) => (
                              <td key={m.month} className="px-4 py-2 text-right tabular-nums text-[#33375c]">
                                {m.storeGmv > 0 ? pct((m.rosterGmv / m.storeGmv) * 100) : NONE}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {trend.gaps && trend.gaps.length > 0 && (
                <ul className="mt-2.5 space-y-1">
                  {trend.gaps.map((g) => (
                    <li key={g} className="text-[11.5px] leading-[1.6] text-[#8a5a08]">{g}</li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {/* ── 3. Watchlist ────────────────────────────────────────── */}
        {isV2 && (
          <>
            <SectionLine>Watchlist</SectionLine>
            <div className="rounded-[14px] border border-[#e7e7f2] bg-white px-5 py-4">
              {watch.length === 0 ? (
                <p className="text-[14px] text-[#5c6183]">
                  No client returns under 1.0x on committed retainer, and none lost share while its store grew.
                </p>
              ) : (
                <>
                  <p className="mb-2 max-w-[72ch] text-[13.5px] leading-[1.6] text-[#5c6183]">
                    Clients under 1.0x on committed retainer, or that lost ground on share. Largest commitment first.
                  </p>
                  {watch.map(({ b, reasons }) => (
                    <div key={b.slug} className="flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-[#f2f1f8] py-2.5 last:border-b-0">
                      <span className="flex min-w-[150px] items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: b.color || '#c7c9de' }} />
                        <span className="text-[14px] font-semibold text-[#171a33]">{b.name}</span>
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        {reasons.map((r) => (
                          <span key={r} className="text-[13px] leading-[1.5] text-[#33375c]">{r}</span>
                        ))}
                      </span>
                    </div>
                  ))}
                  {alsoWatching && (
                    <p className="mt-2.5 text-[12.5px] leading-[1.6] text-[#5c6183]">
                      Also watching: <b className="text-[#171a33]">{alsoWatching.name}</b>, the largest dollar decline not on
                      this list at <b className="text-[#171a33]">&minus;{money(Math.abs(alsoWatching.swing))}</b> on {s.priorLabel}
                      {alsoWatching.momPct !== null && ` (${signed(alsoWatching.momPct)})`}
                      {(() => { const v = verdict(alsoWatching); return v ? `, ${v.label.toLowerCase()}` : ''; })()}
                      {!alsoWatching.invoiced && ', not yet invoiced'}.
                    </p>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {/* ── 4. What moved ───────────────────────────────────────── */}
        <SectionLine>What moved</SectionLine>
        <div className="rounded-[14px] border border-[#e7e7f2] bg-white px-5 py-5">
          <p className="max-w-[72ch] text-[14.5px] leading-[1.65] text-[#33375c]">
            <b className="text-[#171a33]">{money(gainedExisting)}</b> came on across {upExisting} account{upExisting === 1 ? '' : 's'}
            {newOnes.length > 0 && (
              <>
                , plus <b className="text-[#171a33]">{money(newMoney)}</b> from {newOnes.length} new client{newOnes.length === 1 ? '' : 's'}
              </>
            )}
            , and <b className="text-[#171a33]">{money(Math.abs(lost))}</b> came off across {downCount}.
            {isV2 && ' Dollars show where GMV moved; our share before and after shows whether we moved with the client or against it, which is the part we control. Grouped by verdict, largest dollar move first.'}
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-[#eeedf5]">
                  <th className={TH_L}>Client</th>
                  <th className={TH_R}>Our GMV, $</th>
                  <th className={TH_R}>Our GMV, %</th>
                  {isV2 && <th className={TH_R}>Their store, %</th>}
                  {isV2 && <th className={TH_R}>Share</th>}
                  {isV2 && <th className={TH_L}>Verdict</th>}
                </tr>
              </thead>
              <tbody>
                {(isV2 ? byShare : [...moved].sort((a, b) => a.swing - b.swing)).map((b) => {
                  const v = verdict(b);
                  return (
                    <tr key={b.slug} className="border-b border-[#f2f1f8] last:border-b-0">
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: b.color || '#c7c9de' }} />
                          <span className="font-semibold text-[#171a33]">{b.name}</span>
                        </span>
                      </td>
                      <td className={`whitespace-nowrap px-4 py-2.5 text-right font-bold tabular-nums ${b.swing >= 0 ? 'text-[#0b8a5f]' : 'text-[#c0392b]'}`}>
                        {b.swing >= 0 ? '+' : '−'}{money(Math.abs(b.swing))}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right"><Delta v={b.isNew ? null : b.momPct} /></td>
                      {isV2 && (
                        <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-[#5c6183]">
                          {b.storeMomPct === null || b.storeMomPct === undefined ? NONE : signed(b.storeMomPct)}
                        </td>
                      )}
                      {isV2 && (
                        <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums text-[#171a33]">
                          {/* Before and after, not a points delta: the level is
                              what makes a move readable, and 2.5% to 1.6% says
                              what "-0.9 pts" hides. */}
                          {b.priorSharePct === null || b.priorSharePct === undefined || b.sharePct === null || b.isNew
                            ? NONE
                            : `${pct(b.priorSharePct)} → ${pct(b.sharePct)}`}
                        </td>
                      )}
                      {isV2 && (
                        <td className="whitespace-nowrap px-4 py-2.5">
                          {v ? <Chip tone={v.tone}>{v.label}</Chip> : <Chip tone="flat">New this month</Chip>}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {isV2 && (
            <p className="mt-2.5 text-[11.5px] leading-[1.6] text-[#8a8fb0]">
              Under one point and under 15% of the share either way reads as held.
            </p>
          )}
        </div>

        {/* ── 5. Concentration ────────────────────────────────────── */}
        <SectionLine>Concentration</SectionLine>
        <div className="rounded-[14px] border border-[#e7e7f2] bg-white px-5 py-5">
          <p className="max-w-[72ch] text-[14.5px] leading-[1.65] text-[#33375c]">
            {top1 && (
              <>
                <b className="text-[#171a33]">{top1.name}</b> alone is <b className="text-[#171a33]">{pct(top1Share)}</b> of
                everything our creators produced, and the top three are <b className="text-[#171a33]">{pct(top3Share)}</b> between them.
              </>
            )}
          </p>
          <div className="mt-3.5 flex h-3 w-full overflow-hidden rounded-full bg-[#f0eff7]">
            {ranked.map((b) => (
              <div
                key={b.slug}
                title={`${b.name} ${pct((b.rosterGmv / t.rosterGmv) * 100)}`}
                style={{ width: `${(b.rosterGmv / t.rosterGmv) * 100}%`, backgroundColor: b.color || '#c7c9de' }}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {top3.map((b) => (
              <span key={b.slug} className="flex items-center gap-1.5 text-[12px] text-[#5c6183]">
                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: b.color || '#c7c9de' }} />
                {b.name} {pct((b.rosterGmv / t.rosterGmv) * 100)}
              </span>
            ))}
            <span className="text-[12px] text-[#8a8fb0]">and {ranked.length - top3.length} more</span>
          </div>
        </div>

        {/* ── 6. Every client ─────────────────────────────────────── */}
        <SectionLine>Every client</SectionLine>
        <div className="overflow-x-auto rounded-[14px] border border-[#e7e7f2] bg-white">
          <table className="w-full min-w-[860px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-[#eeedf5]">
                <th className={TH_L}>Client</th>
                <th className={TH_R}>Our GMV</th>
                <th className={TH_R}>vs {s.priorLabel.split(' ')[0]}</th>
                <th className={TH_R}>Our share</th>
                <th className={TH_R}>On retainer / signed</th>
                <th className={TH_R}>Committed/mo</th>
                {isV2 && <th className={TH_R}>GMV per $1</th>}
                {isV2 && <th className={TH_R}>Invoiced</th>}
              </tr>
            </thead>
            <tbody>
              {rankedAll.map((b) => (
                <tr key={b.slug} className="border-b border-[#eeedf5]">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: b.color || '#c7c9de' }} />
                      <span className="font-semibold text-[#171a33]">{b.name}</span>
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right font-extrabold tabular-nums text-[#171a33]">{money(b.rosterGmv)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right"><Delta v={b.momPct} /></td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-[#33375c]">
                    {b.sharePct === null ? NONE : pct(b.sharePct)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-[#33375c]">
                    {num(b.retained)}<span className="text-[#8a8fb0]">&nbsp;/&nbsp;{num(b.signed)}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-[#33375c]">
                    {b.committedRetainer > 0 ? money(b.committedRetainer) : NONE}
                  </td>
                  {isV2 && (
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      {b.returnX === null || b.returnX === undefined ? NONE : (
                        <span className={`font-bold tabular-nums ${b.returnX < 1 ? 'text-[#c0392b]' : 'text-[#171a33]'}`}>
                          {b.returnX.toFixed(2)}x
                        </span>
                      )}
                    </td>
                  )}
                  {isV2 && (
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-[#33375c]">
                      {b.invoiced ? money(b.invoiced) : <span className="text-[#b9bcd0]">not yet</span>}
                    </td>
                  )}
                </tr>
              ))}
              {/* Totals, so the reader does not have to prove the page reconciles. */}
              <tr className="bg-[#fcfcff]">
                <td className="px-4 py-2.5 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#5c6183]">All clients</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right font-extrabold tabular-nums text-[#171a33]">{money(t.rosterGmv)}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right"><Delta v={rosterMom} /></td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-[#33375c]">{t.storeGmv > 0 ? pct(share) : NONE}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-[#33375c]">
                  {num(t.retained)}<span className="text-[#8a8fb0]">&nbsp;/&nbsp;{num(t.signed)}</span>
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-[#33375c]">{money(t.committedRetainer)}</td>
                {isV2 && (
                  <td className="whitespace-nowrap px-4 py-2.5 text-right font-bold tabular-nums text-[#171a33]">
                    {perDollar !== null ? perDollar.toFixed(2) + 'x' : NONE}
                  </td>
                )}
                {isV2 && (
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-[#33375c]">
                    {t.invoiced ? money(t.invoiced) : NONE}
                  </td>
                )}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11.5px] leading-[1.6] text-[#8a8fb0]">
          On retainer / signed counts creators on the roster today, not at the end of the period.
          {isV2 &&
            ` GMV per $1 divides ${s.periodLabel} GMV by the full monthly retainer of everyone on the roster as of ${new Date(s.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}; under 1.0x is marked red.`}
        </p>

        {/* ── 7. Invoiced ─────────────────────────────────────────── */}
        {isV2 && t.invoiced !== undefined && (
          <>
            <SectionLine>Invoiced</SectionLine>
            <div className="rounded-[14px] border border-[#e7e7f2] bg-white px-5 py-4">
              {t.invoicedClients === 0 ? (
                <p className="text-[14px] text-[#5c6183]">No {s.periodLabel} invoices had been generated when this was prepared.</p>
              ) : (
                <>
                  <p className="max-w-[72ch] text-[14.5px] leading-[1.65] text-[#33375c]">
                    <b className="text-[#171a33]">{t.invoicedClients} of {t.clients}</b> clients invoiced so far:{' '}
                    <b className="text-[#171a33]">{money(t.invoiced)}</b> across {t.invoiceCount} invoice
                    {t.invoiceCount === 1 ? '' : 's'}.
                  </p>
                  {/* ⚠️ Stated every time: a partial month looks like a complete
                      one unless the page says it is partial. */}
                  <p className="mt-1.5 max-w-[72ch] text-[12.5px] leading-[1.6] text-[#8a8fb0]">
                    Billed, not collected. Clients without an invoice are not in this figure, so it is not the
                    month&rsquo;s revenue until every client has been invoiced.
                  </p>
                </>
              )}
            </div>
          </>
        )}

        {/* ── 8. Cost ─────────────────────────────────────────────── */}
        <SectionLine>What the roster costs</SectionLine>
        <div className="rounded-[14px] border border-[#e7e7f2] bg-white px-5 py-5">
          <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
            <Stat
              label="Signed creators"
              value={num(t.signed)}
              note={isV2 && t.noHandle ? `${num(t.noHandle)} have no TikTok handle` : undefined}
            />
            <Stat label="On a retainer" value={num(t.retained)} note={t.signed > 0 ? `${pct((t.retained / t.signed) * 100, 0)} of signed` : undefined} />
            <Stat label="Committed" value={money(t.committedRetainer) + '/mo'} />
            {perDollar !== null && <Stat label="GMV per $1 committed" value={perDollar.toFixed(2) + 'x'} />}
          </div>
          <p className="mt-3.5 max-w-[72ch] border-t border-[#f2f1f8] pt-3 text-[12px] leading-[1.6] text-[#8a8fb0]">
            Committed is the full monthly retainer for everyone on the roster today. The client reports divide by
            retainer <b className="text-[#5c6183]">earned</b>, which scales each creator&rsquo;s retainer by what they
            actually published, so the multiple on a client&rsquo;s own report is higher than the one here. Both are
            correct; they answer different questions.
            {isV2 && t.noHandle
              ? ` ${num(t.noHandle)} signed creators carry no TikTok handle anywhere, so they can never be credited with GMV.`
              : ''}
          </p>
        </div>

        {s.caveats.length > 0 && (
          <div className="mt-5 rounded-[12px] border border-[#f0dcb0] bg-[#fdf7ea] px-4 py-3">
            <div className="text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a5a08]">Known gaps in this period</div>
            <ul className="mt-1.5 space-y-1">
              {s.caveats.map((c) => (
                <li key={c} className="text-[12.5px] leading-[1.6] text-[#8a5a08]">{c}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-6 text-[11.5px] leading-[1.7] text-[#8a8fb0]">
          Internal. Prepared for {AGENCY} leadership. Every figure is frozen as of{' '}
          {new Date(s.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} and will not
          change. GMV is measured on the same roster-membership rule as the individual client reports, so a
          client&rsquo;s GMV here and on their own report is the same number; the retainer multiple differs because
          their report divides by retainer earned.
        </p>
      </div>
    </div>
  );
}

/**
 * Bars for our GMV (all clients), a line for same-store share.
 *
 * ⚠️ TWO SCALES, BOTH LABELLED. GMV on the bars, share on the right axis.
 * Only the endpoints carry value labels; the table under the chart holds every
 * number, so labels never collide with bars of arbitrary height.
 */
function TrendChart({ points, hasSameStore }: { points: AgencyTrendPoint[]; hasSameStore: boolean }) {
  const W = 720;
  const H = 230;
  const padL = 10;
  const padR = 48;
  const padT = 22;
  const padB = 42;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const slot = plotW / points.length;
  const barW = slot * 0.54;

  const maxGmv = Math.max(1, ...points.map((p) => p.rosterGmv));
  const shares = points.map((p) => (p.sameStoreStore > 0 ? (p.sameStoreRoster / p.sameStoreStore) * 100 : null));
  const shareVals = shares.filter((v): v is number => v !== null);
  const shareMax = shareVals.length ? Math.ceil((Math.max(...shareVals) * 1.25) / 10) * 10 : 100;

  const x = (i: number) => padL + slot * i + slot / 2;
  const yGmv = (v: number) => padT + plotH * (1 - v / maxGmv);
  const yShare = (v: number) => padT + plotH * (1 - v / shareMax);

  const linePts = shares
    .map((v, i) => (v === null ? null : `${x(i).toFixed(1)},${yShare(v).toFixed(1)}`))
    .filter(Boolean)
    .join(' ');
  const lastI = points.length - 1;
  const lastShare = shares[lastI];

  return (
    <div className="mt-4 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[520px]" role="img"
           aria-label="Our GMV by month, with same-store share as a line">
        {/* Gridlines at the share axis quarters. */}
        {[0, 0.5, 1].map((f) => {
          const y = padT + plotH * (1 - f);
          return (
            <g key={f}>
              <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="#eeedf5" strokeWidth={1} />
              {hasSameStore && (
                <text x={W - padR + 8} y={y + 4} fontSize={10.5} fill="#8a8fb0">
                  {Math.round(shareMax * f)}%
                </text>
              )}
            </g>
          );
        })}

        {points.map((p, i) => {
          const y = yGmv(p.rosterGmv);
          const isLast = i === lastI;
          return (
            <g key={p.month}>
              <rect
                x={x(i) - barW / 2}
                y={y}
                width={barW}
                height={Math.max(1, padT + plotH - y)}
                rx={4}
                fill={isLast ? '#b9b3f5' : '#dedcf5'}
              >
                <title>{`${p.label}: ${money(p.rosterGmv)} across ${p.clients} clients`}</title>
              </rect>
              {isLast && (
                <text x={x(i)} y={y - 6} textAnchor="middle" fontSize={11} fontWeight={700} fill="#33375c">
                  {compact(p.rosterGmv)}
                </text>
              )}
              <text x={x(i)} y={H - padB + 17} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="#5c6183">
                {p.label}
              </text>
              <text x={x(i)} y={H - padB + 31} textAnchor="middle" fontSize={10} fill="#9aa0bf">
                {p.clients} clients
              </text>
            </g>
          );
        })}

        {hasSameStore && linePts && (
          <>
            <polyline points={linePts} fill="none" stroke="#4b45ff" strokeWidth={2.5} strokeLinejoin="round" />
            {shares.map((v, i) =>
              v === null ? null : (
                <circle key={i} cx={x(i)} cy={yShare(v)} r={i === lastI ? 5 : 3.5} fill="#4b45ff" stroke="#ffffff" strokeWidth={1.5} />
              ),
            )}
            {lastShare !== null && lastShare !== undefined && (
              <text x={x(lastI) - 9} y={yShare(lastShare) - 10} textAnchor="end" fontSize={11.5} fontWeight={700} fill="#4b45ff">
                {pct(lastShare)}
              </text>
            )}
          </>
        )}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-[11.5px] text-[#5c6183]">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-[#dedcf5]" /> Our GMV, all clients
        </span>
        {hasSameStore && (
          <span className="flex items-center gap-1.5">
            <span className="h-[3px] w-4 rounded bg-[#4b45ff]" /> Same-store share (right axis)
          </span>
        )}
      </div>
    </div>
  );
}

const TH_L = 'px-4 py-2.5 text-left text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]';
const TH_R = 'px-4 py-2.5 text-right text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0] whitespace-nowrap';

function SectionLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2.5 mt-8 flex items-center gap-3 text-[10px] font-extrabold uppercase tracking-[0.15em] text-[#8a8fb0]">
      <span className="shrink-0">{children}</span>
      <span className="h-px flex-1 bg-[#e7e7f2]" />
    </div>
  );
}

function Stat({ label, value, note, delta }: { label: string; value: string; note?: string; delta?: number | null }) {
  return (
    <div className="rounded-[12px] border border-[#e7e7f2] bg-[#fcfcff] px-3.5 py-3">
      <div className="text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">{label}</div>
      <div className="mt-0.5 text-[19px] font-extrabold tabular-nums text-[#171a33]">{value}</div>
      {delta !== undefined ? (
        <div className="mt-1"><Delta v={delta} /></div>
      ) : note ? (
        <div className="mt-1 text-[11px] leading-tight text-[#8a8fb0]">{note}</div>
      ) : null}
    </div>
  );
}
