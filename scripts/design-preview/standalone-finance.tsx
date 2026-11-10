import { useState } from 'react';
import { InvoiceDetailSheet, type Invoice } from '../../src/app/(admin)/invoicing/components/invoice-detail-sheet';
import { TeamMembersSection } from '../../src/components/settings/team-members-section';
import { CompensationArrangementsSection } from '../../src/components/settings/compensation-arrangements-section';

const seed: Invoice = {
  id: 'fixture-invoice', invoice_number: 'FIXTURE-NORTHSTAR-NOVEMBER-2026-LONG-REFERENCE', brand: 'northstar', period_month: '2026-10',
  affiliate_gmv: 25000, marketing_gmv: 0, total_gmv: 25000, commission: 250, retainer: 1000, product_retainer: 0, launch_fee: 0, total_amount: 1250,
  status: 'sent', generated_at: '2026-11-01T12:00:00Z', sent_at: '2026-11-02T12:00:00Z', paid_at: null, due_date: '2026-11-15',
  notes: 'Fictional local invoice. Changes stay in this tab.', bill_to_name: 'Example Billing Team', bill_to_email: 'billing@example.invalid',
  bill_to_address: '123 Example Way\nExample City, XX 00000', payment_instructions: 'Fixture payment instructions only.', bill_from_name: 'Example Agency',
  creator_breakdown: [{ name: 'Fictional Creator', gmv: 25000, rate: 1, commission: 250 }],
};
let savedInvoice = { ...seed };
let teamMembers = [{ id: 'fixture-payee', name: 'Jordan Example', email: 'jordan@example.invalid', address: 'Fixture address', payment_instructions: 'Fixture payment instructions only.', is_archived: false }];
let arrangement = { id: 'fixture-arrangement', brand: 'northstar', team_member_id: 'fixture-payee', retainer: 1000, commission_rate: 1, revenue_share_rate: 0, marketing_commission_rate: 0.02, launch_fee: 0, launch_fee_name: null, product_retainer_amount: 0, product_retainer_name: null, compensation_model: 'standard' };
const failed = new Set<string>();

/** Every endpoint returns local fictional data; unknown endpoints remain closed by the main fixture. */
export function financeFixtureResponse(url: URL, init?: RequestInit, scenario?: string | null): Response | null {
  const method = init?.method ?? 'GET';
  const body = init?.body && typeof init.body === 'string' ? JSON.parse(init.body) : {};
  const failOnce = (key: string) => { if (failed.has(key)) return false; failed.add(key); return true; };
  if (url.pathname === '/api/invoices/fixture-invoice' && method === 'PATCH') {
    if (scenario === 'payment-error' && body.status === 'paid' && failOnce('payment')) return Response.json({ error: 'Fixture: payment save failed. Your receipt details remain available; retry is safe here.' }, { status: 503 });
    savedInvoice = { ...savedInvoice, ...body, ...(body.status === 'paid' ? { paid_at: new Date().toISOString() } : {}) };
    if (['commission', 'retainer', 'product_retainer', 'launch_fee'].some(key => key in body)) savedInvoice.total_amount = Number(savedInvoice.commission) + Number(savedInvoice.retainer) + Number(savedInvoice.product_retainer) + Number(savedInvoice.launch_fee);
    return Response.json({ invoice: savedInvoice });
  }
  if (url.pathname === '/api/team-members') {
    if (method === 'GET') {
      if (scenario === 'settings-error' && failOnce('team')) return Response.json({ error: 'Fixture: billing identities failed to load.' }, { status: 503 });
      return Response.json({ teamMembers });
    }
    if (method === 'POST') {
      const member = { ...teamMembers[0], ...body, id: `fixture-payee-${teamMembers.length + 1}` };
      teamMembers = [...teamMembers, member]; return Response.json({ teamMember: member });
    }
  }
  if (url.pathname.startsWith('/api/team-members/') && method === 'PATCH') {
    const id = url.pathname.split('/').at(-1);
    teamMembers = teamMembers.map(member => member.id === id ? { ...member, ...body } : member);
    return Response.json({ teamMember: teamMembers.find(member => member.id === id) });
  }
  if (url.pathname === '/api/brand-compensation') {
    if (method === 'GET') {
      if (scenario === 'settings-error' && failOnce('compensation')) return Response.json({ error: 'Fixture: compensation arrangements failed to load.' }, { status: 503 });
      return Response.json({ arrangements: [arrangement], month: url.searchParams.get('month') });
    }
    if (method === 'POST') { arrangement = { ...arrangement, ...body }; return Response.json({ arrangement }); }
  }
  return null;
}

export function StandaloneFinanceFixture({ mode, readOnly }: { mode: 'invoice' | 'settings'; readOnly: boolean }) {
  const [invoice, setInvoice] = useState(savedInvoice);
  const [open, setOpen] = useState(true);
  const [notice, setNotice] = useState('');
  if (mode === 'settings') return <div className="min-w-0 space-y-4"><h1 className="text-xl font-semibold">Fictional finance setup</h1><p>Use Retry in each failed section. Saves affect only this local fixture.</p><div className="grid min-w-0 gap-4 xl:grid-cols-2"><TeamMembersSection canEdit={!readOnly} /><CompensationArrangementsSection canEdit={!readOnly} brands={[{ slug: 'northstar', name: 'Northstar Example Brand With A Longer Display Name' }]} /></div></div>;
  return <div className="space-y-4"><h1 className="text-xl font-semibold">Fictional invoice review</h1><p>Edit a note to verify the unsaved-change guard, or choose Mark as Paid to test a receipt. No live record is used.</p>{notice && <p role="status">{notice}</p>}<button className="rounded-lg border border-border bg-card px-4 py-2" onClick={() => setOpen(true)}>Open fictional invoice</button>{open && <InvoiceDetailSheet invoice={invoice} canEdit={!readOnly} onClose={() => setOpen(false)} onUpdated={value => { setInvoice(value); setNotice(`Local fixture saved: ${value.status}; receipt ${value.amount_received ?? 'not recorded'}.`); }} onDeleted={() => { setOpen(false); setNotice('Local fictional invoice removed.'); }} />}</div>;
}
