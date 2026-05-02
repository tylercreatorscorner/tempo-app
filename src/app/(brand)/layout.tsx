import { BrandShell } from '@/components/layout/brand-shell';
import { FeedbackWidget } from '@/components/feedback/FeedbackWidget';
import { loadBrandPortalContext } from '@/lib/data/brand-portal';
import { NoBrandAccess } from './no-brand-access';

export const dynamic = 'force-dynamic';

export default async function BrandLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await loadBrandPortalContext();

  if (ctx.activeBrand === null) {
    return <NoBrandAccess email={ctx.user.email} />;
  }

  return (
    <>
      <BrandShell context={ctx}>{children}</BrandShell>
      <FeedbackWidget />
    </>
  );
}
