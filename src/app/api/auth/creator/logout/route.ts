import { NextResponse } from 'next/server';
import { clearCreatorSession } from '@/lib/auth/creator-auth';

export async function POST() {
  await clearCreatorSession();
  return NextResponse.json({ success: true });
}
