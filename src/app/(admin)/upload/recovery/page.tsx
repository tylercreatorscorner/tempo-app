import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/server';
import { marketYesterday } from '@/lib/tiktok/compass';
import { PageHeader } from '@/components/ui/page-header';
import { buttonVariants } from '@/components/ui/button';
import { RecoveryClient } from './recovery-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Source Recovery | Tempo' };
export default async function RecoveryPage() {
  const profile = await requireAdmin();
  if (!profile?.tenant_id) redirect('/dashboard');
  const admin = await createAdminClient();
  const [{ data: brands, error }, { data: connections, error: connectionError }] = await Promise.all([
    admin.from('brands_v2').select('slug,name').eq('tenant_id',profile.tenant_id).eq('is_archived',false).eq('is_umbrella',false).order('name'),
    admin.from('tiktok_shop_connections').select('brand_slug').eq('is_active',true),
  ]);
  if (error || connectionError) throw new Error('Could not load source recovery access.');
  const connected = new Set((connections ?? []).map(c=>c.brand_slug));
  const slugs = (brands ?? []).map(b=>b.slug);
  const history = slugs.length ? await admin.from('tiktok_api_captures').select('response').in('brand_slug',slugs)
    .like('endpoint','recovery/%/manifest').order('captured_at',{ascending:false}).limit(20) : {data:[],error:null};
  if (history.error) throw new Error('Could not load saved recovery results.');
  return <div className="space-y-5">
    <PageHeader eyebrow="Data Ops" title="Source recovery" subtitle="Inspect alternate TikTok sources for an affected day. Captures stay separate until their coverage and metric definitions are reconciled."
      actions={<Link href="/upload" className={buttonVariants({variant:'outline',size:'sm'})}>Data & Imports</Link>} />
    <RecoveryClient brands={(brands ?? []).map(b=>({...b,connected:connected.has(b.slug)}))} latest={marketYesterday()}
      initialResults={(history.data ?? []).map(r=>r.response as Record<string,unknown>)} />
  </div>;
}
