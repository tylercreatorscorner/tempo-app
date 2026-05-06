import { rankAlerts, type CreatorAlert } from '@/lib/data/creator-alerts';

interface Props {
  alerts: CreatorAlert[];
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
 * Right-rail card on the dashboard surfacing managed creators who deviated
 * notably from their retainer expectations this period.
 */
export function CreatorAlerts({ alerts }: Props) {
  const ranked = rankAlerts(alerts, 5);

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex items-center gap-2">
        <span className="text-lg">🚨</span>
        <h3 className="text-base font-semibold text-[#1A1B3A]">Creator Alerts</h3>
        <span className="text-xs text-gray-400 ml-auto">Needs attention</span>
      </div>
      <div className="divide-y divide-gray-50">
        {ranked.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400 text-sm">
            No alerts right now. Your creators are on track! ✅
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
