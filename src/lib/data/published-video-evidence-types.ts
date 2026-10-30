/** Minimal public evidence. No compensation, private contact or source-file fields. */
export interface PublishedVideoEvidenceItem {
  videoId: string;
  creatorHandle: string;
  qualifyingHandles: string[];
  publishedAt: string;
  watchUrl: string | null;
  title: string | null;
}

export interface PublishedVideoEvidence {
  v: 1;
  capturedAt: string;
  periodStart: string;
  periodEnd: string;
  scope: 'managed-published';
  total: number;
  videos: PublishedVideoEvidenceItem[];
}

export interface ReportVideoLibrary {
  token: string;
  /** Operator preview navigation must not count as a client report view. */
  preview?: boolean;
  brandName: string;
  periodLabel: string;
  reportCount: number | null;
  basis: 'frozen' | 'reconstructed' | 'unavailable';
  evidence: PublishedVideoEvidence | null;
  creators: { key: string; name: string; handles: string[] }[];
  unavailableReason?: string;
}

export function normalizeReportVideoHandle(value: string | null | undefined): string {
  const handle = (value ?? '').trim().replace(/^@+/, '').toLowerCase();
  return /^[a-z0-9._]+$/.test(handle) ? handle : '';
}

export function reportVideoCreatorKey(creator: { creatorId?: string | null; handle?: string | null; handles?: string[] }): string | null {
  if (typeof creator.creatorId === 'string' && creator.creatorId) return `id:${creator.creatorId}`;
  const aliases = (Array.isArray(creator.handles) ? creator.handles : []).filter(value => typeof value === 'string');
  const handle = [typeof creator.handle === 'string' ? creator.handle : null, ...aliases].map(normalizeReportVideoHandle).find(Boolean);
  return handle ? `handle:${handle}` : null;
}

/** Shared by the client list and complete CSV so their filtered sets agree. */
export function filterReportVideos(library: ReportVideoLibrary, filters: { creator?: string; q?: string }): PublishedVideoEvidenceItem[] {
  const creator = filters.creator ? library.creators.find(row => row.key === filters.creator) : null;
  if (filters.creator && !creator) return [];
  const handles = creator ? new Set(creator.handles) : null;
  const query = (filters.q ?? '').trim().slice(0, 120).toLowerCase();
  return (library.evidence?.videos ?? []).filter(video =>
    (!handles || video.qualifyingHandles.some(handle => handles.has(handle)))
    && (!query || [video.videoId, video.creatorHandle, ...video.qualifyingHandles,
      ...video.qualifyingHandles.map(handle => `@${handle}`), video.title ?? '']
      .some(value => value.toLowerCase().includes(query))),
  );
}
