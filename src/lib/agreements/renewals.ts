import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { applyAgreementCommand, type AgreementLedger } from "./model";
/** Cursor-based bounded renewal pass. Scheduler retries failures; CAS prevents lost user edits. */
export async function renewAgreementBatch(afterId?: string) {
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
  if (afterId) query = query.gt("id", afterId);
  const { data: rows, error } = await query;
  if (error) throw Error("Renewal batch could not be read.");
  let renewed = 0;
  const failed: string[] = [];
  for (const row of rows ?? []) {
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
