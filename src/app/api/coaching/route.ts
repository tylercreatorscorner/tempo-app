import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/lib/auth/permissions";
import { guardScreen } from "@/lib/auth/require-screen";
import { createAdminClient } from "@/lib/supabase/server";
import { blankDraft, draftSchema, validWeek } from "@/lib/coaching/model";

export const dynamic = "force-dynamic";
async function access() {
  const scope = await guardScreen("reporting");
  if (scope instanceof NextResponse) return scope;
  if (
    scope.impersonating ||
    !["owner", "admin", "manager", "coach"].includes(scope.role)
  )
    return NextResponse.json(
      { error: "Coaching access denied." },
      { status: 403 },
    );
  return scope;
}
export async function GET(req: NextRequest) {
  const scope = await access();
  if (scope instanceof NextResponse) return scope;
  const week = req.nextUrl.searchParams.get("week") ?? "";
  if (!validWeek(week))
    return NextResponse.json(
      { error: "Choose a week starting Monday." },
      { status: 400 },
    );
  try {
    const db = await createAdminClient();
    const admin = ["owner", "admin"].includes(scope.role);
    let brandQuery = db
      .from("brands_v2")
      .select("id,name,display_name")
      .eq("tenant_id", scope.tenantId)
      .eq("is_archived", false)
      .order("name");
    if (scope.brandScope.kind === "scoped")
      brandQuery = brandQuery.in("id", scope.brandScope.brandIds);
    const brandResult = await brandQuery;
    if (brandResult.error) throw brandResult.error;
    const brands = (brandResult.data ?? []).map((b) => ({
      id: b.id,
      name: b.display_name || b.name,
    }));
    let assignmentQuery = db
      .from("coaching_assignments")
      .select("id,brand_id,coach_id,reviewer_id,active")
      .eq("tenant_id", scope.tenantId)
      .in(
        "brand_id",
        brands.map((b) => b.id),
      )
      .eq("active", true)
      .order("created_at");
    if (!admin)
      assignmentQuery = assignmentQuery.or(
        `coach_id.eq.${scope.userId},reviewer_id.eq.${scope.userId}`,
      );
    const assignmentResult = await assignmentQuery;
    if (assignmentResult.error) throw assignmentResult.error;
    const assignments = assignmentResult.data ?? [];
    let peopleQuery = db
      .from("user_profiles")
      .select("user_id,name,email")
      .eq("tenant_id", scope.tenantId)
      .in("role", ["owner", "admin", "manager", "coach"])
      .order("name");
    if (!admin)
      peopleQuery = peopleQuery.in("user_id", [
        ...new Set(assignments.flatMap((a) => [a.coach_id, a.reviewer_id])),
      ]);
    const [peopleResult, reportResult] = await Promise.all([
      peopleQuery,
      db
        .from("coaching_weekly_reports")
        .select(
          "id,assignment_id,week_start,draft,version,revision,status,updated_at",
        )
        .eq("tenant_id", scope.tenantId)
        .in(
          "assignment_id",
          assignments.map((a) => a.id),
        )
        .eq("week_start", week),
    ]);
    if (peopleResult.error || reportResult.error)
      throw new Error("read failed");
    const reports = (reportResult.data ?? []).map((report) => ({
      ...report,
      draft:
        assignments.find((a) => a.id === report.assignment_id)?.coach_id ===
        scope.userId
          ? report.draft
          : blankDraft(),
    }));
    const submissionsResult = await db
      .from("coaching_submissions")
      .select("id,report_id,revision,content,submitted_by,submitted_at")
      .eq("tenant_id", scope.tenantId)
      .in(
        "report_id",
        reports.map((r) => r.id),
      )
      .order("revision");
    if (submissionsResult.error) throw submissionsResult.error;
    const submissions = submissionsResult.data ?? [];
    const reviewsResult = await db
      .from("coaching_reviews")
      .select("id,submission_id,decision,note,reviewed_by,reviewed_at")
      .eq("tenant_id", scope.tenantId)
      .in(
        "submission_id",
        submissions.map((s) => s.id),
      );
    if (reviewsResult.error) throw reviewsResult.error;
    return NextResponse.json(
      {
        userId: scope.userId,
        admin,
        canWrite: can(scope, "reporting", "write"),
        canConfigure: admin && can(scope, "reporting", "configure"),
        brands,
        people: peopleResult.data ?? [],
        assignments,
        reports,
        submissions,
        reviews: reviewsResult.data ?? [],
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error(
      "[coaching] read failed",
      error instanceof Error ? error.message : "Database read failed",
    );
    return NextResponse.json(
      { error: "Coaching records could not be loaded. Please retry." },
      { status: 503 },
    );
  }
}
const writeSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("assign"),
      brandId: z.uuid(),
      coachId: z.uuid(),
      reviewerId: z.uuid(),
    })
    .strict(),
  z
    .object({
      action: z.enum(["save", "submit"]),
      assignmentId: z.uuid(),
      week: z.string(),
      expected: z.number().int().min(0),
      payload: draftSchema,
    })
    .strict(),
  z
    .object({
      action: z.enum(["reviewed", "changes_requested"]),
      assignmentId: z.uuid(),
      week: z.string(),
      expected: z.number().int().min(0),
      payload: z.object({ note: z.string().max(5000) }).strict(),
    })
    .strict(),
]);
export async function POST(req: NextRequest) {
  const scope = await access();
  if (scope instanceof NextResponse) return scope;
  // Same-origin browser mutation, in addition to authenticated server-side scope.
  if (req.headers.get("origin") !== req.nextUrl.origin)
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = writeSchema.safeParse(raw);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Check the form fields and try again." },
      { status: 400 },
    );
  const input = parsed.data;
  if (!can(scope, "reporting", input.action === "assign" ? "configure" : "write")) return NextResponse.json({error: "Reporting edit permission is required."}, {status:403});
  if (input.action !== "assign" && !validWeek(input.week))
    return NextResponse.json(
      { error: "Choose a valid week starting Monday." },
      { status: 400 },
    );
  if (input.action === "assign" && !["owner", "admin"].includes(scope.role))
    return NextResponse.json(
      { error: "Only administrators can assign coaches." },
      { status: 403 },
    );
  const db = await createAdminClient();
  const { error } = await db.rpc("write_coaching_record", {
    p_actor: scope.userId,
    p_tenant: scope.tenantId,
    p_action: input.action,
    p_assignment: input.action === "assign" ? null : input.assignmentId,
    p_week: input.action === "assign" ? null : input.week,
    p_payload:
      input.action === "assign"
        ? {
            brandId: input.brandId,
            coachId: input.coachId,
            reviewerId: input.reviewerId,
          }
        : input.payload,
    p_expected: input.action === "assign" ? 0 : input.expected,
  });
  if (error) {
    const safe =
      error.code === "P0001"
        ? error.message
        : error.code === "23505"
          ? "This coach already has an assignment for this brand."
          : "Could not save coaching records. Please retry.";
    return NextResponse.json(
      { error: safe },
      { status: error.code === "P0001" || error.code === "23505" ? 409 : 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
