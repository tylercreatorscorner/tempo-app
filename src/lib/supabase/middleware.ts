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
  '/api/webhooks',
];

// Page paths a brand-role user is allowed to visit. Anything else → bounce home.
const BRAND_ALLOWED_PREFIXES = ['/brand-dashboard'];

// Page paths a creator-role user is allowed to visit.
const CREATOR_ALLOWED_PREFIXES = ['/creator-dashboard'];

function homeRouteForRole(role: string | null | undefined): string {
  switch (role) {
    case 'brand':
      return '/brand-dashboard';
    case 'creator':
      return '/creator-dashboard';
    default:
      return '/dashboard';
  }
}

function pathAllowedForRole(path: string, role: string | null | undefined): boolean {
  if (role === 'brand') {
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
