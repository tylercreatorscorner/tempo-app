import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';

export interface PublishedVideoBrandCount {
  slug: string;
  count: number;
  priorCount: number;
  storeCount: number;
  priorStoreCount: number;
  currentComplete: boolean;
  priorComplete: boolean;
}

export interface PublishedVideoCounts {
  /** Unique video IDs across the selected portfolio, not a sum of brand placements. */
  total: number;
  priorTotal: number;
  storeTotal: number;
  priorStoreTotal: number;
  /** Ingested-file coverage only. These do not certify TikTok's export completeness. */
  currentComplete: boolean;
  priorComplete: boolean;
  brands: PublishedVideoBrandCount[];
}

export interface PublishedVideoCountInput {
  tenantId: string;
  /** Caller-authorized roster brands. An empty list never means all brands. */
  rosterSlugs: string[];
  /** Optional data-store restriction, e.g. one child store using its parent roster. */
  dataSlugs?: string[];
  start: string;
  end: string;
  priorStart: string;
  priorEnd: string;
}

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value;
}

function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('Published video count response is invalid.');
  }
  return value;
}

/** Keep only recognized database/request codes, never provider messages or details. */
function readFailureCode(error: unknown, signal: AbortSignal): string {
  const record = error && typeof error === 'object' ? error as { code?: unknown; name?: unknown } : null;
  if (typeof record?.code === 'string' && /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(record.code)) return record.code;
  if (signal.aborted || record?.name === 'TimeoutError') return 'CLIENT_TIMEOUT';
  if (record?.name === 'AbortError') return 'REQUEST_ABORTED';
  return 'RPC_REQUEST_FAILED';
}

/**
 * Publication-date counts for a caller-authorized scope. This stays server-only;
 * the RPC is service-role-only and explicitly tenant-scopes each source read.
 * Query failures propagate so consumers show unavailable rather than a false 0.
 */
export async function getPublishedVideoCounts(input: PublishedVideoCountInput): Promise<PublishedVideoCounts> {
  const { tenantId, start, end, priorStart, priorEnd } = input;
  if (!tenantId || !Array.isArray(input.rosterSlugs)
    || !input.rosterSlugs.every(slug => typeof slug === 'string')
    || (input.dataSlugs !== undefined && (!Array.isArray(input.dataSlugs) || !input.dataSlugs.every(slug => typeof slug === 'string')))
    || ![start, end, priorStart, priorEnd].every(validDate)
    || start > end || priorStart > priorEnd
    || Math.max(Date.parse(end), Date.parse(priorEnd))
      - Math.min(Date.parse(start), Date.parse(priorStart)) > 800 * 86_400_000) {
    throw new Error('Published video count scope or dates are invalid.');
  }
  const rosterSlugs = [...new Set(input.rosterSlugs.map(slug => slug.trim()).filter(Boolean))];
  const dataSlugs = input.dataSlugs === undefined ? null : [...new Set(input.dataSlugs.map(slug => slug.trim()).filter(Boolean))];
  if (!rosterSlugs.length) {
    return { total: 0, priorTotal: 0, storeTotal: 0, priorStoreTotal: 0, currentComplete: false, priorComplete: false, brands: [] };
  }
  const startedAt = Date.now();
  const signal = AbortSignal.timeout(25_000);
  let stage: 'client' | 'rpc' | 'response' = 'client';
  let failureCode = 'CLIENT_INIT_FAILED';
  try {
    const admin = await createAdminClient();
    stage = 'rpc';
    failureCode = 'RPC_REQUEST_FAILED';
    const { data, error } = await admin.rpc('get_published_video_counts_workspace', {
      p_tenant_id: tenantId,
      p_roster_slugs: rosterSlugs,
      p_start: start,
      p_end: end,
      p_prior_start: priorStart,
      p_prior_end: priorEnd,
      p_data_slugs: dataSlugs,
    }).abortSignal(signal);
    if (error) {
      failureCode = readFailureCode(error, signal);
      throw new Error('Published video counts could not be loaded.');
    }
    stage = 'response';
    failureCode = 'INVALID_RESPONSE';
    if (!data || typeof data !== 'object' || !Array.isArray(data.brands)) {
      throw new Error('Published video counts could not be loaded.');
    }
    const raw = data as Record<string, unknown>;
    const brands = (data.brands as unknown[]).map(value => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Published video count response is invalid.');
      }
      const row = value as Record<string, unknown>;
      if (typeof row.slug !== 'string' || !rosterSlugs.includes(row.slug)) {
        failureCode = 'SCOPE_MISMATCH';
        throw new Error('Published video count brand scope is invalid.');
      }
      return {
        slug: row.slug,
        count: count(row.count),
        priorCount: count(row.priorCount),
        storeCount: count(row.storeCount),
        priorStoreCount: count(row.priorStoreCount),
        currentComplete: row.currentComplete === true,
        priorComplete: row.priorComplete === true,
      };
    });
    if (brands.length !== rosterSlugs.length || new Set(brands.map(row => row.slug)).size !== brands.length) {
      failureCode = 'SCOPE_MISMATCH';
      throw new Error('Published video count brand scope is incomplete.');
    }
    return {
      total: count(raw.total),
      priorTotal: count(raw.priorTotal),
      storeTotal: count(raw.storeTotal),
      priorStoreTotal: count(raw.priorStoreTotal),
      currentComplete: raw.currentComplete === true,
      priorComplete: raw.priorComplete === true,
      brands,
    };
  } catch (error) {
    // This module is server-only. Log diagnostic shape and scope size, never
    // tenant IDs, brand/creator identities, credentials or raw RPC responses.
    console.error('[published-videos] count read failed', {
      operation: 'get_published_video_counts_workspace', stage,
      code: stage === 'rpc' && failureCode === 'RPC_REQUEST_FAILED' ? readFailureCode(error, signal) : failureCode,
      elapsedMs: Math.max(0, Date.now() - startedAt),
      start, end, priorStart, priorEnd,
      rosterBrandCount: rosterSlugs.length,
      dataStoreCount: dataSlugs?.length ?? null,
    });
    if (stage === 'client' || stage === 'rpc') {
      // Callers also log their caught error. Do not pass provider messages,
      // rejected transport objects or initialization details to those logs.
      throw new Error('Published video counts could not be loaded.');
    }
    throw error;
  }
}
