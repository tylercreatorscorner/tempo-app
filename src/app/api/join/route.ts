import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { code, name, email, tiktok_usernames } = await request.json();

    if (!code || !name || !email || !tiktok_usernames?.length) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    const supabase = await createAdminClient();

    // Validate invite
    const { data: invite } = await supabase
      .from('invites')
      .select('*')
      .eq('code', code)
      .eq('active', true)
      .single();

    if (!invite || new Date(invite.expires_at) < new Date() || invite.current_uses >= invite.max_uses) {
      return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const brand = invite.brand;
    const tenant_id = invite.tenant_id;

    // Check if any TikTok username matches an existing creator
    const usernamesToCheck = tiktok_usernames.map((u: string) => u.toLowerCase().trim().replace(/^@/, ''));

    const { brandSlugToUuid } = await import('@/lib/utils/constants');
    const brandUuid = brandSlugToUuid(brand) ?? brand;

    // Check tiktok_accounts table first
    const { data: existingAccounts } = await supabase
      .from('tiktok_accounts')
      .select('creator_id, tiktok_username')
      .in('tiktok_username', usernamesToCheck)
      .eq('brand_id', brandUuid);

    let matchedCreatorId: string | null = null;
    const verifiedUsernames: string[] = [];

    if (existingAccounts && existingAccounts.length > 0) {
      matchedCreatorId = existingAccounts[0].creator_id;
      verifiedUsernames.push(...existingAccounts.map((a) => a.tiktok_username));
    }

    let creatorId: string;

    if (matchedCreatorId) {
      // Update existing creator with email and name
      await supabase
        .from('creators_v2')
        .update({ email: normalizedEmail, real_name: name })
        .eq('id', matchedCreatorId);
      creatorId = matchedCreatorId;
    } else {
      // Create new creators_v2 record
      const { data: newCreator, error: createError } = await supabase
        .from('creators_v2')
        .insert({
          real_name: name,
          email: normalizedEmail,
        })
        .select('id')
        .single();

      if (createError || !newCreator) {
        return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
      }
      creatorId = newCreator.id;

      // Create creator_brands entry
      await supabase
        .from('creator_brands')
        .insert({
          creator_id: creatorId,
          brand_id: brandUuid,
          status: 'Applied',
        });
    }

    // Create tiktok_accounts entries
    for (const username of usernamesToCheck) {
      const isVerified = verifiedUsernames.includes(username);
      await supabase
        .from('tiktok_accounts')
        .upsert(
          {
            creator_id: creatorId,
            tiktok_username: username,
            brand_id: brandUuid,
            is_primary: username === usernamesToCheck[0],
            verified: isVerified,
            verified_at: isVerified ? new Date().toISOString() : null,
          },
          { onConflict: 'tiktok_username,brand_id' }
        );
    }

    // Increment invite usage
    await supabase
      .from('invites')
      .update({ current_uses: invite.current_uses + 1 })
      .eq('id', invite.id);

    return NextResponse.json({
      success: true,
      creator_id: creatorId,
      verified: verifiedUsernames.length > 0,
      verified_usernames: verifiedUsernames,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
