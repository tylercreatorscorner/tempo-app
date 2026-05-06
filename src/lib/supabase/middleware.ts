import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = [
  '/login',
  '/signup',
  '/auth/callback',
  '/auth/confirm',
  '/onboarding',
  '/join',
  '/creator-login',
  '/api/auth/creator',
  '/api/webhooks',
  '/api/og',
  '/api/newsletter',
  '/features',
  '/changelog',
  '/status',
];

// Page paths a brand-role user is allowed to visit. Anything else → bounce home.
const BRAND_ALLOWED_PREFIXES = ['/brand-dashboard'];

// Page paths a creator-role user is allowed to visit.
const CREATOR_ALLOWED_PREFIXES = ['/creator-dashboard'];

// 'brand' is the canonical brand-portal role; 'brand_contact' is a legacy
// label for the same thing (kept supported defensively for users invited
// before the dropdown was deduped).
const BRAND_PORTAL_ROLES = new Set(['brand', 'brand_contact']);

function homeRouteForRole(role: string | null | undefined): string {
  if (role && BRAND_PORTAL_ROLES.has(role)) return '/brand-dashboard';
  if (role === 'creator') return '/creator-dashboard';
  return '/dashboard';
}

function pathAllowedForRole(path: string, role: string | null | undefined): boolean {
  if (role && BRAND_PORTAL_ROLES.has(role)) {
    return BRAND_ALLOWED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  }
  if (role === 'creator') {
    return CREATOR_ALLOWED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  }
  // Internal roles (owner/admin/manager/viewer/etc.) can access everything.
  return true;
}

/** Creates a Supabase client for use in middleware (token refresh + role routing) */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const path = request.nextUrl.pathname;
  const isPublicPath = PUBLIC_PATHS.some((p) => path.startsWith(p));
  const isLanding = path === '/';
  const isApi = path.startsWith('/api/');

  // Dev-only escape hatch: if a creator_session cookie is present, allow
  // /creator-dashboard and /api/dev/* to bypass the supabase auth check.
  // The creator portal layout still verifies the JWT via getCreatorProfile().
  const isDev = process.env.NODE_ENV !== 'production';
  const hasCreatorSession = !!request.cookies.get('creator_session')?.value;
  const isCreatorDashboard = path === '/creator-dashboard' || path.startsWith('/creator-dashboard/');
  const isDevApi = path.startsWith('/api/dev/');
  if (isDev && (isDevApi || (hasCreatorSession && isCreatorDashboard))) {
    return supabaseResponse;
  }

  const { data: { user } } = await supabase.auth.getUser();

  // Auth guard: redirect unauthenticated users to /login
  if (!user && !isPublicPath && !isLanding) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Authenticated: route based on role. Skip API routes — let route handlers + RLS enforce.
  if (user && !isPublicPath && !isApi) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    const role = profile?.role ?? null;
    const home = homeRouteForRole(role);

    // Landing page → role-appropriate home
    if (isLanding) {
      const url = request.nextUrl.clone();
      url.pathname = home;
      return NextResponse.redirect(url);
    }

    // Wrong portal for this role → bounce to home
    if (!pathAllowedForRole(path, role)) {
      const url = request.nextUrl.clone();
      url.pathname = home;
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
