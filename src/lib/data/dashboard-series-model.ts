export type MetricKey =
  | "gmv"
  | "managed_gmv"
  | "orders"
  | "managed_orders"
  | "units"
  | "managed_units";
export interface MetricRow {
  brand_id: string;
  stat_date: string;
  gmv: number | null;
  orders: number | null;
  units: number | null;
  managed_gmv: number;
  managed_orders: number;
  managed_units: number;
  recorded: boolean;
}
export function seriesPoints(
  rows: MetricRow[],
  start: string,
  end: string,
  key: MetricKey,
) {
  const totals = new Map<string, { value: number; recorded: Set<string> }>();
  for (const row of rows) {
    if (row.stat_date < start || row.stat_date > end) continue;
    const point = totals.get(row.stat_date) ?? {
      value: 0,
      recorded: new Set<string>(),
    };
    if (row[key] !== null && Number.isFinite(Number(row[key])))
      point.value += Number(row[key]);
    if (row.recorded) point.recorded.add(row.brand_id);
    totals.set(row.stat_date, point);
  }
  const points = [];
  for (
    let date = new Date(start + "T00:00:00Z");
    date <= new Date(end + "T00:00:00Z");
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    const day = date.toISOString().slice(0, 10),
      point = totals.get(day);
    points.push({
      date: day,
      gmv: point && point.recorded.size ? point.value : null,
      recordedBrands: point?.recorded.size ?? 0,
    });
  }
  return points;
}
export function monthlyPoints(
  rows: MetricRow[],
  start: string,
  end: string,
  brandCount: number,
) {
  const months = new Map<
    string,
    { total: number; managed: number; days: Set<string> }
  >();
  for (const row of rows) {
    if (row.stat_date < start || row.stat_date > end || !row.recorded) continue;
    const month = row.stat_date.slice(0, 7);
    const point = months.get(month) ?? {
      total: 0,
      managed: 0,
      days: new Set<string>(),
    };
    point.total += Number(row.gmv ?? 0);
    point.managed += Number(row.managed_gmv);
    point.days.add(row.brand_id + "|" + row.stat_date);
    months.set(month, point);
  }
  const output = [];
  for (
    let d = new Date(start.slice(0, 7) + "-01T00:00:00Z");
    d <= new Date(end + "T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() + 1)
  ) {
    const month = d.toISOString().slice(0, 7),
      p = months.get(month);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
      .toISOString()
      .slice(0, 10);
    const through = last > end ? end : last;
    const days = Math.round((Date.parse(through) - d.getTime()) / 86400000) + 1;
    output.push({
      month,
      total: p?.total ?? null,
      managed: p?.managed ?? null,
      share: p && p.total > 0 ? (p.managed / p.total) * 100 : null,
      partial: through < last || (p?.days.size ?? 0) < days * brandCount,
    });
  }
  return output;
}
