import "server-only";
import { ensureAgreementPeriods } from "./renewals";
import { createAdminClient } from "@/lib/supabase/server";
import { getWorkspaceScope, isBrandInScope } from "@/lib/auth/workspace-scope";
import {
  getActiveTenantId,
  assertNotImpersonating,
} from "@/lib/auth/platform-admin";
import { can } from "@/lib/auth/permissions";
import {
  applyAgreementCommand,
  type AgreementLedger,
  type AgreementCommand,
} from "./model";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class AgreementAccessError extends Error {}
export async function agreementContext(
  creatorId: string,
  brandId: string,
  write = false,
) {
  if (!uuid.test(creatorId) || !uuid.test(brandId))
    throw new AgreementAccessError("Agreement not found.");
  const scope = await getWorkspaceScope();
  if (
    !scope ||
    !scope.canViewCreatorCost ||
    !can(scope, "roster", write ? "write" : "read")
  )
    throw new AgreementAccessError("Agreement access denied.");
  if (write) {
    await assertNotImpersonating();
    if (scope.impersonating) throw new AgreementAccessError("Read-only view.");
  }
  const tenant = (await getActiveTenantId()) ?? scope.tenantId;
  const admin = await createAdminClient();
  const [
    { data: brand, error: brandError },
    { data: creator, error: creatorError },
    { data: link, error: linkError },
  ] = await Promise.all([
    admin
      .from("brands_v2")
      .select("id,slug,tenant_id,is_archived")
      .eq("id", brandId)
      .eq("tenant_id", tenant)
      .maybeSingle(),
    admin
      .from("creators_v2")
      .select("id")
      .eq("id", creatorId)
      .eq("tenant_id", tenant)
      .maybeSingle(),
    admin
      .from("creator_brands")
      .select("id")
      .eq("creator_id", creatorId)
      .eq("brand_id", brandId)
      .eq("tenant_id", tenant)
      .maybeSingle(),
  ]);
  if (brandError || creatorError || linkError)
    throw Error("Agreement access could not be verified.");
  if (
    !brand ||
    !creator ||
    !link ||
    !isBrandInScope(scope, brand) ||
    (write && brand.is_archived)
  )
    throw new AgreementAccessError("Agreement access denied.");
  return { scope, tenant, admin, creatorId, brandId };
}
export async function readAgreements(creatorId: string, brandId: string) {
  const ctx = await agreementContext(creatorId, brandId);
  await ensureAgreementPeriods({tenantId:ctx.tenant,brandIds:[brandId],creatorIds:[creatorId]});
  const { data, error } = await ctx.admin
    .from("creator_agreement_ledgers")
    .select("id,version,state,updated_at")
    .eq("tenant_id", ctx.tenant)
    .eq("creator_id", creatorId)
    .eq("brand_id", brandId)
    .order("starts_on", { ascending: false });
  if (error) throw Error("Agreements could not be loaded.");
  return data ?? [];
}
export interface AgreementWrite {
  id: string;
  version: number;
  requestId: string;
  command: AgreementCommand;
}
export async function writeAgreement(
  creatorId: string,
  brandId: string,
  input: AgreementWrite,
  preview = false,
) {
  const ctx = await agreementContext(creatorId, brandId, true);
  if (
    !input ||
    !uuid.test(input.id) ||
    !uuid.test(input.requestId) ||
    !Number.isSafeInteger(input.version) ||
    input.version < 0
  )
    throw Error("Invalid agreement request.");
  // Auto renewal is only invoked by a trusted job, never a browser command.
  if (
    !input.command ||
    !["create", "change", "end", "renew"].includes(input.command.action)
  )
    throw Error("Invalid agreement action.");
  const { data: row, error } = await ctx.admin
    .from("creator_agreement_ledgers")
    .select("id,version,state")
    .eq("id", input.id)
    .eq("tenant_id", ctx.tenant)
    .eq("creator_id", creatorId)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (error) throw Error("Agreement could not be loaded.");
  // Check replay before applying domain logic: a successful retry must not append a second revision.
  if (row) {
    const { data: event, error: eventError } = await ctx.admin
      .from("creator_agreement_events")
      .select("actor_id,command,version")
      .eq("ledger_id", row.id)
      .eq("request_id", input.requestId)
      .maybeSingle();
    if (eventError) throw Error("Agreement history could not be verified.");
    if (event) {
      if (
        event.actor_id !== ctx.scope.userId ||
        canonical(event.command) !== canonical(input.command)
      )
        throw Error("Request key already used.");
      return { id: row.id, version: row.version, replayed: true };
    }
  }
  if ((row?.version ?? 0) !== input.version)
    throw Error("Agreement changed. Reload before saving.");
  let state = applyAgreementCommand(
    (row?.state as AgreementLedger) ?? null,
    input.command,
    { id: ctx.scope.userId, now: new Date().toISOString() },
  );
  if (state.kind === 'monthly') state = applyAgreementCommand(state,{action:'advance',through:new Date().toLocaleDateString('en-CA',{timeZone:'America/Chicago'}),reason:'Automatic renewal through current period'},{id:'system:renewal',now:new Date().toISOString()});
  if (preview) return {id:input.id,version:input.version,state};
  const { data: version, error: saveError } = await ctx.admin.rpc(
    "save_creator_agreement_ledger",
    {
      p_id: input.id,
      p_tenant: ctx.tenant,
      p_creator: creatorId,
      p_brand: brandId,
      p_actor: ctx.scope.userId,
      p_expected: input.version,
      p_request: input.requestId,
      p_command: input.command,
      p_state: state,
    },
  );
  if (saveError)
    throw Error(
      "Agreement changed or overlaps another agreement. Reload before trying again.",
    );
  return { id: input.id, version, replayed: false };
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => JSON.stringify(key) + ":" + canonical(item))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
