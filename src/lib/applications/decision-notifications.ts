import { createAdminClient } from '@/lib/supabase/server';
import { createStartHereInvite, validateCreatorHubDestination, type CreatorDiscordSetup } from '@/lib/discord/creator-onboarding';
import { sendEmail } from '@/lib/integrations/actions/resend';

/** Transactional applicant email. A saved decision remains auditable if delivery fails. */
export async function deliverCreatorApplicationDecision(notificationId: string): Promise<{ status: 'sent' | 'pending' | 'failed' }> {
  const db = await createAdminClient();
  const { data: row } = await db.from('creator_application_notifications')
    .select('id,submission_id,tenant_id,brand_id,kind,status,invite_url,invite_created_at')
    .eq('id', notificationId).maybeSingle();
  if (!row || row.status === 'sent') return { status: row?.status === 'sent' ? 'sent' : 'pending' };
  const [{ data: application }, { data: brand }] = await Promise.all([
    db.from('creator_application_submissions').select('id,email,full_name,discord_user_id,status')
      .eq('id', row.submission_id).eq('tenant_id', row.tenant_id)
      .eq('brand_id', row.brand_id).maybeSingle(),
    db.from('brands_v2').select('slug,name,display_name').eq('id', row.brand_id)
      .eq('tenant_id', row.tenant_id).maybeSingle(),
  ]);
  if (!application || !brand || application.status !== row.kind) return { status: 'pending' };
  let destination: { guild_id: string; start_here_channel_id: string; creator_role_id: string;
    coaching_category_id: string; staff_role_ids: string[] } | null = null;
  let enrollmentId: string | null = null;
  if (row.kind === 'approved') {
    const [{ data: config }, { data: enrollment }] = await Promise.all([
      db.from('creator_hub_discord_destinations').select('guild_id,start_here_channel_id,creator_role_id,coaching_category_id,staff_role_ids')
        .eq('tenant_id', row.tenant_id).eq('brand_id', row.brand_id).eq('enabled', true).maybeSingle(),
      db.from('creator_hub_enrollments').select('id').eq('application_id', application.id)
        .eq('tenant_id', row.tenant_id).eq('brand_id', row.brand_id).maybeSingle(),
    ]);
    if (!config || !enrollment || !application.discord_user_id) return { status: 'pending' };
    destination = config;
    enrollmentId = enrollment.id;
  }
  const { data: claimed } = await db.rpc('claim_creator_application_notification', { p_id: notificationId });
  if (!claimed) return { status: 'pending' };
  try {
    let inviteUrl = row.invite_url as string | null;
    const inviteExpired = !row.invite_created_at ||
      Date.now() - new Date(row.invite_created_at).getTime() > 6 * 24 * 60 * 60 * 1000;
    if (row.kind === 'approved' && (!inviteUrl || inviteExpired)) {
      const botToken = process.env.DISCORD_BOT_TOKEN;
      if (!botToken || !destination) throw new Error('Tempo Bot invitation is not configured.');
      const setup: CreatorDiscordSetup = { tenantId: row.tenant_id, brandId: row.brand_id, guildId: destination.guild_id,
        startHereChannelId: destination.start_here_channel_id,
        creatorRoleId: destination.creator_role_id, coachingCategoryId: destination.coaching_category_id,
        staffRoleIds: destination.staff_role_ids };
      await validateCreatorHubDestination(setup, botToken);
      inviteUrl = await createStartHereInvite(row.tenant_id, row.brand_id, destination.guild_id,
        destination.start_here_channel_id, botToken);
      const { error } = await db.from('creator_application_notifications').update({
        invite_url: inviteUrl, invite_created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', notificationId).eq('status', 'sending');
      if (error) throw new Error('Could not save the Discord invitation.');
    }
    const brandName = brand.display_name || brand.name;
    // The applicant must return to the same host where Discord sign-in and its
    // identity cookie were established. Preview deploys use a branch alias.
    const redirectUri = process.env.DISCORD_APPLICATION_REDIRECT_URI;
    const appUrl = redirectUri
      ? new URL(redirectUri).origin
      : process.env.VERCEL_ENV === 'production' ? 'https://app.tempoapp.ai' : '';
    if (!appUrl) throw new Error('Creator application public URL is not configured.');
    const subject = row.kind === 'approved'
      ? `Your ${brandName} creator application was approved`
      : `Update on your ${brandName} creator application`;
    const body = row.kind === 'approved'
      ? `Hi ${application.full_name},\n\nThank you for applying to work with ${brandName}. Your application has been approved.\n\nJoin the brand's Discord server using this one-use invitation: ${inviteUrl}\n\nBegin in #start-here, then complete your Creator Hub steps here: ${appUrl}/hub/${enrollmentId}\n\nOnce your required Hub steps are complete, Tempo will unlock the Creator role and your private coaching chat.\n\nThe ${brandName} team`
      : `Hi ${application.full_name},\n\nThank you for taking the time to apply to work with ${brandName}. We reviewed your application and will not be moving forward at this time. We appreciate your interest and wish you well with your content.\n\nThe ${brandName} team`;
    const sent = await sendEmail({ to: application.email, subject, body,
      idempotencyKey: `creator-application-decision/${notificationId}` });
    if (!sent.ok) throw new Error(sent.error || 'Email delivery failed.');
    const { error } = await db.from('creator_application_notifications').update({
      status: 'sent', sent_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString(),
    }).eq('id', notificationId).eq('status', 'sending');
    if (error) throw new Error('Email sent, but its delivery record could not be saved.');
    return { status: 'sent' };
  } catch (cause) {
    await db.from('creator_application_notifications').update({ status: 'failed',
      last_error: (cause instanceof Error ? cause.message : 'Unknown delivery error').slice(0, 500),
      updated_at: new Date().toISOString(),
    }).eq('id', notificationId).eq('status', 'sending');
    return { status: 'failed' };
  }
}
