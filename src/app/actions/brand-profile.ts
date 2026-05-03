'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient } from '@/lib/supabase/server';

/** Updates the current user's display name in user_profiles. */
export async function updateBrandUserName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Name cannot be empty.');
  if (trimmed.length > 80) throw new Error('Name is too long (max 80 chars).');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  // Confirm the caller is a brand-role user (defense in depth — RLS already blocks others)
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!profile || profile.role !== 'brand') {
    throw new Error('Only brand users can update their profile here.');
  }

  // Use admin client so we don't depend on RLS UPDATE policy being open
  const admin = await createAdminClient();
  const { error } = await admin
    .from('user_profiles')
    .update({ name: trimmed })
    .eq('user_id', user.id);
  if (error) throw new Error(error.message);

  revalidatePath('/brand-dashboard/settings');
  return { ok: true, name: trimmed };
}
