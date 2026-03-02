import { NextRequest, NextResponse } from 'next/server';
import { getSavedViews, createSavedView, deleteSavedView } from '@/lib/data/crm';

export async function GET() {
  try {
    const views = await getSavedViews();
    return NextResponse.json({ views });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, filters, created_by } = await request.json();
    if (!name || !filters) return NextResponse.json({ error: 'name and filters required' }, { status: 400 });
    const view = await createSavedView(name, filters, created_by);
    return NextResponse.json({ view }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await deleteSavedView(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
