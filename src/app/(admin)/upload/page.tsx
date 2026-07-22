import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/page-header';
import { UploadClient } from './upload-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Upload — Tempo' };

const UMBRELLA_BRAND_SLUGS = new Set(['leefar']);

export default async function UploadPage() {
  // Server-side gate: only owner/admin can render this page.
  const profile = await requireAdmin();
  if (!profile) {
    redirect('/dashboard');
  }

  // Pull active brands dynamically from brands_v2 — no hardcoded list — so
  // newly added brands show up in the upload UI without a code deploy and
  // archived brands (e.g. Toplux) drop out automatically.
  const admin = await createAdminClient();
  const { data: brandRows } = await admin
    .from('brands_v2')
    .select('slug, name')
    .eq('is_archived', false)
    .order('name');
  const activeBrands = (brandRows as Array<{ slug: string; name: string }> | null ?? [])
    .filter(b => !UMBRELLA_BRAND_SLUGS.has(b.slug));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Data Ops"
        title="Upload"
        subtitle="Keep every brand current — drop TikTok Shop exports, watch the gaps clear as they land."
      />
      <UploadClient activeBrands={activeBrands} />
    </div>
  );
}
