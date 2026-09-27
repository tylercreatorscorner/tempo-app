import { redirect } from 'next/navigation';
import { requireScreen } from '@/lib/auth/require-screen';
import { can } from '@/lib/auth/permissions';
import { isBrandInScope } from '@/lib/auth/workspace-scope';
import { createAdminClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/page-header';
import { CreatorInvitesSection } from '@/components/settings/creator-invites-section';
import { OnboardingWorkspace } from './workspace';

export default async function Page({ searchParams }: { searchParams: Promise<{ brand?: string; page?: string }> }) {
  const scope = await requireScreen('roster');
  if (!['owner','admin','manager'].includes(scope.role)) redirect('/roster');
  const db = await createAdminClient();
  const { data: allBrands, error: brandError } = await db.from('brands_v2')
    .select('id,tenant_id,slug,name,display_name,is_archived')
    .eq('tenant_id', scope.tenantId).eq('is_archived', false).is('parent_brand_id', null).order('name');
  if (brandError) throw new Error('Could not load brands.');
  const brands = (allBrands ?? []).filter(brand => isBrandInScope(scope, brand));
  const ids = brands.map(brand => brand.id);
  const [{ data: assignments, error: assignmentError }, { data: forms, error: formError }] = await Promise.all([
    ids.length ? db.from('brand_manager_assignments').select('brand_id,manager_user_id').in('brand_id', ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? db.from('creator_application_forms').select('id,brand_id,title,introduction,questions,version,active')
      .eq('tenant_id', scope.tenantId).in('brand_id', ids) : Promise.resolve({ data: [], error: null }),
  ]);
  if (assignmentError || formError) throw new Error('Could not load creator applications.');
  const assignmentByBrand = new Map((assignments ?? []).map(row => [row.brand_id, row.manager_user_id]));
  const visibleBrands = scope.role === 'manager' ? brands.filter(brand => assignmentByBrand.get(brand.id) === scope.userId) : brands;
  const { brand: requestedBrand, page: requestedPage } = await searchParams;
  const selectedBrand = visibleBrands.find(brand => brand.id === requestedBrand) ?? visibleBrands[0];
  const page = Math.max(1, Math.min(10000, Number.parseInt(requestedPage || '1', 10) || 1));
  const [{ data: submissions, count, error: submissionError }, { count: pendingCount, error: pendingError }] = selectedBrand
    ? await Promise.all([
        db.from('creator_application_submissions').select('id,brand_id,full_name,email,tiktok_handle,discord_username,answers,questions_snapshot,status,decision_note,decided_at,handoff_status,submitted_at', { count: 'exact' })
          .eq('tenant_id', scope.tenantId).eq('brand_id', selectedBrand.id).order('submitted_at', { ascending: false }).range((page - 1) * 25, page * 25 - 1),
        db.from('creator_application_submissions').select('id', { count: 'exact', head: true })
          .eq('tenant_id', scope.tenantId).eq('brand_id', selectedBrand.id).eq('status', 'pending'),
      ])
    : [{ data: [], count: 0, error: null }, { count: 0, error: null }];
  if (submissionError || pendingError) throw new Error('Could not load applications.');
  const visibleIds = new Set(visibleBrands.map(brand => brand.id));
  return <div className="mx-auto max-w-7xl space-y-5">
    <PageHeader title="Onboarding" subtitle="Collect creator applications, review them by brand, and track the handoff after a decision." />
    <OnboardingWorkspace
      brands={visibleBrands.map(brand => ({ id: brand.id, name: brand.display_name || brand.name, slug: brand.slug,
        canDecide: assignmentByBrand.get(brand.id) === scope.userId }))}
      forms={(forms ?? []).filter(form => visibleIds.has(form.brand_id))}
      submissions={submissions ?? []}
      selectedBrandId={selectedBrand?.id ?? ''}
      page={page} totalCount={count ?? 0} pendingCount={pendingCount ?? 0}
      canConfigure={can(scope, 'roster', 'write') && !scope.impersonating}
    />
    {['owner','admin'].includes(scope.role) && <details className="rounded-xl border border-border bg-card p-4">
      <summary className="cursor-pointer text-sm font-semibold">Direct roster invitations</summary>
      <p className="mt-2 text-sm text-muted-foreground">Use these only for creators who have already been approved. This link skips the application review.</p>
      <CreatorInvitesSection tenantId={scope.tenantId} brands={brands.map(brand => ({ slug: brand.slug, name: brand.name, display_name: brand.display_name }))} />
    </details>}
  </div>;
}
