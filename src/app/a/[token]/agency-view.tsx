/**
 * The agency's portfolio report, for leadership.
 *
 * ── Why it does not look like a client report ───────────────────────────────
 *
 * A client report is persuasive by design: it leads with contribution because
 * the reader is deciding whether to keep paying. This reader already knows the
 * answer to that and needs the opposite — where the business moved, what is at
 * risk, and how concentrated it is. So it leads with MOVEMENT, names the
 * accounts going backwards first, and puts concentration on the page rather
 * than leaving it to be inferred.
 *
 * ⚠️ NO PERSUASION AND NO ROUNDING UP. Every figure that could flatter is
 * stated against the thing that qualifies it: growth against the prior month,
 * our share against the client's whole store, retainer against what it bought.
 *
 * ⚠️ INTERNAL, but served on a public token like the client reports, because
 * the head of agency has no Tempo login. It carries no creator names, no
 * handles, and no client contact details: if the link leaks, what leaks is
 * portfolio totals, which is the same thing any of these clients could work
 * out about their own account.
 */
import type { AgencySnapshot, AgencyBrandRow } from '@/lib/data/agency-report';

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

/** Movement, coloured only where it is real. */
function Delta({ v }: { v: number | null }) {
  if (v === null) return <span className="text-[12px] text-[#9aa0bf]">new</span>;
  const up = v >= 0;
  return (
    <span
      className={`text-[12.5px] font-bold tabular-nums ${up ? 'text-[#0b8a5f]' : 'text-[#c0392b]'}`}
    >
      {signed(v)}
    </span>
  );
}

export function AgencyView({ snapshot: s }: { snapshot: AgencySnapshot }) {
  const t = s.totals;
  const rosterMom =
    t.priorRosterGmv > 0 ? ((t.rosterGmv - t.priorRosterGmv) / t.priorRosterGmv) * 100 : null;
  const storeMom =
    t.priorStoreGmv > 0 ? ((t.storeGmv - t.priorStoreGmv) / t.priorStoreGmv) * 100 : null;
  const share = t.storeGmv > 0 ? (t.rosterGmv / t.storeGmv) * 100 : 0;
  const priorShare =
    t.priorStoreGmv > 0 ? (t.priorRosterGmv / t.priorStoreGmv) * 100 : null;

  const earners = s.brands.filter((b) => b.rosterGmv > 0);
  const ranked = [...earners].sort((a, b) => b.rosterGmv - a.rosterGmv);
  const top1 = ranked[0];
  const top3 = ranked.slice(0, 3);
  const top3Share = t.rosterGmv > 0 ? (top3.reduce((x, b) => x + b.rosterGmv, 0) / t.rosterGmv) * 100 : 0;
  const top1Share = t.rosterGmv > 0 && top1 ? (top1.rosterGmv / t.rosterGmv) * 100 : 0;

  // Movement, biggest dollar swing first: a -49% on the second largest account
  // matters more than a +463% on the smallest, and sorting by percentage buries
  // exactly that.
  //
  // 🚨 A BRAND WITH NO PRIOR IS NEW MONEY, NOT AN ABSENT ROW. Filtering on
  // momPct !== null dropped Caramela Beauty, which started in August, and the
  // sentence below then failed to reconcile with the headline: 459,602 on minus
  // 609,762 off is -150,160 against a stated -102,574. Its whole 47,586 IS the
  // swing. Counted at full value the two halves add back to the headline.
  const moved = earners.map((b) => ({
    ...b,
    swing: b.priorRosterGmv > 0 ? b.rosterGmv - b.priorRosterGmv : b.rosterGmv,
    isNew: b.priorRosterGmv <= 0,
  }));
  const down = moved.filter((b) => b.swing < 0).sort((a, b) => a.swing - b.swing);
  const up = moved.filter((b) => b.swing > 0).sort((a, b) => b.swing - a.swing);
  const gained = up.reduce((x, b) => x + b.swing, 0);
  const lost = down.reduce((x, b) => x + b.swing, 0);

  // GMV per dollar committed. Labelled as COMMITTED everywhere: client reports
  // divide by retainer EARNED, so the two are different ratios on purpose.
  const perDollar = t.committedRetainer > 0 ? t.rosterGmv / t.committedRetainer : null;

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
            {t.clients} client{t.clients === 1 ? '' : 's'} &middot; against {s.priorLabel} &middot;
            prepared{' '}
            {new Date(s.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1000px] px-5 sm:px-11">
        {/* ── The answer ───────────────────────────────────────────── */}
        <div className="mt-6 rounded-[14px] border border-[#e7e7f2] bg-white px-5 py-5">
          <h2 className="text-[21px] font-extrabold leading-snug tracking-tight">
            Our creators produced {compact(t.rosterGmv)} across {t.clients} client stores
          </h2>
          <p className="mt-1.5 max-w-[72ch] text-[14.5px] leading-[1.65] text-[#33375c]">
            That is <b className="text-[#171a33]">{pct(share)}</b> of the {compact(t.storeGmv)} those
            stores did in total
            {priorShare !== null && (
              <>
                , against <b className="text-[#171a33]">{pct(priorShare)}</b> in {s.priorLabel}
              </>
            )}
            .{' '}
            {rosterMom !== null && storeMom !== null && (
              <>
                Our GMV moved <b className="text-[#171a33]">{signed(rosterMom)}</b> while the stores
                themselves moved <b className="text-[#171a33]">{signed(storeMom)}</b>
                {rosterMom > storeMom
                  ? ', so we took a larger share of a smaller market.'
                  : '.'}
              </>
            )}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3.5 md:grid-cols-4">
            <Stat label="Our GMV" value={compact(t.rosterGmv)} delta={rosterMom} />
            <Stat label="Client store GMV" value={compact(t.storeGmv)} delta={storeMom} />
            <Stat label="Share of stores" value={pct(share)}
                  note={priorShare !== null ? `${pct(priorShare)} in ${s.priorLabel}` : undefined} />
            <Stat label="Retainer committed" value={money(t.committedRetainer) + '/mo'}
                  note={`${num(t.retained)} creators`} />
          </div>
        </div>

        {/* ── What moved. Named, biggest dollar swing first. ───────── */}
        <SectionLine>What moved</SectionLine>
        <div className="rounded-[14px] border border-[#e7e7f2] bg-white px-5 py-5">
          <p className="max-w-[72ch] text-[14.5px] leading-[1.65] text-[#33375c]">
            <b className="text-[#171a33]">{money(gained)}</b> came on across {up.length} account
            {up.length === 1 ? '' : 's'} and <b className="text-[#171a33]">{money(Math.abs(lost))}</b>{' '}
            came off across {down.length}.{' '}
            {down.length > 0 && down[0] && (
              <>
                The largest single move was{' '}
                <b className="text-[#171a33]">{down[0].name}</b>, down{' '}
                <b className="text-[#171a33]">{money(Math.abs(down[0].swing))}</b>.
              </>
            )}
          </p>
          {/* ⚠️ Both directions, always. Reporting the net alone hides the size
              of both halves: on this portfolio a modest net decline is a large
              gain and a larger loss happening at once, which is a different
              management problem from a quiet flat month. */}
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            <MoveList title="Down" rows={down} tone="down" />
            <MoveList title="Up" rows={up} tone="up" />
          </div>
        </div>

        {/* ── Concentration ────────────────────────────────────────── */}
        <SectionLine>Concentration</SectionLine>
        <div className="rounded-[14px] border border-[#e7e7f2] bg-white px-5 py-5">
          <p className="max-w-[72ch] text-[14.5px] leading-[1.65] text-[#33375c]">
            {top1 && (
              <>
                <b className="text-[#171a33]">{top1.name}</b> alone is{' '}
                <b className="text-[#171a33]">{pct(top1Share)}</b> of everything our creators
                produced, and the top three are{' '}
                <b className="text-[#171a33]">{pct(top3Share)}</b> between them.
              </>
            )}
          </p>
          <div className="mt-3.5 flex h-3 w-full overflow-hidden rounded-full bg-[#f0eff7]">
            {ranked.map((b) => (
              <div
                key={b.slug}
                title={`${b.name} ${pct((b.rosterGmv / t.rosterGmv) * 100)}`}
                style={{
                  width: `${(b.rosterGmv / t.rosterGmv) * 100}%`,
                  backgroundColor: b.color || '#c7c9de',
                }}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {top3.map((b) => (
              <span key={b.slug} className="flex items-center gap-1.5 text-[12px] text-[#5c6183]">
                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: b.color || '#c7c9de' }} />
                {b.name} {pct((b.rosterGmv / t.rosterGmv) * 100, 0)}
              </span>
            ))}
            <span className="text-[12px] text-[#8a8fb0]">
              and {ranked.length - top3.length} more
            </span>
          </div>
        </div>

        {/* ── Every client ─────────────────────────────────────────── */}
        <SectionLine>Every client</SectionLine>
        <div className="overflow-x-auto rounded-[14px] border border-[#e7e7f2] bg-white">
          <table className="w-full min-w-[760px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-[#eeedf5]">
                <th className={TH_L}>Client</th>
                <th className={TH_R}>Our GMV</th>
                <th className={TH_R}>vs {s.priorLabel.split(' ')[0]}</th>
                <th className={TH_R}>Store GMV</th>
                <th className={TH_R}>Our share</th>
                <th className={TH_R}>Retained</th>
                <th className={TH_R}>Committed/mo</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((b) => (
                <tr key={b.slug} className="border-b border-[#eeedf5] last:border-b-0">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: b.color || '#c7c9de' }} />
                      <span className="font-semibold text-[#171a33]">{b.name}</span>
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right font-extrabold tabular-nums text-[#171a33]">
                    {money(b.rosterGmv)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right"><Delta v={b.momPct} /></td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-[#33375c]">
                    {money(b.storeGmv)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-[#33375c]">
                    {b.sharePct === null ? <span className="text-[#b9bcd0]">&mdash;</span> : pct(b.sharePct)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-[#33375c]">
                    {num(b.retained)}
                    <span className="text-[#8a8fb0]">&nbsp;/&nbsp;{num(b.signed)}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-[#33375c]">
                    {b.committedRetainer > 0 ? money(b.committedRetainer) : <span className="text-[#b9bcd0]">&mdash;</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11.5px] leading-[1.6] text-[#8a8fb0]">
          Retained / signed counts creators on the roster today, not at the end of the period.
        </p>

        {/* ── Cost ─────────────────────────────────────────────────── */}
        <SectionLine>What the roster costs</SectionLine>
        <div className="rounded-[14px] border border-[#e7e7f2] bg-white px-5 py-5">
          <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
            <Stat label="Signed creators" value={num(t.signed)} />
            <Stat label="On a retainer" value={num(t.retained)}
                  note={t.signed > 0 ? `${pct((t.retained / t.signed) * 100, 0)} of signed` : undefined} />
            <Stat label="Committed" value={money(t.committedRetainer) + '/mo'} />
            {perDollar !== null && (
              <Stat label="GMV per $1 committed" value={perDollar.toFixed(1) + 'x'} />
            )}
          </div>
          {/* 🚨 The distinction that stops two artifacts contradicting each
              other in the same meeting. */}
          <p className="mt-3.5 max-w-[72ch] border-t border-[#f2f1f8] pt-3 text-[12px] leading-[1.6] text-[#8a8fb0]">
            Committed is the full monthly retainer for everyone on the roster today. The client
            reports divide by retainer <b className="text-[#5c6183]">earned</b>, which scales each
            creator&rsquo;s retainer by what they actually published, so the multiple on a client&rsquo;s own
            report is higher than the one above. Both are correct; they answer different questions.
          </p>
        </div>

        {/* ── Caveats. Built with the report, not written at render. ─ */}
        {s.caveats.length > 0 && (
          <div className="mt-5 rounded-[12px] border border-[#f0dcb0] bg-[#fdf7ea] px-4 py-3">
            <div className="text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a5a08]">
              Known gaps in this period
            </div>
            <ul className="mt-1.5 space-y-1">
              {s.caveats.map((c) => (
                <li key={c} className="text-[12.5px] leading-[1.6] text-[#8a5a08]">
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-6 text-[11.5px] leading-[1.7] text-[#8a8fb0]">
          Internal. Prepared for {AGENCY} leadership. Every figure is frozen as of{' '}
          {new Date(s.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{' '}
          and will not change. GMV is measured on the same roster-membership rule as the individual
          client reports, so a client&rsquo;s figure here and on their own report are the same number.
        </p>
      </div>
    </div>
  );
}

const TH_L =
  'px-4 py-2.5 text-left text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]';
const TH_R =
  'px-4 py-2.5 text-right text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0] whitespace-nowrap';

function SectionLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2.5 mt-8 flex items-center gap-3 text-[10px] font-extrabold uppercase tracking-[0.15em] text-[#8a8fb0]">
      <span className="shrink-0">{children}</span>
      <span className="h-px flex-1 bg-[#e7e7f2]" />
    </div>
  );
}

function Stat({
  label, value, note, delta,
}: { label: string; value: string; note?: string; delta?: number | null }) {
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

function MoveList({
  title, rows, tone,
}: { title: string; rows: (AgencyBrandRow & { swing: number; isNew?: boolean })[]; tone: 'up' | 'down' }) {
  return (
    <div>
      <div className="mb-1.5 text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]">
        {title}
      </div>
      {rows.length === 0 ? (
        <p className="text-[13px] text-[#8a8fb0]">None this period.</p>
      ) : (
        rows.map((b) => (
          <div key={b.slug} className="flex items-center gap-2 border-b border-[#f2f1f8] py-1.5 last:border-b-0">
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: b.color || '#c7c9de' }} />
            <span className="min-w-0 flex-1 truncate text-[13.5px] text-[#33375c]">{b.name}</span>
            <span
              className={`shrink-0 text-[13px] font-bold tabular-nums ${
                tone === 'up' ? 'text-[#0b8a5f]' : 'text-[#c0392b]'
              }`}
            >
              {tone === 'up' ? '+' : '−'}{money(Math.abs(b.swing))}
            </span>
            <span className="w-[56px] shrink-0 text-right text-[12px] tabular-nums text-[#8a8fb0]">
              {b.isNew ? 'new' : b.momPct === null ? '' : signed(b.momPct, 0)}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
