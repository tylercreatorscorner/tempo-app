import type { BrandClientReportData } from './brand-client-report';
type Creator = NonNullable<BrandClientReportData['granular']>['creators'][number];
/** Linear posting pace, measured only over the frozen calendar-month window. */
export function reportDeliveryPace(c: Creator, mtd: BrandClientReportData['monthToDate']): Creator['pace'] {
  if (!mtd || c.isAffiliate || c.departed || !c.quota) return undefined;
  const matches = mtd.granular.creators.filter(row => c.creatorId ? row.creatorId === c.creatorId : !!c.handle && row.handle === c.handle);
  if (matches.length !== 1) return undefined;
  const row = matches[0];
  const start = new Date(mtd.start).toISOString().slice(0,10);
  if (row.isAffiliate || row.departed || !row.quota || row.quota !== c.quota || (row.ccStartDate && row.ccStartDate > start) || (row.agreement && !row.agreement.reportPeriodComparable)) return undefined;
  const expected = row.quota * mtd.daysElapsed / mtd.daysInMonth;
  const difference = row.postsPublished - expected;
  const label = row.postsPublished >= row.quota ? 'Complete' : difference >= 1 ? 'Ahead' : difference <= -1 ? 'Behind' : 'On pace';
  return { label, tone: label === 'Behind' ? 'behind' : label === 'Ahead' || label === 'Complete' ? 'ahead' : 'neutral', detail: `${row.postsPublished}/${row.quota} MTD · ${Math.round(expected)} expected` };
}
