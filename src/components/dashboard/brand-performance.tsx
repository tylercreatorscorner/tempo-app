import Link from 'next/link';
import { BrandIdentity } from '@/components/creators/brand-identity';
import { formatCurrency } from '@/lib/utils/format';
import { getBrandRegistry, brandLabel, brandColor } from '@/lib/data/brand-registry';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { BrandSparkline } from '@/components/dashboard/brand-sparkline';
import styles from './brand-performance.module.css';

export interface BrandRowData {
  slug: string;
  currentGmv: number;
  /** Selected-period GMV from managed creators. */
  managedGmv: number;
  prevGmv: number;
  prevManagedGmv: number;
  /** Undefined when either period lacks comparable coverage. */
  trend: number | undefined;
  managedTrend: number | undefined;
  /** Current creator commitments. Null for a finance-hidden viewer. */
  retainer: number | null;
  roi?: number;
  series?: number[];
  days?: string[];
  /** Recorded publications, only from the canonical publication counter. */
  publishedVideos?: number | null;
  publishedComplete?: boolean;
}

interface Props {
  brands: BrandRowData[];
  range?: string;
  start?: string;
  end?: string;
  periodLength?: number;
}

function HeadCell({ label, tip }: { label: string; tip: string }) {
  return <InfoTooltip label={tip}><button type="button" className={styles.headLabel}>{label}</button></InfoTooltip>;
}

function Delta({ value }: { value: number | undefined }) {
  if (value === undefined) return <span className={styles.unavailable}>Comparison unavailable</span>;
  return <span className={value >= 0 ? styles.positive : styles.negative}>
    {value >= 0 ? '+' : '−'}{Math.abs(value) < 1 ? Math.abs(value).toFixed(1) : Math.round(Math.abs(value))}%
  </span>;
}

/** Compact, scoped brand comparison. Missing coverage is never replaced by zero. */
export async function BrandPerformance({ brands, range, start, end, periodLength }: Props) {
  if (brands.length === 0) return null;
  const reg = await getBrandRegistry();
  const rows = [...brands].sort((a, b) => b.managedGmv - a.managedGmv || b.currentGmv - a.currentGmv);
  const sparkLabel = periodLength ? `${periodLength}-day trend` : 'Period trend';
  function hrefFor(slug: string) {
    const params = new URLSearchParams({ brand: slug });
    if (range) params.set('range', range);
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    return `/dashboard?${params.toString()}`;
  }
  return <Card className={styles.section}>
    <CardHeader className={styles.header}>
      <CardTitle className={styles.title}>Brand performance</CardTitle>
      <span className={styles.context}>{rows.length} authorized {rows.length === 1 ? 'brand' : 'brands'} · Ranked by managed GMV</span>
    </CardHeader>
    <div className={styles.tableRegion} role="region" aria-label="Brand performance metrics" tabIndex={0}>
      <div className={styles.table}>
        <div className={styles.columns}>
          <span>Brand</span>
          <HeadCell label="Total GMV / change" tip="Total affiliate GMV for this brand in the selected period. Changes require comparable coverage in both periods." />
          <HeadCell label="Managed / change" tip="GMV from your managed creators in the selected period, compared with the prior period of equal length." />
          <HeadCell label="Managed share" tip="Managed creator GMV divided by this brand's total affiliate GMV." />
          <span>{sparkLabel}</span>
          <HeadCell label="Videos published" tip="Managed creators' publications within the selected dates. Recorded counts remain labeled when coverage is incomplete." />
          <HeadCell label="Creator commitments" tip="Current monthly creator retainer commitments, with the trailing-30-day managed GMV-to-fee multiple. These are not historical payments, selected-period spend, or profit ROI." />
        </div>
        {rows.map(b => {
          const name = brandLabel(reg, b.slug);
          const managedPct = b.currentGmv > 0 ? (b.managedGmv / b.currentGmv) * 100 : null;
          return <Link key={b.slug} href={hrefFor(b.slug)} className={styles.row}>
            <span className={styles.identity}><BrandIdentity brand={b.slug} label={name} /></span>
            <span className={styles.result}>
              <span className={styles.mobileLabel}>Total GMV</span>
              <strong>{formatCurrency(b.currentGmv)}</strong><small><Delta value={b.trend} /></small>
            </span>
            <span className={styles.result}>
              <span className={styles.mobileLabel}>Managed GMV</span>
              <strong>{formatCurrency(b.managedGmv)}</strong><small><Delta value={b.managedTrend} /></small>
            </span>
            <span className={styles.value}>
              <span className={styles.mobileLabel}>Managed share</span>
              {managedPct !== null ? `${managedPct.toFixed(1)}%` : 'Unavailable'}
            </span>
            <span className={styles.spark}>
              <span className={styles.mobileLabel}>{sparkLabel}</span>
              <BrandSparkline data={b.series} days={b.days} color={brandColor(reg, b.slug)} />
            </span>
            <span className={styles.result}>
              <span className={styles.mobileLabel}>Videos published</span>
              <strong>{b.publishedVideos != null ? b.publishedVideos.toLocaleString('en-US') : 'Unavailable'}</strong>
              {b.publishedVideos != null && b.publishedComplete === false && <small>Recorded · incomplete coverage</small>}
            </span>
            <span className={styles.result}>
              <span className={styles.mobileLabel}>Creator commitments</span>
              <strong>{b.retainer != null && b.retainer > 0 ? formatCurrency(b.retainer) : '—'}</strong>
              {b.roi != null && b.roi > 0 && <small>{b.roi.toFixed(1)}× 30d GMV / fee</small>}
            </span>
          </Link>;
        })}
      </div>
    </div>
    <p className={styles.footnote}>Open a brand to review its dashboard in the same reporting period. Commitments reflect current terms.</p>
  </Card>;
}
