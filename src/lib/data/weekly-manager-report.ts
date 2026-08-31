/**
 * The internal weekly manager report.
 *
 * Deliberately shares NOTHING with the client report beyond the definition of
 * capture rate. Different purpose (surface problems early, not persuade),
 * different audience, different cadence, and two fields that never go in front
 * of a client at all. It must never render through the public /r/[token] path.
 *
 * The split that matters: the manager types JUDGEMENT, the system computes
 * NUMBERS. GMV, managed GMV, capture rate and posts come from
 * get_brand_week_metrics and are read-only in the form. Capture rate above all,
 * because it is the metric the whole Director of Brands system rests on and the
 * one a manager is most likely to get wrong by hand.
 */
import { createClient, createAdminClient } from '@/lib/supabase/server';

export interface WeekMetrics {
  brandGmv: number;
  managedGmv: number;
  /** null, never 0, when there is no denominator. */
  capturePct: number | null;
  posts: number;
}

export interface WeekCoverage {
  daysCovered: number;
  daysInWeek: number;
  lastDayWithData: string | null;
  priorDaysCovered: number;
}

export interface WeeklyReportRow {
  brandSlug: string;
  brandLabel: string;
  brandId: string;
  managerName: string | null;
  managerUserId: string | null;
  /** True when the signed-in user is the accountable manager for this brand. */
  isMine: boolean;
  current: WeekMetrics;
  prior: WeekMetrics;
  coverage: WeekCoverage;
  submission: WeeklySubmission | null;
}

export interface WeeklySubmission {
  id: string;
  creatorsRecruited: number | null;
  biggestWin: string | null;
  biggestChallenge: string | null;
  nextAction: string | null;
  nextActionDue: string | null;
  clientHealth: 'green' | 'yellow' | 'red' | null;
  clientHealthNote: string | null;
  renewalRisk: 'none' | 'watch' | 'at_risk' | null;
  renewalNote: string | null;
  contractEndsOn: string | null;
  submittedAt: string;
  submittedByName: string | null;
  /** What the row was GRADED on, frozen at submit. See snapshotDrift(). */
  snapCapturePct: number | null;
  snapManagedGmv: number | null;
  snapDaysCovered: number | null;
}

/**
 * The week a report covers: Monday through Sunday.
 *
 * A fixed day is load-bearing. Client reports go out on per-brand cadences, but
 * this one has to land the same day every week or the rows are not comparable
 * and "which reds are new" stops being answerable.
 *
 * Passing no argument gives the most recently COMPLETED week, which is what
 * Monday's meeting is about. The current part-week is never the default.
 */
export function resolveWeek(weekEnding?: string): { weekStart: string; weekEnd: string } {
  const end = weekEnding ? new Date(`${weekEnding}T00:00:00Z`) : lastCompletedSunday();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  return { weekStart: iso(start), weekEnd: iso(end) };
}

function lastCompletedSunday(): Date {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // getUTCDay: 0 = Sunday. Step back to the previous Sunday; if today IS
  // Sunday the week is not finished, so step back a full seven.
  const back = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - back);
  return d;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}

function maybeNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/**
 * How far the live figure has moved from the one this row was graded on.
 *
 * Managed GMV for a past week CHANGES when creators are added to the roster
 * later, because membership does not gate on added_at (migration 180 explains
 * why it must not). Recomputing July today against what it said at the time
 * moved Forchics from $0 to $112,490. So a divergence here is not an error, it
 * is the signal that a roster backfill happened, and the page says so rather
 * than silently showing whichever number it fetched last.
 */
export function snapshotDrift(row: WeeklyReportRow): number | null {
  const snap = row.submission?.snapCapturePct;
  if (snap === null || snap === undefined || row.current.capturePct === null) return null;
  return row.current.capturePct - snap;
}

/**
 * Every brand the signed-in user should see for this week, with the computed
 * figures and any submission already made.
 *
 * The Director sees the whole portfolio (that IS the Monday view: who has not
 * filed). A manager sees only the brands they are accountable for. Note that
 * accountability comes from brand_manager_assignments, NOT user_brand_access:
 * access is many-to-many (catakor has seven people with access) and cannot
 * answer whose report is missing.
 */
export async function getWeeklyReportRows(
  weekStart: string,
  weekEnd: string,
  viewerUserId: string | null,
  seeAll: boolean,
): Promise<WeeklyReportRow[]> {
  const admin = await createAdminClient();

  const { data: assignments, error: aErr } = await admin
    .from('brand_manager_assignments')
    .select('brand_id, manager_user_id, brands_v2!inner(slug, name, display_name, is_archived)');
  if (aErr) {
    console.error('[weekly-report] assignment read failed:', aErr.message);
    return [];
  }

  type A = {
    brand_id: string;
    manager_user_id: string;
    brands_v2: { slug: string; name: string; display_name: string | null; is_archived: boolean | null };
  };
  const rowsIn = ((assignments ?? []) as unknown as A[])
    .filter((a) => !a.brands_v2?.is_archived)
    .filter((a) => seeAll || a.manager_user_id === viewerUserId);
  if (rowsIn.length === 0) return [];

  // Manager display names, one read rather than one per brand.
  const managerIds = Array.from(new Set(rowsIn.map((r) => r.manager_user_id)));
  const { data: people } = await admin
    .from('user_profiles')
    .select('user_id, name, email')
    .in('user_id', managerIds);
  const nameById = new Map<string, string>();
  for (const p of (people ?? []) as { user_id: string; name: string | null; email: string | null }[]) {
    nameById.set(p.user_id, (p.name && p.name.trim()) || p.email || 'Unknown');
  }

  const { data: subs } = await admin
    .from('weekly_manager_reports')
    .select('*')
    .eq('week_ending', weekEnd)
    .in('brand_id', rowsIn.map((r) => r.brand_id));
  const subByBrand = new Map<string, Record<string, unknown>>();
  for (const s of (subs ?? []) as Record<string, unknown>[]) {
    subByBrand.set(String(s.brand_id), s);
  }

  /**
   * Metrics are fetched per brand rather than in one sweep because the RPC is
   * brand-scoped, and a week is cheap (a month across the whole portfolio is
   * ~19s, a week is ~5s, and this is one brand at a time). Failures are
   * non-fatal per brand: one brand's bad read must not blank the Monday view.
   */
  const out = await Promise.all(
    rowsIn.map(async (a) => {
      const slug = a.brands_v2.slug;
      const { data: m, error } = await admin.rpc('get_brand_week_metrics', {
        p_brand_slug: slug,
        p_week_start: weekStart,
        p_week_end: weekEnd,
      });
      if (error) console.error(`[weekly-report] metrics failed for ${slug}:`, error.message);

      const j = (m ?? {}) as Record<string, any>;
      const cur = (j.current ?? {}) as Record<string, unknown>;
      const pri = (j.prior ?? {}) as Record<string, unknown>;
      const cov = (j.coverage ?? {}) as Record<string, unknown>;
      const s = subByBrand.get(a.brand_id);

      return {
        brandSlug: slug,
        brandLabel: a.brands_v2.display_name || a.brands_v2.name || slug,
        brandId: a.brand_id,
        managerName: nameById.get(a.manager_user_id) ?? null,
        managerUserId: a.manager_user_id,
        isMine: a.manager_user_id === viewerUserId,
        current: {
          brandGmv: num(cur.brandGmv),
          managedGmv: num(cur.managedGmv),
          capturePct: maybeNum(cur.capturePct),
          posts: num(cur.posts),
        },
        prior: {
          brandGmv: num(pri.brandGmv),
          managedGmv: num(pri.managedGmv),
          capturePct: maybeNum(pri.capturePct),
          posts: num(pri.posts),
        },
        coverage: {
          daysCovered: num(cov.daysCovered),
          daysInWeek: num(cov.daysInWeek) || 7,
          lastDayWithData: (cov.lastDayWithData as string) ?? null,
          priorDaysCovered: num(cov.priorDaysCovered),
        },
        submission: s
          ? {
              id: String(s.id),
              creatorsRecruited: maybeNum(s.creators_recruited),
              biggestWin: (s.biggest_win as string) ?? null,
              biggestChallenge: (s.biggest_challenge as string) ?? null,
              nextAction: (s.next_action as string) ?? null,
              nextActionDue: (s.next_action_due as string) ?? null,
              clientHealth: (s.client_health as WeeklySubmission['clientHealth']) ?? null,
              clientHealthNote: (s.client_health_note as string) ?? null,
              renewalRisk: (s.renewal_risk as WeeklySubmission['renewalRisk']) ?? null,
              renewalNote: (s.renewal_note as string) ?? null,
              contractEndsOn: (s.contract_ends_on as string) ?? null,
              submittedAt: String(s.submitted_at),
              submittedByName: nameById.get(String(s.submitted_by)) ?? null,
              snapCapturePct: maybeNum(s.snap_capture_pct),
              snapManagedGmv: maybeNum(s.snap_managed_gmv),
              snapDaysCovered: maybeNum(s.snap_days_covered),
            }
          : null,
      } satisfies WeeklyReportRow;
    }),
  );

  // Unfiled first: the Monday question is who has not reported.
  return out.sort((a, b) => {
    if (!a.submission !== !b.submission) return a.submission ? 1 : -1;
    return b.current.brandGmv - a.current.brandGmv;
  });
}

export interface SaveWeeklyReportInput {
  brandSlug: string;
  weekEnding: string;
  creatorsRecruited: number | null;
  biggestWin: string;
  biggestChallenge: string;
  nextAction: string;
  nextActionDue: string | null;
  clientHealth: 'green' | 'yellow' | 'red';
  clientHealthNote: string;
  renewalRisk: 'none' | 'watch' | 'at_risk';
  renewalNote: string;
  contractEndsOn: string | null;
}

/**
 * Write a submission, freezing the computed figures onto it.
 *
 * ⚠️ The snapshot is taken SERVER-SIDE from the RPC, never from anything the
 * form posted. A manager-supplied capture rate is exactly what this system
 * exists to remove, so accepting one over the wire would reintroduce it through
 * the back door.
 *
 * ⚠️ On re-submit the typed fields update but the snapshot is NOT overwritten.
 * The frozen figures record what the week was graded on when it was first
 * filed; rewriting them on a later edit would quietly erase the evidence that
 * the number moved.
 */
export async function saveWeeklyReport(
  input: SaveWeeklyReportInput,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const admin = await createAdminClient();

  const { data: brand } = await admin
    .from('brands_v2')
    .select('id')
    .eq('slug', input.brandSlug)
    .is('parent_brand_id', null)
    .maybeSingle();
  if (!brand) return { ok: false, error: `Unknown brand: ${input.brandSlug}` };
  const brandId = (brand as { id: string }).id;

  const { weekStart, weekEnd } = resolveWeek(input.weekEnding);

  const { data: existing } = await admin
    .from('weekly_manager_reports')
    .select('id, snap_taken_at')
    .eq('brand_id', brandId)
    .eq('week_ending', weekEnd)
    .maybeSingle();

  const typed = {
    brand_id: brandId,
    week_ending: weekEnd,
    submitted_by: userId,
    updated_at: new Date().toISOString(),
    creators_recruited: input.creatorsRecruited,
    biggest_win: input.biggestWin || null,
    biggest_challenge: input.biggestChallenge || null,
    next_action: input.nextAction || null,
    next_action_due: input.nextActionDue,
    client_health: input.clientHealth,
    client_health_note: input.clientHealthNote || null,
    renewal_risk: input.renewalRisk,
    renewal_note: input.renewalNote || null,
    contract_ends_on: input.contractEndsOn,
  };

  // Only compute and freeze the snapshot on FIRST submit.
  let snapshot: Record<string, unknown> = {};
  if (!existing?.snap_taken_at) {
    const { data: m, error } = await admin.rpc('get_brand_week_metrics', {
      p_brand_slug: input.brandSlug,
      p_week_start: weekStart,
      p_week_end: weekEnd,
    });
    if (error) {
      // A failed metrics read must not silently save a report with no numbers
      // attached: the snapshot is the record of what it was graded on.
      return { ok: false, error: `Could not compute this week's figures: ${error.message}` };
    }
    const j = (m ?? {}) as Record<string, any>;
    snapshot = {
      snap_brand_gmv: num(j.current?.brandGmv),
      snap_managed_gmv: num(j.current?.managedGmv),
      snap_capture_pct: maybeNum(j.current?.capturePct),
      snap_posts: num(j.current?.posts),
      snap_prior_brand_gmv: num(j.prior?.brandGmv),
      snap_prior_managed_gmv: num(j.prior?.managedGmv),
      snap_prior_capture_pct: maybeNum(j.prior?.capturePct),
      snap_days_covered: num(j.coverage?.daysCovered),
      snap_taken_at: new Date().toISOString(),
    };
  }

  // Written through the USER's client so RLS applies: only the accountable
  // manager for this brand, or internal staff, can write the row.
  const { error: wErr } = await supabase
    .from('weekly_manager_reports')
    .upsert({ ...typed, ...snapshot }, { onConflict: 'brand_id,week_ending' });
  if (wErr) return { ok: false, error: wErr.message };

  return { ok: true };
}
