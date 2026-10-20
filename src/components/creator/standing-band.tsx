import { formatCurrency } from '@/lib/utils/format';
import type { BrandStanding } from '@/lib/data/creator-portal';
import portal from '@/components/layout/portal-workspace.module.css';

/**
 * "{Brand} · where you stand" hairline band — brand totals (GMV / orders /
 * creators / posts) plus a highlighted personal cell. Shared between Home
 * (variant "share": your % of brand GMV) and Rankings (variant "rank": your
 * position). Values all come from one get_brand_standing RPC row.
 *
 * Whole numbers, never compact rounding ("$2,914,782", not "$3.0M") — owner
 * call: real figures read like a ledger, marketing-rounding doesn't.
 */
export function StandingBand({
  standing,
  variant = 'share',
}: {
  standing: BrandStanding;
  variant?: 'share' | 'rank';
}) {
  const cells: { k: string; v: string }[] = [
    { k: 'Brand GMV', v: formatCurrency(standing.brandGmv) },
    { k: 'Orders', v: Math.round(standing.brandOrders).toLocaleString('en-US') },
    { k: 'Creators', v: standing.creatorCount.toLocaleString('en-US') },
    { k: 'Posts', v: standing.postCount.toLocaleString('en-US') },
  ];

  const topPct = Math.max(1, Math.ceil((standing.myRank / Math.max(1, standing.creatorCount)) * 100));

  return (
    <div className={portal.standing}>
      {cells.map((c) => (
        <div key={c.k} className="bg-card">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{c.k}</p>
          <p className="font-ledger-num mt-1.5 text-xl font-bold text-foreground sm:text-[23px]">{c.v}</p>
        </div>
      ))}
      <div
        style={{ background: 'color-mix(in srgb, var(--primary) 7%, var(--card))' }}
      >
        {variant === 'share' ? (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Your share
            </p>
            <p className="text-pulse-grad font-ledger-num mt-1.5 text-xl font-bold sm:text-[23px]">
              {(standing.myShare * 100).toFixed(1)}%
            </p>
            <p className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
              {formatCurrency(standing.myGmv)} · rank #{standing.myRank} of{' '}
              {standing.creatorCount.toLocaleString('en-US')}
            </p>
          </>
        ) : (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Your rank
            </p>
            <p className="text-pulse-grad font-ledger-num mt-1.5 text-xl font-bold sm:text-[23px]">
              #{standing.myRank}
            </p>
            <p className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
              {formatCurrency(standing.myGmv)} · top {topPct}%
            </p>
          </>
        )}
      </div>
    </div>
  );
}
