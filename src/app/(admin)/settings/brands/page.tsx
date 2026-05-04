import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/require-admin';
import { BrandsSettingsClient } from './brands-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Brand Settings — Tempo' };

export default async function BrandsSettingsPage() {
  const profile = await requireAdmin();
  if (!profile) redirect('/dashboard');
  return <BrandsSettingsClient />;
}
