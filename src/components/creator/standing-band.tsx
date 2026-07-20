import { fmtCompactCurrency } from '@/components/charts/format';
import type { BrandStanding } from '@/lib/data/creator-portal';

/**
 * "{Brand} · where you stand" hairline band — brand totals (GMV / orders /
 * creators / posts) plus a highlighted personal cell. Shared between Home
 * (variant "share": your % of brand GMV) and Rankings (variant "rank": your
 * position). Values all come from one get_brand_standing RPC row.
 */
export function StandingBand({
  standing,
  variant = 'share',
}: {
  standing: BrandStanding;
  variant?: 'share' | 'rank';
}) {
  const cells: { k: string; v: string }[] = [
    { k: 'Brand GMV', v: fmtCompactCurrency(standing.brandGmv) },
    { k: 'Orders', v: compactNum(standing.brandOrders) },
    { k: 'Creators', v: compactNum(standing.creatorCount) },
    { k: 'Posts', v: compactNum(standing.postCount) },
  ];

  const topPct = Math.max(1, Math.ceil((standing.myRank / Math.max(1, standing.creatorCount)) * 100));

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border shadow-[var(--pulse-elev-1)] sm:grid-cols-5">
      {cells.map((c) => (
        <div key={c.k} className="bg-card p-4 sm:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{c.k}</p>
          <p className="font-ledger-num mt-1.5 text-2xl font-bold text-foreground sm:text-[28px]">{c.v}</p>
        </div>
      ))}
      <div
        className="col-span-2 p-4 sm:col-span-1 sm:p-5"
        style={{ background: 'color-mix(in srgb, var(--primary) 7%, var(--card))' }}
      >
        {variant === 'share' ? (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Your share
            </p>
            <p className="text-pulse-grad font-ledger-num mt-1.5 text-2xl font-bold sm:text-[28px]">
              {(standing.myShare * 100).toFixed(1)}%
            </p>
            <p className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
              {fmtCompactCurrency(standing.myGmv)} · rank #{standing.myRank} of {standing.creatorCount}
            </p>
          </>
        ) : (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Your rank
            </p>
            <p className="text-pulse-grad font-ledger-num mt-1.5 text-2xl font-bold sm:text-[28px]">
              #{standing.myRank}
            </p>
            <p className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
              {fmtCompactCurrency(standing.myGmv)} · top {topPct}%
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function compactNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
