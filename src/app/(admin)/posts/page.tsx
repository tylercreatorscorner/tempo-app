import { redirect } from 'next/navigation';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { getAllowedBrandsForUser } from '@/lib/data/brands';
import { createAdminClient } from '@/lib/supabase/server';
import { resolveDateRange } from '@/lib/data/date-utils';
import { getDataAnchorDate } from '@/lib/data/data-anchor';
import { PostsClient } from './posts-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Posts — Tempo' };

interface Props {
  searchParams: Promise<{ range?: string; brand?: string; start?: string; end?: string; managed?: string }>;
}

export default async function PostsPage({ searchParams }: Props) {
  // Any Workspace user; /api/posts scopes the data to their brands.
  const scope = await getWorkspaceScope();
  if (!scope) redirect('/dashboard');
  const allowedBrands = await getAllowedBrandsForUser(); // null = all (owner/admin)

  const params = await searchParams;

  // Pull active brands dynamically so the filter pills stay in sync with
  // brands_v2 (no hardcoded list). Umbrella brands are excluded so their
  // stats don't double-count alongside their child shops — `is_umbrella`
  // is the canonical flag (replaces the old hardcoded `slug !== 'leefar'`).
  const supabase = await createAdminClient();
  const { data: dbBrands } = await supabase
    .from('brands_v2')
    .select('slug, is_umbrella')
    .eq('is_archived', false)
    .order('name');
  const brands = (dbBrands ?? [])
    .filter((b: { slug: string; is_umbrella: boolean | null }) => !b.is_umbrella)
    .map((b: { slug: string }) => b.slug)
    .filter((slug: string) => !allowedBrands || allowedBrands.includes(slug));

  const selectedBrand = params.brand && brands.includes(params.brand) ? params.brand : null;

  // Rolling presets end at the last day with data, not calendar yesterday.
  // Scoped to what this page is showing, never per brand inside a total.
  // See the note on resolveDateRange.
  const dataThrough = await getDataAnchorDate(selectedBrand ? [selectedBrand] : brands);
  const { startDate, endDate, lagDays, anchorDate } =
    resolveDateRange(params.range, params.start, params.end, dataThrough);
  // Non-null only when the window actually moved; see DateRangePicker.
  const staleThrough = lagDays > 0 ? anchorDate : null;
  // Default: ALL creators (owner's call, 2026-07-23 rebuild). ?managed=true
  // opts into the managed-only scope.
  const managedOnly = params.managed === 'true';

  return (
    <div className="space-y-6">
      <PostsClient
        brands={brands}
        selectedBrand={selectedBrand}
        startDate={startDate}
        endDate={endDate}
        staleThrough={staleThrough}
        managedOnly={managedOnly}
      />
    </div>
  );
}
