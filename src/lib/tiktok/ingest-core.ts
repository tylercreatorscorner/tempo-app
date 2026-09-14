/** Pure parsing/pagination rules. Unknown metrics stay unknown. */
export type Rec = Record<string, unknown>;
export const record = (v: unknown): Rec => v && typeof v === 'object' && !Array.isArray(v) ? v as Rec : {};
export const text = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v : null;
export function number(v: unknown): number | null {
  if ((typeof v !== 'number' && typeof v !== 'string') || (typeof v === 'string' && !v.trim())) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
export const amount = (v: unknown) => number(record(v).amount);
export function rows(data: Rec, key: string): Rec[] {
  if (!Array.isArray(data[key])) throw new Error(`Missing ${key} array in TikTok response`);
  return (data[key] as unknown[]).map(v => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`Invalid ${key} row`);
    return v as Rec;
  });
}
export function id(v: unknown): string {
  const value = text(v);
  if (!value) throw new Error('TikTok returned a missing or non-string ID');
  return value;
}
export function nextToken(data: Rec): string | null {
  if (data.next_page_token == null || data.next_page_token === '') return null;
  if (typeof data.next_page_token !== 'string') throw new Error('Invalid next_page_token');
  return data.next_page_token;
}
export function validReportDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value;
}
/** Never assign UTC to a vendor timestamp that supplies no offset. */
export function explicitInstant(value: string | null): string | null {
  if (!value || !/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}
export interface ListedVideo { id: string; username: string; creatorOpenId: string | null; title: string; postTime: string | null; gmv: number | null }
export function listedVideo(v: Rec): ListedVideo {
  const creator = record(v.creator);
  return { id: id(v.id), username: text(creator.user_name) ?? text(v.username) ?? '',
    creatorOpenId: text(creator.open_id), title: text(v.title) ?? '',
    postTime: text(v.video_post_time), gmv: amount(v.gmv) };
}
/** Details are separately bounded; nonselling content is still eligible. */
export function detailTargets(videos: ListedVideo[], limit: number, offset = 0): ListedVideo[] {
  if (!Number.isInteger(limit) || limit < 0 || !Number.isInteger(offset) || offset < 0) throw new Error('Invalid detail window');
  return [...videos].sort((a,b) => a.id.localeCompare(b.id)).slice(offset, offset + limit);
}
export async function* pages(
  fetchPage: (token: string | null) => Promise<Rec>, key: string, maxPages = 200,
): AsyncGenerator<{ data: Rec; rows: Rec[]; page: number; token: string | null }> {
  let token: string | null = null;
  const seen = new Set<string>();
  let count = 0;
  let expected: number | null = null;
  for (let page = 0; page < maxPages; page++) {
    const data = await fetchPage(token);
    const batch = rows(data, key);
    const total = number(data.total_count);
    if (total !== null) {
      if (!Number.isInteger(total) || total < 0 || (expected !== null && expected !== total)) {
        throw new Error(`Unstable total_count for ${key}; rerun snapshot`);
      }
      expected = total;
    }
    count += batch.length;
    yield { data, rows: batch, page, token };
    const next = nextToken(data);
    if (!next) {
      if (expected !== null && count !== expected) throw new Error(`Incomplete ${key}: received ${count}/${expected}`);
      return;
    }
    if (seen.has(next)) throw new Error(`Repeated pagination token for ${key}`);
    seen.add(next); token = next;
  }
  throw new Error(`Page limit reached for ${key}; inventory incomplete`);
}
