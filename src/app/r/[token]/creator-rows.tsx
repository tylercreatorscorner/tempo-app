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
import { useState } from 'react';
import type { BrandClientReportData } from '@/lib/data/brand-client-report';

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
  'px-4 py-2.5 text-left text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]';
const TH_R =
  'px-4 py-2.5 text-right text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-[#8a8fb0]';

function CreatorRows({
  rows,
  judgeQuota,
  showLevel,
  muted = false,
}: {
  rows: NonNullable<BrandClientReportData['granular']>['creators'];
  /** Only show the monthly target beside a count covering that month. */
  judgeQuota: boolean;
  /** Only where enough of the roster carries a level. */
  showLevel: boolean;
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
            {showLevel && <th className={`${TH_L} whitespace-nowrap`}>Level</th>}
            <th className={`${TH_R} whitespace-nowrap`}>{judgeQuota ? 'Posts' : 'Posts this period'}</th>
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
                {showLevel && (
                  <td className="whitespace-nowrap px-4 py-2.5 text-[#6b7093]">
                    {c.role?.trim() ? c.role : <span className="text-[#b9bcd0]">&mdash;</span>}
                  </td>
                )}
                {/* Quota tracking lives here, next to the number it judges,
                    but ONLY when the window it judges is the month the quota
                    was written for. Over a week, "0 / 30" is not a shortfall,
                    it is a unit mismatch: 15 of Dr. Dent's retained creators
                    printed it for 2026-08-23 and the roster read as idle. The
                    month-to-date block carries the comparison instead. */}
                <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-[#33375c]">
                  {num(c.postsPublished)}
                  {judgeQuota && c.quota != null && (
                    <span className="text-[#8a8fb0]">&nbsp;/&nbsp;{num(c.quota)}</span>
                  )}
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
  muted = false,
}: {
  rows: NonNullable<BrandClientReportData['granular']>['creators'];
  judgeQuota: boolean;
  showLevel: boolean;
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
      <CreatorRows rows={slice} judgeQuota={judgeQuota} showLevel={showLevel} muted={muted} />
      {pages > 1 && (
        <div className="flex items-center justify-between gap-3 border-t border-[#eeedf5] px-4 py-2.5">
          <span className="text-[12px] tabular-nums text-[#8a8fb0]">
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
            <span className="px-1 text-[12px] tabular-nums text-[#8a8fb0]">
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
