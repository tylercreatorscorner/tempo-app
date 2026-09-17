import "server-only";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getWorkspaceScope, isBrandInScope } from "@/lib/auth/workspace-scope";
import { getActiveTenantId } from "@/lib/auth/platform-admin";
import { can } from "@/lib/auth/permissions";
import { getDashboardSeries } from "./dashboard-series";
import {
  validGoalMonth,
  goalCoverage,
  type ManagerGoal,
  type GoalReview,
} from "./manager-goals-model";

export async function goalContext() {
  const scope = await getWorkspaceScope();
  if (!scope || !can(scope, "reporting", "read")) return null;
  const client = await createClient();
  const tenant = (await getActiveTenantId()) ?? scope.tenantId;
  const { data, error } = await client
    .from("brands_v2")
    .select("id,slug,name,display_name,tenant_id,parent_brand_id")
    .eq("tenant_id", tenant)
    .eq("is_archived", false);
  if (error) throw Error("Brand access unavailable");
  const brands = (data ?? []).filter(
    (b) => !b.parent_brand_id && isBrandInScope(scope, b),
  );
  const admin = await createAdminClient();
  const assignments = brands.length
    ? await admin
        .from("brand_manager_assignments")
        .select("brand_id,manager_user_id")
        .in(
          "brand_id",
          brands.map((b) => b.id),
        )
    : { data: [], error: null };
  if (assignments.error) throw Error("Assignments unavailable");
  const leadership = can(scope, "reporting", "configure");
  const visible = brands.filter(
    (b) =>
      leadership ||
      assignments.data?.some(
        (a) => a.brand_id === b.id && a.manager_user_id === scope.userId,
      ),
  );
  return {
    scope,
    admin,
    tenant,
    leadership,
    brands: visible,
    assignments: assignments.data ?? [],
    stores: data ?? [],
  };
}
export async function getGoalReview(
  month: string,
  summary = false,
): Promise<GoalReview | null> {
  if (!validGoalMonth(month)) throw Error("Choose a valid month");
  const ctx = await goalContext();
  if (!ctx) return null;
  const { admin, brands, assignments, leadership, scope, tenant } = ctx;
  if (!brands.length) return { month, brands: [], events: [] };
  const { data, error } = await admin
    .from("manager_monthly_goals")
    .select("*")
    .eq("tenant_id", tenant)
    .eq("month", month + "-01")
    .in(
      "brand_id",
      brands.map((b) => b.id),
    );
  if (error) throw Error("Goals could not be loaded");
  const goals = (data ?? []) as ManagerGoal[];
  const events =
    !summary && goals.length
      ? await admin
          .from("manager_goal_events")
          .select("goal_id,actor_id,action,reason,created_at,snapshot")
          .in(
            "goal_id",
            goals.map((g) => g.id),
          )
          .order("created_at", { ascending: false })
          .limit(200)
      : { data: [], error: null };
  if (events.error) throw Error("Goal history unavailable");
  const ids = [
    ...new Set([
      ...assignments.map((a) => a.manager_user_id),
      ...goals.map((g) => g.manager_user_id),
      ...(events.data ?? []).map((e) => e.actor_id),
    ]),
  ];
  const people = ids.length
    ? await admin
        .from("user_profiles")
        .select("user_id,name,email")
        .eq("tenant_id", tenant)
        .in("user_id", ids)
    : { data: [], error: null };
  if (people.error) throw Error("Manager identities unavailable");
  const last = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
  )
    .toISOString()
    .slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const end = last < yesterday ? last : yesterday;
  // Exact UUID filtering after the standard scoped series service; no inferred zero on failure.
  const metrics =
    (!summary || goals.some((g) => g.approved_target !== null)) &&
    month + "-01" <= end
      ? await getDashboardSeries(month + "-01", end).catch(() => null)
      : null;
  return {
    month,
    events: (events.data ?? []).map((e) => ({
      ...e,
      actorName:
        people.data?.find((p) => p.user_id === e.actor_id)?.name ??
        "Team member",
    })) as GoalReview["events"],
    brands: brands.map((b) => {
      const goal = goals.find((g) => g.brand_id === b.id) ?? null;
      const assigned =
        assignments.find((a) => a.brand_id === b.id)?.manager_user_id ?? null;
      const managerId = goal?.manager_user_id ?? assigned;
      const person = people.data?.find((p) => p.user_id === managerId);
      const storeIds = ctx.stores
        .filter((store) => store.id === b.id || store.parent_brand_id === b.id)
        .filter(
          (store) =>
            !ctx.stores.some((child) => child.parent_brand_id === store.id),
        )
        .map((store) => store.id);
      const rows =
        metrics?.rows.filter((r: { brand_id: string }) =>
          storeIds.includes(r.brand_id),
        ) ?? [];
      const recorded = rows.filter((r: { recorded: boolean }) => r.recorded);
      const through =
        recorded
          .map((r: { stat_date: string }) => r.stat_date)
          .sort()
          .at(-1) ?? null;
      const complete = goalCoverage(rows, storeIds, month + "-01", end);
      return {
        id: b.id,
        slug: b.slug,
        name: b.display_name || b.name || b.slug,
        managerId,
        managerName: person?.name || person?.email || "Unassigned",
        goal,
        actual:
          metrics && recorded.length
            ? rows.reduce(
                (sum: number, r: { managed_gmv: number }) =>
                  sum + Number(r.managed_gmv ?? 0),
                0,
              )
            : null,
        through,
        complete,
        canApprove:
          leadership &&
          !scope.impersonating &&
          assigned === managerId &&
          !!managerId,
        canPropose:
          can(scope, "reporting", "write") &&
          !scope.impersonating &&
          assigned === scope.userId &&
          managerId === scope.userId,
      };
    }),
  };
}
