/**
 * /api/clients
 *
 * POST — atomic-ish "onboard a new client" endpoint used by the New Client
 * wizard at /settings/brands. Bundles four operations that previously had
 * to be done across three separate screens:
 *
 *   1. Create brands_v2 row (identity: slug, name, color, display_name)
 *   2. Upsert brand_settings (monthly_gmv_goal, bill_to_*)
 *   3. Upsert brand_compensation for the default team member
 *      (compensation_model, commission_rate, retainer, launch_fee, etc.)
 *   4. Invite one or more brand contacts (auth user + user_profiles row +
 *      user_brand_access scoped to this new brand)
 *
 * Not strictly transactional — if step 1 succeeds and step 2 fails, the
 * brand row exists but its settings are empty. That's fine; the wizard can
 * be reopened against the existing row, or the user can edit through the
 * BrandEditSheet. We report each step's outcome so the UI can surface
 * partial failures clearly.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

type CompensationModel = 'standard' | 'revshare_max' | 'commission_only' | 'retainer_only';
const COMPENSATION_MODELS: CompensationModel[] = ['standard', 'revshare_max', 'commission_only', 'retainer_only'];

interface IdentityInput {
  slug?: unknown;
  name?: unknown;
  display_name?: unknown;
  color?: unknown;
}

interface SettingsInput {
  monthly_gmv_goal?: unknown;
  bill_to_name?: unknown;
  bill_to_email?: unknown;
  bill_to_address?: unknown;
}

interface CompensationInput {
  compensation_model?: unknown;
  commission_rate?: unknown;
  retainer?: unknown;
  launch_fee?: unknown;
  launch_fee_name?: unknown;
  launch_fee_ends?: unknown;
  product_retainer_amount?: unknown;
  product_retainer_name?: unknown;
  marketing_commission_rate?: unknown; // decimal e.g. 0.02
  team_member_id?: unknown;
}

interface ContactInput {
  email?: unknown;
}

interface PostBody {
  identity?: IdentityInput;
  settings?: SettingsInput;
  compensation?: CompensationInput;
  contacts?: ContactInput[];
}

function nonNegNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function stringOrNull(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  return t === '' ? null : t;
}

function createAnonClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return []; }, setAll() {} } },
  );
}

export async function POST(req: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!profile.tenant_id) {
    return NextResponse.json({ error: 'No tenant on your profile — cannot create client' }, { status: 400 });
  }

  let body: PostBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  // ── 1. Identity ────────────────────────────────────────────────────
  const idIn = body.identity ?? {};
  const slug = typeof idIn.slug === 'string' ? idIn.slug.trim().toLowerCase() : '';
  const name = typeof idIn.name === 'string' ? idIn.name.trim() : '';
  const displayName = stringOrNull(idIn.display_name);
  const color = stringOrNull(idIn.color);

  if (!slug || !/^[a-z0-9_]+$/.test(slug)) {
    return NextResponse.json({ error: 'slug must be lowercase letters/numbers/underscores' }, { status: 400 });
  }
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const admin = await createAdminClient();

  // Insert brand row
  const { data: brand, error: brandErr } = await admin
    .from('brands_v2')
    .insert({
      slug,
      name,
      display_name: displayName,
      color,
      tenant_id: profile.tenant_id,
      is_archived: false,
      is_umbrella: false,
    })
    .select()
    .single();

  if (brandErr) {
    if (brandErr.code === '23505' || /duplicate/i.test(brandErr.message)) {
      return NextResponse.json({ error: `A brand with slug "${slug}" already exists.` }, { status: 409 });
    }
    return NextResponse.json({ error: brandErr.message }, { status: 500 });
  }

  const warnings: string[] = [];

  // ── 2. Brand-level settings ────────────────────────────────────────
  const settingsIn = body.settings ?? {};
  const brandSettingsPatch: Record<string, unknown> = {};
  const gmvGoal = nonNegNumber(settingsIn.monthly_gmv_goal);
  if (gmvGoal !== null) brandSettingsPatch.monthly_gmv_goal = gmvGoal;
  const billName = stringOrNull(settingsIn.bill_to_name);
  if (billName !== null) brandSettingsPatch.bill_to_name = billName;
  const billEmail = stringOrNull(settingsIn.bill_to_email);
  if (billEmail !== null) brandSettingsPatch.bill_to_email = billEmail;
  const billAddress = stringOrNull(settingsIn.bill_to_address);
  if (billAddress !== null) brandSettingsPatch.bill_to_address = billAddress;

  if (Object.keys(brandSettingsPatch).length > 0) {
    const { error } = await admin
      .from('brand_settings')
      .upsert({ brand: slug, ...brandSettingsPatch, updated_at: new Date().toISOString() }, { onConflict: 'brand' });
    if (error) warnings.push(`brand_settings: ${error.message}`);
  }

  // ── 3. Per-(brand × team_member) compensation ───────────────────────
  const compIn = body.compensation ?? {};
  const hasCompFields =
    compIn.compensation_model !== undefined ||
    compIn.commission_rate !== undefined ||
    compIn.retainer !== undefined ||
    compIn.launch_fee !== undefined ||
    compIn.launch_fee_name !== undefined ||
    compIn.launch_fee_ends !== undefined ||
    compIn.product_retainer_amount !== undefined ||
    compIn.product_retainer_name !== undefined ||
    compIn.marketing_commission_rate !== undefined;

  if (hasCompFields) {
    // Resolve team member: explicit id wins, otherwise the first active member
    let teamMemberId = typeof compIn.team_member_id === 'string' ? compIn.team_member_id : null;
    if (!teamMemberId) {
      const { data: tm } = await admin
        .from('team_members')
        .select('id')
        .eq('is_archived', false)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      teamMemberId = tm?.id ?? null;
    }

    if (!teamMemberId) {
      warnings.push('No team member exists yet — compensation terms were not saved. Add a team member in Settings → Team Members, then edit the brand to fill in terms.');
    } else {
      const compPatch: Record<string, unknown> = {
        tenant_id: profile.tenant_id,
        brand: slug,
        team_member_id: teamMemberId,
        updated_at: new Date().toISOString(),
      };

      const model = typeof compIn.compensation_model === 'string' ? compIn.compensation_model : null;
      if (model && (COMPENSATION_MODELS as string[]).includes(model)) {
        compPatch.compensation_model = model;
      }

      const commission = nonNegNumber(compIn.commission_rate);
      if (commission !== null) compPatch.commission_rate = commission;

      const retainer = nonNegNumber(compIn.retainer);
      if (retainer !== null) compPatch.retainer = retainer;

      const launch = nonNegNumber(compIn.launch_fee);
      if (launch !== null) compPatch.launch_fee = launch;
      const launchName = stringOrNull(compIn.launch_fee_name);
      if (launchName !== null) compPatch.launch_fee_name = launchName;
      const launchEnds = stringOrNull(compIn.launch_fee_ends);
      if (launchEnds !== null) compPatch.launch_fee_ends = launchEnds;

      const prodRet = nonNegNumber(compIn.product_retainer_amount);
      if (prodRet !== null) compPatch.product_retainer_amount = prodRet;
      const prodName = stringOrNull(compIn.product_retainer_name);
      if (prodName !== null) compPatch.product_retainer_name = prodName;

      const mkt = nonNegNumber(compIn.marketing_commission_rate);
      if (mkt !== null) compPatch.marketing_commission_rate = mkt;

      const { error } = await admin
        .from('brand_compensation')
        .upsert(compPatch, { onConflict: 'brand,team_member_id,tenant_id' });
      if (error) warnings.push(`brand_compensation: ${error.message}`);
    }
  }

  // ── 4. Invite brand contacts ───────────────────────────────────────
  const contacts = Array.isArray(body.contacts) ? body.contacts : [];
  const inviteResults: { email: string; status: 'invited' | 'existing' | 'error'; error?: string }[] = [];

  for (const c of contacts) {
    const email = typeof c.email === 'string' ? c.email.trim() : '';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;

    try {
      let userId: string | null = null;
      let alreadyExisted = false;

      const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      });

      if (inviteErr) {
        if (/already.*(registered|exists)/i.test(inviteErr.message)) {
          alreadyExisted = true;
          // Look up the existing user
          const { data: list } = await admin.auth.admin.listUsers();
          const existing = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
          if (!existing) throw new Error('User exists but could not be located.');
          userId = existing.id;

          // Trigger magic link email
          const anon = createAnonClient();
          await anon.auth.signInWithOtp({
            email,
            options: { shouldCreateUser: false, emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` },
          });
        } else {
          throw new Error(inviteErr.message);
        }
      } else {
        userId = invited.user.id;
      }

      if (!userId) throw new Error('Could not resolve user id.');

      // Upsert profile as a brand contact in this tenant
      const { error: profErr } = await admin.from('user_profiles').upsert({
        user_id: userId,
        email,
        role: 'brand',
        tenant_id: profile.tenant_id,
        status: 'active',
      }, { onConflict: 'user_id' });
      if (profErr) throw new Error(`profile upsert: ${profErr.message}`);

      // Scope to this brand only (don't blow away access they may already have to others)
      const { data: existingAccess } = await admin
        .from('user_brand_access')
        .select('brand_id')
        .eq('user_id', userId);
      const has = (existingAccess ?? []).some((a) => a.brand_id === brand.id);
      if (!has) {
        const { error: accessErr } = await admin
          .from('user_brand_access')
          .insert({ user_id: userId, brand_id: brand.id, tenant_id: profile.tenant_id });
        if (accessErr) throw new Error(`brand access: ${accessErr.message}`);
      }

      inviteResults.push({ email, status: alreadyExisted ? 'existing' : 'invited' });
    } catch (e) {
      inviteResults.push({
        email,
        status: 'error',
        error: e instanceof Error ? e.message : 'Invite failed',
      });
    }
  }

  return NextResponse.json({
    brand,
    warnings,
    contacts: inviteResults,
  }, { status: 201 });
}
