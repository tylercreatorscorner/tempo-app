import { NextRequest, NextResponse } from 'next/server';
import { getCreatorTimeline, addTimelineEntry } from '@/lib/data/crm';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { authorizeCreator } from '@/lib/auth/authorize-creator';

export async function GET(request: NextRequest, { params }: { params: Promise<{ creatorId: string }> }) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { creatorId } = await params;
    const denied = await authorizeCreator(scope, creatorId);
    if (denied) return denied;
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1');
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50');
    const entries = await getCreatorTimeline(creatorId, page, limit);
    return NextResponse.json({ entries });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ creatorId: string }> }) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { creatorId } = await params;
    const denied = await authorizeCreator(scope, creatorId);
    if (denied) return denied;
    const body = await request.json();
    const { activity_type, title, body: entryBody, metadata, created_by } = body;
    if (!activity_type) return NextResponse.json({ error: 'activity_type required' }, { status: 400 });
    const entry = await addTimelineEntry(creatorId, activity_type, title, entryBody, metadata, created_by);
    return NextResponse.json({ entry }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
