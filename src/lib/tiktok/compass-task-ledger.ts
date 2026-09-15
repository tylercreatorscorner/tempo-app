import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompassModuleType, CompassWindowType } from './compass';

export interface CompassRecoveryScope {
  brandSlug: string;
  reportDate: string;
  moduleType: CompassModuleType;
  windowType: CompassWindowType;
  planType: string;
  connectionId: string;
  shopId: string;
  apiVersion: string;
  pollApiVersion: string;
  paramsIn: 'body' | 'query';
  docType: string;
}

export interface CompassTaskLease {
  rowId: string;
  taskId: string;
  leaseToken: string;
}

const TABLE = 'tiktok_compass_tasks';
// The HTTP worker is capped at 300 seconds. A killed worker's lease outlives it.
export const COMPASS_LEASE_MS = 330_000;
const TASK_ID = /^[A-Za-z0-9_-]{1,128}$/;
export const COMPASS_ROW_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Called with a task ID from TikTok after create, or a ledger row ID supplied
 * by an authorized operator. Never accepts an arbitrary upstream ID to resume. */
export async function acquireCompassTask(
  db: SupabaseClient,
  scope: CompassRecoveryScope,
  runId: string | null,
  target: { newTaskId: string } | { rowId: string },
  now = Date.now(),
): Promise<CompassTaskLease> {
  const leaseToken = randomUUID();
  const leasePatch = {
    lease_token: leaseToken,
    lease_expires_at: new Date(now + COMPASS_LEASE_MS).toISOString(),
    ingestion_run_id: runId,
    status: 'created',
    error: null,
    rows_written: null,
  };
  if ('newTaskId' in target) {
    if (!TASK_ID.test(target.newTaskId)) throw new Error('Invalid Compass task ID');
    const inserted = await db.from(TABLE).insert({
      brand_slug: scope.brandSlug, module_type: scope.moduleType,
      window_type: scope.windowType, end_day: scope.reportDate,
      task_id: target.newTaskId, recovery_context: scope,
      ...leasePatch,
    }).select('id');
    if (!inserted.error && inserted.data?.length === 1) {
      return { rowId: inserted.data[0].id, taskId: target.newTaskId, leaseToken };
    }
    // TikTok can return an existing task ID. Reuse only if its recorded context
    // matches and its prior invocation has finished or its lease expired.
    if (inserted.error?.code !== '23505') throw new Error('Could not persist the Compass task; polling was not started');
  } else if (!COMPASS_ROW_ID.test(target.rowId)) {
    throw new Error('Invalid Compass ledger row ID');
  }

  const lookup = db.from(TABLE).select('id,task_id,brand_slug,end_day,module_type,window_type,recovery_context,lease_expires_at,updated_at');
  const { data: row, error } = await ('rowId' in target
    ? lookup.eq('id', target.rowId) : lookup.eq('task_id', target.newTaskId))
    .eq('brand_slug', scope.brandSlug).maybeSingle();
  if (error || !row) throw new Error('Compass task record is unavailable for this brand');
  const saved = row.recovery_context as Record<string, unknown> | null;
  if (!saved || Object.entries(scope).some(([key, value]) => saved[key] !== value)
    || row.brand_slug !== scope.brandSlug || row.end_day !== scope.reportDate
    || row.module_type !== scope.moduleType || row.window_type !== scope.windowType
    || typeof row.task_id !== 'string' || !TASK_ID.test(row.task_id)) {
    throw new Error('Compass task scope is missing or differs from the active shop, date or report settings');
  }
  if (row.lease_expires_at !== null && (!Number.isFinite(Date.parse(row.lease_expires_at)) || Date.parse(row.lease_expires_at) > now)) {
    throw new Error('Compass task is already being processed; retry after its lease expires');
  }
  if (typeof row.updated_at !== 'string') throw new Error('Compass task lacks a revision for safe recovery');
  // Compare-and-set: simultaneous readers of an expired lease cannot both win.
  // The existing database touch trigger changes updated_at on every update.
  const claimed = await db.from(TABLE).update(leasePatch).eq('id', row.id)
    .eq('updated_at', row.updated_at).select('id');
  if (claimed.error || claimed.data?.length !== 1) throw new Error('Compass task was claimed or changed by another run');
  return { rowId: row.id, taskId: row.task_id, leaseToken };
}

export async function patchCompassTask(
  db: SupabaseClient, lease: CompassTaskLease,
  patch: Record<string, string | number | string[] | null>,
): Promise<void> {
  const terminal = ['failed', 'verified_dry_run', 'ingested', 'partial'].includes(String(patch.status));
  const result = await db.from(TABLE).update({ ...patch,
    ...(terminal ? { lease_token: null, lease_expires_at: null } : {}),
  }).eq('id', lease.rowId).eq('lease_token', lease.leaseToken).select('id');
  if (result.error || result.data?.length !== 1) throw new Error('Compass task update failed or invocation no longer owns its lease');
}
