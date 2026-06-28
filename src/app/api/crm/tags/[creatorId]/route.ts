import { NextRequest, NextResponse } from 'next/server';
import { getCreatorTags } from '@/lib/data/crm';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { authorizeCreator } from '@/lib/auth/authorize-creator';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ creatorId: string }> }) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { creatorId } = await params;
    const denied = await authorizeCreator(scope, creatorId);
    if (denied) return denied;
    const tags = await getCreatorTags(creatorId);
    return NextResponse.json({ tags });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
