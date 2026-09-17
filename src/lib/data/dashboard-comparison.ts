/** Compare exactly the same authorized, fully recorded stores in both periods. */
export function dashboardComparison(
  stores: Set<string>,
  current: { brand_slug: string; total_gmv: number; total_orders: number; total_items_sold: number }[],
  previous: { brand_slug: string; total_gmv: number; total_orders: number; total_items_sold: number }[],
  managedCurrent: Map<string, number>,
  managedPrevious: Map<string, number>,
) {
  function sum(rows: typeof current, managed: Map<string, number>) {
    const totals = { gmv: 0, orders: 0, units: 0, managed: 0 };
    for (const row of rows) if (stores.has(row.brand_slug)) {
      totals.gmv += row.total_gmv;
      totals.orders += row.total_orders;
      totals.units += row.total_items_sold;
    }
    for (const store of stores) totals.managed += managed.get(store) ?? 0;
    return totals;
  }
  return { current: sum(current, managedCurrent), previous: sum(previous, managedPrevious) };
}
