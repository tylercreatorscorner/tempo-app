import { getSupabase } from './supabase';
import {
  ensurePrivateCoachingChannel,
  grantCreatorRole,
  preflightCreatorDiscordAccess,
  type CreatorDiscordDestination,
  type CreatorDiscordSubject,
} from './creator-onboarding';

type DestinationRow = {
  tenant_id: string; brand_id: string; guild_id: string; creator_role_id: string;
  coaching_category_id: string; staff_role_ids: string[]; enabled: boolean;
};
type ProvisioningRow = {
  enrollment_id: string; channel_id: string | null; role_granted_at: string | null;
  chat_created_at: string | null; lease_token: string | null;
};

async function updateClaim(enrollmentId: string, leaseToken: string, values: Record<string, unknown>) {
  const { data, error } = await getSupabase().from('creator_hub_provisioning')
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq('enrollment_id', enrollmentId).eq('lease_token', leaseToken)
    .select('enrollment_id').maybeSingle();
  if (error || !data) throw new Error('Creator Hub provisioning lease changed.');
}

export async function provisionCompletedCreatorHub(enrollmentId: string): Promise<void> {
  const db = getSupabase();
  const { data: enrollment, error: enrollmentError } = await db.from('creator_hub_enrollments')
    .select('id,tenant_id,brand_id,application_id,discord_user_id,status')
    .eq('id', enrollmentId).eq('status', 'complete').maybeSingle();
  if (enrollmentError || !enrollment) return;
  const { data: config, error: configError } = await db.from('creator_hub_discord_destinations')
    .select('tenant_id,brand_id,guild_id,creator_role_id,coaching_category_id,staff_role_ids,enabled')
    .eq('tenant_id', enrollment.tenant_id).eq('brand_id', enrollment.brand_id)
    .eq('enabled', true).maybeSingle();
  if (configError || !config) return;
  const destinationRow = config as DestinationRow;
  const [{ data: brand }, { data: application }] = await Promise.all([
    db.from('brands_v2').select('id').eq('id', enrollment.brand_id)
      .eq('tenant_id', enrollment.tenant_id).maybeSingle(),
    db.from('creator_application_submissions').select('full_name,discord_user_id,status')
      .eq('id', enrollment.application_id).eq('tenant_id', enrollment.tenant_id)
      .eq('brand_id', enrollment.brand_id).maybeSingle(),
  ]);
  if (!brand || !application || application.status !== 'approved' ||
      application.discord_user_id !== enrollment.discord_user_id) return;
  const { data: gate, error: gateError } = await db.rpc('creator_hub_required_complete', { p_enrollment_id: enrollmentId });
  if (gateError || gate !== true) return;
  const { data: claimed, error: claimError } = await db.rpc('claim_creator_hub_provisioning', { p_enrollment_id: enrollmentId });
  if (claimError || !claimed) return;
  const record = claimed as ProvisioningRow;
  if (!record.lease_token) return;
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error('DISCORD_BOT_TOKEN is missing.');
  const destination: CreatorDiscordDestination = {
    tenantId: enrollment.tenant_id,
    brandId: enrollment.brand_id,
    guildId: destinationRow.guild_id,
    creatorRoleId: destinationRow.creator_role_id,
    coachingCategoryId: destinationRow.coaching_category_id,
    staffRoleIds: destinationRow.staff_role_ids,
  };
  const subject: CreatorDiscordSubject = {
    enrollmentId, discordUserId: enrollment.discord_user_id, displayName: application.full_name,
  };
  try {
    const { botUserId } = await preflightCreatorDiscordAccess(destination, subject, token);
    if (!record.role_granted_at) {
      await grantCreatorRole(destination, subject, token);
      await updateClaim(enrollmentId, record.lease_token, { role_granted_at: new Date().toISOString() });
    }
    if (!record.chat_created_at) {
      const channelId = await ensurePrivateCoachingChannel(destination, subject, botUserId, token);
      await updateClaim(enrollmentId, record.lease_token, {
        channel_id: channelId, chat_created_at: new Date().toISOString(),
      });
    }
    await updateClaim(enrollmentId, record.lease_token, {
      lease_token: null, lease_until: null, last_error: null,
    });
  } catch (cause) {
    await updateClaim(enrollmentId, record.lease_token, {
      last_error: (cause instanceof Error ? cause.message : 'Unknown Discord error').slice(0, 500),
    }).catch(() => {});
    throw cause;
  }
}

let checking = false;

/** The standalone Tempo Bot retries completed Hub enrollments; no browser request can run this. */
export function startCreatorHubProvisioningChecker(): void {
  const check = async () => {
    if (checking) return;
    checking = true;
    try {
      const db = getSupabase();
      const { data: destinations, error } = await db.from('creator_hub_discord_destinations')
        .select('tenant_id,brand_id').eq('enabled', true);
      if (error) throw error;
      for (const destination of destinations ?? []) {
        const { data: enrollments, error: enrollmentError } = await db.from('creator_hub_pending_provisioning')
          .select('id,last_attempt_at').eq('tenant_id', destination.tenant_id).eq('brand_id', destination.brand_id)
          .order('last_attempt_at', { ascending: true, nullsFirst: true }).limit(50);
        if (enrollmentError) throw enrollmentError;
        const ids = (enrollments ?? []).map((row) => row.id);
        if (!ids.length) continue;
        for (const id of ids) {
          try { await provisionCompletedCreatorHub(id); }
          catch (cause) { console.error('[tempo-bot] Creator Hub provisioning failed:', id, cause); }
        }
      }
    } catch (cause) { console.error('[tempo-bot] Creator Hub checker failed:', cause); }
    finally { checking = false; }
  };
  void check();
  setInterval(() => { void check(); }, 60_000);
}
