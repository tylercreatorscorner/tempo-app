import { BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';

export interface AlertData {
  id: string;
  brand: string;
  metric: string;
  change: number;
  message: string;
}

/** Generate alerts from brand comparison data (server-safe) */
export function generateAlerts(
  brandData: { brand: string; currentGmv: number; prevGmv: number }[]
): AlertData[] {
  const alerts: AlertData[] = [];

  for (const { brand, currentGmv, prevGmv } of brandData) {
    if (prevGmv === 0 && currentGmv === 0) continue;
    const change = prevGmv === 0 ? (currentGmv > 0 ? 100 : 0) : ((currentGmv - prevGmv) / prevGmv) * 100;
    const name = BRAND_DISPLAY_NAMES[brand] ?? brand;

    if (change <= -15) {
      alerts.push({
        id: `${brand}-gmv-drop`,
        brand,
        metric: 'gmv',
        change,
        message: `${name} GMV down ${Math.abs(change).toFixed(0)}% vs previous period — needs attention`,
      });
    } else if (change <= -5) {
      alerts.push({
        id: `${brand}-gmv-dip`,
        brand,
        metric: 'gmv',
        change,
        message: `${name} GMV dipped ${Math.abs(change).toFixed(0)}% vs previous period`,
      });
    } else if (change >= 10) {
      alerts.push({
        id: `${brand}-gmv-up`,
        brand,
        metric: 'gmv',
        change,
        message: `${name} up ${change.toFixed(0)}% — strong growth vs previous period`,
      });
    }
  }

  alerts.sort((a, b) => a.change - b.change);
  return alerts;
}
