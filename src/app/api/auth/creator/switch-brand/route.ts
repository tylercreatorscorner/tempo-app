import { NextRequest, NextResponse } from 'next/server';
import { setCurrentBrandCookie } from '@/lib/auth/creator-auth';

export async function POST(request: NextRequest) {
  const { brand } = await request.json();
  if (brand) {
    await setCurrentBrandCookie(brand);
  } else {
    // Clear to "All Brands" - set empty
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    cookieStore.delete('creator_brand');
  }
  return NextResponse.json({ success: true });
}
