export const brands = [{ id: 'brand-one', slug: 'northstar', name: 'Northstar Example Brand', rawName: 'Northstar Example Brand', display_name: null, color: '#6e4bcc' }];
export function useBrandList() { return { brands, loading: false }; }
export function useBrandMeta() { return { label: (slug: string) => slug === 'northstar' ? brands[0].name : slug, color: () => '#6e4bcc', logo: () => null, loading: false }; }
export function useTenant() { return { tenant: { id: 'fixture', name: 'Fictional workspace', discord_connected: true }, userRole: 'owner', userName: 'Fixture Reviewer', canViewFinance: true, loading: false }; }
