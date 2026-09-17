import { NextResponse } from 'next/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { getActiveTenantId } from '@/lib/auth/platform-admin';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({}, { status: 403 });
  const active = await getActiveTenantId();
  const client = await createClient();
  const { data } = await client.from('tenants').select('name,slug').eq('id', active ?? scope.tenantId).maybeSingle();
  // Official asset from https://brand.thecreatorscorner.io/favicon.png.
  return NextResponse.json({ name: data?.name ?? 'All Brands', logo: data?.slug === 'creators-corner' ? '/logo/creators-corner.png' : null }, { headers: { 'Cache-Control': 'private, no-store' } });
}
