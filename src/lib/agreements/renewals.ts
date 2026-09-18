import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { applyAgreementCommand, type AgreementLedger } from "./model";
export interface RenewalScope { tenantId: string; brandIds: string[]; creatorIds?: string[]; pairs?: Array<{brandId:string;creatorId:string}> }
/** Cursor-based bounded renewal pass. Scheduler retries failures; CAS prevents lost user edits. */
export async function renewAgreementBatch(afterId?: string, scope?: RenewalScope) {
  if (scope && (!scope.brandIds.length || scope.creatorIds?.length === 0 || scope.pairs?.length === 0)) return {renewed:0,failed:[],nextCursor:null};
  const admin = await createAdminClient();
  const through = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Chicago",
  });
  let query = admin
    .from("creator_agreement_ledgers")
    .select("id,tenant_id,creator_id,brand_id,version,state,renew_after,starts_on,ends_on")
    .lte("renew_after",through)
    .order("id")
    .limit(100);
  if (scope) {
    query = query.eq("tenant_id", scope.tenantId).in("brand_id", scope.brandIds);
    if (scope.creatorIds) query = query.in("creator_id", scope.creatorIds);
  }
  if (afterId) query = query.gt("id", afterId);
  const { data: rows, error } = await query;
  if (error) throw Error("Renewal batch could not be read.");
  let renewed = 0;
  const failed: string[] = [];
  for (const row of rows ?? []) {
    // A roster batch may contain different creators under different brands.
    // The coarse IN filters must never authorize the Cartesian product.
    if (scope?.pairs && !scope.pairs.some(pair=>pair.brandId===row.brand_id && pair.creatorId===row.creator_id)) continue;
    const current = row.state as AgreementLedger;

    const command = {
      action: "advance" as const,
      through,
      reason: "Scheduled agreement activation or renewal",
    };
    try {
      const state = current.kind !== "monthly" ? current : applyAgreementCommand(current, command, {
        id: "system:renewal",
        now: new Date().toISOString(),
      });
      const { error: saveError } = await admin.rpc(
        "save_creator_agreement_ledger",
        {
          p_id: row.id,
          p_tenant: row.tenant_id,
          p_creator: row.creator_id,
          p_brand: row.brand_id,
          p_actor: null,
          p_expected: row.version,
          p_request: randomUUID(),
          p_command: command,
          p_state: state,
        },
      );
      if (saveError) failed.push(row.id);
      else renewed++;
    } catch {
      failed.push(row.id);
    }
  }
  return {
    renewed,
    failed,
    nextCursor: rows?.length === 100 ? rows.at(-1)!.id : null,
  };
}

/** Only pass an already-authorized scope. No preview mutation while writes are disabled.
 * A second fresh pass handles a concurrent editor/cron winning the compare-and-swap.
 */
export async function ensureAgreementPeriods(scope: RenewalScope): Promise<void> {
  if (process.env.CREATOR_AGREEMENTS_ENABLED !== 'true' || process.env.CREATOR_AGREEMENTS_WRITES_ENABLED !== 'true') return;
  for (let attempt = 0; attempt < 2; attempt++) {
    let cursor: string | undefined;
    let failures = 0;
    do {
      const result = await renewAgreementBatch(cursor, scope);
      failures += result.failed.length;
      cursor = result.nextCursor ?? undefined;
    } while (cursor);
    if (!failures) return;
  }
  throw Error('Agreement renewal could not complete. Please retry.');
}
