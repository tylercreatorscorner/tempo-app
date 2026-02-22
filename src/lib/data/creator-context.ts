import { getCreatorSession, getCurrentBrandCookie } from '@/lib/auth/creator-auth';
import { createAdminClient } from '@/lib/supabase/server';

export interface CreatorAccount {
  id: string;
  tiktok_username: string;
  brand: string;
  is_primary: boolean;
  verified: boolean;
}

export interface CreatorProfile {
  creator_id: number;
  real_name: string;
  email: string;
  accounts: CreatorAccount[];
  brands: string[];
  current_brand: string | null; // null = "All Brands"
}

/** Load full creator profile from session. Returns null if not authenticated. */
export async function getCreatorProfile(): Promise<CreatorProfile | null> {
  const session = await getCreatorSession();
  if (!session) return null;

  const supabase = await createAdminClient();

  // Get creator record
  const { data: creator } = await supabase
    .from('managed_creators')
    .select('id, real_name, email')
    .eq('id', session.creatorId)
    .single();

  if (!creator) return null;

  // Get linked accounts
  const { data: accounts } = await supabase
    .from('creator_accounts')
    .select('id, tiktok_username, brand, is_primary, verified')
    .eq('creator_id', creator.id);

  const accts = (accounts ?? []) as CreatorAccount[];
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

/** Get all tiktok usernames for a creator, optionally filtered by brand */
export function getCreatorUsernames(profile: CreatorProfile, brand?: string | null): string[] {
  const filtered = brand
    ? profile.accounts.filter((a) => a.brand === brand)
    : profile.accounts;
  return filtered.map((a) => a.tiktok_username);
}
