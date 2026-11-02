import { InterfaceIcon } from '@/components/ui/interface-icon';
import Link from 'next/link';
import { VideoThumbnail } from './video-thumbnail';
import { formatCurrency } from '@/lib/utils/format';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import styles from './dashboard-drivers.module.css';

export interface TopVideoRow {
  title: string;
  url: string;
  handle: string;
  brand: string;
  gmv: number;
  /** Engagement is windowed and displayed only when supplied. */
  views?: number | null;
  orders?: number | null;
  units?: number | null;
  publishedAt?: string | null;
}

function VideoCard({ video }: { video: TopVideoRow }) {
  const commerce = [
    video.orders != null ? `${video.orders.toLocaleString('en-US')} orders` : '',
    video.units != null ? `${video.units.toLocaleString('en-US')} units` : '',
    video.views != null && video.views > 0 ? `${video.views.toLocaleString('en-US')} views` : '',
  ].filter(Boolean).join(' · ');
  const published = video.publishedAt ? new Date(`${video.publishedAt.slice(0, 10)}T12:00:00Z`) : null;
  const publication = published && !Number.isNaN(published.getTime())
    ? published.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    : null;
  return <a href={video.url} target="_blank" rel="noopener noreferrer" className={styles.videoCard}>
    <span className={styles.poster}><VideoThumbnail url={video.url} /></span>
    <span className={styles.videoDetails}>
      <strong className={styles.videoTitle}>{video.title || `@${video.handle}`}</strong>
      <span className={styles.videoCreator}>@{video.handle} · {video.brand}</span>
      <strong className={styles.videoGmv}>{formatCurrency(video.gmv)} <span>GMV</span></strong>
      {commerce && <span className={styles.videoMeta}>{commerce}</span>}
      {publication && <span className={styles.videoMeta}>Published {publication}</span>}
      <span className={styles.openVideo}>Open video <InterfaceIcon name="external" /></span>
    </span>
  </a>;
}

/** Rankings use GMV earned during the selected sales period, not lifetime GMV. */
export function TopVideos({ videos, label, failed = false, brand, start, end }: { videos: TopVideoRow[]; label: string; failed?: boolean; brand?: string | null; start?: string; end?: string }) {
  const params = new URLSearchParams();
  if (brand) params.set('brand', brand);
  if (start && end) { params.set('range', 'custom'); params.set('start', start); params.set('end', end); }
  return <Card className={`${styles.panel} ${styles.videos}`}>
    <CardHeader className={styles.header}>
      <CardTitle className={styles.title}>Top-performing content</CardTitle>
      <Link href={`/posts${params.size ? `?${params}` : ''}`} className={styles.headerLink}>View all <InterfaceIcon name="forward" /></Link>
    </CardHeader>
    {failed ? <p className={styles.empty}>Video performance could not be loaded. The selected period has not been confirmed empty.</p>
      : videos.length === 0 ? <p className={styles.empty}>No managed videos in this period.</p>
      : <>
        <div className={styles.videoCards}>{videos.slice(0, 2).map((video, index) => <VideoCard key={`${video.url}-${index}`} video={video} />)}</div>
        {videos.length > 2 && <details className={styles.more}><summary>Show {videos.length - 2} more videos</summary><div className={styles.videoCards}>{videos.slice(2).map((video, index) => <VideoCard key={`${video.url}-${index}`} video={video} />)}</div></details>}
      </>}
    <p className={styles.footnote}>GMV earned in the {label} selected period. Older posts can still generate sales.</p>
  </Card>;
}
