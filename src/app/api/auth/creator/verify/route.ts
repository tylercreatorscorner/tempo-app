import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, setCreatorSession } from '@/lib/auth/creator-auth';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(new URL('/creator-login?error=missing_token', request.url));
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.redirect(new URL('/creator-login?error=invalid_token', request.url));
  }

  // Set session cookie
  await setCreatorSession({
    creatorId: payload.creatorId,
    email: payload.email,
    tenantId: payload.tenantId,
  });

  return NextResponse.redirect(new URL('/creator-dashboard', request.url));
}
