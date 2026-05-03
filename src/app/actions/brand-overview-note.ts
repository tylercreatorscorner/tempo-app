'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient } from '@/lib/supabase/server';

const MAX_NOTE_LEN = 2000;

/**
 * Updates the account-manager note for a brand. Only owner/admin can call.
 * The note surfaces on the client-facing /brand-dashboard.
 */
export async function updateBrandOverviewNote(brandSlug: string, note: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    throw new Error('Only owners or admins can edit brand notes.');
  }

  const trimmed = note.trim();
  if (trimmed.length > MAX_NOTE_LEN) {
    throw new Error(`Note is too long (max ${MAX_NOTE_LEN} chars).`);
  }

  const admin = await createAdminClient();
  // Upsert by brand slug; brand_settings rows already exist for active brands
  const { error } = await admin
    .from('brand_settings')
    .upsert(
      {
        brand: brandSlug,
        brand_overview_note: trimmed || null,
        brand_overview_note_updated_at: new Date().toISOString(),
        brand_overview_note_updated_by: user.id,
      },
      { onConflict: 'brand' },
    );
  if (error) throw new Error(`Failed to save note: ${error.message}`);

  revalidatePath(`/brands/${brandSlug}`);
  revalidatePath('/brand-dashboard');
  return { ok: true };
}
