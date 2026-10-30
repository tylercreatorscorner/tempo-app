import type { SupabaseClient } from '@supabase/supabase-js';
import { expandSlugs, type BrandRegistry } from '@/lib/data/brand-registry-core';
import { readCompensationForMonth, writeCompensationBatchForMonth, type CompensationFinancials, type CompensationPatch } from '@/lib/finance/compensation-history';

const RATES = new Set(['commission_rate', 'revenue_share_rate', 'marketing_commission_rate', 'compensation_model']);
const AMOUNTS: Record<string, string[]> = {
  retainer: [], launch_fee: ['launch_fee_name', 'launch_fee_ends'], product_retainer_amount: ['product_retainer_name'],
};
const NUMERIC = new Set(['retainer', 'product_retainer_amount', 'launch_fee', 'commission_rate', 'revenue_share_rate', 'marketing_commission_rate']);
const TEXT = new Set(['product_retainer_name', 'launch_fee_name', 'launch_fee_ends']);

export function compensationPatch(body: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (NUMERIC.has(key)) {
      if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) throw new Error(`${key} must be a non-negative number or null.`);
      patch[key] = value;
    } else if (TEXT.has(key)) {
      if (value !== null && typeof value !== 'string') throw new Error(`${key} must be a string or null.`);
      patch[key] = value === '' ? null : value;
    } else if (key === 'compensation_model') {
      if (!['standard', 'revshare_max', 'commission_only', 'retainer_only'].includes(String(value))) throw new Error('Invalid compensation_model.');
      patch[key] = value;
    }
  }
  return patch;
}

export function isEffectiveMonth(value: unknown): value is string {
  return typeof value === 'string' && /^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(value);
}

/** Month-aware umbrella edit: fan rates out, but carry each fixed amount once. */
export async function saveCompensation(
  db: SupabaseClient,
  input: { tenantId: string; actorId: string; teamMemberId: string; brand: string;
    effectiveMonth: string; patch: Record<string, unknown>; permittedSlugs: string[];
    registry: BrandRegistry; active?: boolean; source: Record<string, unknown> },
) {
  if (!isEffectiveMonth(input.effectiveMonth)) throw new Error('A valid effectiveMonth (YYYY-MM) is required.');
  const slugs = expandSlugs(input.registry, input.brand);
  if (!input.permittedSlugs.includes(input.brand) || !slugs.length
    || slugs.some(slug => !input.permittedSlugs.includes(slug))) throw new Error('Brand unavailable.');
  const current = await readCompensationForMonth(db, input.tenantId, input.teamMemberId, slugs, input.effectiveMonth);
  const byBrand = new Map(current.map(row => [row.brand, row]));
  const patches = new Map(slugs.map(slug => [slug, {} as Record<string, unknown>]));
  if (slugs.length === 1) Object.assign(patches.get(slugs[0])!, input.patch);
  else {
    const carrier = (amount: string) => slugs.reduce((best, slug) =>
      Number(byBrand.get(slug)?.[amount as keyof CompensationFinancials] ?? 0) > Number(byBrand.get(best)?.[amount as keyof CompensationFinancials] ?? 0) ? slug : best, slugs[0]);
    for (const [field, value] of Object.entries(input.patch)) {
      if (RATES.has(field)) {
        for (const patch of patches.values()) patch[field] = value;
      } else if (field in AMOUNTS) {
        const target = carrier(field);
        for (const slug of slugs) patches.get(slug)![field] = slug === target ? value : 0;
      } else {
        const parent = Object.entries(AMOUNTS).find(([, companions]) => companions.includes(field))?.[0];
        if (parent) {
          const target = carrier(parent);
          for (const slug of slugs) patches.get(slug)![field] = slug === target ? value : null;
        } else for (const patch of patches.values()) patch[field] = value;
      }
    }
  }
  return writeCompensationBatchForMonth(db, {
    tenantId: input.tenantId, actorId: input.actorId, effectiveMonth: input.effectiveMonth, source: input.source,
    rows: slugs.map(brand => ({ brand, teamMemberId: input.teamMemberId, patch: patches.get(brand)! as CompensationPatch,
      active: input.active ?? true, expectedRevision: byBrand.get(brand)?.revision ?? 0 })),
  });
}
