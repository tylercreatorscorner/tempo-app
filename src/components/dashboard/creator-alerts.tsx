import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { rankAlerts, type CreatorAlert } from '@/lib/data/creator-alerts';
import { formatCurrency } from '@/lib/utils/format';
import { BRAND_COLORS, BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';

export interface BrandMover {
  slug: string;
  currentGmv: number;
  trend: number;
}

interface Props {
  alerts: CreatorAlert[];
  /** Optional brand-level movers — surface above creator alerts when present.
   * The agency-client view's "what fires need attention" signal. */
  brandRiser?: BrandMover | null;
  brandFaller?: BrandMover | null;
}

const TYPE_LABEL: Record<CreatorAlert['type'], string> = {
  underperforming: 'Underperforming',
  crushing: 'Crushing it',
  breakout: 'Breakout',
};

const TYPE_ICON: Record<CreatorAlert['type'], string> = {
  underperforming: '⚠️',
  crushing: '🔥',
  breakout: '⭐',
};

const TYPE_BADGE: Record<CreatorAlert['type'], string> = {
  underperforming: 'bg-amber-50 text-amber-600',
  crushing: 'bg-green-50 text-green-600',
  breakout: 'bg-blue-50 text-blue-600',
};

/**
 * Combined alerts card — surfaces brand-level movers (for multi-brand tenants)
 * above the creator-level alerts. On single-brand tenants this collapses to
 * just the creator alerts.
 */
export function CreatorAlerts({ alerts, brandRiser, brandFaller }: Props) {
  const ranked = rankAlerts(alerts, 5);
  const hasBrandMovers = !!brandRiser || !!brandFaller;

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex items-center gap-2">
        <span className="text-lg">🚨</span>
        <h3 className="text-base font-semibold text-[#1A1B3A]">Alerts</h3>
        <span className="text-xs text-gray-400 ml-auto">Needs attention</span>
      </div>

      {/* Brand-level movers (only on multi-brand portfolio view) */}
      {hasBrandMovers && (
        <div className="px-4 py-3 bg-gray-50/50 border-b border-gray-100 space-y-2">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Brand movers</p>
          {brandRiser && <BrandMoverRow mover={brandRiser} kind="riser" />}
          {brandFaller && <BrandMoverRow mover={brandFaller} kind="faller" />}
        </div>
      )}

      <div className="divide-y divide-gray-50">
        {ranked.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400 text-sm">
            {hasBrandMovers
              ? 'No creator-level alerts. ✅'
              : 'No alerts right now. Your creators are on track! ✅'}
          </div>
        ) : (
          ranked.map((alert, i) => (
            <div
              key={`${alert.name}-${alert.type}-${i}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-pink-50/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-base">{TYPE_ICON[alert.type]}</span>
                <div>
                  <p className="text-sm font-medium text-[#1A1B3A]">{alert.name}</p>
                  <p className="text-xs text-gray-400">{alert.detail}</p>
                </div>
              </div>
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${TYPE_BADGE[alert.type]}`}>
                {TYPE_LABEL[alert.type]}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function BrandMoverRow({ mover, kind }: { mover: BrandMover; kind: 'riser' | 'faller' }) {
  const color = BRAND_COLORS[mover.slug] ?? '#6B7280';
  const name  = BRAND_DISPLAY_NAMES[mover.slug] ?? mover.slug;
  const isPositive = kind === 'riser';

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="text-sm font-semibold text-[#1A1B3A] truncate">{name}</span>
        <span className="text-xs text-gray-400">{formatCurrency(mover.currentGmv)}</span>
      </div>
      <span
        className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-xs font-bold flex-shrink-0 ${
          isPositive ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'
        }`}
      >
        {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
        {Math.abs(mover.trend).toFixed(1)}%
      </span>
    </div>
  );
}
