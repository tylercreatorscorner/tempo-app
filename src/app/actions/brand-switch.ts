'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { ACTIVE_BRAND_COOKIE } from '@/lib/brand-portal-cookies';

/**
 * Switches which brand the current brand-role user is viewing in the portal.
 * Verifies the user actually has access to the requested brand before
 * setting the cookie so it can't be used to peek at other brands.
 */
export async function setActiveBrand(brandSlug: string) {
  const slug = brandSlug.trim().toLowerCase();
  if (!slug) throw new Error('Missing brand slug.');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  // Only brand-role users use this switcher; admins don't go through brand portal layout.
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!profile || (profile.role !== 'brand' && profile.role !== 'brand_contact')) {
    throw new Error('Not a brand-portal user.');
  }

  // Verify the requested slug is in the user's user_brand_access list
  const admin = await createAdminClient();
  const { data: brand } = await admin
    .from('brands_v2')
    .select('id, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (!brand) throw new Error('Brand not found.');

  const { data: access } = await admin
    .from('user_brand_access')
    .select('brand_id')
    .eq('user_id', user.id)
    .eq('brand_id', brand.id)
    .maybeSingle();
  if (!access) throw new Error("You don't have access to that brand.");

  // 30-day cookie — long enough to feel sticky, short enough to expire if revoked.
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_BRAND_COOKIE, slug, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect('/brand-dashboard');
}
