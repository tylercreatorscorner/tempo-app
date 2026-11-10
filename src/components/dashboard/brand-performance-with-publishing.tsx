import 'server-only';
import type { ComponentProps } from 'react';
import { BrandPerformance } from './brand-performance';
import type { PublishedVideoCounts } from '@/lib/data/published-videos';

/** One publication request feeds both the KPI and the per-brand evidence. */
export async function BrandPerformanceWithPublishing({ counts, ...props }: ComponentProps<typeof BrandPerformance> & {
  counts: Promise<PublishedVideoCounts | null>;
}) {
  const published = await counts;
  const bySlug = new Map(published?.brands.map(row => [row.slug, row]));
  return <BrandPerformance {...props} brands={props.brands.map(row => {
    const publication = bySlug.get(row.slug);
    return {
      ...row,
      publishedVideos: publication?.count ?? null,
      publishedComplete: publication?.currentComplete ?? false,
    };
  })} />;
}
