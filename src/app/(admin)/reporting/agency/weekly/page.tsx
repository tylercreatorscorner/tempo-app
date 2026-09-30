import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { CreatorPortrait } from '@/components/creators/creator-portrait';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { clientReportContext } from '@/lib/auth/client-report-access';
import { buildAgencySnapshot } from '@/lib/data/agency-report';
import { resolveWeek } from '@/lib/data/weekly-manager-report';
import { createAdminClient } from '@/lib/supabase/server';
import type { AgencyBrandRow } from '@/lib/data/agency-report';
import type { BrandRegistry } from '@/lib/data/brand-registry-core';
import { fetchDiscordAvatars } from '@/lib/discord/avatars';

export const dynamic = 'force-dynamic';

const money = (value: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
}).format(value);
const pct = (value: number) => `${value.toFixed(1)}%`;
const change = (current: number, prior: number) => prior > 0 ? ((current - prior) / prior) * 100 : null;
const signed = (value: number | null, unit = '%') =>
  value === null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)}${unit}`;
const tone = (value: number | null) =>
  value === null ? 'text-muted-foreground' : value < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400';
const day = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US', {
  month: 'short', day: 'numeric', timeZone: 'UTC',
});
function shift(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
type Submission = {
  brand_id: string;
  next_action: string | null;
  next_action_due: string | null;
  client_health: string | null;
};
type Manager = { id: string; name: string; avatar: string | null; brands: string[] };

async function loadManagers(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  registry: BrandRegistry,
  tenantId: string,
): Promise<Manager[]> {
  const brands = registry.rows.filter(brand => !brand.is_archived && !brand.parent_brand_id);
  if (!brands.length) return [];
  const assignmentResult = await admin.from('brand_manager_assignments')
    .select('brand_id,manager_user_id').in('brand_id', brands.map(brand => brand.id));
  if (assignmentResult.error) throw new Error('Manager assignments could not be loaded.');
  const assignments = assignmentResult.data ?? [];
  const ids = [...new Set(assignments.map(row => row.manager_user_id))];
  const profileResult = ids.length ? await admin.from('user_profiles')
    .select('user_id,name,email,discord_id,discord_avatar')
    .eq('tenant_id', tenantId).in('user_id', ids) : { data: [], error: null };
  if (profileResult.error) throw new Error('Manager profiles could not be loaded.');
  const profiles = profileResult.data ?? [];
  const discordIds = profiles.map(profile => profile.discord_id)
    .filter((id): id is string => typeof id === 'string' && /^\d{17,20}$/.test(id));
  const avatars = discordIds.length ? await fetchDiscordAvatars(discordIds) : {};
  const groups = new Map<string, Manager>();
  for (const brand of brands) {
    const assignment = assignments.find(row => row.brand_id === brand.id);
    const profile = profiles.find(row => row.user_id === assignment?.manager_user_id);
    const id = profile?.user_id ?? (assignment ? `unavailable:${brand.id}` : 'unassigned');
    const group: Manager = groups.get(id) ?? {
      id,
      name: profile?.name || profile?.email || (assignment ? 'Manager profile unavailable' : 'Unassigned'),
      avatar: profile?.discord_id ? avatars[profile.discord_id] || profile.discord_avatar : profile?.discord_avatar ?? null,
      brands: [],
    };
    group.brands.push(brand.slug);
    groups.set(id, group);
  }
  return [...groups.values()];
}

export default async function WeeklyAgencyBrief({ searchParams }: {
  searchParams: Promise<{ week?: string }>;
}) {
  const scope = await getWorkspaceScope();
  if (!scope) redirect('/login');
  // This view covers every client and exposes internal manager assessments.
  if (!scope.tenantId || (scope.role !== 'owner' && scope.role !== 'admin') ||
      !scope.canViewFinance || scope.brandScope.kind !== 'all' || scope.impersonating) redirect('/reporting');

  const latest = resolveWeek();
  const requested = (await searchParams).week;
  const valid = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) &&
    !Number.isNaN(Date.parse(`${requested}T00:00:00Z`)) &&
    new Date(`${requested}T00:00:00Z`).getUTCDay() === 0 && requested <= latest.weekEnd;
  const { weekStart, weekEnd } = valid ? resolveWeek(requested) : latest;
  const context = await clientReportContext(scope, 'all');
  const brandIds = context.registry.rows.filter(brand => !brand.is_archived && !brand.parent_brand_id).map(brand => brand.id);
  const admin = await createAdminClient();
  const priorStart = shift(weekStart, -7);
  const priorEnd = shift(weekEnd, -7);
  const [snapshot, managers, submissions, currentGaps, priorGaps] = await Promise.all([
    buildAgencySnapshot(weekStart, weekEnd, context, 'weekly'),
    loadManagers(admin, context.registry, scope.tenantId),
    brandIds.length ? admin.from('weekly_manager_reports')
      .select('brand_id,next_action,next_action_due,client_health')
      .eq('week_ending', weekEnd).in('brand_id', brandIds) : Promise.resolve({ data: [], error: null }),
    admin.rpc('get_agency_coverage_gaps_workspace', { p_tenant_id: scope.tenantId, p_start: weekStart, p_end: weekEnd }),
    admin.rpc('get_agency_coverage_gaps_workspace', { p_tenant_id: scope.tenantId, p_start: priorStart, p_end: priorEnd }),
  ]);
  if (submissions.error) throw new Error('Manager updates could not be loaded.');
  if (!managers) throw new Error('Manager assignments could not be loaded.');
  const submissionByBrand = new Map((submissions.data as Submission[]).map(row => [row.brand_id, row]));
  const currentMissing = new Set<string>(((currentGaps.data ?? []) as Array<{ brand_name: string }>).map(row => row.brand_name));
  const priorMissing = new Set<string>(((priorGaps.data ?? []) as Array<{ brand_name: string }>).map(row => row.brand_name));
  const coverageKnown = !currentGaps.error && !priorGaps.error;
  const ready = (brand: AgencyBrandRow) => coverageKnown &&
    !currentMissing.has(brand.name) && !priorMissing.has(brand.name) &&
    !(brand.storeGmv === 0 && brand.priorStoreGmv > 0);
  const submissionFor = (brand: AgencyBrandRow) =>
    submissionByBrand.get(context.registry.bySlug.get(brand.slug)?.id ?? '');
  const reportedSlugs = new Set(snapshot.brands.map(brand => brand.slug));
  const missingSlugs = new Set(context.registry.rows
    .filter(brand => !brand.is_archived && !brand.parent_brand_id && !reportedSlugs.has(brand.slug))
    .map(brand => brand.slug));
  const missingBrands: AgencyBrandRow[] = context.registry.rows
    .filter(brand => missingSlugs.has(brand.slug))
    .map(brand => ({
      slug: brand.slug, name: brand.display_name || brand.name, color: brand.color || '',
      storeGmv: 0, priorStoreGmv: 0, rosterGmv: 0, priorRosterGmv: 0,
      signed: 0, retained: 0, committedRetainer: 0, momPct: null, sharePct: null,
    }));
  const dataBrands = [...snapshot.brands, ...missingBrands];
  const hasData = (brand: AgencyBrandRow) => !missingSlugs.has(brand.slug);
  const readyWithData = (brand: AgencyBrandRow) => hasData(brand) && ready(brand);
  const covered = dataBrands.length > 0 && dataBrands.every(readyWithData);
  const totals = snapshot.totals;
  const managedDelta = covered ? change(totals.rosterGmv, totals.priorRosterGmv) : null;
  const storeDelta = covered ? change(totals.storeGmv, totals.priorStoreGmv) : null;
  const share = totals.storeGmv > 0 ? totals.rosterGmv / totals.storeGmv * 100 : null;
  const priorShare = totals.priorStoreGmv > 0 ? totals.priorRosterGmv / totals.priorStoreGmv * 100 : null;
  const shareDelta = covered && share !== null && priorShare !== null ? share - priorShare : null;
  const assigned = managers.filter(manager => manager.id !== 'unassigned');
  const assignedSlugs = new Set(assigned.flatMap(manager => manager.brands));
  const filed = dataBrands.filter(brand => assignedSlugs.has(brand.slug) && submissionFor(brand)).length;
  const updateCount = dataBrands.filter(brand => assignedSlugs.has(brand.slug)).length;
  const sorted = [...dataBrands].sort((a, b) => {
    const priority = (row: AgencyBrandRow) =>
      !readyWithData(row) ? -2 : typeof row.sharePts === 'number' && row.sharePts < 0 ? -1 : 0;
    return priority(a) - priority(b) || b.rosterGmv - a.rosterGmv;
  });
  const agenda = sorted
    .filter(brand => {
      const submission = submissionFor(brand);
      return !readyWithData(brand) || submission?.client_health === 'red' ||
        (typeof brand.sharePts === 'number' && brand.sharePts < -1);
    })
    .slice(0, 3);

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      <PageHeader eyebrow="Internal · All brands" title="Weekly agency brief"
        subtitle={`${day(weekStart)}–${day(weekEnd)} · Monday–Sunday · ${filed} of ${updateCount} assigned-brand updates filed`}
        actions={<div className="flex items-center gap-2">
          <Link href={`/reporting/agency/weekly?week=${shift(weekEnd, -7)}`} aria-label="Previous week"
            className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted"><ChevronLeft className="h-4 w-4" /></Link>
          {weekEnd < latest.weekEnd && <Link href={`/reporting/agency/weekly?week=${shift(weekEnd, 7)}`} aria-label="Next week"
            className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted"><ChevronRight className="h-4 w-4" /></Link>}
          <Link href={`/reporting/weekly?week=${weekEnd}`} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted">Manager submissions</Link>
        </div>} />

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            {!covered ? 'Check data coverage before the meeting.' : managedDelta === null
              ? 'Review this week’s portfolio movement.' : managedDelta >= 0
                ? 'Managed creator GMV increased this week.' : 'Managed creator GMV declined this week.'}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {covered
              ? `Managed creators generated ${money(totals.rosterGmv)} across ${totals.clients} client stores, ${signed(managedDelta)} against the prior seven days. The brand movement below identifies who owns the next step.`
              : 'One or more brands lack a complete seven-day comparison. Current recorded totals remain visible; movement claims are withheld until coverage is complete.'}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Meeting agenda</h2>
          {agenda.length ? <ol className="mt-2 space-y-2 text-sm">
            {agenda.map(brand => {
              const submission = submissionFor(brand);
              return <li key={brand.slug}><span className="font-semibold text-primary">{brand.name}</span>
                {' · '}{!readyWithData(brand) ? 'Check data coverage' :
                  submission?.next_action || (typeof brand.sharePts === 'number' && brand.sharePts < 0 ? 'Review managed share decline' : 'Review manager update')}
              </li>;
            })}
          </ol> : <p className="mt-2 text-sm text-muted-foreground">No coverage gaps or share declines met the attention threshold.</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-4">
        {[
          ['Managed GMV', money(totals.rosterGmv), covered ? `${signed(managedDelta)} vs prior week` : 'Comparison unavailable', managedDelta],
          ['Total store GMV', money(totals.storeGmv), covered ? `${signed(storeDelta)} vs prior week` : 'Comparison unavailable', storeDelta],
          ['Managed share', share === null ? '—' : pct(share), covered ? `${signed(shareDelta, ' pts')} vs prior week` : 'Comparison unavailable', shareDelta],
          ['Manager updates', `${filed} / ${updateCount}`, 'Filed for assigned brands', null],
        ].map(([label, value, detail, delta]) => <div key={String(label)} className="bg-card p-4">
          <span className="text-xs text-muted-foreground">{label}</span>
          <strong className="mt-2 block text-2xl font-semibold tracking-tight tabular-nums">{value}</strong>
          <span className={`text-xs ${typeof delta === 'number' ? tone(delta) : 'text-muted-foreground'}`}>{detail}</span>
        </div>)}
      </div>

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">Brand movement &amp; owner actions</h2>
          <span className="text-xs text-muted-foreground">Coverage gaps first · current assignments</span>
        </div>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-4 py-3">Brand</th><th className="px-3 py-3 text-right">Managed GMV</th>
                <th className="px-3 py-3 text-right">vs prior week</th><th className="px-3 py-3 text-right">Managed share</th>
                <th className="px-3 py-3">Manager</th><th className="px-4 py-3">Next action</th></tr>
            </thead>
            <tbody>{sorted.map(brand => {
              const submission = submissionFor(brand);
              const hasCoverage = readyWithData(brand);
              const delta = hasCoverage ? change(brand.rosterGmv, brand.priorRosterGmv) : null;
              const manager = managers?.find(person => person.brands.includes(brand.slug));
              return <tr key={brand.slug} className="border-b border-border/70 last:border-0">
                <td className="px-4 py-3 font-semibold">{brand.name}</td>
                <td className="px-3 py-3 text-right tabular-nums">{hasData(brand) ? money(brand.rosterGmv) : 'No data'}</td>
                <td className={`px-3 py-3 text-right tabular-nums ${tone(delta)}`}>{hasCoverage ? signed(delta) : 'Check coverage'}</td>
                <td className="px-3 py-3 text-right tabular-nums">{brand.sharePct === null ? '—' : pct(brand.sharePct)}
                  {hasCoverage && typeof brand.sharePts === 'number' && <span className={`ml-1 text-xs ${tone(brand.sharePts)}`}>{signed(brand.sharePts, ' pts')}</span>}</td>
                <td className="px-3 py-3">{manager ? <span className="inline-flex items-center gap-2">
                  <CreatorPortrait name={manager.name} source={manager.avatar} className="inline-grid h-6 w-6 place-items-center rounded-full bg-primary/10 object-cover text-[9px] font-bold text-primary" />{manager.name}
                </span> : 'Unassigned'}</td>
                <td className="max-w-[280px] px-4 py-3 text-xs">
                  {submission?.next_action ? <><span className="block truncate font-semibold" title={submission.next_action}>{submission.next_action}</span>
                    {submission.next_action_due && <span className="text-muted-foreground">Due {day(submission.next_action_due)}</span>}</>
                    : <span className="text-muted-foreground">{manager ? 'Awaiting manager update' : 'Assign a manager'}</span>}
                </td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">Manager check-in</h2>
          <span className="text-xs text-muted-foreground">Recorded GMV · submissions · next step</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(managers ?? []).filter(manager => !manager.id.startsWith('unavailable:') && manager.id !== 'unassigned').map(manager => {
            const owned = dataBrands.filter(brand => manager.brands.includes(brand.slug));
            const complete = owned.length > 0 && owned.every(readyWithData);
            const current = owned.reduce((sum, brand) => sum + brand.rosterGmv, 0);
            const prior = owned.reduce((sum, brand) => sum + brand.priorRosterGmv, 0);
            const delta = complete ? change(current, prior) : null;
            const updates = owned.filter(brand => submissionFor(brand)).length;
            return <div key={manager.id} className="border-t-2 border-border pt-3">
              <div className="flex items-center gap-2">
                <CreatorPortrait name={manager.name} source={manager.avatar} className="inline-grid h-7 w-7 place-items-center rounded-full bg-primary/10 object-cover text-[10px] font-bold text-primary" />
                <strong className="text-sm">{manager.name}</strong>
                <span className={`ml-auto text-sm tabular-nums ${tone(delta)}`}>{complete ? signed(delta) : 'Coverage pending'}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{owned.some(hasData) ? money(current) : 'No recorded GMV'} managed GMV · {updates}/{owned.length} updates filed · {owned.length} brands</p>
              <p className="mt-1 line-clamp-2 text-xs">{owned.map(submissionFor).find(row => row?.next_action)?.next_action || 'Next steps pending manager submissions.'}</p>
            </div>;
          })}
        </div>
      </section>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Internal leadership view. Weekly GMV and share compare matched seven-day windows only where both weeks have full coverage.
        Manager actions come from submitted weekly reviews. Monthly retainer commitments and return multiples are intentionally omitted.
        {snapshot.caveats.length > 0 && ` Data notes: ${snapshot.caveats.join(' ')}`}
      </p>
    </div>
  );
}
