import { redirect } from 'next/navigation';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { canOpenBrandSetup } from '@/lib/brands/setup-access';
import { BrandSetupClient } from './setup-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Brand Settings — Tempo' };

export default async function BrandsSettingsPage() {
  const scope = await getWorkspaceScope();
  if (!canOpenBrandSetup(scope)) redirect('/dashboard');
  return <BrandSetupClient />;
}
