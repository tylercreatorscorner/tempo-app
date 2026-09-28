import { notFound } from 'next/navigation';
import { requireScreen } from '@/lib/auth/require-screen';
import { isBrandInScope } from '@/lib/auth/workspace-scope';
import { createAdminClient } from '@/lib/supabase/server';
import { getCreatorHubCompletion, type CreatorHubEnrollmentItem } from '@/lib/creator-hub/completion';
import { CreatorHubHome } from '@/app/hub/[id]/creator-hub-home';

const examples = [
  {
    id: 'sample-welcome', kind: 'video', required: true, title: 'Welcome to the creator program',
    body: 'Example: meet the brand team and learn what happens after you join.', url: 'https://example.com',
  },
  {
    id: 'sample-guide', kind: 'reading', required: true, title: 'How the community works',
    body: 'Example: where to find announcements, ask questions, and get coaching support.', url: null,
  },
  {
    id: 'sample-terms', kind: 'acknowledgement', required: true, title: 'Payment and deliverable expectations',
    body: 'Sample only. Your brand manager will add the approved terms here before onboarding is enabled.', url: null,
  },
  {
    id: 'sample-resource', kind: 'link', required: false, title: 'Creator resources',
    body: 'Example: find product information and content guidance when you need it.', url: 'https://example.com',
  },
] as const;

export default async function CreatorHubPreviewPage({ searchParams }: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const scope = await requireScreen('roster');
  if (scope.impersonating || !['owner', 'admin', 'manager'].includes(scope.role)) notFound();
  const { brand: slug } = await searchParams;
  if (!slug) notFound();
  const db = await createAdminClient();
  const { data: brand, error } = await db.from('brands_v2')
    .select('id,tenant_id,slug,name,display_name,logo_url,color,is_archived')
    .eq('tenant_id', scope.tenantId).eq('slug', slug).maybeSingle();
  if (error || !brand || brand.is_archived || !isBrandInScope(scope, brand)) notFound();

  const enrollmentItems: CreatorHubEnrollmentItem[] = examples.map((item) => ({
    item_id: item.id, item_version_id: 'sample-version', kind: item.kind,
    required: item.required, completed_at: null, accepted_at: null,
  }));
  const completion = getCreatorHubCompletion('pending', 'preview-only', enrollmentItems);

  return <CreatorHubHome preview enrollmentId="preview-only"
    brandName={brand.display_name || brand.name} brandLogoUrl={brand.logo_url}
    brandColor={brand.color} creatorName="Creator"
    items={examples.map(item => ({ ...item, version: 1, completed_at: null, accepted_at: null }))}
    completion={completion} />;
}
