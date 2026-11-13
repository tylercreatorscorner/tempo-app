import type { BrandClientReportData } from '@/lib/data/brand-client-report';
import { classifySpendWindow, creatorEarnedShare, estimateDeliveredSpend, spendCaveats } from '@/lib/data/delivered-spend';

type SourceCreator = NonNullable<BrandClientReportData['granular']>['creators'][number];
export type ReportCreator = Omit<SourceCreator, 'agreement'> & {
  agreement?: Omit<NonNullable<SourceCreator['agreement']>, 'snapshot' | 'ledgerId'> | null;
  items?: number | null; units?: number | null; unitsSold?: number | null; avatarUrl?: string | null; avatar_url?: string | null;
};
export type ReportVideo = BrandClientReportData['creatorsCorner']['topVideos'][number] & {
  items?: number | null; units?: number | null; unitsSold?: number | null; postedAt?: string | null; postDate?: string | null; thumbnailUrl?: string | null;
};
type PublicGranular = Pick<NonNullable<BrandClientReportData['granular']>, 'roster' | 'vintageAge' | 'netNew'> & { creators: ReportCreator[] };
export type PublicStudioReport = Omit<BrandClientReportData, 'granular' | 'monthToDate' | 'topProducts' | 'productCreatorBreakdown'> & {
  granular?: PublicGranular;
  monthToDate?: Omit<NonNullable<BrandClientReportData['monthToDate']>, 'granular'> & { granular: PublicGranular };
  topProducts: Array<BrandClientReportData['topProducts'][number] & { productId?: string }>;
  productCreatorBreakdown: Array<BrandClientReportData['productCreatorBreakdown'][number] & { productId?: string }>;
};
export const finiteNumber = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
export const reportUnits = (row: { items?: number | null; units?: number | null; unitsSold?: number | null }) => finiteNumber(row.items) ?? finiteNumber(row.units) ?? finiteNumber(row.unitsSold);
const sourceMoney = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Describe the saved source bridge without treating separate exports as matched transactions. */
export function reportSourceNotes(report: Pick<BrandClientReportData, 'sourceReconciliation' | 'totalGmv'>): string[] {
  const source = report.sourceReconciliation;
  if (!source) return [];
  if (source.recovery) return [
    `Reconciled managed sales: ${sourceMoney(source.creatorGmv)} = ${sourceMoney(source.videoGmv)} video + ${sourceMoney(source.liveGmv)} recorded live + ${sourceMoney(source.productCardGmv)} product cards. The creator table and headline include ${sourceMoney(source.recovery.managedVideoGmv)} recovered from saved video records for ${source.recovery.creatorDays} missing creator-days.`,
    `Content and video-age detail total ${sourceMoney(source.videoExportGmv)}, matching managed video sales. Product-card sales are separate. No unrecorded live or product-card sales have been credited to a creator.`,
    `Whole-shop sales and product detail use the product export: ${sourceMoney(source.productExportGmv)}. Of this, ${sourceMoney(source.recovery.shopUnattributedGmv)} cannot be attributed to a creator from the available exports and is included only in the store total, not in managed sales.`,
    'Store orders are recorded creator orders. Product-level order counts can overlap and are not added together as unique shop orders. Store units use the product export.',
  ];
  const difference = (value: number) => Math.abs(value) < 0.005 ? 'equal to' : sourceMoney(Math.abs(value)) + (value > 0 ? ' above' : ' below');
  return [
    `Creator sales export: ${sourceMoney(source.creatorGmv)} managed GMV = ${sourceMoney(source.videoGmv)} video + ${sourceMoney(source.liveGmv)} live + ${sourceMoney(source.productCardGmv)} product cards. Creator-table GMV, orders and units use this export.`,
    `Video sales export: ${sourceMoney(source.videoExportGmv)} for content and video-age detail, ${difference(source.videoDifference)} creator-export video GMV. These exports remain separate; the difference is not assigned to individual transactions.`,
    `Product sales export: ${sourceMoney(source.productExportGmv)}, ${difference(source.productDifference)} total affiliate GMV of ${sourceMoney(report.totalGmv)}. Product detail retains its own source values.`,
  ];
}
export function reportPriorWindow(report: Pick<BrandClientReportData, 'startDate' | 'endDate'>): string {
  const days = Math.round((report.endDate.getTime() - report.startDate.getTime()) / 86_400_000) + 1;
  const end = new Date(report.startDate); end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - days + 1);
  const format = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return `${format(start)} to ${format(end)}`;
}
export function rosterScopeNote(creator: Pick<ReportCreator, 'ccStartDate'>, report: Pick<BrandClientReportData, 'endDate'>): string | null {
  return creator.ccStartDate && creator.ccStartDate.slice(0, 10) > report.endDate.toISOString().slice(0, 10)
    ? 'Included in this report; saved roster date is later than the report window.' : null;
}
export const normalizeHandle = (handle: string | null | undefined) => (handle ?? '').trim().replace(/^@+/, '').toLowerCase();
export function safeTikTokUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.port && !url.username && !url.password && ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'].includes(url.hostname) && /^\/@[a-zA-Z0-9._]+\/(video|photo)\/\d+\/?$/.test(url.pathname) ? 'https://www.tiktok.com' + url.pathname.replace(/\/$/, '') : null;
  } catch { return null; }
}
export function matchedRetainerReturn(report: PublicStudioReport) {
  const creators = (report.granular?.creators ?? []) as ReportCreator[];
  const window = classifySpendWindow(report.startDate, report.endDate);
  const retained = creators.filter(creator => !creator.isAffiliate && !creator.departed && creator.retainer > 0);
  // Legacy retainerHistoryExact verifies only an amount as of the period end.
  // It cannot establish payment rules, quota history, or a full-month term.
  // The saved comparable flag certifies one prorated-post agreement segment;
  // require its dates and amounts to agree with every retained row as well.
  const verifiedAgreements = window.kind === 'month' && retained.length > 0 && retained.every(creator => {
    const agreement = creator.agreement;
    return agreement?.reportPeriodComparable === true
      && agreement.periodStart === report.startDate.toISOString().slice(0, 10)
      && agreement.periodEnd === report.endDate.toISOString().slice(0, 10)
      && finiteNumber(creator.retainer) !== null && agreement.retainer === creator.retainer
      && finiteNumber(creator.quota) !== null && creator.quota! > 0 && agreement.quota === creator.quota;
  });
  const spend = window.kind === 'month' && verifiedAgreements ? estimateDeliveredSpend(retained, window) : null;
  const cohort = spend ? retained.filter(creator => creatorEarnedShare(creator) !== null) : [];
  const gmv = cohort.reduce((sum, creator) => sum + creator.gmv, 0);
  const comparable = Boolean(spend && report.granular?.roster.retainerHistoryExact === true && report.videoCoverageComplete === true);
  return {
    comparable,
    spend,
    cohort,
    gmv: spend ? gmv : null,
    multiple: comparable && spend && spend.earned > 0 ? gmv / spend.earned : null,
    excludedGmv: spend ? report.creatorsCorner.gmv - gmv : null,
    caveats: spend ? spendCaveats(spend.defaultQuotaShare, report.granular?.roster.retainerHistoryExact === true) : [],
    unavailableReason: window.kind !== 'month' ? 'A complete calendar month is needed to compare sales with a monthly retainer.'
      : !verifiedAgreements ? 'Comparable agreement dates, payment rules, and post commitments were not saved for every retained creator.'
      : !spend ? 'Agreement periods, payment rules, or post commitments need review before estimating a comparable retainer cost.'
        : report.granular?.roster.retainerHistoryExact !== true ? 'The saved snapshot does not verify dated retainer history for the full cost cohort.'
          : report.videoCoverageComplete === false ? 'Video coverage was incomplete when this report was prepared.'
            : report.videoCoverageComplete !== true ? 'Video coverage status was not saved with this report.' : null,
  };
}
export function reportDelivery(report: PublicStudioReport) {
  const wholeMonth = classifySpendWindow(report.startDate, report.endDate).kind === 'month';
  const source = wholeMonth ? report.granular : report.monthToDate?.granular;
  const creators = (source?.creators ?? []) as ReportCreator[];
  const retained = creators.filter(creator => !creator.isAffiliate && !creator.departed && creator.retainer > 0 && (creator.quota ?? 0) > 0);
  const unmeasured = creators.filter(creator => !creator.isAffiliate && !creator.departed && creator.retainer > 0 && (finiteNumber(creator.quota) ?? 0) <= 0).length;
  const unverifiedTerms = creators.filter(creator => !creator.isAffiliate && !creator.departed && creator.retainer > 0 && !creator.agreement).length;
  const comparable = retained.length > 0 && !retained.some(creator => creator.agreement && !creator.agreement.reportPeriodComparable);
  const committed = retained.reduce((sum, creator) => sum + (creator.quota ?? 0), 0);
  const published = retained.reduce((sum, creator) => sum + creator.postsPublished, 0);
  const credited = retained.reduce((sum, creator) => sum + Math.min(creator.postsPublished, creator.quota ?? 0), 0);
  return { wholeMonth, retained, unmeasured, unverifiedTerms, comparable, committed, published, credited, remaining: Math.max(0, committed - credited), source,
    start: wholeMonth ? report.startDate : report.monthToDate?.start,
    end: wholeMonth ? report.endDate : report.monthToDate?.end,
  };
}
