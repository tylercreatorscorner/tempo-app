/**
 * GET /api/earnings?month=YYYY-MM
 *
 * Returns monthly earnings breakdown — affiliate GMV by brand, marketing
 * GMV, commission, retainers, launch fees, total earnings, Tyler/Matt split.
 * Admin-only.
 *
 * Each brand row is ENRICHED with its invoice lifecycle for the month+payee:
 *   invoice — the (brand, month, payee) invoice if one exists (id, status,
 *             totalAmount, dueDate, paidAt, invoiceNumber), else null
 *   frozen  — the earnings-ledger freeze written at generation time
 *             (totalAmount, frozenAt, drifted), else null. `drifted` flags a
 *             live total that has moved more than $1 from the invoiced total
 *             (late uploads shifting an already-billed month).
 *   umbrella — { storeCount } for umbrella roll-up rows, else null.
 *
 * Both invoice + ledger reads run on the ADMIN client (service-role-only
 * tables post-mig-106) as ONE grouped query each — never per brand.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { createAdminClient } from '@/lib/supabase/server';
import { getBrandRegistry } from '@/lib/data/brand-registry';
import { getEarnings, type BrandRow } from '@/lib/data/earnings';

export const runtime = 'nodejs';
export const maxDuration = 30;

export interface EarningsRowInvoice {
  id: string;
  invoiceNumber: string;
  status: string;
  totalAmount: number;
  dueDate: string | null;
  paidAt: string | null;
}
export interface EarningsRowFrozen {
  totalAmount: number;
  frozenAt: string;
  drifted: boolean;
}

/** Live total moving more than $1 from the invoiced snapshot counts as drift. */
const DRIFT_TOLERANCE_USD = 1;

export async function GET(request: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!scope.canViewFinance) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const month = request.nextUrl.searchParams.get('month');
  if (!month) return NextResponse.json({ error: 'Missing month' }, { status: 400 });

  // Optional payee filter — defaults to first team member (Tyler) when unset.
  const teamMemberId = request.nextUrl.searchParams.get('team_member_id') ?? undefined;

  // Managers see only their brands' earnings; owner/admin see all.
  const brandFilterSlugs = scope.brandScope.kind === 'scoped'
    ? scope.brandScope.brandSlugs
    : null;

  try {
    const result = await getEarnings(month, teamMemberId, brandFilterSlugs);

    // ── Invoice lifecycle + freeze enrichment ─────────────────────────
    const payeeId = result.teamMember?.id ?? null;
    const brandSlugs = result.brands.map((b) => b.brand);
    const invoiceByBrand = new Map<string, EarningsRowInvoice>();
    const frozenByBrand = new Map<string, { totalAmount: number; frozenAt: string }>();

    if (payeeId && brandSlugs.length > 0) {
      const supabase = await createAdminClient();
      const [invoicesRes, ledgerRes] = await Promise.all([
        supabase
          .from('invoices')
          .select('id, brand, invoice_number, status, total_amount, due_date, paid_at')
          .eq('period_month', month)
          .eq('team_member_id', payeeId)
          .in('brand', brandSlugs),
        supabase
          .from('earnings_ledger')
          .select('brand_slug, snapshot, frozen_at')
          .eq('period_month', month)
          .eq('team_member_id', payeeId)
          .in('brand_slug', brandSlugs),
      ]);
      // Throw, never fake: a failed read rendered as null would show already-
      // invoiced brands as "Ready to invoice" — the same class of lie as a $0.
      if (invoicesRes.error) {
        return NextResponse.json({ error: `invoices read failed: ${invoicesRes.error.message}` }, { status: 500 });
      }
      if (ledgerRes.error) {
        return NextResponse.json({ error: `earnings_ledger read failed: ${ledgerRes.error.message}` }, { status: 500 });
      }

      for (const inv of (invoicesRes.data as Array<{
        id: string; brand: string; invoice_number: string; status: string;
        total_amount: number | string | null; due_date: string | null; paid_at: string | null;
      }> | null) ?? []) {
        invoiceByBrand.set(inv.brand, {
          id: String(inv.id),
          invoiceNumber: inv.invoice_number,
          status: inv.status,
          totalAmount: Number(inv.total_amount ?? 0),
          dueDate: inv.due_date,
          paidAt: inv.paid_at,
        });
      }
      for (const row of (ledgerRes.data as Array<{
        brand_slug: string; snapshot: { total?: number } | null; frozen_at: string;
      }> | null) ?? []) {
        frozenByBrand.set(row.brand_slug, {
          totalAmount: Number(row.snapshot?.total ?? 0),
          frozenAt: row.frozen_at,
        });
      }
    }

    // Umbrella store counts (registry-driven) for the "(umbrella · N stores)"
    // tag — the merged earnings row no longer knows how many stores fed it.
    const reg = await getBrandRegistry();
    const umbrellaByBrand = new Map<string, { storeCount: number }>();
    for (const slug of brandSlugs) {
      const b = reg.bySlug.get(slug);
      if (b?.is_umbrella) {
        umbrellaByBrand.set(slug, { storeCount: (reg.childrenByParentId.get(b.id) ?? []).length });
      }
    }

    const brands = result.brands.map((b: BrandRow) => {
      const frozenRaw = frozenByBrand.get(b.brand);
      return {
        ...b,
        invoice: invoiceByBrand.get(b.brand) ?? null,
        frozen: frozenRaw
          ? {
              totalAmount: frozenRaw.totalAmount,
              frozenAt: frozenRaw.frozenAt,
              drifted: Math.abs(frozenRaw.totalAmount - b.total) > DRIFT_TOLERANCE_USD,
            }
          : null,
        umbrella: umbrellaByBrand.get(b.brand) ?? null,
      };
    });

    return NextResponse.json({ ...result, brands });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to compute earnings';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
