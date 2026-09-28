import { notFound } from 'next/navigation';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { getDiscordIdentity } from '@/lib/applications/discord-identity';
import { getCreatorHubCompletion, type CreatorHubEnrollmentItem } from '@/lib/creator-hub/completion';
import { CreatorHubChecklist } from './creator-hub-checklist';

export default async function Page({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ discord?: string }>;
}) {
  const { id } = await params;
  const { discord } = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();
  const db = await createAdminClient();
  const { data: enrollment } = await db.from('creator_hub_enrollments')
    .select('id,application_id,tenant_id,brand_id,discord_user_id,status,snapshot_finalized_at')
    .eq('id', id).maybeSingle();
  if (!enrollment) notFound();
  const { data: application } = await db.from('creator_application_submissions')
    .select('id,form_id,full_name,status,discord_user_id')
    .eq('id', enrollment.application_id).eq('tenant_id', enrollment.tenant_id)
    .eq('brand_id', enrollment.brand_id).maybeSingle();
  if (!application || application.status !== 'approved' ||
      application.discord_user_id !== enrollment.discord_user_id) notFound();
  const identity = await getDiscordIdentity();
  const connected = Boolean(identity && identity.id === enrollment.discord_user_id && identity.formId === application.form_id);
  const otherAccount = identity && !connected;
  if (!connected) return <main className="min-h-screen bg-[#f7f6fa] px-4 py-16 text-[#24212e]">
    <div className="mx-auto max-w-lg rounded-2xl border border-[#e8e5ee] bg-white p-7 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#7548ca]">Tempo Creator Hub</p>
      <h1 className="mt-2 text-2xl font-semibold">Connect Discord to continue</h1>
      <p className="mt-2 text-sm leading-6 text-[#696574]">Use the same Discord account you connected when you applied. Your Hub progress and acknowledgments are tied to that account.</p>
      {otherAccount && <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">This Discord account does not match the approved application. Switch accounts before continuing.</p>}
      {discord && discord !== 'connected' && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">Discord sign-in did not finish. Please try again.</p>}
      <a className="mt-6 inline-flex rounded-lg bg-[#7548ca] px-4 py-2.5 text-sm font-semibold text-white" href={`/auth/discord/application/start?form=${encodeURIComponent(application.form_id)}&hub=${encodeURIComponent(id)}`}>Connect Discord</a>
    </div>
  </main>;

  const [{ data: brand }, { data: rows, error: itemError }] = await Promise.all([
    db.from('brands_v2').select('name,display_name').eq('id', enrollment.brand_id)
      .eq('tenant_id', enrollment.tenant_id).maybeSingle(),
    db.from('creator_hub_enrollment_items')
      .select('id,item_id,item_version_id,kind,required,completed_at,accepted_at')
      .eq('enrollment_id', id).eq('tenant_id', enrollment.tenant_id)
      .eq('brand_id', enrollment.brand_id),
  ]);
  if (itemError || !brand || !enrollment.snapshot_finalized_at) notFound();
  const itemIds = (rows ?? []).map((row) => row.item_id);
  const versionIds = (rows ?? []).map((row) => row.item_version_id);
  const [{ data: definitions }, { data: versions }] = await Promise.all([
    itemIds.length ? db.from('creator_hub_items').select('id,sort_order')
      .eq('tenant_id', enrollment.tenant_id).eq('brand_id', enrollment.brand_id).in('id', itemIds)
      : Promise.resolve({ data: [] }),
    versionIds.length ? db.from('creator_hub_item_versions').select('id,title,content,version')
      .in('id', versionIds) : Promise.resolve({ data: [] }),
  ]);
  const order = new Map((definitions ?? []).map((row) => [row.id, row.sort_order]));
  const versionMap = new Map((versions ?? []).map((row) => [row.id, row]));
  const items = (rows ?? []).map((row) => {
    const version = versionMap.get(row.item_version_id);
    const content = version?.content && typeof version.content === 'object' && !Array.isArray(version.content)
      ? version.content as { body?: string; url?: string } : {};
    return {
      ...row, title: version?.title ?? 'Hub item', version: version?.version ?? 1,
      body: content.body ?? '', url: content.url ?? null, order: order.get(row.item_id) ?? 0,
    };
  }).sort((left, right) => left.order - right.order);
  const completion = getCreatorHubCompletion(
    enrollment.status as 'pending' | 'in_progress' | 'complete', enrollment.snapshot_finalized_at,
    items as CreatorHubEnrollmentItem[],
  );
  return <CreatorHubChecklist enrollmentId={id} brandName={brand.display_name || brand.name}
    creatorName={application.full_name} items={items} completion={completion} />;
}
