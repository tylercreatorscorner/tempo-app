import { Globe2 } from 'lucide-react';
import { getNetworkFlex, type DateWindow } from '@/lib/data/creator-portal';
import { fmtCompactCurrency } from '@/components/charts/format';

/**
 * "You're 1 of N creators powering $X across the network · Top Y%" — the Home
 * hero's network-scale morale beat. An async server component so it can be
 * streamed behind <Suspense>: Home renders instantly and this band pops in when
 * the (network-wide) query resolves. Renders nothing if the creator has no
 * standing or the read fails — never a fake stat.
 */
export async function NetworkFlexBand({
  handles,
  window,
}: {
  handles: string[];
  window: DateWindow;
}) {
  const flex = await getNetworkFlex(handles, window).catch(() => null);
  if (!flex) return null;

  const pct = Math.max(1, Math.ceil(flex.percentile * 100));
  const badge = flex.myRank === 1 ? '#1' : `Top ${pct}%`;

  return (
    <section
      className="flex items-center gap-3 rounded-2xl border px-4 py-3"
      style={{
        borderColor: 'color-mix(in srgb, var(--primary) 24%, var(--border))',
        background: 'color-mix(in srgb, var(--primary) 6%, var(--card))',
      }}
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-pulse-grad text-white">
        <Globe2 className="h-4 w-4" />
      </span>
      <p className="min-w-0 flex-1 text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">
          You&apos;re 1 of {flex.creatorCount.toLocaleString()} creators
        </span>{' '}
        powering <span className="font-semibold text-foreground">{fmtCompactCurrency(flex.networkGmv)}</span>{' '}
        across the network this period.
      </p>
      <span className="shrink-0 rounded-lg bg-primary/10 px-2.5 py-1 font-mono text-xs font-semibold text-primary">
        {badge}
      </span>
    </section>
  );
}

/** Slim placeholder shown while the network band streams in. */
export function NetworkFlexSkeleton() {
  return <div className="h-[54px] animate-pulse rounded-2xl border border-border bg-card/60" />;
}
