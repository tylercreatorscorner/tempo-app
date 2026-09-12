import { NextResponse } from 'next/server';

// Retired endpoint: stale clients and provider events cannot change billing or access.
export async function POST() {
  return NextResponse.json({ error: 'Subscription billing is unavailable' }, { status: 410 });
}
