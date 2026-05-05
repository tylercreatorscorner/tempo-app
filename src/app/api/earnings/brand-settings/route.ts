/**
 * PATCH /api/earnings/brand-settings
 *
 * Update brand-level + per-payee compensation fields. Backwards-compatible
 * with the old single-table endpoint.
 *
 * Body shape:
 *   { brand: string, patch: { [field]: value, ... }, team_member_id?: string }
 *
 * Field routing:
 *   - Brand-level (brand_settings):   bill_to_name/email/address, monthly_gmv_goal
 *   - Per-payee  (brand_compensation): retainer, commission_rate, revenue_share_rate,
 *                marketing_commission_rate, launch_fee + name + ends,
 *                product_retainer_amount + name, compensation_model
 *
 * If team_member_id is omitted, the per-payee fields target the FIRST active
 * team member (Tyler in single-tenant ops). The legacy 'payment_instructions'
 * field is now stored on team_members and is silently ignored here.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Fields that live per-(brand × team_member)
const COMPENSATION_NUMERIC = new Set([
  'commission_rate',
  'revenue_share_rate',
  'retainer',
  'launch_fee',
  'product_retainer_amount',
  'marketing_commission_rate',
]);
const COMPENSATION_STRING_OR_NULL = new Set([
  'launch_fee_name',
  'launch_fee_ends',
  'product_retainer_name',
]);

// Fields that live per-brand (brand_settings)
const BRAND_LEVEL_NUMERIC = new Set(['monthly_gmv_goal']);
const BRAND_LEVEL_STRING_OR_NULL = new Set([
  'bill_to_name',
  'bill_to_email',
  'bill_to_address',
]);

// payment_instructions used to live on brand_settings but moved to team_members.
// Accept it for backwards compat but route it to the team_member instead.
const TEAM_MEMBER_STRING_OR_NULL = new Set(['payment_instructions']);

const COMPENSATION_MODELS = new Set(['standard', 'revshare_max', 'commission_only', 'retainer_only']);

export async function PATCH(request: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { brand?: string; patch?: Record<string, unknown>; team_member_id?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { brand, patch, team_member_id: teamMemberIdInput } = body;
  if (!brand || typeof brand !== 'string') {
    return NextResponse.json({ error: 'Missing or invalid brand' }, { status: 400 });
  }
  if (!patch || typeof patch !== 'object') {
    return NextResponse.json({ error: 'Missing patch object' }, { status: 400 });
  }

  const compensationUpdate: Record<string, unknown> = {};
  const brandLevelUpdate: Record<string, unknown> = {};
  const teamMemberUpdate: Record<string, unknown> = {};

  for (const [field, raw] of Object.entries(patch)) {
    if (COMPENSATION_NUMERIC.has(field)) {
      const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: `${field} must be a non-negative number` }, { status: 400 });
      }
      compensationUpdate[field] = n;
    } else if (COMPENSATION_STRING_OR_NULL.has(field)) {
      if (raw === null || raw === '') compensationUpdate[field] = null;
      else if (typeof raw === 'string') compensationUpdate[field] = raw;
      else return NextResponse.json({ error: `${field} must be a string or null` }, { status: 400 });
    } else if (BRAND_LEVEL_NUMERIC.has(field)) {
      const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: `${field} must be a non-negative number` }, { status: 400 });
      }
      brandLevelUpdate[field] = n;
    } else if (BRAND_LEVEL_STRING_OR_NULL.has(field)) {
      if (raw === null || raw === '') brandLevelUpdate[field] = null;
      else if (typeof raw === 'string') brandLevelUpdate[field] = raw;
      else return NextResponse.json({ error: `${field} must be a string or null` }, { status: 400 });
    } else if (TEAM_MEMBER_STRING_OR_NULL.has(field)) {
      if (raw === null || raw === '') teamMemberUpdate[field] = null;
      else if (typeof raw === 'string') teamMemberUpdate[field] = raw;
      else return NextResponse.json({ error: `${field} must be a string or null` }, { status: 400 });
    } else if (field === 'compensation_model') {
      if (typeof raw !== 'string' || !COMPENSATION_MODELS.has(raw)) {
        return NextResponse.json({ error: `compensation_model must be one of ${[...COMPENSATION_MODELS].join(', ')}` }, { status: 400 });
      }
      compensationUpdate[field] = raw;
    } else {
      return NextResponse.json({ error: `Field "${field}" is not editable` }, { status: 400 });
    }
  }

  const admin = await createAdminClient();

  // Resolve which team member's arrangement we're editing
  let teamMemberId = teamMemberIdInput ?? null;
  if (!teamMemberId && (Object.keys(compensationUpdate).length > 0 || Object.keys(teamMemberUpdate).length > 0)) {
    const { data } = await admin
      .from('team_members')
      .select('id')
      .eq('is_archived', false)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    teamMemberId = data?.id ?? null;
    if (!teamMemberId) {
      return NextResponse.json({ error: 'No team member configured — add one in Settings → Team Members first' }, { status: 400 });
    }
  }

  const errors: string[] = [];

  if (Object.keys(compensationUpdate).length > 0 && teamMemberId) {
    compensationUpdate.updated_at = new Date().toISOString();
    const { error } = await admin.from('brand_compensation').upsert({
      tenant_id: profile.tenant_id,
      brand,
      team_member_id: teamMemberId,
      ...compensationUpdate,
    }, { onConflict: 'brand,team_member_id,tenant_id' });
    if (error) errors.push(error.message);
  }
  if (Object.keys(brandLevelUpdate).length > 0) {
    brandLevelUpdate.updated_at = new Date().toISOString();
    const { error } = await admin.from('brand_settings').upsert({ brand, ...brandLevelUpdate }, { onConflict: 'brand' });
    if (error) errors.push(error.message);
  }
  if (Object.keys(teamMemberUpdate).length > 0 && teamMemberId) {
    teamMemberUpdate.updated_at = new Date().toISOString();
    const { error } = await admin.from('team_members').update(teamMemberUpdate).eq('id', teamMemberId);
    if (error) errors.push(error.message);
  }

  if (errors.length > 0) return NextResponse.json({ error: errors.join('; ') }, { status: 500 });

  return NextResponse.json({ ok: true });
}
