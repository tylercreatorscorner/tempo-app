import { formatCurrency } from '@/lib/utils/format';

export type CreatorAlertType = 'underperforming' | 'crushing' | 'breakout';

export interface CreatorAlert {
  name: string;
  type: CreatorAlertType;
  detail: string;
}

export interface AlertableCreator {
  display_name: string;
  isManaged: boolean;
  retainer: number | null;
  total_gmv: number;
  total_videos: number;
}

/**
 * Score and label managed creators for the dashboard's Creator Alerts +
 * Period Brief action items. One source of truth so the brief and the alerts
 * card never disagree about who's slacking vs. crushing it.
 */
export function buildCreatorAlerts(creators: AlertableCreator[]): CreatorAlert[] {
  const alerts: CreatorAlert[] = [];
  for (const c of creators) {
    if (!c.isManaged) continue;
    const retainer = c.retainer ?? 0;

    if (retainer > 0 && c.total_gmv < retainer * 2) {
      alerts.push({
        name: c.display_name,
        type: 'underperforming',
        detail: `GMV ${formatCurrency(c.total_gmv)} vs ${formatCurrency(retainer)} retainer`,
      });
    } else if (retainer > 0 && c.total_gmv > retainer * 10) {
      alerts.push({
        name: c.display_name,
        type: 'crushing',
        detail: `${(c.total_gmv / retainer).toFixed(0)}x ROI on retainer`,
      });
    }
    if (c.total_videos > 0 && c.total_videos <= 2 && c.total_gmv > 500) {
      alerts.push({
        name: c.display_name,
        type: 'breakout',
        detail: `${formatCurrency(c.total_gmv)} from just ${c.total_videos} video${c.total_videos === 1 ? '' : 's'}`,
      });
    }
  }
  return alerts;
}

const ALERT_ORDER: Record<CreatorAlertType, number> = {
  underperforming: 0,
  breakout: 1,
  crushing: 2,
};

/** Sort alerts by severity (underperforming first) and clamp to a max length. */
export function rankAlerts(alerts: CreatorAlert[], limit = 5): CreatorAlert[] {
  return [...alerts]
    .sort((a, b) => ALERT_ORDER[a.type] - ALERT_ORDER[b.type])
    .slice(0, limit);
}
