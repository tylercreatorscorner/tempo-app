import { Sparkles } from 'lucide-react';
import { getDashboardVideos } from '@/lib/data/video-sections';
import { VideoSection } from './video-section';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Props {
  brandFilter: string | null;
  startDate: string;
  endDate: string;
}

/**
 * Async wrapper around the dashboard's video grid — kept as its own component
 * so the page can `<Suspense>` it and stream the rest of the dashboard above
 * while video data is still in flight.
 *
 * Combines the three legacy buckets (Hot Now / Rising / Top Performers) into
 * a single "Today's Standouts" section. The deeper sortable view lives at
 * /posts; the dashboard is just a curated taster.
 */
export async function TodaysStandouts({ brandFilter, startDate, endDate }: Props) {
  const sections = await getDashboardVideos(brandFilter, startDate, endDate);

  // Merge buckets, dedupe by video_id, prefer hot-now > rising > top-performers ordering.
  const seen = new Set<string>();
  const merged: typeof sections.hotNow = [];
  for (const v of [...sections.hotNow, ...sections.rising, ...sections.topPerformers]) {
    if (seen.has(v.video_id)) continue;
    seen.add(v.video_id);
    merged.push(v);
  }
  // Cap at 8 — enough variety, doesn't dominate the page.
  const videos = merged.slice(0, 8);

  return (
    <VideoSection
      emoji="✨"
      title="Today's Standouts"
      description="Top-performing posts in the selected period"
      videos={videos}
      defaultExpanded={false}
    />
  );
}

export function TodaysStandoutsSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Sparkles className="h-4 w-4" />
          </span>
          <CardTitle>Today&apos;s Standouts</CardTitle>
          <Badge variant="neutral" className="animate-pulse">loading</Badge>
        </div>
      </CardHeader>
    </Card>
  );
}
