import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompassIngestInput, CompassIngestResult } from './compass-ingest';
import { COMPASS_ROW_ID } from './compass-task-ledger';

export const COMPASS_TEST_PROJECT = 'https://otwssgedcnxamcglqpnn.supabase.co';
const BRAND = 'jiyu-api-test';
const SHOP = '7495653723838187639';

function completedDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0,10) === value
    && value < new Date(Date.now()-8*60*60*1000).toISOString().slice(0,10);
}

/** One bounded, dry-run recovery. No loop, creates, cron or production path.
 * db must be constructed from the same validated URL by the server caller.
 * SQL serializes dispatcher instances; unrelated/manual API calls do not yet
 * participate in its shared gate. The existing ingest rechecks active scope. */
export async function dispatchCompassRecovery(
  db: SupabaseClient,
  projectUrl: string,
  ingest: (input: CompassIngestInput) => Promise<CompassIngestResult>,
): Promise<{ state: string; jobId?: string; attempt?: number }> {
  if (projectUrl !== COMPASS_TEST_PROJECT) throw new Error('Compass dispatcher is restricted to the hosted test project');
  const claim = await db.rpc('claim_compass_recovery', { p_brand: BRAND });
  if (claim.error) throw new Error('Could not claim Compass recovery');
  const job = claim.data;
  if (!job || !['busy','cooldown','idle','claimed'].includes(job.state)) throw new Error('Invalid Compass claim response');
  if (job.state !== 'claimed') return { state: job.state };
  if (!COMPASS_ROW_ID.test(job.jobId) || !COMPASS_ROW_ID.test(job.taskRowId)
    || !COMPASS_ROW_ID.test(job.leaseToken) || !Number.isInteger(job.attempt)
    || job.attempt < 1 || job.attempt > 3) throw new Error('Malformed Compass lease');

  let outcome = 'needs_review';
  let retryAt: string | null = null;
  let rateLimited = false;
  const scope = job.scope;
  // Deliberately only the report shape already validated against JiYu UI.
  if (scope && scope.brandSlug === BRAND && scope.shopId === SHOP
    && COMPASS_ROW_ID.test(scope.connectionId) && completedDay(scope.reportDate)
    && scope.moduleType === 'CREATOR' && scope.windowType === 'PAST_24H'
    && scope.planType === 'ALL' && scope.apiVersion === '202603'
    && scope.pollApiVersion === '202603' && scope.paramsIn === 'body' && scope.docType === 'CREATOR') {
    try {
      const result = await ingest({ brandSlug: BRAND, reportDate: scope.reportDate,
        moduleType: 'CREATOR',windowType: 'PAST_24H',dryRun: true,
        resumeTaskRowId: job.taskRowId,
        request: { apiVersion: '202603',paramsIn: 'body' },
        poll: { apiVersion: '202603',docType: 'CREATOR',maxPolls: 1 },
      });
      const sameScope = result.brandSlug === BRAND && result.reportDate === scope.reportDate
        && result.moduleType === 'CREATOR' && result.taskRowId === job.taskRowId && result.dryRun;
      if (sameScope && result.ok && result.stage === 'done') outcome = 'verified_dry_run';
      else if (sameScope && !result.ok && result.retry
        && ['rate_limit','transient','pending'].includes(result.retry.reason)
        && Number.isFinite(Date.parse(result.retry.notBefore))) {
        outcome = 'retry'; retryAt = result.retry.notBefore;
        rateLimited = result.retry.reason === 'rate_limit';
      }
    } catch {
      // Unknown errors require inspection, never a blind retry or stored secrets.
    }
  }
  const finished = await db.rpc('finish_compass_recovery', {
    p_job: job.jobId,p_token: job.leaseToken,p_outcome: outcome,
    p_retry_at: retryAt,p_rate_limited: rateLimited,
  });
  if (finished.error || !['queued','verified_dry_run','needs_review'].includes(finished.data)) {
    throw new Error('Compass recovery outcome was not saved; lease expiry will expose it');
  }
  return { state: finished.data,jobId: job.jobId,attempt: job.attempt };
}
