import { NextRequest, NextResponse } from 'next/server';
import { getCreatorTags } from '@/lib/data/crm';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ creatorId: string }> }) {
  try {
    const { creatorId } = await params;
    const tags = await getCreatorTags(creatorId);
    return NextResponse.json({ tags });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
