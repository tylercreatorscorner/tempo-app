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

  // AUTH BYPASS FOR DEVELOPMENT — skip redirect to /login
  // TODO: Re-enable auth check before production
  // const { data: { user } } = await supabase.auth.getUser();
  // const publicPaths = ['/login', '/signup', '/auth/callback', '/auth/confirm'];
  // const isPublicPath = publicPaths.some((path) => request.nextUrl.pathname.startsWith(path));
  // if (!user && !isPublicPath) {
  //   const url = request.nextUrl.clone();
  //   url.pathname = '/login';
  //   return NextResponse.redirect(url);
  // }

  return supabaseResponse;
}
