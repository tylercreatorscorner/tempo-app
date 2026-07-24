/**
 * Shared request guard for per-invoice operator actions (send, nudge).
 *
 * One call gives a route: workspace scope + canViewFinance enforcement,
 * manager brand-scoping (managers may only act on invoices for brands in
 * their user_brand_access), and the fetched invoice row. Mirrors the
 * authorizeInvoice logic in /api/invoices/[id]/route.ts — kept as a lib so
 * sibling routes don't re-implement the predicate (route files may only
 * export HTTP handlers, so the helper can't live there).
 */
import { NextResponse } from 'next/server';
import { getWorkspaceScope, type WorkspaceScope } from '@/lib/auth/workspace-scope';
import { createAdminClient } from '@/lib/supabase/server';

export interface InvoiceGuardOk {
  ok: true;
  scope: WorkspaceScope;
  supabase: Awaited<ReturnType<typeof createAdminClient>>;
  /** Full invoice row (select *). */
  invoice: Record<string, unknown>;
}

export interface InvoiceGuardDenied {
  ok: false;
  response: NextResponse;
}

export async function guardInvoiceAction(id: string): Promise<InvoiceGuardOk | InvoiceGuardDenied> {
  const scope = await getWorkspaceScope();
  if (!scope || !scope.canViewFinance) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  const supabase = await createAdminClient();
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    return { ok: false, response: NextResponse.json({ error: error.message }, { status: 500 }) };
  }
  if (!invoice) {
    return { ok: false, response: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  }

  const brand = invoice.brand as string | null;
  if (
    scope.brandScope.kind === 'scoped' &&
    !(brand && scope.brandScope.brandSlugs.includes(brand))
  ) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden: brand not in your access' }, { status: 403 }),
    };
  }

  return { ok: true, scope, supabase, invoice };
}
