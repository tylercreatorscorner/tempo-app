'use client';

import { TrendingUp, TrendingDown, Sparkles, Flame, Package } from 'lucide-react';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils/format';
import { useBrandMeta } from '@/hooks/use-brand-meta';

export interface BrandChange {
  brand: string;
  current: number;
  prior: number;
  delta_pct: number;
}

export interface CreatorBreakout {
  creator_name: string;
  brand: string;
  current_gmv: number;
  prior_gmv: number;
  delta_pct: number;
  is_managed: boolean;
}

export interface HotPost {
  video_id: string;
  video_title: string;
  creator_name: string;
  brand: string;
  total_gmv: number;
  days_active: number;
  /** GMV per day this video has been live — high = ramping fast */
  velocity: number;
}

export interface TopProduct {
  product_name: string;
  brand: string;
  current_gmv: number;
  prior_gmv: number;
  delta_pct: number;
}

interface Props {
  brandRiser?: BrandChange | null;
  brandFaller?: BrandChange | null;
  creatorBreakout?: CreatorBreakout | null;
  hotPost?: HotPost | null;
  topProduct?: TopProduct | null;
}

function ChangeCard({
  icon, iconColor, iconBg, eyebrow, title, subtitle, valueLabel, value, delta,
  link,
}: {
  icon: React.ReactNode;
  iconColor: string;
  iconBg: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  valueLabel: string;
  value: string;
  delta?: number;
  link?: string;
}) {
  const inner = (
    <>
      <div className="flex items-center gap-2 mb-2">
        <div
          className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: iconBg, color: iconColor }}
        >
          {icon}
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {eyebrow}
        </span>
      </div>
      <p className="text-sm font-semibold text-[var(--foreground)] line-clamp-2 mb-0.5">{title}</p>
      <p className="text-[11px] font-mono tabular-nums text-muted-foreground mb-3 line-clamp-1">{subtitle}</p>
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{valueLabel}</p>
          <p className="text-base font-bold text-[var(--foreground)] font-mono tabular-nums">{value}</p>
        </div>
        {delta !== undefined && (
          <span
            className={`text-xs font-bold px-1.5 py-0.5 rounded-md font-mono tabular-nums ${
              delta >= 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-500'
            }`}
          >
            {delta >= 0 ? '+' : ''}{delta.toFixed(0)}%
          </span>
        )}
      </div>
    </>
  );

  const className =
    'block rounded-2xl bg-card border border-border shadow-sm p-4 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none';

  return link ? (
    <Link
      href={link}
      className={`${className} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/40 focus-visible:ring-offset-1`}
    >{inner}</Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}

export function NotableChanges({ brandRiser, brandFaller, creatorBreakout, hotPost, topProduct }: Props) {
  const brandMeta = useBrandMeta();
  // Don't render the section at all if there's nothing notable
  if (!brandRiser && !brandFaller && !creatorBreakout && !hotPost && !topProduct) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-[var(--primary)]" />
        <h3 className="text-sm font-extrabold tracking-tight text-[var(--foreground)]">Notable Changes</h3>
        <span className="text-[11px] font-mono tabular-nums text-muted-foreground">vs prior period</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {brandRiser && (
          <ChangeCard
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            iconColor={brandMeta.color(brandRiser.brand)}
            iconBg={`${brandMeta.color(brandRiser.brand)}18`}
            eyebrow="Top Brand Riser"
            title={brandMeta.label(brandRiser.brand)}
            subtitle={`Up from ${formatCurrency(brandRiser.prior)} last period`}
            valueLabel="GMV"
            value={formatCurrency(brandRiser.current)}
            delta={brandRiser.delta_pct}
          />
        )}

        {brandFaller && (
          <ChangeCard
            icon={<TrendingDown className="h-3.5 w-3.5" />}
            iconColor={brandMeta.color(brandFaller.brand)}
            iconBg={`${brandMeta.color(brandFaller.brand)}18`}
            eyebrow="Biggest Drop"
            title={brandMeta.label(brandFaller.brand)}
            subtitle={`Down from ${formatCurrency(brandFaller.prior)} last period`}
            valueLabel="GMV"
            value={formatCurrency(brandFaller.current)}
            delta={brandFaller.delta_pct}
          />
        )}

        {creatorBreakout && (
          <ChangeCard
            icon={<Sparkles className="h-3.5 w-3.5" />}
            iconColor="var(--pulse-accent-2)"
            iconBg="var(--pulse-accent-2)18"
            eyebrow="Breakout Creator"
            title={`@${creatorBreakout.creator_name}`}
            subtitle={`${brandMeta.label(creatorBreakout.brand)} · ${
              creatorBreakout.is_managed ? 'managed' : 'unmanaged'
            }`}
            valueLabel="GMV"
            value={formatCurrency(creatorBreakout.current_gmv)}
            delta={creatorBreakout.delta_pct}
            link={creatorBreakout.is_managed ? `/creators/${encodeURIComponent(creatorBreakout.creator_name)}` : undefined}
          />
        )}

        {hotPost && (
          <ChangeCard
            icon={<Flame className="h-3.5 w-3.5" />}
            iconColor="#FF9800"
            iconBg="#FF980018"
            eyebrow="Hottest Post"
            title={hotPost.video_title}
            subtitle={`@${hotPost.creator_name} · ${brandMeta.label(hotPost.brand)} · ${hotPost.days_active}d live`}
            valueLabel={`${formatCurrency(hotPost.velocity)}/day`}
            value={formatCurrency(hotPost.total_gmv)}
          />
        )}

        {topProduct && (
          <ChangeCard
            icon={<Package className="h-3.5 w-3.5" />}
            iconColor="#2196F3"
            iconBg="#2196F318"
            eyebrow="Top Product"
            title={topProduct.product_name}
            subtitle={brandMeta.label(topProduct.brand)}
            valueLabel="GMV"
            value={formatCurrency(topProduct.current_gmv)}
            delta={topProduct.prior_gmv > 0 ? topProduct.delta_pct : undefined}
          />
        )}
      </div>
    </div>
  );
}

