'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Dialog } from 'radix-ui';
import { Check, CircleAlert, FileCheck2, Loader2, RefreshCw, X } from 'lucide-react';
import { ChoiceMenu } from '@/components/ui/choice-menu';
import { SearchInput } from '@/components/ui/search-input';
import { DateField } from '@/components/ui/date-field';
import { Input, Textarea } from '@/components/ui/input';
import { billingPosition } from '@/lib/agency/billing-model';
import { calculateServiceRevenue } from '@/lib/agency/model';
import type { AgencyBillingRecord, BillingAction, BillingMutation, BillingResponse } from '@/lib/agency/billing-types';
import type { AgencyBusinessResponse } from './workspace';
import shared from './agency.module.css';
import styles from './billing.module.css';

const money = (cents: number | null | undefined) => cents === null || cents === undefined ? 'Not recorded' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const monthName = (month: string) => new Date(`${month}-01T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const dateName = (date: string | null) => date ? (date.includes('T') ? new Date(date).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' }) : new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })) : 'Not set';
function today() { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); return ['year', 'month', 'day'].map(key => parts.find(part => part.type === key)?.value).join('-'); }
function shiftMonth(month: string, offset: number) { const date = new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1 + offset, 1); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; }
const labels: Record<string, string> = { calculated: 'Ready to review', needs_setup: 'Needs terms', needs_lifecycle: 'Needs service dates', outside_service: 'Outside service', review_required: 'Needs manual review', missing_gmv: 'Incomplete GMV', reviewed: 'Reviewed', invoiced: 'Invoiced', partially_paid: 'Partially paid', paid: 'Paid', no_payment_due: 'No payment due' };
const eventLabels: Record<BillingAction, string> = { review: 'Fee reviewed', correct_review: 'Review corrected', invoice: 'Invoice recorded', void_invoice: 'Invoice voided', receipt: 'Payment recorded', reverse_receipt: 'Payment reversed' };

function sourceRows(data: AgencyBusinessResponse) {
  const performance = new Map(data.performance.map(row => [row.brandId, row]));
  const brands = new Map(data.brands.map(brand => [brand.id, brand]));
  return data.clients.map(client => {
    const sources = client.brandIds.map(id => performance.get(id));
    const complete = sources.length > 0 && sources.every(row => row?.complete && row.managedGmv !== null);
    const gmvCents = complete ? sources.reduce((sum, row) => sum + Math.round((row?.managedGmv ?? 0) * 100), 0) : null;
    return { client, brandNames: client.brandIds.map(id => brands.get(id)?.name).filter(Boolean).join(', '), gmvCents, complete, recordedThrough: sources.map(row => row?.recordedThrough).filter((date): date is string => Boolean(date)).sort()[0] ?? null, calculation: calculateServiceRevenue({ client, month: data.month, periodStart: data.periodStart, periodEnd: data.periodEnd, gmvCents, gmvComplete: complete }) };
  });
}
type SourceRow = ReturnType<typeof sourceRows>[number];
type CombinedRow = SourceRow & { billing: AgencyBillingRecord | null };
type WorkspaceData = { business: AgencyBusinessResponse; billing: BillingResponse };

export function BillingWorkspace({ initialMonth }: { initialMonth?: string }) {
  const [month, setMonth] = useState(initialMonth ?? shiftMonth(today().slice(0, 7), -1));
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [tab, setTab] = useState('review');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const epoch = useRef(0);
  const context = useRef(0);
  useEffect(() => {
    const reset = () => { epoch.current++; context.current++; setData(null); setSelected(null); setNotice(null); setError(null); setLoading(true); setReload(value => value + 1); };
    window.addEventListener('workspace-context-changed', reset);
    return () => window.removeEventListener('workspace-context-changed', reset);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const requestEpoch = ++epoch.current;
    const get = async <T,>(url: string): Promise<T> => { const response = await fetch(url, { cache: 'no-store', signal: controller.signal }); const payload = await response.json().catch(() => null); if (!response.ok) throw new Error(payload?.error || 'Unable to load billing records.'); return payload as T; };
    Promise.all([get<AgencyBusinessResponse>(`/api/agency/business?month=${month}`), get<BillingResponse>(`/api/agency/billing?month=${month}`)])
      .then(([business, billing]) => { if (!controller.signal.aborted && requestEpoch === epoch.current) { setData({ business, billing }); setError(null); setLoading(false); } })
      .catch(cause => { if (!controller.signal.aborted && requestEpoch === epoch.current) { setError(cause instanceof Error ? cause.message : 'Unable to load billing records.'); setLoading(false); } });
    return () => controller.abort();
  }, [month, reload]);
  const visible = data?.business.month === month ? data : null;
  const rows = useMemo<CombinedRow[]>(() => visible ? sourceRows(visible.business).map(row => ({ ...row, billing: visible.billing.records.find(record => record.clientId === row.client.id) ?? null })).filter(row => row.calculation.status !== 'outside_service' || row.billing) : [], [visible]);
  const asOf = today();
  const ready = rows.filter(row => row.calculation.status === 'calculated');
  const reviewed = rows.filter(row => row.billing);
  const invoiced = reviewed.filter(row => row.billing?.record.invoice);
  const status = (row: CombinedRow) => row.billing ? billingPosition(row.billing.record, asOf).status : row.calculation.status;
  const filtered = rows.filter(row => tab !== 'history' || row.billing).filter(row => filter === 'all' || (filter === 'open' ? !['paid', 'no_payment_due'].includes(status(row)) : filter === 'blocked' ? !row.billing && row.calculation.status !== 'calculated' : status(row) === filter)).filter(row => `${row.client.name} ${row.brandNames}`.toLowerCase().includes(search.toLowerCase()));
  const selectedRow = rows.find(row => row.client.id === selected);
  const total = (list: CombinedRow[], value: (row: CombinedRow) => number) => list.length ? list.reduce((sum, row) => sum + value(row), 0) : null;
  const options = Array.from(new Set([month, ...Array.from({ length: 18 }, (_, index) => shiftMonth(today().slice(0, 7), -index - 1))])).sort().reverse().map(value => ({ value, label: monthName(value) }));
  const refresh = () => { setLoading(true); setError(null); setReload(value => value + 1); };
  const renderContext = context.current;
  return <div className={`${shared.workspace} ${styles.workspace}`} aria-busy={loading}>
    <header className={shared.pageHeader}><div><div className={shared.eyebrow}>AGENCY WORKSPACE</div><h1>Revenue</h1><p>Review service fees. Track invoices and collections.</p></div><div className={shared.headerActions}><ChoiceMenu compact label="Service month" value={month} options={options} onChange={value => { setMonth(value); setData(null); setSelected(null); setNotice(null); setLoading(true); setError(null); }} /><button type="button" className={shared.iconButton} aria-label="Refresh billing" disabled={loading} onClick={refresh}><RefreshCw size={15} className={loading ? styles.spin : ''} /></button></div></header>
    {notice && <div className={styles.notice} role="status"><Check size={16} />{notice}</div>}
    {error && <div className={styles.notice} data-error role="alert"><CircleAlert size={16} /><span>{error}</span><button type="button" className={shared.textButton} onClick={refresh}>Try again</button></div>}
    {loading && !visible ? <div className={styles.loading} role="status"><Loader2 size={18} className={styles.spin} />Loading monthly billing review</div> : visible && <>
      {!visible.billing.storageReady && <div className={styles.notice}><CircleAlert size={16} />Billing storage is not available yet. Calculated fees are visible; saving is disabled.</div>}
      {visible.business.performanceWarning && <div className={styles.notice}><CircleAlert size={16} />{visible.business.performanceWarning}</div>}
      <section className={shared.metricRail} aria-label="Monthly billing totals">
        <Summary label="Calculated fees" value={total(ready, row => row.calculation.revenueCents ?? 0)} detail={`${ready.length} of ${rows.length} clients calculated${ready.length < rows.length ? ' · partial subtotal' : ''}`} />
        <Summary label="Reviewed fees" value={total(reviewed, row => row.billing!.record.review.reviewedCents)} detail={`${reviewed.length} saved reviews · service month`} />
        <Summary label="Invoiced" value={total(invoiced, row => row.billing!.record.invoice!.amountCents)} detail={`${invoiced.length} recorded invoices · this service month`} />
        <Summary label="Outstanding" value={total(invoiced, row => billingPosition(row.billing!.record, asOf).balanceCents ?? 0)} detail={`For this service month · as of ${dateName(asOf)}`} />
      </section>
      <div className={styles.tabs} role="tablist" aria-label="Revenue view" onKeyDown={event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const next = event.key === 'Home' ? 'review' : event.key === 'End' ? 'history' : tab === 'review' ? 'history' : 'review'; setTab(next); setFilter('all'); document.getElementById(`billing-${next}-tab`)?.focus(); }}><button type="button" role="tab" id="billing-review-tab" tabIndex={tab === 'review' ? 0 : -1} aria-controls="billing-panel" aria-selected={tab === 'review'} onClick={() => { setTab('review'); setFilter('all'); }}>Monthly review</button><button type="button" role="tab" id="billing-history-tab" tabIndex={tab === 'history' ? 0 : -1} aria-controls="billing-panel" aria-selected={tab === 'history'} onClick={() => { setTab('history'); setFilter('all'); }}>Invoice history</button></div>
      <section className={shared.panel} id="billing-panel" role="tabpanel" aria-labelledby={`billing-${tab}-tab`}>
        <div className={styles.toolbar}><div><h2>{monthName(month)}</h2><p>{tab === 'review' ? 'Review a client to verify the calculation and freeze the fee.' : 'Recorded reviews, invoices and payments for this service month.'}</p></div><div className={styles.toolbarControls}><SearchInput aria-label="Find a client" placeholder="Find a client" value={search} onChange={event => setSearch(event.target.value)} onClear={() => setSearch('')} /><ChoiceMenu compact label="Billing status" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All statuses' }, { value: 'open', label: 'Open items' }, { value: 'calculated', label: 'Ready to review' }, { value: 'blocked', label: 'Needs setup' }, { value: 'reviewed', label: 'Reviewed' }, { value: 'invoiced', label: 'Invoiced' }, { value: 'partially_paid', label: 'Partially paid' }, { value: 'paid', label: 'Paid' }]} /></div></div>
        <div className={shared.tableScroll}><table className={styles.table}><thead><tr><th>Client</th><th className={styles.numeric}>{tab === 'history' ? 'Reviewed fee' : 'Calculated fee'}</th><th className={styles.numeric}>{tab === 'history' ? 'Collected' : 'Reviewed fee'}</th><th>Status</th><th>{tab === 'history' ? 'Invoice' : 'Agreement'}</th><th><span className="sr-only">Action</span></th></tr></thead><tbody>{filtered.map(row => { const record = row.billing?.record; const position = record ? billingPosition(record, asOf) : null; return <tr key={row.client.id}><td><span className={styles.client}>{row.client.name}</span>{row.brandNames !== row.client.name && <span className={styles.sub}>{row.brandNames}</span>}</td><td className={styles.numeric}>{money(tab === 'history' ? record?.review.reviewedCents : row.calculation.revenueCents)}</td><td className={styles.numeric}>{money(tab === 'history' ? position?.collectedCents : record?.review.reviewedCents)}</td><td><Status status={status(row)} overdue={position?.overdue} /></td><td>{tab === 'history' ? record?.invoice?.reference ?? 'Not invoiced' : `Revision ${row.client.revision}`}{row.billing && row.billing.evidence.client.revision !== row.client.revision && <span className={styles.sub}>Reviewed on revision {row.billing.evidence.client.revision}</span>}</td><td><button type="button" className={shared.textButton} onClick={() => setSelected(row.client.id)}>{row.billing ? 'View details' : row.calculation.status === 'calculated' ? 'Review fee' : row.calculation.status === 'review_required' ? 'Enter agreed fee' : 'View blocker'}</button></td></tr>; })}</tbody></table></div>
        {!filtered.length && <div className={styles.empty}><strong>{rows.length ? 'No clients match this view' : 'No clients for this month'}</strong>{rows.length ? 'Change the filter or search to see other clients.' : 'Add service dates and agency terms in Clients to start calculating fees.'}</div>}
      </section><p className={styles.scopeNote}>Agency service fees only. Creator funding and team compensation are separate. Recording an invoice or payment here does not send an invoice or move money.</p>
    </>}
    {selectedRow && visible && <BillingDrawer key={`${month}:${selectedRow.client.id}:${selectedRow.billing?.revision ?? 0}`} row={selectedRow} month={month} history={visible.billing.history.filter(record => record.clientId === selectedRow.client.id)} canEdit={visible.billing.canEdit && visible.billing.storageReady && visible.business.canEdit && !loading} onClose={() => setSelected(null)} onRefresh={refresh} onSaved={saved => { if (renderContext !== context.current) return; setData(previous => previous ? { ...previous, billing: { ...previous.billing, records: [...previous.billing.records.filter(record => record.clientId !== saved.clientId), saved], history: [...previous.billing.history.filter(record => !(record.clientId === saved.clientId && record.revision === saved.revision)), saved] } } : previous); setNotice(`${selectedRow.client.name}: ${eventLabels[saved.events.at(-1)?.action ?? 'review'].toLowerCase()}.`); }} />}
  </div>;
}

function Summary({ label, value, detail }: { label: string; value: number | null; detail: string }) { return <div className={shared.metric}><span className={shared.metricLabel}>{label}</span><strong style={{ fontSize: 'clamp(22px,2.25vw,32px)' }}>{money(value)}</strong><span className={shared.metricDetail}>{detail}</span></div>; }
function Status({ status, overdue }: { status: string; overdue?: boolean }) { return <span className={styles.status} data-tone={overdue || ['needs_setup', 'needs_lifecycle', 'review_required', 'missing_gmv'].includes(status) ? 'warning' : ['paid', 'no_payment_due'].includes(status) ? 'paid' : ['calculated', 'reviewed'].includes(status) ? 'ready' : undefined}>{overdue ? 'Overdue' : labels[status] ?? status}</span>; }

type Fields<T> = T extends BillingMutation ? Omit<T, 'clientId' | 'month' | 'expectedRevision' | 'requestId'> : never;
type ActionFields = Fields<BillingMutation>;
function BillingDrawer({ row, month, history, canEdit, onClose, onSaved, onRefresh }: { row: CombinedRow; month: string; history: AgencyBillingRecord[]; canEdit: boolean; onClose: () => void; onSaved: (record: AgencyBillingRecord) => void; onRefresh: () => void }) {
  const [mode, setMode] = useState<BillingAction | null>(row.billing ? null : ['calculated', 'review_required'].includes(row.calculation.status) ? 'review' : null);
  const [receiptId, setReceiptId] = useState('');
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const retry = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const billing = row.billing;
  const record = billing?.record;
  const evidence = billing?.evidence;
  const position = record ? billingPosition(record, today()) : null;
  const close = () => { if (busy) return; if (dirty) setDiscard(true); else onClose(); };
  const begin = (action: BillingAction, id = '') => { setMode(action); setReceiptId(id); setError(null); setDirty(false); };
  const save = async (fields: ActionFields) => {
    if (!canEdit || busy || conflict) return;
    const body = { ...fields, clientId: row.client.id, month, expectedRevision: billing?.revision ?? 0 };
    const fingerprint = JSON.stringify(body);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, requestId: crypto.randomUUID() };
    setBusy(true); setError(null);
    try {
      const response = await fetch('/api/agency/billing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, requestId: retry.current.requestId }) });
      const payload = await response.json().catch(() => null);
      if (!active.current) return;
      if (!response.ok) { if (response.status === 409) setConflict(true); throw new Error(payload?.error || 'Unable to save. You can retry this action safely.'); }
      setDirty(false); setMode(null); onSaved(payload as AgencyBillingRecord);
    } catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : 'Unable to save. You can retry this action safely.'); }
    finally { if (active.current) setBusy(false); }
  };
  const terms = evidence?.terms ?? row.calculation.terms;
  return <Dialog.Root open onOpenChange={open => { if (!open) close(); }}><Dialog.Portal><Dialog.Overlay className={styles.overlay} /><Dialog.Content className={`${styles.workspace} ${styles.drawer}`} onEscapeKeyDown={event => { event.preventDefault(); close(); }} onPointerDownOutside={event => { event.preventDefault(); close(); }} data-lenis-prevent>
    <header className={styles.drawerHeader}><div><Dialog.Title>{row.client.name}</Dialog.Title><Dialog.Description>{monthName(month)} service fees · {row.brandNames}</Dialog.Description></div><button type="button" className={shared.iconButton} aria-label="Close billing details" disabled={busy} onClick={close}><X size={18} /></button></header>
    <div className={styles.drawerBody}>
      <section className={styles.section}><div className={styles.sectionTitle}><h3>{billing ? 'Saved review' : 'Calculation evidence'}</h3><Status status={position?.status ?? row.calculation.status} overdue={position?.overdue} /></div>
        <dl className={styles.facts}><div><dt>{billing ? 'Reviewed service fee' : 'Calculated service fee'}</dt><dd><strong>{money(record?.review.reviewedCents ?? row.calculation.revenueCents)}</strong></dd></div><div><dt>{billing ? 'Outstanding balance' : 'Managed GMV'}</dt><dd><strong>{money(position ? position.balanceCents : row.gmvCents)}</strong></dd></div><div><dt>Agreement</dt><dd>Revision {evidence?.client.revision ?? row.client.revision}{evidence && evidence.client.revision !== row.client.revision && <span className={styles.sub}>Current agreement is revision {row.client.revision}</span>}</dd></div><div><dt>Service dates</dt><dd>{dateName(evidence ? evidence.client.serviceStart : row.client.serviceStart)} to {dateName(evidence ? evidence.client.serviceEnd : row.client.serviceEnd) === 'Not set' ? 'ongoing' : dateName(evidence ? evidence.client.serviceEnd : row.client.serviceEnd)}</dd></div></dl>
        <div className={styles.calculation}><div><span>Fee model</span><strong>{terms ? { fixed: 'Fixed fee', share: 'Revenue share', additive: 'Fixed fee + share', minimum: 'Minimum guarantee' }[terms.feeModel] : 'Terms not set'}</strong></div>{terms && <><div><span>Monthly agency fee</span><strong>{money(Math.round(terms.monthlyRetainer * 100))}</strong></div><div><span>Revenue share</span><strong>{terms.revSharePercent}%</strong></div></>}<div><span>Managed GMV {billing ? 'at review' : 'for the month'}</span><strong>{money(evidence ? evidence.managedGmvCents : row.gmvCents)}</strong></div><div><span>{record?.review.calculatedCents === null ? 'Fee basis' : 'Source calculation'}</span><strong>{record?.review.calculatedCents === null ? 'Manually agreed' : money(record ? record.review.calculatedCents : row.calculation.revenueCents)}</strong></div>{record && record.review.calculatedCents !== null && <div><span>Documented adjustment</span><strong>{money(record.review.adjustmentCents)}</strong></div>}</div>
        {record?.review.calculatedCents === null && <div className={styles.notice}><div><strong>Manually agreed fee</strong><p className={styles.muted}>{[...(billing?.events ?? [])].reverse().find(event => event.action === 'review' || event.action === 'correct_review')?.reason ?? 'See review history for the agreed basis.'}</p><p className={styles.muted}>This amount was entered explicitly, not calculated or automatically prorated.</p></div></div>}
        {record?.review.adjustmentReason && <p className={styles.scopeNote}>Adjustment: {record.review.adjustmentReason}</p>}
        <p className={styles.scopeNote}>{billing ? `Snapshot saved ${dateName(evidence!.calculatedAt)}. Later agreement changes do not rewrite this review.` : `Source recorded through ${dateName(row.recordedThrough)}. ${row.complete ? 'GMV coverage complete.' : 'GMV coverage incomplete; fixed fees can still be calculated.'}`}</p>
      </section>
      {!billing && row.calculation.status !== 'calculated' && <div className={styles.notice}><CircleAlert size={18} /><div><strong>{labels[row.calculation.status]}</strong><p className={styles.muted}>{row.calculation.status === 'missing_gmv' ? 'Complete the source data before reviewing a revenue-share fee.' : row.calculation.status === 'review_required' ? 'This month includes a partial service period or another calculation exception. Enter the agreed fee and explain its basis below. No proration is assumed.' : 'Save the client’s service dates and effective terms before reviewing this month.'}</p><Link href="/agency/clients" className={shared.textButton}>Open client agreements</Link></div></div>}
      {record?.invoice && <section className={styles.section}><div className={styles.sectionTitle}><h3>Invoice</h3>{canEdit && !mode && record.receipts.length === 0 && <button type="button" className={shared.textButton} onClick={() => begin('void_invoice')}>Void record</button>}</div><dl className={styles.facts}><div><dt>Reference</dt><dd>{record.invoice.reference}</dd></div><div><dt>Invoice amount</dt><dd>{money(record.invoice.amountCents)}</dd></div><div><dt>Issued</dt><dd>{dateName(record.invoice.issuedOn)}</dd></div><div><dt>Due</dt><dd>{dateName(record.invoice.dueOn)}</dd></div></dl></section>}
      {record && record.receipts.length > 0 && <section className={styles.section}><h3>Payments received</h3>{record.receipts.map(receipt => <div className={styles.receipt} key={receipt.id}><div>{receipt.reference}<span className={styles.sub}>{dateName(receipt.receivedOn)}</span></div><div className={styles.receiptActions}><strong>{money(receipt.amountCents)}</strong>{canEdit && !mode && <button type="button" className={shared.textButton} onClick={() => begin('reverse_receipt', receipt.id)}>Reverse</button>}</div></div>)}</section>}
      {error && <div className={styles.notice} data-error role="alert"><CircleAlert size={16} /><div>{error}{conflict && <p><button type="button" className={shared.textButton} onClick={() => { onClose(); onRefresh(); }}>Reload latest records</button></p>}</div></div>}
      {mode && canEdit && <section className={styles.section}><h3>{{ review: 'Review this fee', correct_review: 'Correct the review', invoice: 'Record an invoice', receipt: 'Record a payment', void_invoice: 'Void this invoice record', reverse_receipt: 'Reverse this payment record' }[mode]}</h3><ActionForm key={`${mode}:${receiptId}`} mode={mode} row={row} receiptId={receiptId} busy={busy || conflict} onDirty={() => setDirty(true)} onSubmit={save} onCancel={() => { if (dirty) setDiscard(true); else setMode(null); }} /></section>}
      {canEdit && !mode && record && <section className={styles.section}><div className={styles.toolbarControls}>{!record.invoice && <><button type="button" className={shared.primaryButton} onClick={() => begin('invoice')}><FileCheck2 size={14} />Record invoice</button><button type="button" className={shared.secondaryButton} disabled={!['calculated', 'review_required'].includes(row.calculation.status)} onClick={() => begin('correct_review')}>Correct review</button></>}{record.invoice && (position?.balanceCents ?? 0) > 0 && <button type="button" className={shared.primaryButton} onClick={() => begin('receipt')}>Record payment</button>}</div><p className={styles.scopeNote}>{record.invoice ? 'To correct the reviewed fee, reverse its payments and void the invoice record first. Existing history is preserved.' : 'The invoice amount will match the saved review. Changes require a documented correction.'}</p></section>}
      {billing && <section className={styles.section}><h3>Activity history</h3><ol className={styles.audit}>{[...billing.events].reverse().map(event => <li key={event.revision}><strong>{eventLabels[event.action]}</strong><time dateTime={event.at}>{new Date(event.at).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })} CT · Revision {event.revision}</time>{event.reason && <p>{event.reason}</p>}{event.effectiveOn && <p>Effective {dateName(event.effectiveOn)}</p>}<details><summary className={styles.muted}>Record details</summary><p>Actor ID: {event.actorId}</p>{history.filter(item => item.revision === event.revision).map(item => <div key={item.revision}><p>Reviewed {money(item.record.review.reviewedCents)}{item.record.invoice ? ` · Invoice ${item.record.invoice.reference}: ${money(item.record.invoice.amountCents)}` : ' · No active invoice'}</p>{item.record.invoice && <p>Issued {dateName(item.record.invoice.issuedOn)} · Due {dateName(item.record.invoice.dueOn)}</p>}{item.record.receipts.map(receipt => <p key={receipt.id}>Payment {receipt.reference}: {money(receipt.amountCents)} · {dateName(receipt.receivedOn)}</p>)}</div>)}</details></li>)}</ol></section>}
      {!canEdit && <p className={styles.muted}>This view is read-only. Recording billing activity requires agency finance access.</p>}
    </div>
    <footer className={styles.drawerFooter}>{discard ? <><span className={styles.muted}>Discard your unsaved changes?</span><div className={styles.toolbarControls}><button type="button" className={shared.secondaryButton} onClick={() => setDiscard(false)}>Keep editing</button><button type="button" className={shared.primaryButton} onClick={onClose}>Discard</button></div></> : <><span className={styles.muted}>Internal records only. No money is moved.</span><button type="button" className={shared.secondaryButton} disabled={busy} onClick={close}>Close</button></>}</footer>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}

function decimalCents(value: string, signed = false) { const raw = value.trim() || '0'; if (!(signed ? /^-?\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/).test(raw)) throw new Error('Enter a dollar amount with at most two decimal places.'); const cents = Math.round(Number(raw) * 100); if (!Number.isSafeInteger(cents)) throw new Error('The amount is too large.'); return cents; }
function ActionForm({ mode, row, receiptId, busy, onDirty, onSubmit, onCancel }: { mode: BillingAction; row: CombinedRow; receiptId: string; busy: boolean; onDirty: () => void; onSubmit: (fields: ActionFields) => Promise<void>; onCancel: () => void }) {
  const [adjustment, setAdjustment] = useState(mode === 'correct_review' ? String((row.billing?.record.review.adjustmentCents ?? 0) / 100) : '0');
  const [reason, setReason] = useState(''); const [reference, setReference] = useState(''); const [date, setDate] = useState(today()); const [due, setDue] = useState(''); const [amount, setAmount] = useState(''); const [error, setError] = useState<string | null>(null);
  const review = mode === 'review' || mode === 'correct_review';
  const manual = review && row.calculation.status === 'review_required';
  const reversal = mode === 'void_invoice' || mode === 'reverse_receipt';
  const submit = async (event: FormEvent) => { event.preventDefault(); setError(null); try {
    let payload: ActionFields;
    if (review) payload = { action: mode, clientRevision: row.client.revision, expectedCalculatedCents: row.calculation.revenueCents, adjustmentCents: manual ? 0 : decimalCents(adjustment, true), ...(reason.trim() ? { adjustmentReason: reason.trim() } : {}), ...(mode === 'correct_review' || manual ? { reason: reason.trim() } : {}), ...(manual ? { manualReviewedCents: decimalCents(amount) } : {}) };
    else if (mode === 'invoice') payload = { action: mode, reference: reference.trim(), issuedOn: date, dueOn: due } as ActionFields;
    else if (mode === 'receipt') payload = { action: mode, reference: reference.trim(), receivedOn: date, amountCents: decimalCents(amount) } as ActionFields;
    else payload = { action: mode, reason: reason.trim(), effectiveOn: date, ...(mode === 'reverse_receipt' ? { receiptId } : {}) } as ActionFields;
    await onSubmit(payload);
  } catch (cause) { setError(cause instanceof Error ? cause.message : 'Check the entered values.'); } };
  let preview: number | null = null; try { if (manual && amount.trim()) preview = decimalCents(amount); else if (review && row.calculation.revenueCents !== null) preview = row.calculation.revenueCents + decimalCents(adjustment, true); } catch { /* Invalid input is explained on submit. */ }
  return <form className={styles.form} onSubmit={submit} onChange={onDirty}>
    {review && <>{manual ? <label className={styles.field}><span>Agreed service fee (USD)</span><Input value={amount} onChange={event => setAmount(event.target.value)} required inputMode="decimal" disabled={busy} placeholder="Enter the approved amount" /><small className={styles.muted}>Manual fee for this service month. Enter the actual agreed amount, including zero when explicitly waived.</small></label> : <label className={styles.field}><span>Adjustment (USD)</span><Input value={adjustment} onChange={event => setAdjustment(event.target.value)} inputMode="decimal" disabled={busy} /><small className={styles.muted}>Use a negative amount for a credit. The source calculation stays unchanged.</small></label>}<label className={styles.field}><span>{manual ? 'Basis for the agreed fee' : mode === 'correct_review' ? 'Reason for this correction' : 'Adjustment reason'}</span><Textarea value={reason} onChange={event => setReason(event.target.value)} required={manual || mode === 'correct_review' || (Number(adjustment) !== 0)} maxLength={2000} rows={3} disabled={busy} placeholder="Explain the change for accounting." /></label>{mode === 'correct_review' && <p className={styles.muted}>The current agreement and source data will be captured in a new review. The prior review remains in history.</p>}</>}
    {(mode === 'invoice' || mode === 'receipt') && <label className={styles.field}><span>{mode === 'invoice' ? 'External invoice reference' : 'Payment reference'}</span><Input value={reference} onChange={event => setReference(event.target.value)} required maxLength={200} disabled={busy} placeholder={mode === 'invoice' ? 'Invoice number from accounting' : 'Bank or accounting reference'} /></label>}
    {mode === 'receipt' && <label className={styles.field}><span>Amount received (USD)</span><Input value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal" required disabled={busy} placeholder="0.00" /><small className={styles.muted}>Outstanding: {money(row.billing ? billingPosition(row.billing.record, today()).balanceCents : null)}</small></label>}
    {!review && <div className={styles.twoFields}><label className={styles.field}><span>{mode === 'invoice' ? 'Issue date' : mode === 'receipt' ? 'Received date' : 'Effective date'}</span><DateField aria-label={mode === 'invoice' ? 'Issue date' : mode === 'receipt' ? 'Received date' : 'Effective date'} value={date} onValueChange={value => { setDate(value); onDirty(); }} max={today()} required disabled={busy} /></label>{mode === 'invoice' && <label className={styles.field}><span>Due date</span><DateField aria-label="Due date" value={due} onValueChange={value => { setDue(value); onDirty(); }} min={date} required disabled={busy} /></label>}</div>}
    {reversal && <><label className={styles.field}><span>Reason</span><Textarea value={reason} onChange={event => setReason(event.target.value)} required maxLength={2000} rows={3} disabled={busy} placeholder="Explain why this record is being reversed." /></label><p className={styles.muted}>{mode === 'void_invoice' ? 'This removes the invoice from the active balance. It does not cancel an invoice in your accounting system.' : 'This removes the receipt from the active balance. It does not refund or transfer funds.'} The original record stays in history.</p></>}
    {error && <p className={styles.formError} role="alert">{error}</p>}
    <div className={styles.formFooter}><div>{review && <span className={styles.total}>Fee after review<strong>{money(preview)}</strong></span>}</div><div className={styles.toolbarControls}><button type="button" className={shared.secondaryButton} disabled={busy} onClick={onCancel}>Cancel</button><button type="submit" className={shared.primaryButton} disabled={busy || (review && (preview === null || preview < 0))}>{busy && <Loader2 size={13} className={styles.spin} />}{({ review: 'Save review', correct_review: 'Save correction', invoice: 'Record invoice', receipt: 'Record payment', void_invoice: 'Void invoice record', reverse_receipt: 'Reverse payment record' })[mode]}</button></div></div>
  </form>;
}
