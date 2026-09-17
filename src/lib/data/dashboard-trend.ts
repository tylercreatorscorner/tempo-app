/** Keep calendar positions and distinguish absent records from recorded zero. */
export function buildDashboardTrend(days: string[], slugs: string[], daily: Map<string, Map<string, number>>) {
  return days.map(date => {
    const values = [...new Set(slugs)].flatMap(slug => {
      const value = daily.get(slug)?.get(date);
      return value !== undefined && Number.isFinite(value) ? [value] : [];
    });
    return { date, gmv: values.length ? values.reduce((sum, value) => sum + value, 0) : null, recordedBrands: values.length };
  });
}
