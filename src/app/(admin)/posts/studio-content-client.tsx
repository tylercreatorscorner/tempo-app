'use client';

import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Dialog, Popover } from 'radix-ui';
import { Check, ChevronDown, Download, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import { useNavigationPending } from '@/components/layout/navigation-pending';
import { BrandFilter } from '@/components/creators/brand-filter';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { VideoThumbnail } from '@/components/dashboard/video-thumbnail';
import { SearchInput } from '@/components/ui/search-input';
import { ChoiceMenu } from '@/components/ui/choice-menu';
import { ContentInspector, ContentPreview } from '@/components/posts/studio-content-inspector';
import { formatCurrency, formatNumber, resolveWatchUrl } from '@/lib/utils/format';
import { CONTENT_AGE_OPTIONS, CONTENT_REVIEW_OPTIONS, CONTENT_SORT_OPTIONS, normalizeContentQuery,
  filterContentPosts, summarizeContent, contentCsv, contentPostKey, postAgeDays,
  type ContentPost, type ContentQuery, type ContentResponse } from '@/lib/posts/studio-content';
import styles from './studio-content.module.css';
import { requestContentLibrary } from '@/lib/posts/client-interactions';

type Scope = { brand: string | null; start: string; end: string; managed: boolean; basis: 'earned' | 'posted' };
type Loaded = { key: string; scope: Scope; data: ContentResponse };
type Request = { key: string; pending: boolean; error: string | null };

function date(value: string) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
const defaults: ContentQuery = { q: '', creator: '', age: 'all', review: 'all', sort: 'gmv', dir: 'desc', tag: '', metrics: 'sales' };
const CHUNK = 40;

export function StudioContentClient({ brands, selectedBrand, startDate, endDate, managedOnly, staleThrough, canViewRoster }: {
  brands: string[]; selectedBrand: string | null; startDate: string; endDate: string;
  managedOnly: boolean; staleThrough?: string | null; canViewRoster: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const brandMeta = useBrandMeta();
  const navigation = useNavigationPending();
  const filterParams = JSON.stringify(Object.fromEntries(Object.keys(defaults).map(name => [name, params.get(name)])));
  const urlQuery = useMemo(() => normalizeContentQuery(JSON.parse(filterParams) as Record<string, string | null>), [filterParams]);
  const [query, setQuery] = useOptimistic(urlQuery);
  const [selectedKey, setSelectedKey] = useOptimistic(params.get('selected'));
  const [, startLocalTransition] = useTransition();
  const basis = params.get('basis') === 'posted' ? 'posted' : 'earned';
  const key = `${selectedBrand ?? 'all'}|${startDate}|${endDate}|${managedOnly}|${basis}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [request, setRequest] = useState<Request>({ key: '', pending: true, error: null });
  const [attempt, setAttempt] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [exportNotice, setExportNotice] = useState('');
  const mobileOpener = useRef<HTMLButtonElement | null>(null);
  const inspectorElement = useRef<HTMLElement>(null);
  const mobileInspectorElement = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const requestPending = request.key !== `${key}|${attempt}` || request.pending;
  const error = request.key === `${key}|${attempt}` ? request.error : null;
  const stale = loaded !== null && loaded.key !== key;
  const updating = navigation.isPending || requestPending || stale;
  const data = loaded?.data ?? null;
  const shownStart = loaded?.scope.start ?? startDate;
  const shownEnd = loaded?.scope.end ?? endDate;
  const shownBrand = loaded?.scope.brand ?? null;
  const shownBasis = loaded?.scope.basis ?? basis;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const requestKey = `${key}|${attempt}`;
    const scope: Scope = { brand: selectedBrand, start: startDate, end: endDate, managed: managedOnly, basis };
    const api = new URLSearchParams({ start: startDate, end: endDate });
    if (selectedBrand) api.set('brand', selectedBrand);
    if (!managedOnly) api.set('managed', 'false');
    if (basis === 'posted') api.set('basis', 'posted');
    requestContentLibrary(`/api/posts?${api}`, controller.signal)
      .then(body => {
        if (active) {
          setLoaded({ key, scope, data: body as ContentResponse });
          setRequest({ key: requestKey, pending: false, error: null });
        }
      })
      .catch(error => { if (active && !controller.signal.aborted) setRequest({ key: requestKey, pending: false, error: error instanceof Error ? error.message : 'Content could not be loaded. Please try again.' }); });
    return () => { active = false; controller.abort(); };
  }, [key, selectedBrand, startDate, endDate, managedOnly, basis, attempt]);

  const rows = useMemo(() => filterContentPosts(data?.posts ?? [], query, shownEnd), [data, query, shownEnd]);
  const totals = useMemo(() => summarizeContent(rows), [rows]);
  const selected = rows.find(post => contentPostKey(post) === selectedKey) ?? rows[0] ?? null;
  const selectionKey = selected ? contentPostKey(selected) : '';
  const creators = useMemo(() => [...new Set((data?.posts ?? []).map(post => post.creator_handle.replace(/^@/, '').toLowerCase()).filter(Boolean))].sort(), [data]);
  const tags = useMemo(() => [...new Set((data?.posts ?? []).filter(post => post.creator_context_status === 'ready').flatMap(post => post.creator_tags ?? []).map(tag => tag.toLowerCase()))].sort(), [data]);
  const contextIncomplete = canViewRoster && (data?.posts.some(post => post.creator_context_status !== 'ready') ?? false);
  const listKey = `${key}|${query.q}|${query.creator}|${query.age}|${query.tag}|${query.review}|${query.sort}|${query.dir}`;
  const [previousList, setPreviousList] = useState(listKey);
  if (listKey !== previousList) { setPreviousList(listKey); setPage(1); }
  const rendered = rows.slice(0, CHUNK * page);
  const filtered = Boolean(query.q || query.creator || query.tag || query.age !== 'all' || query.review !== 'all' || managedOnly || basis === 'posted');

  function setLocal(patch: Partial<ContentQuery> & { selected?: string }) {
    if (navigation.isPending) return;
    const url = new URLSearchParams(window.location.search);
    // Preserve controls already changed by a fast preceding interaction, even
    // before Next has committed the new search-param context to this render.
    for (const name of Object.keys(patch) as (keyof ContentQuery | 'selected')[]) {
      const value = patch[name];
      if (value === undefined) continue;
      if (name !== 'selected' && value === defaults[name]) url.delete(name); else url.set(name, value);
    }
    const nextQuery = normalizeContentQuery(url);
    // Optimistic controls settle onto the URL base after either native local
    // filtering or a server navigation, without a separate sync effect.
    startLocalTransition(() => {
      if (Object.keys(patch).some(name => name !== 'selected')) setQuery(nextQuery);
      if (patch.selected !== undefined) setSelectedKey(patch.selected);
      // Next copies its internal state and notifies useSearchParams itself.
      window.history.replaceState(null, '', `${pathname}${url.size ? `?${url}` : ''}`);
    });
    setExportNotice('');
  }
  function setServer(name: 'managed' | 'basis', value: string) {
    if (navigation.isPending) return;
    const url = new URLSearchParams(window.location.search);
    if (value) url.set(name, value); else url.delete(name);
    navigation.startNav(() => router.push(`${pathname}${url.size ? `?${url}` : ''}`, { scroll: false }));
  }
  function reviewHref(post: ContentPost | null) {
    return post ? `/posts/${encodeURIComponent(post.video_id)}?${new URLSearchParams({ brand: post.brand_slug, start: shownStart, end: shownEnd })}` : '/posts';
  }
  function select(post: ContentPost, opener: HTMLButtonElement) {
    if (navigation.isPending) return;
    setLocal({ selected: contentPostKey(post) });
    if (!inspectorElement.current || window.getComputedStyle(inspectorElement.current).display === 'none') { mobileOpener.current = opener; setMobileOpen(true); }
  }
  function returnPreviewFocus() {
    const inspector = mobileOpen ? mobileInspectorElement.current : inspectorElement.current;
    const trigger = inspector?.querySelector<HTMLButtonElement>('[data-content-preview-trigger]');
    if (!trigger || trigger.disabled) return false;
    trigger.focus({ preventScroll: true });
    return true;
  }
  function exportLinks() {
    if (!data || !rows.length || updating) return;
    const blob = new Blob(['\uFEFF', contentCsv(rows, shownStart, shownEnd)], { type: 'text/csv;charset=utf-8;' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `tempo-video-links-${shownStart}-to-${shownEnd}${data.capped ? '-loaded-subset' : ''}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    setExportNotice(`Exported ${formatNumber(rows.length)} video/brand rows${data.capped ? ' from the loaded subset' : ''}.`);
  }
  function resetFilters() {
    if (navigation.isPending) return;
    if (!managedOnly && basis === 'earned') { setLocal({ q: '', creator: '', age: 'all', tag: '', review: 'all' }); return; }
    const url = new URLSearchParams(window.location.search);
    for (const name of ['q', 'creator', 'age', 'tag', 'review', 'managed', 'basis']) url.delete(name);
    navigation.startNav(() => router.push(`${pathname}${url.size ? `?${url}` : ''}`, { scroll: false }));
    setExportNotice('');
  }
  const sortOptions = CONTENT_SORT_OPTIONS.flatMap(option => [
    { value: `${option.value}:desc`, label: `${option.label} · ${option.value === 'post_date' ? 'Newest first' : option.value === 'post_age' ? 'Oldest first' : 'High to low'}` },
    { value: `${option.value}:asc`, label: `${option.label} · ${option.value === 'post_date' ? 'Oldest first' : option.value === 'post_age' ? 'Newest first' : 'Low to high'}` },
  ]);
  const selectedIndex = selected ? rows.findIndex(post => contentPostKey(post) === selectionKey) : -1;

  const filterFields = <>
    <label className={styles.filterField}><span>Creator scope</span><ChoiceMenu compact label="Creator scope" value={managedOnly ? 'managed' : 'all'} disabled={updating} options={[{ value: 'all', label: 'All creators' }, { value: 'managed', label: 'Managed creators' }]} onChange={value => setServer('managed', value === 'managed' ? 'true' : '')} /></label>
    <label className={styles.filterField}><span>Date basis</span><ChoiceMenu compact label="Date basis" value={basis} disabled={updating} options={[{ value: 'earned', label: 'Sales in period', description: 'Any publication date' }, { value: 'posted', label: 'Published in period', description: 'Sales remain limited to the selected period' }]} onChange={value => setServer('basis', value === 'posted' ? 'posted' : '')} /></label>
    <label className={styles.filterField}><span>Review status</span><ChoiceMenu compact label="Review status" value={query.review} disabled={navigation.isPending} options={[...CONTENT_REVIEW_OPTIONS]} onChange={value => setLocal({ review: value as ContentQuery['review'] })} /></label>
    <label className={styles.filterField}><span>Metrics shown</span><ChoiceMenu compact label="Metrics shown" value={query.metrics} disabled={navigation.isPending} options={[{ value: 'sales', label: 'Sales' }, { value: 'engagement', label: 'Engagement' }]} onChange={value => setLocal({ metrics: value as ContentQuery['metrics'] })} /></label>
  </>;

  return <div className={styles.page}>
    <header className={styles.heading}>
      <div className={styles.title}><h1>Content</h1><p>Find what your creators publish, what earns sales, and the evidence behind delivery.</p></div>
      <div className={styles.scopeControls}>
        <BrandFilter appearance="studio" compact label="Content brand" brands={brands} brandsWithData={brands} selectedBrand={selectedBrand} />
        <DateRangePicker appearance="studio" label="Content sales period" staleThrough={staleThrough} displayRange={{ start: startDate, end: endDate }} />
      </div>
      <button className={styles.export} type="button" onClick={exportLinks} disabled={!rows.length || updating} aria-label="Export video links"><Download size={15} aria-hidden="true" /><span>Export video links</span></button>
    </header>

    <section className={styles.toolbar} aria-label="Find videos">
      <SearchInput ref={searchInput} className={styles.search} value={query.q} disabled={navigation.isPending} aria-label="Search videos or creators" placeholder="Search videos or creators" onChange={event => setLocal({ q: event.target.value })} onClear={() => setLocal({ q: '' })} />
      <div className={styles.primaryFilter}><CreatorMenu disabled={navigation.isPending} creators={creators} value={query.creator} onChange={value => setLocal({ creator: value })} /></div>
      {canViewRoster && <div className={styles.primaryFilter}><ChoiceMenu compact triggerClassName={styles.choice} label="Creator tag" value={query.tag} disabled={navigation.isPending} options={[{ value: '', label: 'All tags' }, ...[...new Set([...tags, ...(query.tag ? [query.tag] : [])])].map(tag => ({ value: tag, label: tag }))]} onChange={value => setLocal({ tag: value })} /></div>}
      <div className={styles.primaryFilter}><ChoiceMenu compact triggerClassName={styles.choice} label="Video age" value={query.age} disabled={navigation.isPending} options={CONTENT_AGE_OPTIONS.map(({value,label}) => ({value,label}))} onChange={value => setLocal({ age: value as ContentQuery['age'] })} /></div>
      <Popover.Root><Popover.Trigger asChild><button type="button" className={styles.more} disabled={navigation.isPending}><SlidersHorizontal size={16} aria-hidden="true" /><span>Filters</span>{(managedOnly || basis === 'posted' || query.review !== 'all' || query.tag || query.creator || query.age !== 'all') && <i aria-label="Active filters" />}</button></Popover.Trigger>
        <Popover.Portal><Popover.Content className={styles.filterPopover} align="end" sideOffset={8} collisionPadding={12} data-lenis-prevent aria-label="Content filters">
          <div className={styles.popoverHead}><h2>Filter content</h2><Popover.Close className={styles.iconButton} aria-label="Close content filters"><X size={17} aria-hidden="true" /></Popover.Close></div>
          <div className={styles.mobileFilter}><label className={styles.filterField}><span>Creator</span><CreatorMenu disabled={navigation.isPending} creators={creators} value={query.creator} onChange={value => setLocal({ creator: value })} /></label>
            {canViewRoster && <label className={styles.filterField}><span>Creator tag</span><ChoiceMenu compact label="Creator tag" value={query.tag} disabled={navigation.isPending} options={[{ value: '', label: 'All tags' }, ...[...new Set([...tags, ...(query.tag ? [query.tag] : [])])].map(tag => ({ value: tag, label: tag }))]} onChange={value => setLocal({ tag: value })} /></label>}
            <label className={styles.filterField}><span>Video age</span><ChoiceMenu compact label="Video age" value={query.age} disabled={navigation.isPending} options={CONTENT_AGE_OPTIONS.map(({value,label}) => ({value,label}))} onChange={value => setLocal({ age: value as ContentQuery['age'] })} /></label></div>
          {filterFields}<button type="button" className={styles.textButton} onClick={resetFilters} disabled={!filtered || navigation.isPending}>Clear content filters</button>
        </Popover.Content></Popover.Portal>
      </Popover.Root>
    </section>

    {filtered && <div className={styles.filterChips} aria-label="Active content filters">
      {managedOnly && <button disabled={navigation.isPending} onClick={() => setServer('managed', '')}>Managed creators<X size={12} aria-label="Remove creator scope filter" /></button>}
      {basis === 'posted' && <button disabled={navigation.isPending} onClick={() => setServer('basis', '')}>Published in period<X size={12} aria-label="Remove publication filter" /></button>}
      {query.creator && <button disabled={navigation.isPending} onClick={() => setLocal({ creator: '' })}>@{query.creator}<X size={12} aria-label="Remove creator filter" /></button>}
      {query.tag && <button disabled={navigation.isPending} onClick={() => setLocal({ tag: '' })}>{query.tag}<X size={12} aria-label="Remove tag filter" /></button>}
      {query.age !== 'all' && <button disabled={navigation.isPending} onClick={() => setLocal({ age: 'all' })}>{CONTENT_AGE_OPTIONS.find(option => option.value === query.age)?.label}<X size={12} aria-label="Remove age filter" /></button>}
      {query.review !== 'all' && <button disabled={navigation.isPending} onClick={() => setLocal({ review: 'all' })}>{CONTENT_REVIEW_OPTIONS.find(option => option.value === query.review)?.label}<X size={12} aria-label="Remove review filter" /></button>}
      <button className={styles.clearFilters} onClick={resetFilters}>Clear filters</button>
    </div>}

    <section className={styles.summary} aria-label="Matching content totals" aria-busy={updating}>
      <strong>{data ? `${formatNumber(totals.videoCount)} ${totals.videoCount === 1 ? 'video' : 'videos'}` : 'Videos unavailable'}</strong>
      <strong className={styles.summaryGmv}>{data ? formatCurrency(totals.totalGmv) : 'Unavailable'} <span>GMV</span></strong>
      <span>{data ? formatNumber(totals.totalOrders) : 'Unavailable'} orders</span>
      <span>{data ? formatNumber(totals.totalUnits) : 'Unavailable'} units</span>
      <p>{updating && loaded ? 'Last loaded results' : data?.capped ? 'Matching loaded subset' : 'Matching current filters'}<br />{updating && loaded && <>{loaded.scope.managed ? 'Managed creators' : 'All creators'} · {shownBasis === 'posted' ? 'Published in period' : 'Any publication date'}<br /></>}Sales during {date(shownStart)} to {date(shownEnd)}</p>
    </section>
    <p className={styles.definition}>Video GMV is earned during the selected sales period. Video age is measured as of {date(shownEnd)}. {shownBasis === 'posted' ? 'Only videos published in the period are included. ' : ''}Published dates and qualifying delivery are separate.</p>
    {data?.capped && <div className={styles.notice}>This range contains more videos than can be loaded at once. These totals and exports cover the {formatNumber(data.deliveredCount)} loaded video/brand rows. Narrow the sales period or select a brand to review the full result.</div>}
    {contextIncomplete && query.tag && <p className={styles.definition}>Some creator tags are unverified. Tag filters show confirmed matches.</p>}
    {!canViewRoster && query.tag && <p className={styles.notice}>Creator tags are not included in your access. Clear the tag filter to see the video library.</p>}

    <div className={styles.feedback}>
      <p role="status">{error ? `${error}${loaded ? ` Showing ${shownBrand ? brandMeta.label(shownBrand) : 'All Brands'} · ${loaded.scope.managed ? 'Managed creators' : 'All creators'} · ${shownBasis === 'posted' ? 'Published in period' : 'Any publication date'} · ${date(shownStart)} to ${date(shownEnd)}.` : ''}` : updating ? `${loaded ? 'Updating content. Previous results remain visible.' : 'Loading your video library…'}` : `${shownBrand ? brandMeta.label(shownBrand) : 'All Brands'} · ${formatNumber(totals.videoCount)} matching videos${loaded?.scope.managed ? ' · Managed creators' : ''}`}</p>
      <button type="button" className={styles.refresh} disabled={requestPending} onClick={() => setAttempt(value => value + 1)}><RefreshCw size={14} aria-hidden="true" />{error ? 'Retry' : requestPending ? 'Updating' : 'Refresh'}</button>
    </div>
    <span className={styles.srOnly} role="status">{exportNotice}</span>
    <div className={styles.workspace} data-updating={updating || undefined}>
      <section className={styles.library} aria-label="Video library">
        <div className={styles.libraryHead}><h2>Video library</h2><ChoiceMenu compact label="Sort content" value={`${query.sort}:${query.dir}`} disabled={navigation.isPending} options={sortOptions} triggerClassName={styles.sort} onChange={value => { const [sort, dir] = value.split(':'); setLocal({ sort: sort as ContentQuery['sort'], dir: dir as ContentQuery['dir'] }); }} /></div>
        {!data && requestPending ? <ContentSkeleton /> : !rows.length ? <div className={styles.empty}><Search size={24} aria-hidden="true" /><h3>{error ? 'Content is unavailable' : filtered ? 'No videos match these filters' : 'No recorded videos in this period'}</h3><p>{error ? 'Try loading the library again.' : filtered ? 'Clear the search or adjust the creator, tag, and age filters.' : 'Try another brand or a wider sales period.'}</p>{filtered ? <button type="button" className={styles.secondary} onClick={() => { resetFilters(); searchInput.current?.focus(); }}>Clear filters</button> : error ? <button type="button" className={styles.secondary} onClick={() => setAttempt(value => value + 1)}>Try again</button> : null}</div> : <div className={styles.rows}>{rendered.map(post => {
          const age = postAgeDays(post.post_date, shownEnd);
          const url = resolveWatchUrl(post.video_url, post.creator_handle, post.video_id);
          const creatorName = post.creator_name?.trim();
          const showName = creatorName && creatorName.toLowerCase().replace(/^@/, '') !== post.creator_handle.toLowerCase().replace(/^@/, '');
          return <button type="button" key={contentPostKey(post)} className={styles.videoRow} disabled={navigation.isPending} aria-pressed={contentPostKey(post) === selectionKey} aria-label={`View video details: ${post.video_title || 'Untitled video'} by @${post.creator_handle}`} onClick={event => select(post, event.currentTarget)}>
            <VideoThumbnail url={url ?? ''} className={styles.rowCover} />
            <span className={styles.videoIdentity}><strong>{post.video_title || 'Untitled video'}</strong><span>{showName ? `${creatorName} · ` : ''}@{post.creator_handle}{!shownBrand ? ` · ${post.brand_name || brandMeta.label(post.brand_slug)}` : ''}</span><span>{post.post_date ? `${date(post.post_date)}${age === null ? '' : ` · ${age}d old`}` : 'Publication date unavailable'}</span><span className={styles.rowContext}>{post.is_managed ? 'Managed creator' : 'Outside managed roster'}{post.flagged ? ' · Flagged for review' : post.review_count ? ` · ${post.review_count} ${post.review_count === 1 ? 'review' : 'reviews'}` : ' · Unreviewed'}</span></span>
            <span className={styles.rowMetrics}>{query.metrics === 'sales' ? <><strong>{formatCurrency(post.gmv)}<small> GMV</small></strong><span>{formatNumber(post.orders)} orders · {formatNumber(post.items_sold)} units</span></> : <><strong>{post.views === null ? 'Unavailable' : formatNumber(post.views)}<small> views</small></strong><span>{post.likes === null ? 'Likes unavailable' : `${formatNumber(post.likes)} likes`} · {post.engagement_rate === null ? 'Engagement unavailable' : `${post.engagement_rate.toFixed(1)}% engagement`}</span></>}</span>
            <span className={styles.mobileDetails}>View video details</span>
          </button>;
        })}</div>}
        {rendered.length < rows.length && <button type="button" className={styles.loadMore} onClick={() => setPage(value => value + 1)}>Show more videos ({formatNumber(rows.length - rendered.length)} remaining)</button>}
        {data && rows.length > 0 && <p className={styles.listFooter}>{formatNumber(rendered.length)} of {formatNumber(rows.length)} video/brand rows · {date(shownStart)} to {date(shownEnd)}</p>}
      </section>
      <aside ref={inspectorElement} className={styles.inspector} aria-label="Selected video inspector"><ContentInspector post={selected} start={shownStart} end={shownEnd} reviewHref={reviewHref(selected)} onPreview={() => setPreviewOpen(true)} isUpdating={updating} /></aside>
    </div>
    <Dialog.Root open={mobileOpen && !!selected} onOpenChange={setMobileOpen}><Dialog.Portal><Dialog.Overlay className={styles.detailOverlay} /><Dialog.Content className={styles.detailSheet} data-lenis-prevent onCloseAutoFocus={event => { event.preventDefault(); mobileOpener.current?.focus({ preventScroll: true }); }}>
      <header className={styles.detailHeader}><Dialog.Title>Video details</Dialog.Title><Dialog.Close className={styles.iconButton} aria-label="Close video details"><X size={20} aria-hidden="true" /></Dialog.Close></header><Dialog.Description className={styles.srOnly}>Sales, publication, and coaching context for the selected video.</Dialog.Description>
      <div ref={mobileInspectorElement} className={styles.detailBody}><ContentInspector post={selected} start={shownStart} end={shownEnd} reviewHref={reviewHref(selected)} onPreview={() => setPreviewOpen(true)} isUpdating={updating} /></div>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
    <ContentPreview post={selected} start={shownStart} end={shownEnd} reviewHref={reviewHref(selected)} open={previewOpen && !!selected && !updating} onOpenChange={setPreviewOpen} onReturnFocus={returnPreviewFocus} onNext={selectedIndex >= 0 && selectedIndex + 1 < rows.length ? () => setLocal({ selected: contentPostKey(rows[selectedIndex + 1]) }) : undefined} />
  </div>;
}

function CreatorMenu({ creators, value, onChange, disabled = false }: { creators: string[]; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const filtered = creators.filter(creator => creator.includes(search.toLowerCase().replace(/^@/, '').trim()));
  return <Popover.Root open={open} onOpenChange={setOpen}><Popover.Trigger asChild><button type="button" className={styles.creatorTrigger} disabled={disabled} aria-label="Creator filter"><span>{value ? `@${value}` : 'All creators'}</span><ChevronDown size={15} aria-hidden="true" /></button></Popover.Trigger><Popover.Portal><Popover.Content className={styles.creatorMenu} align="start" sideOffset={8} collisionPadding={12} data-lenis-prevent aria-label="Choose a creator" onOpenAutoFocus={event => { event.preventDefault(); input.current?.focus(); }}>
    <SearchInput ref={input} className={styles.creatorSearch} value={search} aria-label="Search creator handles" placeholder="Search creator handles" onChange={event => setSearch(event.target.value)} onClear={() => setSearch('')} />
    <div className={styles.creatorOptions}><button type="button" onClick={() => { onChange(''); setOpen(false); }}>All creators{!value && <Check size={14} aria-hidden="true" />}</button>{filtered.slice(0, 60).map(creator => <button key={creator} type="button" onClick={() => { onChange(creator); setOpen(false); }}>@{creator}{creator === value && <Check size={14} aria-hidden="true" />}</button>)}</div>
    {!filtered.length && <p className={styles.menuHint}>No matching creator handles in this library.</p>}{filtered.length > 60 && <p className={styles.menuHint}>Search to narrow the creator list.</p>}
  </Popover.Content></Popover.Portal></Popover.Root>;
}

export function ContentSkeleton() {
  return <div className={styles.skeleton} role="status" aria-label="Loading video library">{Array.from({ length: 6 }, (_, index) => <div key={index}><i /><span><b /><b /><b /></span><em /></div>)}</div>;
}
