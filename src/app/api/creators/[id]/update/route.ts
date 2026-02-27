import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const creatorId = id; // UUID string now

  const body = await request.json();

  // Fields that go to creators_v2
  const creatorFields = ['real_name', 'email', 'phone', 'notes'];
  // Fields that go to creator_brands
  const brandFields = ['role', 'status', 'retainer', 'monthly_post_requirement', 'retainer_start_date'];

  const creatorUpdates: Record<string, unknown> = {};
  const brandUpdates: Record<string, unknown> = {};

  for (const field of creatorFields) {
    if (field in body) creatorUpdates[field] = body[field];
  }
  for (const field of brandFields) {
    if (field in body) brandUpdates[field] = body[field];
  }

  if (Object.keys(creatorUpdates).length === 0 && Object.keys(brandUpdates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const supabase = await createAdminClient();

  if (Object.keys(creatorUpdates).length > 0) {
    const { error } = await supabase
      .from('creators_v2')
      .update(creatorUpdates)
      .eq('id', creatorId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (Object.keys(brandUpdates).length > 0) {
    // Update creator_brands — update all brand rows for this creator
    // In the future, accept a brand_id param to update a specific brand relationship
    const { error } = await supabase
      .from('creator_brands')
      .update(brandUpdates)
      .eq('creator_id', creatorId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
