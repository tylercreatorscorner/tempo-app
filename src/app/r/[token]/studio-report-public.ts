import type { BrandClientReportData } from '@/lib/data/brand-client-report';
import type { ClientReportSnapshot } from '@/lib/data/client-reports';
import { finiteNumber, reportUnits, safeTikTokUrl, type PublicStudioReport, type ReportCreator, type ReportVideo } from './studio-report-model';

type SourceGranular = NonNullable<BrandClientReportData['granular']>;
function avatar(value: unknown) {
  if (typeof value !== 'string') return null;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}
function publicCreator(row: SourceGranular['creators'][number]): ReportCreator {
  const optional = row as ReportCreator;
  const agreement = row.agreement;
  return {
    creatorId: row.creatorId, name: row.name, realName: row.realName, handle: row.handle,
    handles: row.handles?.filter(value => typeof value === 'string'), handleCount: row.handleCount,
    isAffiliate: row.isAffiliate, role: row.role, retainer: row.retainer, quota: row.quota,
    departed: row.departed, postsPublished: row.postsPublished, videosEarning: row.videosEarning,
    gmv: row.gmv, orders: row.orders, windowPostGmv: row.windowPostGmv, netNewGmv: row.netNewGmv,
    ccStartDate: row.ccStartDate, units: reportUnits(optional), avatarUrl: avatar(optional.avatarUrl ?? optional.avatar_url),
    agreement: agreement ? {
      reportPeriodComparable: agreement.reportPeriodComparable, ledgerVersion: agreement.ledgerVersion,
      periodStart: agreement.periodStart, periodEnd: agreement.periodEnd, revision: agreement.revision,
      retainer: agreement.retainer, quota: agreement.quota, status: agreement.status,
    } : agreement,
  };
}
function publicVideo(row: BrandClientReportData['topVideos'][number]): ReportVideo {
  return { title: row.title, creator: row.creator, gmv: row.gmv, orders: row.orders, videoUrl: safeTikTokUrl(row.videoUrl), units: reportUnits(row as ReportVideo) };
}
function granular(row: SourceGranular): NonNullable<PublicStudioReport['granular']> {
  const age = row.vintageAge;
  const bucket = (value: { videos: number; gmv: number }) => ({ videos: value.videos, gmv: value.gmv });
  return {
    roster: { signed: row.roster.signed, onRetainer: row.roster.onRetainer, affiliateOnly: row.roster.affiliateOnly,
      monthlyRetainerBudget: row.roster.monthlyRetainerBudget, retainerHistoryExact: row.roster.retainerHistoryExact, roleCoverage: row.roster.roleCoverage },
    netNew: row.netNew ? { netNewGmv: row.netNew.netNewGmv, preCcGmv: row.netNew.preCcGmv, totalGmv: row.netNew.totalGmv } : undefined,
    vintageAge: age ? { d0_30: bucket(age.d0_30), d30_60: bucket(age.d30_60), d60_90: bucket(age.d60_90), d90_plus: bucket(age.d90_plus), unknown: bucket(age.unknown) } : undefined,
    creators: row.creators.map(publicCreator),
  };
}

/** Public presentation boundary. No rest spread: a future private snapshot field
 * must never be serialized merely because the report gains an interaction. */
export function publicStudioReport(row: BrandClientReportData): PublicStudioReport {
  const cc = row.creatorsCorner, activity = row.activity, channels = row.channels, signings = row.signings, split = row.agreementSplit;
  return {
    brandName: row.brandName, brandSlug: row.brandSlug, startDate: row.startDate, endDate: row.endDate,
    periodLabel: row.periodLabel, periodLengthDays: row.periodLengthDays,
    totalGmv: row.totalGmv, totalOrders: row.totalOrders, totalItems: row.totalItems, totalVideos: row.totalVideos,
    activeCreators: row.activeCreators, avgOrderValue: row.avgOrderValue, avgGmvPerCreator: row.avgGmvPerCreator, estCommission: row.estCommission,
    priorTotalGmv: row.priorTotalGmv, priorTotalOrders: row.priorTotalOrders, priorTotalItems: row.priorTotalItems,
    priorActiveCreators: row.priorActiveCreators, priorTotalVideos: row.priorTotalVideos,
    gmvChangePct: row.gmvChangePct, orderChangePct: row.orderChangePct, itemChangePct: row.itemChangePct,
    creatorChangePct: row.creatorChangePct, videoChangePct: row.videoChangePct,
    videoCoverageComplete: row.videoCoverageComplete, priorVideoCoverageComplete: row.priorVideoCoverageComplete,
    topCreator: row.topCreator ? { name: row.topCreator.name, gmv: row.topCreator.gmv, orders: row.topCreator.orders, videos: row.topCreator.videos } : null,
    topVideo: row.topVideo ? { title: row.topVideo.title, creator: row.topVideo.creator, gmv: row.topVideo.gmv, orders: row.topVideo.orders, videoUrl: safeTikTokUrl(row.topVideo.videoUrl) } : null,
    bestDay: row.bestDay ? { date: row.bestDay.date, weekday: row.bestDay.weekday, gmv: row.bestDay.gmv, orders: row.bestDay.orders, creators: row.bestDay.creators } : null,
    managed: { gmv: row.managed?.gmv, creatorCount: row.managed?.creatorCount, orders: row.managed?.orders },
    organic: { gmv: row.organic?.gmv, creatorCount: row.organic?.creatorCount, orders: row.organic?.orders }, managedPct: row.managedPct,
    creatorsCorner: {
      gmv: cc.gmv, orders: cc.orders, items: cc.items, priorItems: cc.priorItems, creatorCount: cc.creatorCount,
      videos: cc.videos, commission: cc.commission, pctOfStoreGmv: cc.pctOfStoreGmv,
      priorGmv: cc.priorGmv, priorOrders: cc.priorOrders, priorCreatorCount: cc.priorCreatorCount, priorVideos: cc.priorVideos,
      gmvChangePct: cc.gmvChangePct, orderChangePct: cc.orderChangePct, videoChangePct: cc.videoChangePct, creatorChangePct: cc.creatorChangePct,
      managedAov: cc.managedAov, organicAov: cc.organicAov, managedGmvPerCreator: cc.managedGmvPerCreator, organicGmvPerCreator: cc.organicGmvPerCreator,
      signedCreatorCount: cc.signedCreatorCount, activeCreatorCount: cc.activeCreatorCount, newlyActivatedCount: cc.newlyActivatedCount,
      topCreators: (cc.topCreators ?? []).map(value => ({ name: value.name, videos: value.videos, gmv: value.gmv, orders: value.orders, pctOfManaged: value.pctOfManaged })),
      topVideos: (cc.topVideos ?? []).map(publicVideo),
    },
    newCreators: { count: row.newCreators?.count, gmv: row.newCreators?.gmv }, returningCreators: { count: row.returningCreators?.count, gmv: row.returningCreators?.gmv },
    dayOfWeek: (row.dayOfWeek ?? []).map(value => ({ day: value.day, gmv: value.gmv, isPeak: value.isPeak })),
    dailyPerformance: (row.dailyPerformance ?? []).map(value => ({ date: value.date, weekday: value.weekday, gmv: value.gmv, orders: value.orders, creators: value.creators, isPeak: value.isPeak })),
    topCreators: (row.topCreators ?? []).map(value => ({ name: value.name, videos: value.videos, gmv: value.gmv, orders: value.orders, pctOfTotal: value.pctOfTotal })),
    topVideos: (row.topVideos ?? []).map(publicVideo),
    topProducts: (row.topProducts ?? []).map(value => ({ name: value.name, gmv: value.gmv, orders: value.orders, pctOfTotal: value.pctOfTotal, productId: typeof (value as { productId?: unknown }).productId === 'string' ? (value as { productId?: string }).productId : undefined })),
    activity: activity ? { rosterPosted: activity.rosterPosted, rosterPostedPrior: activity.rosterPostedPrior, rosterSold: activity.rosterSold, rosterSoldNotPosted: activity.rosterSoldNotPosted, rosterDeparted: activity.rosterDeparted, storeCreatorsPosted: activity.storeCreatorsPosted, storeCreatorsSold: activity.storeCreatorsSold } : undefined,
    channels: channels ? { rosterVideoGmv: channels.rosterVideoGmv, rosterLiveGmv: channels.rosterLiveGmv, rosterCardGmv: channels.rosterCardGmv, rosterLiveStreams: channels.rosterLiveStreams, storeVideoGmv: channels.storeVideoGmv, storeLiveGmv: channels.storeLiveGmv, storeCardGmv: channels.storeCardGmv, storeLiveStreams: channels.storeLiveStreams } : undefined,
    signings: signings ? { monthLabel: signings.monthLabel, priorMonthLabel: signings.priorMonthLabel, signed: signings.signed, signedRetained: signings.signedRetained, signedPrior: signings.signedPrior, isFirstMonth: signings.isFirstMonth, priorComparable: signings.priorComparable } : undefined,
    monthToDate: row.monthToDate ? { start: row.monthToDate.start, end: row.monthToDate.end, daysElapsed: row.monthToDate.daysElapsed, daysInMonth: row.monthToDate.daysInMonth, granular: granular(row.monthToDate.granular) } : undefined,
    topLive: row.topLive?.map(value => ({ handle: value.handle, liveGmv: value.liveGmv, lives: value.lives })),
    agreementSplit: split ? { retainerGmv: split.retainerGmv, affiliateGmv: split.affiliateGmv, retainerCreators: split.retainerCreators, affiliateCreators: split.affiliateCreators, unattributedGmv: split.unattributedGmv } : undefined,
    granular: row.granular ? granular(row.granular) : undefined,
    productCreatorBreakdown: (row.productCreatorBreakdown ?? []).map(value => ({ productId: typeof (value as { productId?: unknown }).productId === 'string' ? (value as { productId?: string }).productId : undefined, productName: value.productName, productGmv: value.productGmv, productOrders: value.productOrders, pctOfTotal: value.pctOfTotal, topCreators: value.topCreators.map(creator => ({ name: creator.name, gmv: creator.gmv })) })),
  };
}
export function publicStudioSnapshot(source: ClientReportSnapshot): Pick<ClientReportSnapshot, 'generatedAt' | 'weekly' | 'movers'> {
  const movers = source.movers;
  return {
    generatedAt: source.generatedAt,
    weekly: (source.weekly ?? []).filter(row => finiteNumber(row.gmv) !== null).map(row => ({ weekEnd: row.weekEnd, gmv: row.gmv, ...(finiteNumber(row.rosterGmv) !== null ? { rosterGmv: row.rosterGmv } : {}) })),
    movers: movers ? { gained: movers.gained, lost: movers.lost, netChange: movers.netChange, started: movers.started, stopped: movers.stopped,
      list: movers.list.map(row => ({ handle: row.handle, name: row.name, cur: row.cur, prior: row.prior, change: row.change, movement: row.movement })) } : movers,
  };
}
