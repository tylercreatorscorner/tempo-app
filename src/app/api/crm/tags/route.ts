import { NextRequest, NextResponse } from 'next/server';
import { getAllTags, addCreatorTag, removeCreatorTag } from '@/lib/data/crm';

export async function GET() {
  try {
    const tags = await getAllTags();
    return NextResponse.json({ tags });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { creator_id, tag, created_by } = await request.json();
    if (!creator_id || !tag) return NextResponse.json({ error: 'creator_id and tag required' }, { status: 400 });
    const result = await addCreatorTag(creator_id, tag, created_by);
    return NextResponse.json({ tag: result }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { creator_id, tag } = await request.json();
    if (!creator_id || !tag) return NextResponse.json({ error: 'creator_id and tag required' }, { status: 400 });
    await removeCreatorTag(creator_id, tag);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
