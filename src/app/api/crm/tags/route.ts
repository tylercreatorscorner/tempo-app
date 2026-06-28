import { NextRequest, NextResponse } from 'next/server';
import { getAllTags, addCreatorTag, removeCreatorTag } from '@/lib/data/crm';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { authorizeCreator } from '@/lib/auth/authorize-creator';

// creator_tags has no RLS, so scope is enforced here: the caller must be a
// workspace user, and tag writes must target a creator in their tenant + brands.
export async function GET() {
  // TODO(phase0): tenant-scope the tag-name list (low sev — label names only).
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const tags = await getAllTags();
    return NextResponse.json({ tags });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { creator_id, tag, created_by } = await request.json();
    if (!creator_id || !tag) return NextResponse.json({ error: 'creator_id and tag required' }, { status: 400 });
    const denied = await authorizeCreator(scope, creator_id);
    if (denied) return denied;
    const result = await addCreatorTag(creator_id, tag, created_by);
    return NextResponse.json({ tag: result }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { creator_id, tag } = await request.json();
    if (!creator_id || !tag) return NextResponse.json({ error: 'creator_id and tag required' }, { status: 400 });
    const denied = await authorizeCreator(scope, creator_id);
    if (denied) return denied;
    await removeCreatorTag(creator_id, tag);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
