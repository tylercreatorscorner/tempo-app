'use client';

import { TrendingUp, TrendingDown, Sparkles, Flame } from 'lucide-react';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils/format';
import { BRAND_COLORS, BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';

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

interface Props {
  brandRiser?: BrandChange | null;
  brandFaller?: BrandChange | null;
  creatorBreakout?: CreatorBreakout | null;
  hotPost?: HotPost | null;
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
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
          {eyebrow}
        </span>
      </div>
      <p className="text-sm font-semibold text-[#1A1B3A] line-clamp-2 mb-0.5">{title}</p>
      <p className="text-[11px] text-gray-400 mb-3 line-clamp-1">{subtitle}</p>
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-400">{valueLabel}</p>
          <p className="text-base font-bold text-[#1A1B3A] tabular-nums">{value}</p>
        </div>
        {delta !== undefined && (
          <span
            className={`text-xs font-bold px-1.5 py-0.5 rounded-md tabular-nums ${
              delta >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'
            }`}
          >
            {delta >= 0 ? '+' : ''}{delta.toFixed(0)}%
          </span>
        )}
      </div>
    </>
  );

  const className =
    'block rounded-2xl bg-white border border-gray-100 shadow-sm p-4 hover:shadow-md hover:-translate-y-0.5 transition-all';

  return link ? (
    <Link href={link} className={className}>{inner}</Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}

export function NotableChanges({ brandRiser, brandFaller, creatorBreakout, hotPost }: Props) {
  // Don't render the section at all if there's nothing notable
  if (!brandRiser && !brandFaller && !creatorBreakout && !hotPost) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-[#E91E8C]" />
        <h3 className="text-sm font-bold text-[#1A1B3A]">Notable Changes</h3>
        <span className="text-xs text-gray-400">vs prior period</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {brandRiser && (
          <ChangeCard
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            iconColor={BRAND_COLORS[brandRiser.brand] ?? '#00C853'}
            iconBg={`${BRAND_COLORS[brandRiser.brand] ?? '#00C853'}18`}
            eyebrow="Top Brand Riser"
            title={BRAND_DISPLAY_NAMES[brandRiser.brand] ?? brandRiser.brand}
            subtitle={`Up from ${formatCurrency(brandRiser.prior)} last period`}
            valueLabel="GMV"
            value={formatCurrency(brandRiser.current)}
            delta={brandRiser.delta_pct}
          />
        )}

        {brandFaller && (
          <ChangeCard
            icon={<TrendingDown className="h-3.5 w-3.5" />}
            iconColor={BRAND_COLORS[brandFaller.brand] ?? '#F44336'}
            iconBg={`${BRAND_COLORS[brandFaller.brand] ?? '#F44336'}18`}
            eyebrow="Biggest Drop"
            title={BRAND_DISPLAY_NAMES[brandFaller.brand] ?? brandFaller.brand}
            subtitle={`Down from ${formatCurrency(brandFaller.prior)} last period`}
            valueLabel="GMV"
            value={formatCurrency(brandFaller.current)}
            delta={brandFaller.delta_pct}
          />
        )}

        {creatorBreakout && (
          <ChangeCard
            icon={<Sparkles className="h-3.5 w-3.5" />}
            iconColor="#7C5CFC"
            iconBg="#7C5CFC18"
            eyebrow="Breakout Creator"
            title={`@${creatorBreakout.creator_name}`}
            subtitle={`${BRAND_DISPLAY_NAMES[creatorBreakout.brand] ?? creatorBreakout.brand} · ${
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
            iconColor="#FF6B35"
            iconBg="#FF6B3518"
            eyebrow="Hottest Post"
            title={hotPost.video_title}
            subtitle={`@${hotPost.creator_name} · ${BRAND_DISPLAY_NAMES[hotPost.brand] ?? hotPost.brand}`}
            valueLabel={`${hotPost.days_active}d live`}
            value={formatCurrency(hotPost.total_gmv)}
            delta={hotPost.velocity > 0 ? Math.round((hotPost.velocity / Math.max(hotPost.total_gmv / Math.max(hotPost.days_active, 1), 1) - 1) * 100) : undefined}
          />
        )}
      </div>
    </div>
  );
}

