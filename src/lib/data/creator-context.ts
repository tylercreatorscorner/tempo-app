import { getCreatorSession, getCurrentBrandCookie } from '@/lib/auth/creator-auth';
import { createClient } from '@/lib/supabase/server';
import { brandUuidToSlug } from '@/lib/utils/constants';

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

  const supabase = await createClient();

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

  const accts: CreatorAccount[] = (accounts ?? []).map((a: any) => ({
    id: a.id,
    tiktok_username: a.tiktok_username,
    brand_id: a.brand_id,
    brand: brandUuidToSlug(a.brand_id) ?? a.brand_id,
    is_primary: !!a.is_primary,
    verified: !!a.verified,
  }));
  const brands = [...new Set(accts.map((a) => a.brand))];

  // Current brand from cookie
  const brandCookie = await getCurrentBrandCookie();
  const current_brand = brandCookie && brands.includes(brandCookie) ? brandCookie : null;

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
