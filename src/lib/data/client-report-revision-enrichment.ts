import type { ClientReportSnapshot } from './client-reports';

export interface RecoveryName {
  name: string;
  source: string;
  firstSeen: string;
  lastSeen: string;
  observations: number;
}
export interface RecoveredProduct {
  productId: string;
  gmv: number;
  orders: number;
  units: number | null;
  sourceRows: number;
  unitRows: number;
  nameCandidates: RecoveryName[];
  topCreators: { name: string; gmv: number; orders: number; units: number | null }[];
}
export interface RecoveredVideoUnits {
  videoId: string;
  scope: 'store' | 'managed';
  gmv: number;
  orders: number;
  units: number | null;
  sourceRows: number;
  unitRows: number;
}
export interface ClientReportRecoveryEvidence {
  version: 1;
  sourceReportId: string;
  tenantId: string;
  brandSlug: string;
  window: { start: string; end: string };
  observedAt: string;
  denominator: { metric: 'whole_shop_affiliate_gmv'; value: number };
  productTotals: { gmv: number; orders: number; units: number | null; sourceRows: number; productIds: number; earningProductIds: number };
  productGroups: RecoveredProduct[];
  videoUnits: RecoveredVideoUnits[];
  provenance: Record<string, string | boolean>;
}

const cents = (value: number) => Math.round(value * 100);
function requireEqual(actual: number, expected: number, label: string) {
  if (!Number.isFinite(actual) || !Number.isFinite(expected) || cents(actual) !== cents(expected)) throw new Error(`Recovery does not reconcile: ${label}`);
}
function unitsWhenComplete(row: { units: number | null; sourceRows: number; unitRows: number }) {
  if (!Number.isSafeInteger(row.sourceRows) || row.sourceRows <= 0 || !Number.isSafeInteger(row.unitRows)
    || row.unitRows < 0 || row.unitRows > row.sourceRows) throw new Error('Invalid unit coverage');
  if (row.unitRows !== row.sourceRows || row.units === null) return null;
  if (!Number.isSafeInteger(row.units) || row.units < 0) throw new Error('Invalid recovered units');
  return row.units;
}
function dateOnly(value: Date | string) { return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10); }

/** Pure transformation of a copied report. Never reads, writes, or regenerates source data. */
export function enrichClientReportRevision(
  snapshot: ClientReportSnapshot,
  evidence: ClientReportRecoveryEvidence,
  authority: { sourceReportId: string; tenantId: string },
) {
  const report = snapshot.report;
  if (evidence.version !== 1 || evidence.sourceReportId !== authority.sourceReportId || evidence.tenantId !== authority.tenantId
    || evidence.brandSlug !== report.brandSlug || evidence.window.start !== dateOnly(report.startDate)
    || evidence.window.end !== dateOnly(report.endDate)) throw new Error('Recovery scope does not match the source report');
  if (evidence.denominator.metric !== 'whole_shop_affiliate_gmv') throw new Error('Unsupported recovery denominator');
  requireEqual(evidence.denominator.value, report.totalGmv, 'whole-shop GMV');
  const productIds = new Set<string>();
  let productGmv = 0, productOrders = 0, productUnits = 0, productRows = 0, completeProductUnits = true;
  const products = evidence.productGroups.map(product => {
    if (!product.productId || productIds.has(product.productId)) throw new Error('Product IDs must be present and unique');
    productIds.add(product.productId);
    if (!Number.isFinite(product.gmv) || product.gmv < 0 || !Number.isSafeInteger(product.orders) || product.orders < 0) throw new Error('Invalid product totals');
    const units = unitsWhenComplete(product);
    productGmv += product.gmv; productOrders += product.orders; productRows += product.sourceRows;
    if (units === null) completeProductUnits = false; else productUnits += units;
    // A historical rename is retained as evidence. Only conflicting names on
    // the latest observed date prevent selecting a display name.
    const candidates = product.nameCandidates.filter(candidate => candidate.name.trim() && /^\d{4}-\d{2}-\d{2}$/.test(candidate.lastSeen)
      && candidate.firstSeen <= candidate.lastSeen && candidate.lastSeen <= evidence.window.end);
    const latestDate = candidates.reduce((latest, candidate) => candidate.lastSeen > latest ? candidate.lastSeen : latest, '');
    const latestNames = [...new Set(candidates.filter(candidate => candidate.lastSeen === latestDate).map(candidate => candidate.name.trim()))];
    const nameStatus = latestNames.length === 1 ? 'recorded' : latestNames.length > 1 ? 'conflicting' : 'unavailable';
    const name = latestNames.length === 1 ? latestNames[0] : `Product ${product.productId}`;
    return {
      productId: product.productId, name, gmv: product.gmv, orders: product.orders, units,
      pctOfTotal: report.totalGmv > 0 ? product.gmv / report.totalGmv * 100 : 0,
      nameStatus, nameAsOf: latestDate || null,
      nameProvenance: { candidates, hasHistoricalAliases: new Set(candidates.map(candidate => candidate.name.trim())).size > 1 },
      topCreators: product.topCreators.slice().sort((a, b) => b.gmv - a.gmv || a.name.localeCompare(b.name)).slice(0, 3),
    };
  }).sort((a, b) => b.gmv - a.gmv || a.productId.localeCompare(b.productId));
  requireEqual(productGmv, evidence.productTotals.gmv, 'product GMV');
  requireEqual(productOrders, evidence.productTotals.orders, 'product orders');
  requireEqual(productRows, evidence.productTotals.sourceRows, 'product source rows');
  if (productIds.size !== evidence.productTotals.productIds || products.filter(product => product.gmv > 0).length !== evidence.productTotals.earningProductIds) throw new Error('Product population does not reconcile');
  if (completeProductUnits && evidence.productTotals.units !== null) requireEqual(productUnits, evidence.productTotals.units, 'product units');
  else if (evidence.productTotals.units !== null) throw new Error('Product unit total claims incomplete coverage');
  if (productGmv > report.totalGmv + 0.005) throw new Error('Product total exceeds the frozen whole-shop denominator');
  const videoIndex = new Map<string, RecoveredVideoUnits>();
  for (const video of evidence.videoUnits) {
    const key = `${video.scope}:${video.videoId}`;
    if (videoIndex.has(key) || !/^\d+$/.test(video.videoId)) throw new Error('Invalid or duplicate recovered video');
    videoIndex.set(key, video);
  }
  function withUnits<T extends { videoUrl: string | null; gmv: number; orders: number }>(video: T, scope: 'store' | 'managed') {
    const videoId = video.videoUrl?.match(/\/video\/(\d+)/)?.[1];
    const recovered = videoId ? videoIndex.get(`${scope}:${videoId}`) : undefined;
    if (!recovered) throw new Error('Missing unit evidence for a displayed video');
    requireEqual(recovered.gmv, video.gmv, `video ${videoId} GMV`);
    requireEqual(recovered.orders, video.orders, `video ${videoId} orders`);
    return { ...video, units: unitsWhenComplete(recovered) };
  }
  const topProducts = products.filter(product => product.gmv > 0).slice(0, 10).map(product => ({
    productId: product.productId, name: product.name, gmv: product.gmv, orders: product.orders, units: product.units,
    pctOfTotal: product.pctOfTotal, nameStatus: product.nameStatus, nameAsOf: product.nameAsOf, nameProvenance: product.nameProvenance,
  }));
  const productCreatorBreakdown = products.filter(product => product.gmv > 0).slice(0, 5).map(product => ({
    productId: product.productId, productName: product.name, productGmv: product.gmv, productOrders: product.orders,
    units: product.units, pctOfTotal: product.pctOfTotal, nameStatus: product.nameStatus, nameAsOf: product.nameAsOf,
    nameProvenance: product.nameProvenance, topCreators: product.topCreators,
  }));
  return {
    ...snapshot,
    report: {
      ...report,
      topVideo: report.topVideo ? withUnits(report.topVideo, 'store') : null,
      topVideos: report.topVideos.map(video => withUnits(video, 'store')),
      creatorsCorner: { ...report.creatorsCorner, topVideos: report.creatorsCorner.topVideos.map(video => withUnits(video, 'managed')) },
      topProducts, productCreatorBreakdown,
    },
    revisionEnrichment: {
      version: evidence.version, sourceReportId: evidence.sourceReportId, observedAt: evidence.observedAt,
      tenantId: evidence.tenantId, brandSlug: evidence.brandSlug, window: evidence.window,
      denominator: evidence.denominator, productTotals: evidence.productTotals, provenance: evidence.provenance,
      displayedProductNameGaps: topProducts.filter(product => product.nameStatus !== 'recorded').map(product => product.productId),
    },
  };
}
