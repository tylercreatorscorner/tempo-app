import { NextRequest, NextResponse } from "next/server";
import { getGoalReview, goalContext } from "@/lib/data/manager-goals";
import {
  validGoalMonth,
  validGoalTarget,
} from "@/lib/data/manager-goals-model";
import { assertNotImpersonating } from "@/lib/auth/platform-admin";
import { can } from "@/lib/auth/permissions";
export const maxDuration = 60;
export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month") ?? "";
  if (!validGoalMonth(month))
    return NextResponse.json(
      { error: "Choose a valid month" },
      { status: 400 },
    );
  try {
    const data = await getGoalReview(
      month,
      req.nextUrl.searchParams.get("summary") === "1",
    );
    return NextResponse.json(data ?? { error: "Unauthorized" }, {
      status: data ? 200 : 403,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Review could not be loaded. Please retry." },
      { status: 503 },
    );
  }
}
export async function POST(req: NextRequest) {
  try {
    await assertNotImpersonating();
    const ctx = await goalContext();
    if (!ctx)
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    const input = await req.json();
    if (
      !input ||
      !validGoalMonth(input.month) ||
      !["propose", "approve"].includes(input.action) ||
      !validGoalTarget(input.target) ||
      typeof input.reason !== "string" ||
      input.reason.trim().length < 3 ||
      input.reason.length > 2000 ||
      !Number.isInteger(input.version) ||
      input.version < 0
    )
      return NextResponse.json(
        { error: "Enter a positive target and a reason (3–2,000 characters)." },
        { status: 400 },
      );
    const brand = ctx.brands.find((b) => b.id === input.brandId);
    const manager = ctx.assignments.find(
      (a) => a.brand_id === brand?.id,
    )?.manager_user_id;
    if (
      !brand ||
      !manager ||
      ctx.scope.impersonating ||
      (input.action === "approve"
        ? !ctx.leadership
        : !can(ctx.scope, "reporting", "write") || manager !== ctx.scope.userId)
    )
      return NextResponse.json(
        { error: "You cannot change this goal." },
        { status: 403 },
      );
    const { error } = await ctx.admin.rpc("save_manager_monthly_goal", {
      p_tenant: ctx.tenant,
      p_brand: brand.id,
      p_manager: manager,
      p_month: input.month + "-01",
      p_actor: ctx.scope.userId,
      p_action: input.action,
      p_target: input.target,
      p_reason: input.reason,
      p_version: input.version,
    });
    if (error)
      return NextResponse.json(
        {
          error:
            "The goal or assignment changed, or could not be saved. Reload before trying again.",
        },
        { status: 409 },
      );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Unable to save. Check your session and try again." },
      { status: 400 },
    );
  }
}
