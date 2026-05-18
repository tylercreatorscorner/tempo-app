import { redirect } from 'next/navigation';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { getAllowedBrandsForUser } from '@/lib/data/brands';
import { createAdminClient } from '@/lib/supabase/server';
import { resolveDateRange } from '@/lib/data/date-utils';
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
  const { startDate, endDate } = resolveDateRange(params.range, params.start, params.end);

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
  // Default: managed creators only (Tyler's spec). ?managed=false to include all.
  const managedOnly = params.managed !== 'false';

  return (
    <div className="space-y-6">
      <PostsClient
        brands={brands}
        selectedBrand={selectedBrand}
        startDate={startDate}
        endDate={endDate}
        managedOnly={managedOnly}
      />
    </div>
  );
}
