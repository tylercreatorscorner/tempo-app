import { AgencyRevenueWorkspace } from './workspace';
import { revenuePeriod } from '@/lib/data/agency-revenue';
export default async function AgencyRevenuePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const current = revenuePeriod(null), query = await searchParams;
  let month = current.month;
  try { month = revenuePeriod(typeof query.month === 'string' ? query.month : null).month; } catch { /* Invalid links open the current service month. */ }
  return <AgencyRevenueWorkspace initialMonth={month} latestMonth={current.month} />;
}
