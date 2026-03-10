import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/** Creates a Supabase client for use in middleware (token refresh) */
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

  // Auth guard: redirect unauthenticated users to /login
  const { data: { user } } = await supabase.auth.getUser();
  const publicPaths = ['/login', '/signup', '/auth/callback', '/auth/confirm', '/onboarding', '/join', '/creator-login', '/api/webhooks', '/forgot-password'];
  const isPublicPath = publicPaths.some((path) => request.nextUrl.pathname.startsWith(path));
  // Landing page is public
  const isLanding = request.nextUrl.pathname === '/';
  if (!user && !isPublicPath && !isLanding) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
