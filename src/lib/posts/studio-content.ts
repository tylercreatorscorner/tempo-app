import { resolveWatchUrl } from '@/lib/utils/format';

/** A video/brand row. Sales always belong to the selected sales window. */
export interface ContentPost {
  video_id: string;
  video_title: string;
  video_url: string | null;
  creator_handle: string;
  brand_slug: string;
  brand_name: string;
  post_date: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  engagement_rate: number | null;
  gmv: number;
  orders: number;
  items_sold: number;
  is_managed: boolean;
  review_count: number;
  avg_rating: number | null;
  flagged: boolean;
  has_my_review: boolean;
  creator_id?: string | null;
  creator_name?: string | null;
  creator_tags?: string[];
  creator_context_status?: 'ready' | 'unavailable';
}

export interface ContentResponse {
  posts: ContentPost[];
  totals: {
    postCount: number;
    totalViews: number | null;
    totalLikes: number | null;
    totalComments: number | null;
    totalShares: number | null;
    viewsKnown: number;
    totalGmv: number;
    avgEngagement: number | null;
    reviewedCount: number;
    unreviewedCount: number;
    flaggedCount: number;
    reviewedByMeCount: number;
  };
  /** Rows delivered before local filters; a cap makes local matches a subset. */
  deliveredCount: number;
  capped: boolean;
  startDate: string;
  endDate: string;
}

export type ContentAge = 'all' | '0-30' | '30-60' | '60-90' | '90-180' | '180+' | 'unknown';
export type ContentSort = 'gmv' | 'orders' | 'items_sold' | 'views' | 'likes' | 'comments' | 'shares' | 'engagement_rate' | 'post_date' | 'post_age';
export type ContentReview = 'all' | 'unreviewed' | 'reviewed-by-me' | 'flagged';
export type ContentDirection = 'asc' | 'desc';
export type ContentMetrics = 'sales' | 'engagement';

export interface ContentQuery {
  q: string;
  creator: string;
  age: ContentAge;
  review: ContentReview;
  sort: ContentSort;
  dir: ContentDirection;
  tag: string;
  metrics: ContentMetrics;
}

/** Preserve existing saved URL keys and their disjoint upper-exclusive bounds. */
export const CONTENT_AGE_OPTIONS: readonly { value: ContentAge; label: string; description: string }[] = [
  { value: 'all', label: 'Any video age', description: 'Age at the end of the selected sales period.' },
  { value: '0-30', label: '0–29 days', description: 'Less than 30 full days old at period end.' },
  { value: '30-60', label: '30–59 days', description: '30 to 59 full days old at period end.' },
  { value: '60-90', label: '60–89 days', description: '60 to 89 full days old at period end.' },
  { value: '90-180', label: '90–179 days', description: '90 to 179 full days old at period end.' },
  { value: '180+', label: '180+ days', description: 'At least 180 full days old at period end.' },
  { value: 'unknown', label: 'Date unavailable', description: 'A publication date is not recorded.' },
];

export const CONTENT_SORT_OPTIONS: readonly { value: ContentSort; label: string }[] = [
  { value: 'gmv', label: 'Period GMV' },
  { value: 'orders', label: 'Orders' },
  { value: 'items_sold', label: 'Units sold' },
  { value: 'views', label: 'Views' },
  { value: 'likes', label: 'Likes' },
  { value: 'comments', label: 'Comments' },
  { value: 'shares', label: 'Shares' },
  { value: 'engagement_rate', label: 'Engagement rate' },
  { value: 'post_date', label: 'Publication date' },
  { value: 'post_age', label: 'Video age' },
];

export const CONTENT_REVIEW_OPTIONS: readonly { value: ContentReview; label: string }[] = [
  { value: 'all', label: 'All reviews' },
  { value: 'unreviewed', label: 'Unreviewed' },
  { value: 'reviewed-by-me', label: 'Reviewed by me' },
  { value: 'flagged', label: 'Flagged' },
];

type QuerySource = { get(name: string): string | null } | Record<string, string | readonly string[] | null | undefined>;

function normalizeHandle(value: string): string {
  return value.trim().replace(/^@+/, '').toLowerCase();
}

export function normalizeContentQuery(source: QuerySource): ContentQuery {
  const get = (name: string): string | null => {
    if (typeof source.get === 'function') return source.get(name);
    const value = (source as Record<string, string | readonly string[] | null | undefined>)[name];
    return typeof value === 'string' ? value : Array.isArray(value) ? value[0] ?? null : null;
  };
  const age = get('age');
  const review = get('review');
  const sort = get('sort');
  return {
    q: get('q') ?? '',
    creator: normalizeHandle(get('creator') ?? ''),
    age: CONTENT_AGE_OPTIONS.some(option => option.value === age) ? age as ContentAge : 'all',
    review: CONTENT_REVIEW_OPTIONS.some(option => option.value === review) ? review as ContentReview : 'all',
    sort: CONTENT_SORT_OPTIONS.some(option => option.value === sort) ? sort as ContentSort : 'gmv',
    dir: get('dir') === 'asc' ? 'asc' : 'desc',
    tag: (get('tag') ?? '').trim().toLowerCase(),
    metrics: get('metrics') === 'engagement' ? 'engagement' : 'sales',
  };
}

function calendarDay(value: string | null | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : null;
}

export function postAgeDays(postDate: string | null, windowEnd: string): number | null {
  const published = calendarDay(postDate);
  const end = calendarDay(windowEnd);
  return published === null || end === null ? null : Math.max(0, Math.floor((end - published) / 86_400_000));
}

export function ageBucket(days: number | null): ContentAge {
  if (days === null || !Number.isFinite(days)) return 'unknown';
  if (days < 30) return '0-30';
  if (days < 60) return '30-60';
  if (days < 90) return '60-90';
  if (days < 180) return '90-180';
  return '180+';
}

export function contentPostKey(post: Pick<ContentPost, 'video_id' | 'brand_slug'>): string {
  return `${post.brand_slug}|${post.video_id}`;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortValue(post: ContentPost, sort: ContentSort, windowEnd: string): number | null {
  if (sort === 'post_date') return calendarDay(post.post_date);
  if (sort === 'post_age') return postAgeDays(post.post_date, windowEnd);
  const value = post[sort];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Pure local predicates: do not reinterpret a sales period as a publication filter. */
export function filterContentPosts(posts: readonly ContentPost[], query: ContentQuery, windowEnd: string): ContentPost[] {
  const creator = normalizeHandle(query.creator);
  const term = query.q.trim().toLowerCase();
  const tag = query.tag.trim().toLowerCase();
  const result = posts.filter(post => {
    if (query.review === 'unreviewed' && post.review_count !== 0) return false;
    if (query.review === 'reviewed-by-me' && !post.has_my_review) return false;
    if (query.review === 'flagged' && !post.flagged) return false;
    if (creator && normalizeHandle(post.creator_handle) !== creator) return false;
    if (query.age !== 'all' && ageBucket(postAgeDays(post.post_date, windowEnd)) !== query.age) return false;
    if (term && !post.video_title.toLowerCase().includes(term) && !post.creator_handle.toLowerCase().includes(term)
      && !(post.creator_name ?? '').toLowerCase().includes(term)) return false;
    if (tag && (post.creator_context_status !== 'ready' || !(post.creator_tags ?? []).some(value => value.trim().toLowerCase() === tag))) return false;
    return true;
  });
  const direction = query.dir === 'asc' ? 1 : -1;
  return result.sort((a, b) => {
    const av = sortValue(a, query.sort, windowEnd);
    const bv = sortValue(b, query.sort, windowEnd);
    if (av === null && bv !== null) return 1;
    if (bv === null && av !== null) return -1;
    const value = av === null || bv === null ? 0 : (av - bv) * direction;
    return value || compareText(contentPostKey(a), contentPostKey(b));
  });
}

function knownTotal(posts: readonly ContentPost[], key: 'views' | 'likes' | 'comments' | 'shares'): number | null {
  const known = posts.map(post => post[key]).filter((value): value is number => value !== null && Number.isFinite(value));
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
}

/** Local row totals only. A capped response cannot establish complete filtered totals. */
export function summarizeContent(posts: readonly ContentPost[]) {
  const identities = new Set(posts.map(post => post.video_id));
  const reviewed = new Set(posts.filter(post => post.review_count > 0).map(post => post.video_id));
  const engagement = posts.map(post => post.engagement_rate).filter((value): value is number => value !== null && Number.isFinite(value));
  return {
    videoCount: identities.size,
    rowCount: posts.length,
    totalGmv: posts.reduce((sum, post) => sum + post.gmv, 0),
    totalOrders: posts.reduce((sum, post) => sum + post.orders, 0),
    totalUnits: posts.reduce((sum, post) => sum + post.items_sold, 0),
    totalViews: knownTotal(posts, 'views'),
    totalLikes: knownTotal(posts, 'likes'),
    totalComments: knownTotal(posts, 'comments'),
    totalShares: knownTotal(posts, 'shares'),
    /** Known brand rows; compare with rowCount, not distinct videoCount. */
    viewsKnown: posts.filter(post => post.views !== null && Number.isFinite(post.views)).length,
    avgEngagement: engagement.length ? engagement.reduce((sum, value) => sum + value, 0) / engagement.length : null,
    reviewedCount: reviewed.size,
    unreviewedCount: identities.size - reviewed.size,
    flaggedCount: new Set(posts.filter(post => post.flagged).map(post => post.video_id)).size,
    reviewedByMeCount: new Set(posts.filter(post => post.has_my_review).map(post => post.video_id)).size,
    creatorContextUnavailable: posts.filter(post => post.creator_context_status !== 'ready').length,
  };
}

function csvCell(value: string | number | null): string {
  const raw = value === null ? '' : String(value);
  // Quoting does not prevent spreadsheet formula evaluation. Keep genuine
  // numeric negatives numeric; neutralize user-controlled text separately.
  const safe = typeof value === 'string' && /^[\u0000-\u0020\uFEFF]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** The caller supplies the current filtered rows, including any disclosed cap. */
export function contentCsv(posts: readonly ContentPost[], start: string, end: string): string {
  const headers = ['Creator', 'Creator name', 'Brand', 'Title', 'Sales period start', 'Sales period end', 'Published', 'Post age at period end (days)', 'GMV', 'Orders', 'Units sold', 'Views', 'Likes', 'Comments', 'Shares', 'Engagement %', 'Managed creator', 'Reviews', 'Average rating', 'Flagged', 'Reviewed by me', 'Creator tags', 'Creator context', 'Video URL'];
  const rows: (string | number | null)[][] = posts.map(post => [
    `@${normalizeHandle(post.creator_handle)}`, post.creator_name ?? null, post.brand_name, post.video_title, start, end,
    post.post_date, postAgeDays(post.post_date, end), post.gmv, post.orders, post.items_sold,
    post.views, post.likes, post.comments, post.shares, post.engagement_rate,
    post.is_managed ? 'Yes' : 'No', post.review_count, post.avg_rating,
    post.flagged ? 'Yes' : 'No', post.has_my_review ? 'Yes' : 'No',
    post.creator_context_status === 'ready' ? (post.creator_tags ?? []).join('; ') : null,
    post.creator_context_status === 'ready' ? 'Available' : 'Unavailable',
    resolveWatchUrl(post.video_url, post.creator_handle, post.video_id),
  ]);
  return [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
}
