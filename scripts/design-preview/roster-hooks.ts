export const brands = [{ id: 'fixture-northstar', slug: 'northstar', name: 'Northstar Beauty', rawName: 'Northstar Beauty', color: '#6e4bcc' }, { id: 'fixture-evergreen', slug: 'evergreen', name: 'Evergreen Wellness', rawName: 'Evergreen Wellness', color: '#278369' }];
export function useBrandList() { return { brands, loading: false }; }
export function useBrandMeta() { return { label: (slug: string) => brands.find(brand => brand.slug === slug)?.name ?? slug, color: () => '#6e4bcc', logo: () => null, loading: false }; }
export function useTenant() { return { tenant: { id: 'fictional', name: 'Fictional workspace' }, userRole: 'owner', userName: 'Fixture Reviewer', canViewFinance: true, loading: false }; }
