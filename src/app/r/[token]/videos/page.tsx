import { notFound } from 'next/navigation';
import { getClientReportVideoLibrary } from '@/lib/data/client-report-videos';
import { filterReportVideos } from '@/lib/data/published-video-evidence-types';
import { VideoLibrary } from './video-library';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Published videos | Tempo',
  robots: { index: false, follow: false },
};

export default async function ReportVideosPage({ params, searchParams }: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ creator?: string | string[]; q?: string | string[]; sort?: string | string[]; page?: string | string[] }>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const library = await getClientReportVideoLibrary(token);
  if (!library) notFound();
  const creator = typeof query.creator === 'string' ? query.creator.slice(0, 200) : '';
  const search = typeof query.q === 'string' ? query.q.slice(0, 120) : '';
  const sort = typeof query.sort === 'string' && ['newest', 'oldest', 'creator'].includes(query.sort) ? query.sort : 'newest';
  const filtered = filterReportVideos(library, { creator, q: search }).sort((a, b) => {
    const order = sort === 'oldest' ? a.publishedAt.localeCompare(b.publishedAt)
      : sort === 'creator' ? a.creatorHandle.localeCompare(b.creatorHandle) : b.publishedAt.localeCompare(a.publishedAt);
    return order || a.videoId.localeCompare(b.videoId);
  });
  const requestedPage = typeof query.page === 'string' && /^\d+$/.test(query.page) ? Math.min(Number(query.page), 1_000_000) : 0;
  const page = Math.min(requestedPage, Math.max(0, Math.ceil(filtered.length / 25) - 1));
  // The complete packet stays on the server. Mobile viewers receive one page,
  // while CSV export applies the same filters to every saved record.
  const pagedLibrary = { ...library, evidence: library.evidence ? { ...library.evidence, videos: filtered.slice(page * 25, (page + 1) * 25) } : null };
  return <VideoLibrary library={pagedLibrary}
    recordedTotal={library.evidence?.videos.length ?? 0}
    filteredTotal={filtered.length}
    initialCreator={creator}
    initialQuery={search}
    initialSort={sort}
    initialPage={page}
  />;
}
