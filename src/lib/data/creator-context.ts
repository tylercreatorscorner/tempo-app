import { getCreatorSession, getCurrentBrandCookie } from '@/lib/auth/creator-auth';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getBrandRegistry, uuidToSlug } from '@/lib/data/brand-registry';
import { loadCreatorPortalProfile } from '@/lib/data/creator-portal';
import { cookies } from 'next/headers';

export interface CreatorAccount {
  id: string;
  tiktok_username: string;
  brand_id: string;
  brand: string; // slug, derived from brand_id
  is_primary: boolean;
  verified: boolean;
}

export interface CreatorProfile {
  creator_id: string;
  real_name: string;
  email: string;
  accounts: CreatorAccount[];
  brands: string[]; // slugs
  current_brand: string | null; // slug, null = "All Brands"
}

/** Load full creator profile from session. Returns null if not authenticated. */
export async function getCreatorProfile(): Promise<CreatorProfile | null> {
  const session = await getCreatorSession();
  if (!session) return null;

  // Dev preview mode: JWT is already verified — use admin client to bypass RLS
  // since there's no Supabase auth user to satisfy row policies.
  const isDev = process.env.NODE_ENV !== 'production';
  const cookieStore = await cookies();
  const isDevPreview = isDev && !!cookieStore.get('dev_creator_preview')?.value;
  const supabase = isDevPreview ? await createAdminClient() : await createClient();

  // Get creator record from creators_v2
  const { data: creator } = await supabase
    .from('creators_v2')
    .select('id, real_name, email')
    .eq('id', session.creatorId)
    .single();

  if (!creator) return null;

  // Get linked accounts from tiktok_accounts
  const { data: accounts } = await supabase
    .from('tiktok_accounts')
    .select('id, tiktok_username, brand_id, is_primary, verified')
    .eq('creator_id', creator.id);

  const reg = await getBrandRegistry();
  const accts: CreatorAccount[] = (accounts ?? []).map((a: any) => ({
    id: a.id,
    tiktok_username: a.tiktok_username,
    brand_id: a.brand_id,
    brand: uuidToSlug(reg, a.brand_id) ?? a.brand_id,
    is_primary: !!a.is_primary,
    verified: !!a.verified,
  }));

  // Brands the switcher offers = the creator's CONTRACT brands (matches My Brands +
  // the portal's brand filter), resolved via loadCreatorPortalProfile (admin client,
  // handle→contract bridge, archived-filtered). tiktok_accounts.brand is only the
  // account ASSIGNMENT and — under the creator's RLS-bound session — may not even
  // load, so it hid the switcher for multi-brand creators. loadCreatorPortalProfile
  // is React-cached, so sharing it with the page render is free.
  const brandCookie = await getCurrentBrandCookie();
  const portal = await loadCreatorPortalProfile(creator.id, brandCookie);
  const brands =
    portal && portal.brandSlugs.length > 0
      ? portal.brandSlugs
      : [...new Set(accts.map((a) => a.brand))];
  const current_brand =
    portal?.currentBrand ?? (brandCookie && brands.includes(brandCookie) ? brandCookie : null);

  return {
    creator_id: creator.id,
    real_name: creator.real_name ?? '',
    email: creator.email ?? '',
    accounts: accts,
    brands,
    current_brand,
  };
}

/** Get all tiktok usernames for a creator, optionally filtered by brand slug */
export function getCreatorUsernames(profile: CreatorProfile, brand?: string | null): string[] {
  const filtered = brand
    ? profile.accounts.filter((a) => a.brand === brand)
    : profile.accounts;
  return filtered.map((a) => a.tiktok_username);
}
