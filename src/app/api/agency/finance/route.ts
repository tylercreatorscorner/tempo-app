import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { createAdminClient } from '@/lib/supabase/server';
import { canAccessAgency } from '@/lib/agency/access';
import { buildInvoice, financeSettingsSchema, type FinanceRecord } from '@/lib/agency/finance-model';
import { isAgencyDate, type ClientRecord } from '@/lib/agency/model';

export const runtime = 'nodejs';
export const maxDuration = 60;
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const revision = z.number().int().min(0).max(2147483646);
const command = z.discriminatedUnion('action', [
  z.object({ action: z.literal('settings'), clientId: z.uuid(), expectedRevision: revision, settings: financeSettingsSchema }).strict(),
  z.object({ action: z.literal('draft'), clientId: z.uuid(), month: z.string().regex(/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/) }).strict(),
  z.object({ action: z.enum(['issue', 'void', 'collect', 'pay']), id: z.uuid(), expectedRevision: revision, date: z.string().refine(isAgencyDate).optional() }).strict(),
]);
export async function GET() {
  const scope = await getWorkspaceScope();
  if (!canAccessAgency(scope)) return reply({ error: 'Agency finance is restricted to authorized leadership.' }, scope ? 403 : 401);
  try {
    const db = await createAdminClient();
    const results = await Promise.all([
      db.rpc('agency_business_list_clients', { p_tenant_id: scope.tenantId }),
      db.from('agency_finance_settings').select('client_id,revision,settings', { count: 'exact' }).eq('tenant_id', scope.tenantId).limit(1000),
      db.from('agency_client_invoices').select('id,client_id,month,revision,status,snapshot,collected_on,manager_paid_on', { count: 'exact' }).eq('tenant_id', scope.tenantId).order('created_at', { ascending: false }).limit(1000),
      db.from('user_profiles').select('user_id,name', { count: 'exact' }).eq('tenant_id', scope.tenantId).in('role', ['owner', 'admin', 'manager']).limit(1000),
      db.from('agency_contracts').select('id,client_id,name,created_at,source_url,extraction', { count: 'exact' }).eq('tenant_id', scope.tenantId).order('created_at', { ascending: false }).limit(1000),
    ]);
    if (results.some((r, i) => r.error || (i > 0 && r.count !== (r.data ?? []).length))) return reply({ error: 'Could not load the complete finance workspace. Please retry.' }, 503);
    return reply({ clients: results[0].data, settings: results[1].data, invoices: results[2].data, managers: results[3].data, contracts: results[4].data, canEdit: canAccessAgency(scope, true), extractionAvailable: Boolean(process.env.ANTHROPIC_API_KEY) });
  } catch { return reply({ error: 'Finance workspace is unavailable.' }, 503); }
}
export async function POST(request: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!canAccessAgency(scope, true)) return reply({ error: 'You do not have permission to change agency finance.' }, scope ? 403 : 401);
  if (request.headers.get('origin') !== request.nextUrl.origin) return reply({ error: 'Invalid request origin.' }, 403);
  try {
    const raw = await request.text();
    if (raw.length > 100000) return reply({ error: 'Request is too large.' }, 413);
    const parsed = command.safeParse(JSON.parse(raw));
    if (!parsed.success) return reply({ error: parsed.error.issues[0]?.message ?? 'Invalid finance details.' }, 400);
    const body = parsed.data, db = await createAdminClient();
    let payload: object = body;
    if (body.action === 'draft') {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      if (body.month >= today.slice(0, 7)) return reply({ error: 'Only completed service months can be invoiced.' }, 400);
      const [clients, record, performance] = await Promise.all([
        db.rpc('agency_business_list_clients', { p_tenant_id: scope.tenantId }),
        db.from('agency_finance_settings').select('client_id,revision,settings').eq('tenant_id', scope.tenantId).eq('client_id', body.clientId).maybeSingle(),
        db.rpc('agency_business_month_performance', { p_tenant_id: scope.tenantId, p_month: `${body.month}-01` }).abortSignal(AbortSignal.timeout(30000)),
      ]);
      if (clients.error || record.error || performance.error) return reply({ error: 'Could not verify the agreement and complete GMV.' }, 503);
      const client = (clients.data as ClientRecord[]).find(c => c.id === body.clientId);
      if (!client || !record.data) return reply({ error: 'Save this client’s billing and manager arrangement first.' }, 400);
      const rows = client.brandIds.map(id => (performance.data as { brand_id: string; managed_gmv: number | null; complete: boolean }[]).find(r => r.brand_id === id));
      if (!rows.length || rows.some(r => !r?.complete || r.managed_gmv === null || !Number.isFinite(Number(r.managed_gmv)))) return reply({ error: 'Every linked brand needs complete managed GMV before invoicing.' }, 400);
      const gmvCents = rows.reduce((sum, r) => sum + Math.round(Number(r!.managed_gmv) * 100), 0);
      try { payload = { clientId: client.id, month: body.month, snapshot: buildInvoice(client, record.data as FinanceRecord, body.month, gmvCents, today) }; }
      catch (error) { return reply({ error: (error as Error).message }, 400); }
    }
    const { data, error } = await db.rpc('agency_finance_write', { p_tenant_id: scope.tenantId, p_actor_id: scope.userId, p_action: body.action, p_payload: payload });
    if (error) {
      if (error.code === '23505') return reply({ error: 'An active invoice already exists for this client and service month.' }, 409);
      if (error.message.includes('revision conflict')) return reply({ error: 'This record changed. Reload and review before trying again.' }, 409);
      if (error.message === 'Invalid historical finance client') return reply({ error: 'Past agreements cannot create or issue invoices. Reactivate the client before continuing.' }, 400);
      if (/Invalid |Unknown /.test(error.message)) return reply({ error: 'Check the dates, manager assignment, and current invoice status.' }, 400);
      return reply({ error: 'Finance changes could not be saved.' }, 503);
    }
    return reply(data);
  } catch (error) { return reply({ error: error instanceof SyntaxError ? 'Invalid JSON.' : 'Finance changes could not be saved.' }, error instanceof SyntaxError ? 400 : 503); }
}
