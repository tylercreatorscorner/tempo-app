export interface ManagerGoal {
  id: string;
  tenant_id: string;
  brand_id: string;
  manager_user_id: string;
  month: string;
  proposed_target: number | null;
  proposal_reason: string | null;
  approved_target: number | null;
  approval_reason: string | null;
  approved_at: string | null;
  version: number;
}
export function validGoalMonth(month: unknown): month is string {
  return (
    typeof month === "string" &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(month) &&
    Number(month.slice(0, 4)) >= 2020 &&
    Number(month.slice(0, 4)) <= 2100
  );
}
export function goalProgress(actual: number | null, target: number | null) {
  return target && actual !== null
    ? { percent: (actual / target) * 100, gap: Math.max(0, target - actual) }
    : null;
}
export interface GoalBrand {
  id: string;
  slug: string;
  name: string;
  managerId: string | null;
  managerName: string;
  goal: ManagerGoal | null;
  actual: number | null;
  through: string | null;
  complete: boolean;
  canPropose: boolean;
  canApprove: boolean;
}
export interface GoalReview {
  month: string;
  brands: GoalBrand[];
  events: {
    goal_id: string;
    actorName: string;
    action: string;
    reason: string;
    created_at: string;
    snapshot: ManagerGoal;
  }[];
}

export function validGoalTarget(target: unknown): target is number {
  return (
    typeof target === "number" &&
    Number.isFinite(target) &&
    target >= 0.01 &&
    target <= 99999999999999 &&
    Math.abs(target * 100 - Math.round(target * 100)) < 0.001
  );
}
/** Require every store/day through the last completed day; duplicates cannot hide gaps. */
export function goalCoverage(
  rows: { brand_id: string; stat_date: string; recorded: boolean }[],
  storeIds: string[],
  start: string,
  end: string,
) {
  if (!storeIds.length || end < start) return false;
  const recorded = new Set(
    rows.filter((r) => r.recorded).map((r) => `${r.brand_id}:${r.stat_date}`),
  );
  for (
    let day = new Date(start + "T00:00:00Z");
    day.toISOString().slice(0, 10) <= end;
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    for (const id of storeIds)
      if (!recorded.has(`${id}:${day.toISOString().slice(0, 10)}`))
        return false;
  }
  return true;
}
