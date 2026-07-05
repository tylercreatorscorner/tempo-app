import { AlertTriangle, Flame, Star, CheckCircle2, Siren } from 'lucide-react';
import { rankAlerts, type CreatorAlert } from '@/lib/data/creator-alerts';

interface Props {
  alerts: CreatorAlert[];
}

const TYPE_LABEL: Record<CreatorAlert['type'], string> = {
  underperforming: 'Underperforming',
  crushing: 'Crushing it',
  breakout: 'Breakout',
};

const TYPE_ICON: Record<CreatorAlert['type'], React.ReactNode> = {
  underperforming: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  crushing: <Flame className="h-4 w-4 text-[#FF4D8D]" />,
  breakout: <Star className="h-4 w-4 text-emerald-500" />,
};

const TYPE_BADGE: Record<CreatorAlert['type'], string> = {
  underperforming: 'bg-amber-50 text-amber-600',
  crushing: 'bg-emerald-50 text-emerald-600',
  breakout: 'bg-blue-50 text-blue-600',
};

/**
 * Creator-level alerts card — surfaces underperforming / crushing / breakout
 * creators that need attention right now. Brand-level riser/faller signals
 * deliberately live on /analytics's Notable Changes section instead, so we
 * have one canonical home for "period vs prior period" comparisons.
 */
export function CreatorAlerts({ alerts }: Props) {
  const ranked = rankAlerts(alerts, 5);

  return (
    <div className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-gray-200 flex items-center gap-2">
        <span className="h-7 w-7 rounded-lg bg-[#FF4D8D]/10 text-[#FF4D8D] flex items-center justify-center">
          <Siren className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-extrabold tracking-tight text-[#1A1B3A]">Alerts</h3>
        <span className="text-xs text-gray-400 ml-auto">Needs attention</span>
      </div>

      <div className="divide-y divide-gray-50">
        {ranked.length === 0 ? (
          <div className="px-4 py-8 flex flex-col items-center gap-2 text-center text-gray-400 text-sm">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            No alerts right now. Your creators are on track!
          </div>
        ) : (
          ranked.map((alert, i) => (
            <div
              key={`${alert.name}-${alert.type}-${i}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-pink-50/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="flex items-center justify-center">{TYPE_ICON[alert.type]}</span>
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

