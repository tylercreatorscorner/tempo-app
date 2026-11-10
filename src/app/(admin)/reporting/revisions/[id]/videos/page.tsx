import { notFound } from 'next/navigation';
import { VideoLibrary } from '@/app/r/[token]/videos/video-library';
import { filterReportVideos } from '@/lib/data/published-video-evidence-types';
import { loadClientReportRevisionDraft, PrivateReportDraftError, privateReportDraftRoutes, privateReportDraftVideoLibrary } from '@/lib/data/client-report-revision-drafts';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata = { title: 'Private revision videos | Tempo', robots: { index: false, follow: false } };

export default async function PrivateReportRevisionVideosPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ creator?: string | string[]; q?: string | string[]; sort?: string | string[]; page?: string | string[] }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const draft = await loadClientReportRevisionDraft(id).catch(error => {
    if (error instanceof PrivateReportDraftError && error.status < 500) notFound();
    throw error;
  });
  const library = privateReportDraftVideoLibrary(draft);
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
  return <VideoLibrary privateRevision routes={privateReportDraftRoutes(draft.id)}
    library={{ ...library, evidence: library.evidence ? { ...library.evidence, videos: filtered.slice(page * 25, (page + 1) * 25) } : null }}
    recordedTotal={library.evidence?.videos.length ?? 0} filteredTotal={filtered.length}
    initialCreator={creator} initialQuery={search} initialSort={sort} initialPage={page} />;
}
