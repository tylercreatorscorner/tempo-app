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
  '/creator-claim', // claim-link landing — the pre-session portal entry point
  '/api/auth/creator',
  '/api/webhooks',
  '/api/og',
  '/api/newsletter',
  '/features',
  '/changelog',
  '/status',
  // Public invoice share — gated by opaque token in the URL, not by auth.
  // Brands view invoices without an account.
  '/share/invoice',
  '/api/invoices/share',
  // Public client report share links — same opaque-token gate. The trailing
  // slash matters: '/r' alone would also match /reporting. The PDF export
  // lives on its own /api/report-pdf prefix so the authed
  // /api/client-reports/* admin routes stay behind the auth guard.
  '/r/',
  '/api/report-pdf/',
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

  // The creator portal authenticates via the creator_session JWT cookie (NOT a
  // Supabase user), so a valid creator session must bypass the Supabase auth
  // guard below — the portal layout re-verifies the JWT via getCreatorProfile().
  // This MUST work in production: it was previously gated behind `isDev`, which
  // made the entire portal (and the claim/onboarding entry) redirect every real
  // creator to /login — the reason no creator had ever onboarded.
  const isDev = process.env.NODE_ENV !== 'production';
  const hasCreatorSession = !!request.cookies.get('creator_session')?.value;
  const isCreatorPortal =
    path === '/creator-dashboard' || path.startsWith('/creator-dashboard/') ||
    path === '/creator-onboarding' || path.startsWith('/creator-onboarding/');
  const isDevApi = path.startsWith('/api/dev/');
  if ((isDev && isDevApi) || (hasCreatorSession && isCreatorPortal)) {
    return supabaseResponse;
  }

  const { data: { user } } = await supabase.auth.getUser();

  // Auth guard: redirect unauthenticated users to /login
  if (!user && !isPublicPath && !isLanding) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Read-only "view as": when a platform admin is impersonating a member
  // (platform_active_manager cookie — see lib/auth/platform-admin), block
  // mutating API calls so a preview can't change data. Exiting/switching is a
  // server action (a page POST, not /api/*), so it stays allowed.
  if (
    user && isApi && !isPublicPath &&
    request.cookies.get('platform_active_manager')?.value &&
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
  ) {
    return NextResponse.json(
      { error: 'Read-only while viewing as another user. Exit “view as” to make changes.' },
      { status: 403 },
    );
  }

  // Systemic Workspace-API gate (default-deny for portal roles).
  //
  // The role-based routing below intentionally skips API paths, so without
  // this block ANY authenticated user — including the 150+ creator-role and
  // brand-role portal users — could call any Workspace `/api/*` (the per-route
  // handlers historically assumed something upstream gated them; nothing did).
  // The creator/brand portals are server-rendered and do NOT client-call
  // `/api/*` (their only API, /api/auth/creator, is public above), so denying
  // portal roles here is safe and closes the whole class at one chokepoint.
  // owner/admin/manager/viewer pass through to the per-route requireAdmin /
  // getWorkspaceScope checks that enforce finer (incl. per-brand) authz.
  if (user && isApi && !isPublicPath) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();
    const role = profile?.role ?? null;
    if (role && (BRAND_PORTAL_ROLES.has(role) || role === 'creator')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
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
