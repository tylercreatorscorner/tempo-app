'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { DateField } from '@/components/ui/date-field';
import { ClientEditor, type AgencyBusinessResponse } from '../workspace';
import { type ClientRecord, selectMonthTerms } from '@/lib/agency/model';
import { addDays, emptyFinanceSettings, forecast, managerFor, readiness, shiftMonth, type AgencyInvoice, type FinanceRecord, type FinanceSettings } from '@/lib/agency/finance-model';
import s from './finance.module.css';

type Findings = { findings: { field: string; value: string; quote: string; page: number | null }[]; uncertainties: string[] };
type Contract = { id: string; client_id: string; name: string; created_at: string; extraction: Findings | null };
type Data = { clients: ClientRecord[]; settings: FinanceRecord[]; invoices: AgencyInvoice[]; managers: { user_id: string; name: string }[]; contracts: Contract[]; canEdit: boolean; extractionAvailable: boolean };
const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
async function api(url: string, body?: object | FormData) {
  const response = await fetch(url, { cache: 'no-store', ...(body ? { method: 'POST', ...(body instanceof FormData ? { body } : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) } : {}) });
  const json = await response.json(); if (!response.ok) throw new Error(json.error ?? 'Request failed. Please retry.'); return json;
}
function Field({ label, children, full = false }: { label: string; children: ReactNode; full?: boolean }) { return <label className={`${s.field} ${full ? s.full : ''}`}><span>{label}</span>{children}</label>; }
export function AgencyFinanceWorkspace() {
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('Clients & onboarding'), [clientId, setClientId] = useState('');
  const dirtyRef = useRef(false);
  const onDirty = useCallback((value: boolean) => { dirtyRef.current = value; }, []);
  const mayLeave = () => !dirtyRef.current || window.confirm('Discard unsaved billing and arrangement changes?');
  const [editor, setEditor] = useState<{ data: AgencyBusinessResponse; client: ClientRecord } | null>(null);
  const load = useCallback(async () => { const result = await api('/api/agency/finance') as Data; setData(result); setClientId(id => id || result.clients[0]?.id || ''); }, []);
  useEffect(() => { let active = true; api('/api/agency/finance').then((result: Data) => { if (active) { setData(result); setClientId(result.clients[0]?.id ?? ''); } }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
  const run = async (job: () => Promise<unknown>) => { setBusy(true); setError(''); try { await job(); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const client = data?.clients.find(c => c.id === clientId);
  return <main className={s.page}>
    <header className={s.heading}><div><span className={s.eyebrow}>Agency workspace</span><h1>Client finance</h1><p>Agreements, billing, and cash visibility from the first day of a client relationship.</p></div><Link className={s.button} href="/agency/clients">Add or manage clients</Link></header>
    <nav className={s.tabs} role="tablist" aria-label="Client finance sections">{['Clients & onboarding', 'Invoices & manager pay', 'Collections forecast'].map(name => <button key={name} role="tab" aria-selected={tab === name} onClick={() => { if (name === tab || mayLeave()) setTab(name); }}>{name}</button>)}</nav>
    {error && <div role="alert" className={`${s.notice} ${s.error}`}>{error} <button className={s.button} disabled={busy} onClick={() => void run(load)}>Reload</button></div>}
    {!data && !error && <p role="status">Loading agreements and billing records…</p>}
    {data && tab === 'Clients & onboarding' && <><div className={s.toolbar}><label htmlFor="finance-client">Client</label><select id="finance-client" value={clientId} onChange={e => { if (mayLeave()) setClientId(e.target.value); }}>{data.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      {client ? <ClientFinance key={`${client.id}:${data.settings.find(r => r.client_id === client.id)?.revision ?? 0}`} client={client} data={data} busy={busy} run={run} onDirty={onDirty} editTerms={() => void run(async () => { const business = await api(`/api/agency/business?month=${shiftMonth(today().slice(0, 7), -1)}`); setEditor({ data: business, client }); })} /> : <div className={s.panel}><h2>Start with a client</h2><p>Create a client and link its brands, then add its signed agreement, billing details, and manager arrangement here.</p><Link href="/agency/clients" className={s.button}>Set up a client</Link></div>}</>}
    {data && tab === 'Invoices & manager pay' && <Invoices data={data} busy={busy} run={run} />}
    {data && tab === 'Collections forecast' && <Forecast data={data} />}
    {editor && <ClientEditor client={editor.client} data={editor.data} month={today().slice(0, 7)} returnFocus={null} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); void run(load); }} />}
  </main>;
}
type Run = (job: () => Promise<unknown>) => Promise<void>;
function ClientFinance({ client, data, busy, run, editTerms, onDirty }: { client: ClientRecord; data: Data; busy: boolean; run: Run; editTerms: () => void; onDirty: (dirty: boolean) => void }) {
  const record = data.settings.find(r => r.client_id === client.id);
  const [draft, setDraft] = useState<FinanceSettings>(() => record?.settings ?? emptyFinanceSettings());
  const [file, setFile] = useState<File | null>(null), [selectedContract, setSelectedContract] = useState('');
  const contracts = data.contracts.filter(c => c.client_id === client.id), month = today().slice(0, 7);
  const extracted = contracts.find(c => c.id === selectedContract)?.extraction;
  const update = <K extends keyof FinanceSettings>(key: K, value: FinanceSettings[K]) => setDraft(d => ({ ...d, [key]: value }));
  const terms = selectMonthTerms(client.terms, month), manager = managerFor(draft, month);
  const dirty = JSON.stringify(draft) !== JSON.stringify(record?.settings ?? emptyFinanceSettings());
  useEffect(() => { onDirty(dirty); const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); }; window.addEventListener('beforeunload', warn); return () => { onDirty(false); window.removeEventListener('beforeunload', warn); }; }, [dirty, onDirty]);
  const textFields = [['legalName', 'Client legal name'], ['billingContact', 'Accounts payable contact'], ['billingEmail', 'Billing email'], ['purchaseOrder', 'Purchase order / reference'], ['taxId', 'Tax ID (optional)']] as const;
  return <div className={s.stack}>
    <div className={s.steps}>{[
      ['Signed agreement', Boolean(contracts.length && draft.signedDate), contracts.length ? `${contracts.length} stored contract(s)` : 'Upload signed PDF'],
      ['Agency terms', Boolean(terms && client.serviceStart), client.serviceStart ? `Service starts ${client.serviceStart}` : 'Set service dates and fees'],
      ['Billing details', readiness(draft), readiness(draft) ? 'Core billing fields complete' : 'Add legal entity and billing contact'],
      ['Manager assigned', Boolean(manager), manager ? `${manager.gmvPercent}% GMV + ${money(manager.fixedMonthly * 100)}` : 'Add a pay arrangement'],
    ].map(([label, complete, detail]) => <div key={String(label)} className={`${s.step} ${complete ? s.complete : ''}`}><strong>{String(label)}</strong><small>{String(detail)}</small></div>)}</div>
    <section className={s.panel}><div className={s.heading}><div><h2>Agency deal terms</h2><p>Use the agreed service dates and effective monthly fees for {client.name}.</p></div><button className={s.button} disabled={!data.canEdit || busy} onClick={editTerms}>Edit agency terms</button></div>
      <p>{terms ? `${terms.feeModel === 'fixed' ? 'Fixed fee' : terms.feeModel === 'share' ? 'GMV share' : terms.feeModel === 'minimum' ? 'Higher of fee or GMV share' : 'Fee plus GMV share'} · ${money(terms.monthlyRetainer * 100)} monthly · ${terms.revSharePercent}% of managed GMV · effective ${terms.effectiveMonth}` : 'No agency terms are effective this month.'}</p>
      <p>Service start: {client.serviceStart ?? 'Not set'} · Service end: {client.serviceEnd ?? 'Open ended'}. Partial service months require review before invoicing.</p>
    </section>
    <form className={s.stack} onSubmit={e => { e.preventDefault(); void run(() => api('/api/agency/finance', { action: 'settings', clientId: client.id, expectedRevision: record?.revision ?? 0, settings: draft })); }}>
      <fieldset disabled={!data.canEdit || busy} className={s.stack}>
        <section className={s.panel}><h2>Client billing information</h2><p>The brand pays the agency. Client invoices use these billing details and agency fees.</p><div className={s.grid}>
          {textFields.map(([key, label]) => <Field key={key} label={label}><input type={key === 'billingEmail' ? 'email' : 'text'} value={draft[key]} maxLength={key === 'billingEmail' ? 254 : 200} onChange={e => update(key, e.target.value)} /></Field>)}
          <Field label="Currency"><input readOnly value="USD" /></Field><Field label="Billing address" full><textarea value={draft.billingAddress} maxLength={2000} onChange={e => update('billingAddress', e.target.value)} /></Field>
          <Field label="Issuing agency legal name"><input value={draft.agencyName} maxLength={200} onChange={e => update('agencyName', e.target.value)} /></Field>
          <Field label="Issuing agency address"><textarea value={draft.agencyAddress} maxLength={2000} onChange={e => update('agencyAddress', e.target.value)} /></Field>
          <Field label="Client payment instructions" full><textarea value={draft.paymentInstructions} maxLength={2000} onChange={e => update('paymentInstructions', e.target.value)} /></Field>
          <Field label="Monthly invoice day (following service month)"><input type="number" min={1} max={28} required value={draft.invoiceDay} onChange={e => update('invoiceDay', Number(e.target.value))} /></Field>
          <Field label="Payment terms (days after invoice)"><input type="number" min={0} max={365} required value={draft.netDays} onChange={e => update('netDays', Number(e.target.value))} /></Field>
          <Field label="Expected collection delay beyond due date (days)"><input type="number" min={0} max={365} required value={draft.collectionDelayDays} onChange={e => update('collectionDelayDays', Number(e.target.value))} /></Field>
        </div></section>
        <section className={s.panel}><h2>Individual manager pay arrangements</h2><p>Managed GMV percentage plus fixed monthly pay. Payment is due seven days after the agency receives the full client payment. Effective months preserve the arrangement used on each invoice.</p>
          {draft.managerTerms.map((term, index) => <div className={s.row} key={index}><div className={s.grid}>
            <Field label="Effective month"><input type="month" required value={term.effectiveMonth} onChange={e => update('managerTerms', draft.managerTerms.map((t, i) => i === index ? { ...t, effectiveMonth: e.target.value } : t))} /></Field>
            <Field label="Brand manager"><select required value={term.managerId} onChange={e => update('managerTerms', draft.managerTerms.map((t, i) => i === index ? { ...t, managerId: e.target.value } : t))}><option value="">Choose manager</option>{data.managers.map(m => <option key={m.user_id} value={m.user_id}>{m.name || 'Unnamed manager'}</option>)}</select></Field>
            <Field label="Managed GMV percentage"><input type="number" required min={0} max={100} step="0.01" value={term.gmvPercent} onChange={e => update('managerTerms', draft.managerTerms.map((t, i) => i === index ? { ...t, gmvPercent: Number(e.target.value) } : t))} /></Field>
            <Field label="Fixed monthly pay (USD)"><input type="number" required min={0} max={100000000} step="0.01" value={term.fixedMonthly} onChange={e => update('managerTerms', draft.managerTerms.map((t, i) => i === index ? { ...t, fixedMonthly: Number(e.target.value) } : t))} /></Field>
          </div><button type="button" className={s.button} onClick={() => update('managerTerms', draft.managerTerms.filter((_, i) => i !== index))}>Remove arrangement</button></div>)}
          <button type="button" className={s.button} onClick={() => update('managerTerms', [...draft.managerTerms, { effectiveMonth: month, managerId: '', gmvPercent: 0, fixedMonthly: 0, payoutDays: 7 }])}>Add effective arrangement</button>
        </section>
        <section className={s.panel}><h2>Onboarding and renewal dates</h2><div className={s.grid}>
          {([['signedDate', 'Contract signed date'], ['campaignStart', 'Campaign start date'], ['renewalDate', 'Next renewal date']] as const).map(([key, label]) => <Field key={key} label={label}><DateField value={draft[key] ?? ''} onValueChange={value => update(key, value || null)} /></Field>)}
          <Field label="Automatic renewal"><select value={draft.autoRenew} onChange={e => update('autoRenew', e.target.value as FinanceSettings['autoRenew'])}><option value="unknown">Not reviewed</option><option value="yes">Yes</option><option value="no">No</option></select></Field>
          <Field label="Cancellation notice (days before renewal)"><input type="number" min={0} max={365} value={draft.noticeDays ?? ''} onChange={e => update('noticeDays', e.target.value === '' ? null : Number(e.target.value))} /></Field>
          <Field label="Contract and onboarding notes" full><textarea value={draft.notes} maxLength={4000} onChange={e => update('notes', e.target.value)} /></Field>
        </div>{draft.renewalDate && draft.noticeDays !== null && <div className={s.notice}>Cancellation notice date: <strong>{addDays(draft.renewalDate, -draft.noticeDays)}</strong>. Confirm the contract’s notice rules and delivery requirements.</div>}</section>
        <section className={s.panel}><h2>Monthly GMV forecast assumptions</h2><p>Enter an estimate for each service month. These estimates feed the collections forecast; invoices use completed actual GMV instead.</p>
          {draft.forecastGmv.map((row, index) => <div key={index} className={s.toolbar}><Field label="Service month"><input type="month" required value={row.month} onChange={e => update('forecastGmv', draft.forecastGmv.map((r, i) => i === index ? { ...r, month: e.target.value } : r))} /></Field><Field label="Estimated managed GMV (USD)"><input type="number" required min={0} max={100000000} step="0.01" value={row.amount} onChange={e => update('forecastGmv', draft.forecastGmv.map((r, i) => i === index ? { ...r, amount: Number(e.target.value) } : r))} /></Field><button type="button" className={s.button} onClick={() => update('forecastGmv', draft.forecastGmv.filter((_, i) => i !== index))}>Remove estimate</button></div>)}
          <button type="button" className={s.button} onClick={() => update('forecastGmv', [...draft.forecastGmv, { month: shiftMonth(month, draft.forecastGmv.length), amount: 0 }])}>Add monthly estimate</button>
        </section>
        <div className={s.toolbar}><button className={`${s.button} ${s.primary}`} type="submit">{busy ? 'Saving…' : 'Save billing & arrangements'}</button><p>{dirty ? 'You have unsaved changes.' : record ? `Saved · revision ${record.revision}` : 'Not saved yet'}</p></div>
      </fieldset>
    </form>
    <section className={s.panel}><h2>Signed contracts</h2><p>Private PDF storage for agency leadership. Upload a signed copy, then optionally have AI read it for review. Reading sends the PDF to Tempo’s AI provider, Anthropic; suggestions never change billing or dates automatically.</p>
      <div className={s.toolbar}><input aria-label="Signed contract PDF" type="file" accept="application/pdf" disabled={!data.canEdit || busy} onChange={e => setFile(e.target.files?.[0] ?? null)} /><button className={s.button} disabled={!file || !data.canEdit || busy} onClick={() => void run(async () => { const form = new FormData(); form.set('clientId', client.id); form.set('file', file!); await api('/api/agency/contracts', form); setFile(null); })}>Upload PDF (up to 4 MB)</button></div>
      {contracts.map(contract => <div className={s.row} key={contract.id}><div className={s.toolbar}><strong>{contract.name}</strong><span className={s.badge}>Uploaded {contract.created_at.slice(0, 10)}</span><button className={s.button} disabled={busy} onClick={() => void run(async () => { const result = await api(`/api/agency/contracts?id=${contract.id}`); window.location.assign(result.url); })}>Download</button>
        <button className={s.button} disabled={busy || (!contract.extraction && (!data.canEdit || !data.extractionAvailable))} onClick={() => { setSelectedContract(contract.id); if (!contract.extraction) void run(() => api('/api/agency/contracts', { id: contract.id, action: 'extract' })); }}>{contract.extraction ? 'Review extracted terms' : 'Read contract with AI'}</button></div></div>)}
      {!data.extractionAvailable && <p>AI contract reading is not configured. Contract storage and manual entry are available.</p>}
      {busy && selectedContract && <p role="status">Reading contract and saving suggestions…</p>}
      {extracted && <div className={s.stack}><h3>Suggested terms for review</h3><p>Compare each finding with the signed document, then enter approved values in the fields above or in agency terms. AI can miss terms or read them incorrectly.</p>{extracted.findings.map((f, i) => <div className={s.row} key={i}><strong>{f.field}: {f.value}</strong><blockquote className={s.quote}>{f.quote}{f.page ? ` (page ${f.page})` : ''}</blockquote></div>)}{extracted.uncertainties.map((value, i) => <p key={i} className={s.notice}>{value}</p>)}</div>}
    </section>
  </div>;
}

function Invoices({ data, busy, run }: { data: Data; busy: boolean; run: Run }) {
  const [clientId, setClientId] = useState(data.clients[0]?.id ?? ''), [month, setMonth] = useState(shiftMonth(today().slice(0, 7), -1));
  const [dates, setDates] = useState<Record<string, string>>({});
  return <div className={s.stack}><section className={s.panel}><h2>Agency client invoices</h2><p>Prepare a draft using actual managed GMV, review it, then mark it issued. Issuing records the invoice; it does not send an email or move money. Historical individual-payee invoices remain in <Link href="/invoicing">Finance invoicing</Link>.</p>
    <div className={s.toolbar}><Field label="Client"><select value={clientId} onChange={e => setClientId(e.target.value)}>{data.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Completed service month"><input type="month" value={month} max={shiftMonth(today().slice(0, 7), -1)} onChange={e => setMonth(e.target.value)} /></Field><button className={`${s.button} ${s.primary}`} disabled={busy || !clientId || !month || !data.canEdit} onClick={() => void run(() => api('/api/agency/finance', { action: 'draft', clientId, month }))}>{busy ? 'Working…' : 'Prepare invoice draft'}</button></div>
  </section>
  {data.invoices.length === 0 && <div className={s.notice}>No agency client invoices yet. Complete billing, agency terms, and manager arrangements before preparing your first draft.</div>}
  {data.invoices.map(invoice => { const snap = invoice.snapshot, manager = data.managers.find(m => m.user_id === snap.manager.managerId); return <section className={s.panel} key={invoice.id}>
    <div className={s.heading}><div><h2>{snap.clientName} · {invoice.month}</h2><p>Invoice {invoice.id.slice(0, 8).toUpperCase()} · Issued date {snap.issuedDate} · Due {snap.dueDate}</p></div><span className={s.badge}>{invoice.status}</span></div>
    <div className={s.cards}><div><span>Agency invoice</span><strong>{money(snap.feeCents)}</strong></div><div><span>{manager?.name ?? 'Assigned manager'} pay</span><strong>{money(snap.managerCents)}</strong></div><div><span>Agency retained before overhead</span><strong>{money(snap.feeCents - snap.managerCents)}</strong></div></div>
    <p>Managed GMV: {money(snap.gmvCents)}. Manager pay: {snap.manager.gmvPercent}% plus {money(snap.manager.fixedMonthly * 100)} fixed. {invoice.collected_on ? `Collected ${invoice.collected_on}; manager pay due ${addDays(invoice.collected_on, 7)}.` : `Expected collection ${snap.expectedDate}; manager pay due seven days after actual collection.`}{invoice.manager_paid_on ? ` Manager paid ${invoice.manager_paid_on}.` : ''}</p>
    {snap.managerCents > snap.feeCents && <div className={s.notice}>Manager pay exceeds this agency invoice. Review the arrangements before issuing.</div>}
    <details><summary>Review client invoice details</summary><p>{snap.billing.legalName}<br />{snap.billing.billingAddress}<br />{snap.billing.billingEmail}<br />PO: {snap.billing.purchaseOrder || 'None'}<br />Agency fees for {invoice.month}: {money(snap.feeCents)} USD</p><p>Agreement revision {snap.clientRevision}; billing and pay revision {snap.settingsRevision}. This snapshot stays fixed if the agreement changes.</p></details>
    <div className={s.toolbar}>
      <Link className={s.button} href={`/agency/finance/invoice/${invoice.id}`} target="_blank">Print client invoice</Link>
      {data.canEdit && invoice.status === 'draft' && <button className={s.button} disabled={busy} onClick={() => void run(() => api('/api/agency/finance', { action: 'issue', id: invoice.id, expectedRevision: invoice.revision }))}>Mark issued</button>}
      {data.canEdit && (invoice.status === 'issued' || (invoice.status === 'paid' && !invoice.manager_paid_on)) && <><Field label={invoice.status === 'issued' ? 'Full collection date' : 'Manager payment date'}><DateField value={dates[invoice.id] ?? today()} min={invoice.collected_on ?? snap.issuedDate} max={today()} onValueChange={value => setDates(d => ({ ...d, [invoice.id]: value }))} /></Field><button className={s.button} disabled={busy || dates[invoice.id] === ''} onClick={() => void run(() => api('/api/agency/finance', { action: invoice.status === 'issued' ? 'collect' : 'pay', id: invoice.id, expectedRevision: invoice.revision, date: dates[invoice.id] ?? today() }))}>{invoice.status === 'issued' ? 'Record full collection' : 'Record manager payment'}</button></>}
      {data.canEdit && ['draft', 'issued'].includes(invoice.status) && <button className={s.button} disabled={busy} onClick={() => void run(() => api('/api/agency/finance', { action: 'void', id: invoice.id, expectedRevision: invoice.revision }))}>Void invoice</button>}
    </div>
  </section>; })}</div>;
}
function Forecast({ data }: { data: Data }) {
  const [delay, setDelay] = useState(0), [clientId, setClientId] = useState('');
  const clients = data.clients.filter(c => !clientId || c.id === clientId), invoices = data.invoices.filter(i => !clientId || i.client_id === clientId);
  const result = forecast(clients, data.settings, invoices, today(), delay);
  const end = result.weeks.at(-1)!.end, receipts = result.weeks.reduce((sum, w) => sum + w.receiptCents, 0), payouts = result.weeks.reduce((sum, w) => sum + w.payoutCents, 0);
  const max = Math.max(1, ...result.weeks.map(w => w.receiptCents));
  return <div className={s.stack}><section className={s.panel}><div className={s.heading}><div><h2>13-week collections forecast</h2><p>{today()} through {end}. Monthly collections stay on their expected dates.</p></div><div className={s.toolbar}><Field label="Client"><select value={clientId} onChange={e => setClientId(e.target.value)}><option value="">All clients</option>{data.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Collection scenario"><select value={delay} onChange={e => setDelay(Number(e.target.value))}><option value={0}>Expected timing</option><option value={14}>14 days later</option><option value={30}>30 days later</option></select></Field></div></div>
    <div className={s.cards}><div><span>Expected collections</span><strong>{money(receipts)}</strong></div><div><span>Expected manager payments</span><strong>{money(payouts)}</strong></div><div><span>Net cash before overhead</span><strong>{money(receipts - payouts)}</strong></div></div>
    <p>Open invoices replace estimates for the same client and service month. Drafts remain provisional. Overdue amounts appear in the first week and need follow-up. Paid receipts are excluded; unpaid manager obligations remain. This is a forecast of agency client invoices, not an account balance or a forecast of legacy payee invoices.</p>
    <div className={s.scroll}><table className={s.table}><thead><tr><th>Week beginning</th><th>Collections</th><th>Manager payments</th><th>Net cash</th></tr></thead><tbody>{result.weeks.map(w => <tr key={w.start}><td>{w.start}<small>through {w.end}</small></td><td className={s.money}>{money(w.receiptCents)}<div className={s.bar} style={{ width: `${w.receiptCents / max * 100}%` }} /></td><td className={s.money}>{money(w.payoutCents)}</td><td className={s.money}>{money(w.retainedCents)}</td></tr>)}</tbody></table></div>
  </section>
  {result.missing.length > 0 && <details className={s.panel}><summary>{result.missing.length} client months need setup or an estimate</summary>{result.missing.map((m, i) => <p key={i}>{m}</p>)}</details>}
  <section className={s.panel}><h2>Collection and payment schedule</h2><p>Dates outside the 13-week window remain visible below and are excluded from the totals above.</p><div className={s.scroll}><table className={s.table}><thead><tr><th>Client / service month</th><th>Source</th><th>Collection date</th><th>Agency receipt</th><th>Manager pay date</th><th>Manager pay</th></tr></thead><tbody>{result.events.map((e, i) => <tr key={i}><td>{e.clientName}<small>{e.month}</small></td><td>{e.source}{e.overdue && <small>Overdue / follow-up</small>}</td><td>{e.receiptDate ?? 'Already collected'}{e.receiptDate && e.receiptDate > end && <small>Outside window</small>}</td><td className={s.money}>{money(e.receiptCents)}</td><td>{e.payoutDate ?? 'Already paid'}{e.payoutDate && e.payoutDate > end && <small>Outside window</small>}</td><td className={s.money}>{money(e.payoutCents)}</td></tr>)}</tbody></table></div></section>
  <section className={s.panel}><h2>Renewals and notice dates</h2>{clients.map(c => { const settings = data.settings.find(r => r.client_id === c.id)?.settings; return settings?.renewalDate ? <p key={c.id}><strong>{c.name}</strong> · Renewal {settings.renewalDate} · Notice {settings.noticeDays === null ? 'Not reviewed' : addDays(settings.renewalDate, -settings.noticeDays)} · Auto-renewal {settings.autoRenew}</p> : null; })}</section>
  </div>;
}
