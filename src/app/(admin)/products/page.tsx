import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createClient } from '@/lib/supabase/server';
import { resolveDateRange } from '@/lib/data/date-utils';
import { ProductsClient } from './products-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Products — Tempo' };

interface Props {
  searchParams: Promise<{ range?: string; brand?: string; start?: string; end?: string }>;
}

export default async function ProductsPage({ searchParams }: Props) {
  // Server-side gate — non-admin users get bounced to /dashboard.
  const profile = await requireAdmin();
  if (!profile) redirect('/dashboard');

  const params = await searchParams;
  const { startDate, endDate } = resolveDateRange(params.range, params.start, params.end);

  // Brand list — respect tenant + RBAC like analytics page does
  const supabase = await createClient();
  const { getAllowedBrandsForUser } = await import('@/lib/data/brands');
  const allowedBrands = await getAllowedBrandsForUser();
  let brandsQuery = supabase.from('brands_v2').select('slug').eq('is_archived', false);
  if (allowedBrands) brandsQuery = brandsQuery.in('slug', allowedBrands);
  const { data: dbBrands } = await brandsQuery.order('name');
  const brands = (dbBrands ?? []).map((b: { slug: string }) => b.slug);

  const selectedBrand = params.brand && brands.includes(params.brand) ? params.brand : null;

  return (
    <div className="space-y-6">
      <ProductsClient
        brands={brands}
        selectedBrand={selectedBrand}
        startDate={startDate}
        endDate={endDate}
      />
    </div>
  );
}
