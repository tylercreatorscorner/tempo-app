/**
 * Cookie names used by the brand portal. Lives in a plain module (not a
 * "use server" file) so it can be imported by both server actions and
 * server components without violating the rule that "use server" files
 * may only export async functions.
 */
export const ACTIVE_BRAND_COOKIE = 'bp_active_brand';
