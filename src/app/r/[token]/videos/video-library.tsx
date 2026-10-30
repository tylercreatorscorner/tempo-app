'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, X, Download } from 'lucide-react';
import { ChoiceMenu } from '@/components/ui/choice-menu';
import { InterfaceIcon } from '@/components/ui/interface-icon';
import { type PublishedVideoEvidenceItem, type ReportVideoLibrary } from '@/lib/data/published-video-evidence-types';

const PAGE_SIZE = 25;
type VideoSort = 'newest' | 'oldest' | 'creator';
const number = (value: number) => value.toLocaleString('en-US');

function dateLabel(value: string): string {
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return 'Date unavailable';
  const date = new Date(`${day}T12:00:00Z`);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'Date unavailable';
}

export function evidenceWatchUrl(video: PublishedVideoEvidenceItem): string | null {
  if (!video.watchUrl) return null;
  try {
    const url = new URL(video.watchUrl);
    const pathname = url.pathname.replace(/\/$/, '');
    const identity = /^\/@[A-Za-z0-9._]+\/(?:video|photo)\/(\d+)$/.exec(pathname);
    return url.protocol === 'https:' && !url.port && !url.username && !url.password
      && ['www.tiktok.com', 'tiktok.com', 'm.tiktok.com'].includes(url.hostname)
      && identity?.[1] === video.videoId ? `https://www.tiktok.com${pathname}` : null;
  } catch { return null; }
}

export function VideoLibrary({ library, recordedTotal, filteredTotal, initialCreator = '', initialQuery = '', initialSort = 'newest', initialPage = 0 }: {
  library: ReportVideoLibrary;
  recordedTotal: number;
  filteredTotal: number;
  initialCreator?: string;
  initialQuery?: string;
  initialSort?: string;
  initialPage?: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(initialQuery);
  const [syncedQuery, setSyncedQuery] = useState(initialQuery);
  const [lastRequestedQuery, setLastRequestedQuery] = useState(initialQuery);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigationSequence = useRef(0);
  const creatorKey = initialCreator;
  const sort: VideoSort = ['newest', 'oldest', 'creator'].includes(initialSort) ? initialSort as VideoSort : 'newest';
  if (syncedQuery !== initialQuery) {
    setSyncedQuery(initialQuery);
    // Preserve typing that happened while an earlier navigation was in flight.
    if (query === lastRequestedQuery) {
      setQuery(initialQuery);
      setLastRequestedQuery(initialQuery);
    }
  }
  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);
  const creator = library.creators.find(row => row.key === creatorKey);
  const available = library.basis !== 'unavailable' && library.evidence !== null;
  const pages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));
  const safePage = Math.min(initialPage, pages - 1);
  const visible = library.evidence?.videos ?? [];
  const csvParams = new URLSearchParams();
  if (creatorKey) csvParams.set('creator', creatorKey);
  if (initialQuery.trim()) csvParams.set('q', initialQuery.trim());
  const csvHref = `/api/report-videos/${encodeURIComponent(library.token)}${csvParams.size ? `?${csvParams}` : ''}`;

  function updateUrl(next: { creator?: string; q?: string; sort?: string; page?: number }) {
    navigationSequence.current += 1;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const params = new URLSearchParams();
    const nextCreator = next.creator ?? creatorKey;
    const nextQuery = next.q ?? query;
    const nextSort = next.sort ?? sort;
    const nextPage = next.page ?? 0;
    if (nextCreator) params.set('creator', nextCreator);
    if (nextQuery.trim()) params.set('q', nextQuery.trim());
    if (nextSort !== 'newest') params.set('sort', nextSort);
    if (nextPage > 0) params.set('page', String(nextPage));
    setLastRequestedQuery(nextQuery);
    startTransition(() => router.replace(`/r/${encodeURIComponent(library.token)}/videos${params.size ? `?${params}` : ''}`, { scroll: false }));
  }

  function changeSearch(value: string) {
    setQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const sequence = ++navigationSequence.current;
    searchTimer.current = setTimeout(() => {
      if (sequence === navigationSequence.current) updateUrl({ q: value });
    }, 300);
  }

  const creators = [...library.creators].sort((a, b) => a.name.localeCompare(b.name));
  const creatorOptions = [{ value: '', label: 'All creators' },
    ...(creatorKey && !creator ? [{ value: creatorKey, label: 'Creator unavailable', disabled: true }] : []),
    ...creators.map(row => ({ value: row.key, label: row.name }))];

  return <main className="min-h-screen bg-[#fbfbfd] px-4 py-6 text-[#171a33] sm:px-8 sm:py-9">
    <div className="mx-auto max-w-5xl space-y-5">
      <Link href={`/r/${encodeURIComponent(library.token)}#creators`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6b7093] hover:text-[#4b45ff]"><InterfaceIcon name="back" className="size-3.5"/>Back to report</Link>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-[11px] font-semibold uppercase tracking-wider text-[#8a8fb0]">{library.brandName}</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Published videos</h1><p className="mt-1 text-sm text-[#6b7093]">{library.periodLabel}</p></div>
        {available && <a href={csvHref} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#e7e7f2] bg-white px-3 py-2 text-xs font-semibold text-[#4b45ff] hover:bg-[#f6f6fb]"><Download className="size-3.5" aria-hidden="true"/>Download filtered CSV</a>}
      </header>

      <section className={`rounded-xl border px-4 py-3 ${library.basis === 'reconstructed' ? 'border-amber-200 bg-amber-50/60' : 'border-[#e7e7f2] bg-[#f1f0f8]'}`} aria-label="Video record basis">
        <p className="text-xs font-semibold">{library.basis === 'frozen' ? 'Captured with this report' : library.basis === 'reconstructed' ? 'Reconstructed video list' : 'Video list unavailable'}</p>
        <p className="mt-1 text-xs leading-relaxed text-[#6b7093]">{library.basis === 'frozen'
          ? `These video records were saved with the report on ${library.evidence ? dateLabel(library.evidence.capturedAt) : 'its preparation date'}. Later uploads do not change this list.`
          : library.basis === 'reconstructed' ? `This list uses currently saved video records and the report’s saved creators${library.evidence ? `, retrieved ${dateLabel(library.evidence.capturedAt)}` : ''}. It may differ from the report as sent. The original report numbers have not changed.`
            : library.unavailableReason || 'The report remains available, but its supporting video records could not be loaded. Please ask your Creators Corner contact to review it.'}</p>
        {available && <p className="mt-1 text-xs leading-relaxed text-[#6b7093]">{library.evidence ? `${dateLabel(library.evidence.periodStart)} to ${dateLabel(library.evidence.periodEnd)}. ` : ''}All recorded published videos from managed creators, counted once per video ID, including videos with no sales. Missing source data can leave gaps. Contract deliverables and approved credits from earlier periods are separate.</p>}
      </section>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[#e7e7f2] bg-[#e7e7f2]">
        <div className="bg-white px-4 py-3"><p className="text-[11px] text-[#6b7093]">Published count in report as sent</p><p className="mt-1 text-xl font-semibold tabular-nums">{library.reportCount === null ? 'Not recorded' : number(library.reportCount)}</p></div>
        <div className="bg-white px-4 py-3"><p className="text-[11px] text-[#6b7093]">{library.basis === 'reconstructed' ? 'Currently recorded video records' : 'Video records captured'}</p><p className="mt-1 text-xl font-semibold tabular-nums">{available ? number(recordedTotal) : 'Unavailable'}</p></div>
      </div>

      {available && <section className="overflow-hidden rounded-xl border border-[#e7e7f2] bg-white" aria-label="Published video library" aria-busy={isPending || query.trim() !== initialQuery.trim()}>
        <div className="flex flex-wrap items-center gap-2 border-b border-[#eeedf5] p-3">
          <div className="relative min-w-[180px] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#8a8fb0]" aria-hidden="true"/><input type="search" aria-label="Search published videos" placeholder="Search title, handle or video ID" maxLength={120} value={query}
            onChange={event => changeSearch(event.target.value)}
            className="h-9 w-full rounded-lg border border-[#e7e7f2] bg-[#fbfbfd] pl-9 pr-9 text-xs outline-none focus:border-[#8f87cf] focus:ring-2 focus:ring-[#f0eefb]"/>
            {query && <button type="button" aria-label="Clear video search" onClick={() => { setQuery(''); updateUrl({ q: '' }); }} className="absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-[#8a8fb0] hover:bg-[#eeedf5]"><X className="size-3.5"/></button>}
          </div>
          <ChoiceMenu compact label="Filter videos by creator" value={creatorKey} options={creatorOptions} disabled={isPending} onChange={key => updateUrl({ creator: key })} triggerClassName="max-w-full sm:max-w-[230px]"/>
          <ChoiceMenu compact label="Sort published videos" value={sort} options={[{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }, { value: 'creator', label: 'Creator handle' }]} disabled={isPending} onChange={value => updateUrl({ sort: value })}/>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eeedf5] px-4 py-2 text-[11px] text-[#6b7093]" aria-live="polite">
          <span>{isPending || query.trim() !== initialQuery.trim() ? 'Updating video list…' : <>{number(filteredTotal)} {filteredTotal === 1 ? 'video' : 'videos'}{creator ? ` for ${creator.name}` : ''}{initialQuery.trim() ? ' matching your search' : ''}</>}</span>
          {(creatorKey || query) && <button type="button" className="font-semibold text-[#4b45ff] hover:underline" onClick={() => { setQuery(''); updateUrl({ creator: '', q: '' }); }}>Clear filters</button>}
        </div>
        {visible.length === 0 ? <div className="px-4 py-10 text-center"><p className="text-sm font-medium">{creatorKey && !creator ? 'This creator is not available in the report.' : 'No recorded videos match these filters.'}</p><p className="mt-1 text-xs text-[#6b7093]">{creatorKey && !creator ? 'Choose a saved creator or clear the filter.' : 'Try another creator or search. A missing record is not proof that a video was never published.'}</p></div>
          : <ul className="divide-y divide-[#eeedf5]">{visible.map(video => {
            const href = evidenceWatchUrl(video);
            return <li key={video.videoId} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1"><p className="break-words text-[13px] font-semibold leading-snug">{video.title || `Video ${video.videoId}`}</p><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#6b7093]"><span>{/^[a-zA-Z0-9._]+$/.test(video.creatorHandle) ? `@${video.creatorHandle}` : 'Account unavailable'}</span><time dateTime={video.publishedAt}>{dateLabel(video.publishedAt)}</time><span className="break-all text-[#8a8fb0]">ID {video.videoId}</span></div></div>
              {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 self-start rounded-lg border border-[#e7e7f2] px-3 py-1.5 text-xs font-semibold text-[#4b45ff] hover:bg-[#f6f6fb] sm:self-auto">Open TikTok<InterfaceIcon name="external" className="size-3.5"/><span className="sr-only"> for video {video.videoId} (new tab)</span></a>
                : <span className="text-xs text-[#8a8fb0]">Video link unavailable</span>}
            </li>;
          })}</ul>}
        {pages > 1 && <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eeedf5] px-4 py-2.5 text-xs text-[#6b7093]"><span>{number(safePage * PAGE_SIZE + 1)}–{number(Math.min((safePage + 1) * PAGE_SIZE, filteredTotal))} of {number(filteredTotal)}</span><div className="flex items-center gap-2"><button type="button" disabled={isPending || safePage === 0} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-[#e7e7f2] px-2.5 py-1 font-semibold text-[#4b45ff] disabled:opacity-40" onClick={() => updateUrl({ page: safePage - 1 })}><InterfaceIcon name="back" className="size-3"/>Previous</button><span>{safePage + 1} / {pages}</span><button type="button" disabled={isPending || safePage === pages - 1} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-[#e7e7f2] px-2.5 py-1 font-semibold text-[#4b45ff] disabled:opacity-40" onClick={() => updateUrl({ page: safePage + 1 })}>Next<InterfaceIcon name="forward" className="size-3"/></button></div></footer>}
      </section>}
    </div>
  </main>;
}
