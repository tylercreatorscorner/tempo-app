// Alias used only by the isolated fixture. No real Supabase client is bundled.
export const fixtureBrands = [{ slug: 'northstar', name: 'Northstar Beauty', display_name: null, color: '#6e4bcc', logo_url: null, is_archived: false, parent_brand_id: null }, { slug: 'evergreen', name: 'Evergreen Wellness', display_name: null, color: '#278369', logo_url: null, is_archived: false, parent_brand_id: null }];
export function createClient() { return { from: () => ({ select: async () => ({ data: fixtureBrands, error: null }) }), auth: { signOut: async () => undefined } }; }
