'use client';

/**
 * The creator table, paginated.
 *
 * 🚨 THIS IS A CLIENT ISLAND ON PURPOSE. report-view is a server component with
 * no hooks, and the roster runs to hundreds of rows: Cata-Kor's August report
 * lists 440 creators, 83 of whom earned. Printing them all made the table the
 * longest thing in the report by a wide margin, which is why it had to be moved
 * below the story in the first place. Ten at a time keeps it a lookup table
 * rather than a wall.
 *
 * ⚠️ EVERY row still ships to the browser. The pager is a view over the whole
 * array, not a fetch, so the CSV, the counts and the page numbers can never
 * disagree with each other and nothing needs a round trip.
 *
 * ⚠️ The formatters below are duplicated from report-view rather than shared.
 * They are four pure lines each, and a server component cannot export them to
 * a client one.
 */
import { ReportImage } from './report-image';
import { useState } from 'react';
import type { BrandClientReportData } from '@/lib/data/brand-client-report';
import { creatorEarnedShare } from '@/lib/data/delivered-spend';

function money(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

function num(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

function handleOf(name: string): string {
  return name.trim().replace(/^@+/, '').toLowerCase();
}

const TH_L =
  'px-3 py-2 text-left text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#71717a]';
const TH_R =
  'px-3 py-2 text-right text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#71717a]';

function CreatorRows({
  rows,
  judgeQuota,
  showLevel,
  showEarned = false,
  muted = false,
  showUnits = false,
  showPace = false,
}: {
  rows: NonNullable<BrandClientReportData['granular']>['creators'];
  /** Only show the monthly target beside a count covering that month. */
  judgeQuota: boolean;
  /** Only where enough of the roster carries a level. */
  showLevel: boolean;
  muted?: boolean;
  showUnits?: boolean;
  showPace?: boolean;
  /**
   * Show what each retained creator's posting actually earned of their
   * retainer.
   *
   * 🚨 WITHOUT THIS THE HEADLINE FIGURE WAS UNTRACEABLE. The report states
   * "$48,100 of the $62,150 committed" and a brand's first question is where
   * the other $14,050 went. Every input was on the page (retainer, posts,
   * target) but the arithmetic was not, so answering meant doing 50 rows of
   * mental multiplication across 11 pages of table.
   *
   * ⚠️ Only on a window the quota was written for. Over a week the posts count
   * is not comparable to a monthly target, so an "earned" figure derived from
   * it would be a unit mismatch presented as money.
   */
  showEarned?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-[13px]">
        <thead>
          {/* Every column but the two identity ones is nowrap. "19 / 30" was
              breaking across two lines, and a wrapped number reads as two
              numbers. The identity columns truncate instead: a long name gets
              an ellipsis rather than pushing the numeric columns around. */}
          <tr className="border-b border-[#e4e4e7]">
            <th className={TH_L}>Creator</th>
            <th className={`${TH_L} whitespace-nowrap`}>Agreement</th>
            {showLevel && <th className={`${TH_L} whitespace-nowrap`}>Level</th>}
            <th className={`${TH_R} whitespace-nowrap`}>{judgeQuota ? 'Posts' : 'Posts this period'}</th>
            {showEarned && <th className={`${TH_R} whitespace-nowrap`}>Earned</th>}
            <th className={`${TH_R} whitespace-nowrap`}>Total orders</th>
            {showUnits && <th className={`${TH_R} whitespace-nowrap`}>Units sold</th>}
            {showPace && <th className={TH_L}>Monthly pace</th>}
            <th className={`${TH_R} whitespace-nowrap`}>GMV</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => {
            const periodStart = c.agreement?.periodStart;
            const periodEnd = c.agreement?.periodEnd;
            const calendarMonth = !c.agreement || (!!periodStart && !!periodEnd && periodStart.endsWith('-01') && new Date(`${periodEnd}T00:00:00Z`).getUTCDate() === new Date(Date.UTC(Number(periodStart.slice(0,4)),Number(periodStart.slice(5,7)),0)).getUTCDate() && periodStart.slice(0,7) === periodEnd.slice(0,7));
            const h = c.handle ? handleOf(c.handle) : handleOf(c.name);
            // Every OTHER known handle for this person. Deduped against the
            // primary because the account_ columns and tiktok_accounts often
            // both carry it.
            const extras = (c.handles ?? [])
              .map((x) => handleOf(x))
              .filter((x) => x && x !== h);
            return (
              <tr key={i} className={`border-b border-[#f2f1f8] last:border-b-0 ${muted ? 'opacity-70' : ''}`}>
                <td className="max-w-[210px] px-3 py-2">
                  <div className="flex items-center gap-2"><ReportImage src={c.avatarUrl} kind="creator" name={c.realName || h} /><div className="min-w-0">
                    <div className="truncate font-semibold text-zinc-900" title={c.realName || h}>{c.realName?.trim() || `@${h}`}</div>
                    {c.handle && <a href={`https://www.tiktok.com/@${h}`} target="_blank" rel="noopener noreferrer" className="block truncate text-[11px] text-violet-700">@{h}</a>}
                    {extras.length > 0 && <details><summary className="cursor-pointer text-[10px] text-zinc-500">+{extras.length} accounts</summary>{extras.map(x=><a key={x} href={`https://www.tiktok.com/@${x}`} target="_blank" rel="noopener noreferrer" className="block truncate text-[11px] text-violet-700">@{x}</a>)}</details>}
                  </div></div>
                </td>
                {/* Keep the saved fee and commitment together. */}
                <td className="whitespace-nowrap px-3 py-2 text-[12px] text-[#3f3f46]">
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
                    <span className="whitespace-nowrap font-semibold">{money(c.retainer)}<span className="font-normal text-zinc-500">{calendarMonth ? "/month" : "/period"}</span></span>
                  )}
                  {!c.isAffiliate && !c.departed && <small className="block text-[11px] text-zinc-500">{c.quota == null ? "Post target not recorded" : `${num(c.quota)} posts${calendarMonth ? " / month" : " per period"}`}</small>}
                  {c.agreement?.periodStart && <small className="block text-[10px] text-[#6b7191]">{c.agreement.periodStart} to {c.agreement.periodEnd}</small>}
                  {c.agreement && !c.agreement.reportPeriodComparable && <small className="block text-[10px] text-[#6b7191]">Payment requires agreement-period review</small>}
                </td>
                {/* Blank for affiliate-only: there is no agreed amount, and a
                    $0 would read as "we agreed zero" rather than "n/a". */}
                {showLevel && (
                  <td className="whitespace-nowrap px-3 py-2 text-[#6b7093]">
                    {c.role?.trim() ? c.role : <span className="text-[#b9bcd0]">&mdash;</span>}
                  </td>
                )}
                {/* Quota tracking lives here, next to the number it judges,
                    but ONLY when the window it judges is the month the quota
                    was written for. Over a week, "0 / 30" is not a shortfall,
                    it is a unit mismatch: 15 of Dr. Dent's retained creators
                    printed it for 2026-08-23 and the roster read as idle. The
                    month-to-date block carries the comparison instead. */}
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-[#3f3f46]">
                  {num(c.postsPublished)}
                  {judgeQuota && c.quota != null && (!c.agreement || c.agreement.reportPeriodComparable) && (
                    <span className="text-[#71717a]">&nbsp;/&nbsp;{num(c.quota)}</span>
                  )}
                </td>
                {/* ⚠️ From the SAME function that produces the total, so a
                    client adding this column cannot arrive at a different
                    number from the headline. Null is "not measured"
                    (affiliate-only, departed, no retainer, no agreed target)
                    and renders as absence, never as $0. */}
                {showEarned && (() => {
                  const earned = creatorEarnedShare(c);
                  const short = earned !== null && c.retainer - earned > 0.5;
                  return (
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {earned === null ? (
                        <span className="text-[#b9bcd0]">&mdash;</span>
                      ) : (
                        <>
                          <span className="font-semibold text-[#3f3f46]">{money(earned)}</span>
                          {short && (
                            <span className="block text-[10.5px] leading-tight text-[#b0870f]">
                              {money(c.retainer - earned)} short
                            </span>
                          )}
                        </>
                      )}
                    </td>
                  );
                })()}
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-[#3f3f46]">{num(c.orders)}</td>
                {showUnits && <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{c.units == null ? '—' : num(c.units)}</td>}
                {showPace && <td className="px-3 py-2"><span className={`text-xs font-semibold ${c.pace?.tone === 'behind' ? 'text-amber-700' : c.pace?.tone === 'ahead' ? 'text-emerald-700' : 'text-zinc-600'}`}>{c.pace?.label ?? '—'}</span>{c.pace && <small className="block text-[10px] text-zinc-500">{c.pace.detail}</small>}</td>}
                <td className="whitespace-nowrap px-3 py-2 text-right font-extrabold tabular-nums text-[#18181b]">{money(c.gmv)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** How many creators a page of the table shows. */
const PER_PAGE = 10;

/**
 * Pages through the roster ten at a time.
 *
 * Renders nothing but the table when everything fits on one page: a pager
 * under a nine-row table is furniture.
 */
export function PaginatedCreatorRows({
  rows,
  judgeQuota,
  showLevel,
  showEarned = false,
  muted = false,
}: {
  rows: NonNullable<BrandClientReportData['granular']>['creators'];
  judgeQuota: boolean;
  showLevel: boolean;
  showEarned?: boolean;
  muted?: boolean;
}) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  // A roster can shrink between renders; never strand the reader past the end.
  const safe = Math.min(page, pages - 1);
  const from = safe * PER_PAGE;
  const slice = rows.slice(from, from + PER_PAGE);

  return (
    <>
      <CreatorRows
        rows={slice}
        showUnits={rows.some(c=>c.units != null)}
        showPace={rows.some(c=>!!c.pace)}
        judgeQuota={judgeQuota}
        showLevel={showLevel}
        showEarned={showEarned}
        muted={muted}
      />
      {pages > 1 && (
        <div className="flex items-center justify-between gap-3 border-t border-[#e4e4e7] px-3 py-2">
          <span className="text-[12px] tabular-nums text-[#71717a]">
            {num(from + 1)}&ndash;{num(from + slice.length)} of {num(rows.length)}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage(Math.max(0, safe - 1))}
              disabled={safe === 0}
              className="rounded-[8px] border border-[#e7e7f2] px-2.5 py-1 text-[12px] font-bold text-[#4b45ff] transition-colors hover:bg-[#f6f6fb] disabled:cursor-default disabled:border-[#f0f0f6] disabled:text-[#c4c7dc] disabled:hover:bg-transparent"
            >
              Previous
            </button>
            <span className="px-1 text-[12px] tabular-nums text-[#71717a]">
              {safe + 1} / {pages}
            </span>
            <button
              type="button"
              onClick={() => setPage(Math.min(pages - 1, safe + 1))}
              disabled={safe >= pages - 1}
              className="rounded-[8px] border border-[#e7e7f2] px-2.5 py-1 text-[12px] font-bold text-[#4b45ff] transition-colors hover:bg-[#f6f6fb] disabled:cursor-default disabled:border-[#f0f0f6] disabled:text-[#c4c7dc] disabled:hover:bg-transparent"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </>
  );
}
