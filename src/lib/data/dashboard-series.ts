import "server-only";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getWorkspaceScope, isBrandInScope } from "@/lib/auth/workspace-scope";
import { getActiveTenantId } from "@/lib/auth/platform-admin";
import { getBrandRegistry, expandSlugs } from "./brand-registry";
import { buildManagedLookup } from "./managed-gmv";

export async function getDashboardSeries(
  start: string,
  end: string,
  brand?: string,
) {
  const scope = await getWorkspaceScope();
  if (!scope) return null;
  const client = await createClient();
  const activeTenant = await getActiveTenantId();
  let query = client
    .from("brands_v2")
    .select("id,slug,tenant_id,parent_brand_id,is_umbrella")
    .eq("is_archived", false);
  if (activeTenant) query = query.eq("tenant_id", activeTenant);
  const { data, error } = await query;
  if (error) throw new Error("Brand scope unavailable");
  const authorized = (data ?? []).filter((row) => isBrandInScope(scope, row));
  const selected = authorized.filter(
    (row) => !row.parent_brand_id && (!brand || row.slug === brand),
  );
  if (!selected.length) return { rows: [], brands: 0 };
  const reg = await getBrandRegistry();
  // Expansion follows an authorized parent and remains in its tenant.
  const stores = selected.flatMap((parent) =>
    expandSlugs(reg, parent.slug).map((slug) => ({
      slug,
      tenant: parent.tenant_id,
    })),
  );
  const admin = await createAdminClient();
  const { data: storeRows, error: storeError } = await admin
    .from("brands_v2")
    .select("id,slug,tenant_id")
    .in(
      "slug",
      stores.map((s) => s.slug),
    );
  if (storeError) throw new Error("Stores unavailable");
  const scoped = (storeRows ?? []).filter((row) =>
    stores.some((s) => s.slug === row.slug && s.tenant === row.tenant_id),
  );
  if (!scoped.length) return { rows: [], brands: 0 };
  const lookup = await buildManagedLookup(
    scoped.map((s) => s.slug),
    reg,
  );
  const members = [...lookup.managedLookup].map((key) => {
    const [handle, brand] = key.split("|||");
    return { handle, brand, cutoff: lookup.archivedOn.get(key) ?? null };
  });
  const result = await admin
    .rpc("dashboard_metric_series", {
      p_brand_ids: scoped.map((row) => row.id),
      p_start: start,
      p_end: end,
      p_members: members,
    })
    .abortSignal(AbortSignal.timeout(20000));
  if (result.error) throw new Error("Dashboard series unavailable");
  return { rows: result.data ?? [], brands: scoped.length };
}
