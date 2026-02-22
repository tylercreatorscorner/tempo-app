import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const creatorId = parseInt(id, 10);
  if (isNaN(creatorId)) {
    return NextResponse.json({ error: 'Invalid creator ID' }, { status: 400 });
  }

  const body = await request.json();
  const allowedFields = [
    'real_name', 'email', 'phone', 'role', 'status', 'notes',
    'retainer', 'monthly_post_requirement', 'retainer_start_date',
  ];

  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from('managed_creators')
    .update(updates)
    .eq('id', creatorId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
