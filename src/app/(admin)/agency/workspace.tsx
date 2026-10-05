'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Dialog } from 'radix-ui';
import { ArrowUpRight, Building2, CalendarDays, Check, CircleAlert, Clock3, FileCheck2, Loader2, Pencil, Plus, RefreshCw, Save, Users, X } from 'lucide-react';
import { ChoiceMenu } from '@/components/ui/choice-menu';
import { SearchInput } from '@/components/ui/search-input';
import { DateField } from '@/components/ui/date-field';
import { Input, Textarea } from '@/components/ui/input';
import { calculateServiceRevenue, selectMonthTerms, summarizeClientRetention, summarizeTenureGrowth, type AgencyTerms, type ClientRecord } from '@/lib/agency/model';
import styles from './agency.module.css';

export type AgencyView = 'overview' | 'clients' | 'revenue';
export interface AgencyBrand { id: string; slug: string; name: string; logoUrl: string | null; archived: boolean }
export interface AgencyBusinessResponse {
  month: string;
  periodStart: string;
  periodEnd: string;
  priorPeriodStart: string;
  priorPeriodEnd: string;
  clients: ClientRecord[];
  brands: AgencyBrand[];
  performance: Array<{ brandId: string; managedGmv: number | null; priorManagedGmv: number | null; complete: boolean; priorComplete: boolean; recordedThrough?: string | null }>;
  performanceWarning?: string | null;
  storageReady: boolean;
  canEdit: boolean;
}

const FEE_MODELS: Array<{ value: AgencyTerms['feeModel']; label: string; description: string }> = [
  { value: 'fixed', label: 'Fixed agency fee', description: 'Monthly agency fee only' },
  { value: 'share', label: 'Revenue share', description: 'Managed GMV × revenue share' },
  { value: 'additive', label: 'Fee + revenue share', description: 'Monthly agency fee plus revenue share' },
  { value: 'minimum', label: 'Minimum guarantee', description: 'Higher of monthly agency fee or revenue share' },
];
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const compactMoney = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 });
const headlineMoney = (amount: number) => Math.abs(amount) >= 10000000 ? compactMoney.format(amount) : money.format(amount);
const preciseMoney = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
const number = new Intl.NumberFormat('en-US');
const monthName = (month: string, short = false) => new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).toLocaleDateString('en-US', { month: short ? 'short' : 'long', year: 'numeric' });
const dateName = (date: string | null) => date ? new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set';
function shiftMonth(month: string, offset: number) { const date = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + offset, 1); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; }
function currentMonth() { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit' }).formatToParts(new Date()); return `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}`; }
function periodOptions(month: string) { const latest = currentMonth(); return Array.from(new Set([month, ...Array.from({ length: 12 }, (_, i) => shiftMonth(latest, -i - 1))])).sort().reverse().map(value => ({ value, label: monthName(value) })); }
function tenureMonths(start: string, month: string) { return (Number(month.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(month.slice(5, 7)) - Number(start.slice(5, 7)) + 1; }
function clientActive(client: ClientRecord, data: AgencyBusinessResponse) { return Boolean(client.serviceStart && client.serviceStart <= data.periodEnd && (!client.serviceEnd || client.serviceEnd >= data.periodStart)); }
function lifecycleLabel(client: ClientRecord, data: AgencyBusinessResponse) { if (!client.serviceStart) return 'Needs setup'; if (client.serviceStart > data.periodEnd) return 'Upcoming'; if (client.serviceEnd && client.serviceEnd < data.periodStart) return 'Exited'; return 'Active'; }
function termsLabel(terms: AgencyTerms | null) { if (!terms) return 'Terms not set'; if (terms.feeModel === 'fixed') return `${money.format(terms.monthlyRetainer)} / month`; if (terms.feeModel === 'share') return `${terms.revSharePercent}% of managed GMV`; if (terms.feeModel === 'minimum') return `${money.format(terms.monthlyRetainer)} minimum · ${terms.revSharePercent}%`; return `${money.format(terms.monthlyRetainer)} + ${terms.revSharePercent}%`; }
const statusLabel = { calculated: 'Ready', needs_setup: 'Needs terms', needs_lifecycle: 'Needs service dates', outside_service: 'Outside service', review_required: 'Review needed', missing_gmv: 'Awaiting complete GMV' };

function deriveRows(data: AgencyBusinessResponse) {
  return data.clients.map(client => {
    const brands = client.brandIds.map(id => data.brands.find(brand => brand.id === id)).filter((brand): brand is AgencyBrand => Boolean(brand));
    const performance = client.brandIds.map(id => data.performance.find(row => row.brandId === id));
    const complete = performance.length > 0 && performance.every(row => row?.complete && row.managedGmv !== null);
    const priorComplete = performance.length > 0 && performance.every(row => row?.priorComplete && row.priorManagedGmv !== null);
    const observed = performance.length > 0 && performance.every(row => row?.managedGmv !== null && row?.managedGmv !== undefined);
    const recordedGmv = observed ? performance.reduce((sum, row) => sum + (row?.managedGmv ?? 0), 0) : null;
    const recordedThrough = performance.map(row => row?.recordedThrough).filter((value): value is string => Boolean(value)).sort()[0] ?? null;
    const gmv = complete ? recordedGmv : null;
    const priorGmv = priorComplete ? performance.reduce((sum, row) => sum + (row?.priorManagedGmv ?? 0), 0) : null;
    const revenue = calculateServiceRevenue({ client, month: data.month, periodStart: data.periodStart, periodEnd: data.periodEnd, gmvCents: gmv === null ? null : Math.round(gmv * 100), gmvComplete: complete });
    return { client, brands, gmv, recordedGmv, recordedThrough, priorGmv, revenue, lifecycle: lifecycleLabel(client, data) };
  });
}
type ClientRow = ReturnType<typeof deriveRows>[number];

export function AgencyWorkspace({ view, initialMonth }: { view: AgencyView; initialMonth?: string }) {
  const [month, setMonth] = useState(initialMonth && initialMonth < currentMonth() ? initialMonth : shiftMonth(currentMonth(), -1));
  const [data, setData] = useState<AgencyBusinessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<{ client: ClientRecord | null; brandId?: string; returnFocus: HTMLElement | null; contextEpoch: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const contextEpoch = useRef(0);
  useEffect(() => {
    const reset = () => {
      contextEpoch.current += 1;
      activeRequest.current?.abort();
      setData(null);
      setNotice(null);
      setEditing(null);
      setError(null);
      setLoading(true);
      setReload(value => value + 1);
    };
    window.addEventListener('workspace-context-changed', reset);
    return () => window.removeEventListener('workspace-context-changed', reset);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    activeRequest.current = controller;
    fetch(`/api/agency/business?month=${encodeURIComponent(month)}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => { const payload = await response.json().catch(() => null); if (!response.ok) throw new Error(payload?.error || 'Unable to load agency workspace.'); return payload as AgencyBusinessResponse; })
      .then(payload => { if (!controller.signal.aborted) { setData(payload); setError(null); setLoading(false); } })
      .catch(cause => { if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : 'Unable to load agency workspace.'); setLoading(false); } });
    return () => { controller.abort(); if (activeRequest.current === controller) activeRequest.current = null; };
  }, [month, reload]);
  const refresh = useCallback(() => { setLoading(true); setError(null); setReload(value => value + 1); }, []);
  const openEditor = (client: ClientRecord | null, brandId?: string) => { setEditing({ client, brandId, returnFocus: document.activeElement as HTMLElement, contextEpoch: contextEpoch.current }); };
  const displayedData = data?.month === month ? data : null;
  return <>
    {displayedData ? <AgencyWorkspaceView view={view} data={displayedData} month={month} onMonthChange={value => { setMonth(value); setLoading(true); setError(null); setNotice(null); }} onEdit={client => openEditor(client)} onAdd={brandId => openEditor(null, brandId)} loading={loading} notice={notice} /> : <div className={styles.workspace}>
      <WorkspaceHeading view={view} month={month} onMonthChange={value => { setMonth(value); setLoading(true); setError(null); }} />
      {loading && <div className={styles.loading} role="status"><Loader2 size={22} className={styles.spin} /><span>Loading agency workspace</span></div>}
    </div>}
    {error && <div className={`${styles.workspace} ${styles.errorBanner}`} role="alert"><CircleAlert size={16} /><span>{error}</span><button type="button" className={styles.textButton} onClick={refresh}><RefreshCw size={14} />Try again</button></div>}
    {editing && displayedData && <ClientEditor client={editing.client} defaultBrandId={editing.brandId} data={displayedData} month={month} returnFocus={editing.returnFocus} onClose={() => setEditing(null)} onSaved={saved => { if (editing.contextEpoch !== contextEpoch.current) return; setData(previous => previous ? { ...previous, clients: [...previous.clients.filter(client => client.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)) } : previous); setNotice(`${saved.name} saved.`); setEditing(null); refresh(); }} />}
  </>;
}

function WorkspaceHeading({ view, month, onMonthChange, onAdd, busy = false }: { view: AgencyView; month: string; onMonthChange: (month: string) => void; onAdd?: () => void; busy?: boolean }) {
  const copy = { overview: ['Agency overview', 'The business behind your brands.'], clients: ['Clients', 'Service history and agency agreements.'], revenue: ['Revenue', 'Contracted agency fees and managed GMV revenue share.'] }[view];
  return <header className={styles.pageHeader}><div><div className={styles.eyebrow}>AGENCY WORKSPACE</div><h1>{copy[0]}</h1><p>{copy[1]}</p></div><div className={styles.headerActions}><ChoiceMenu compact label="Reporting month" value={month} options={periodOptions(month)} onChange={onMonthChange} disabled={busy} />{onAdd && <button type="button" className={styles.primaryButton} onClick={onAdd}><Plus size={15} />Add client</button>}</div></header>;
}

export function AgencyWorkspaceView({ view, data, month, onMonthChange, onEdit, onAdd, loading = false, notice }: {
  view: AgencyView; data: AgencyBusinessResponse; month: string; onMonthChange: (month: string) => void; onEdit: (client: ClientRecord) => void; onAdd: (brandId?: string) => void; loading?: boolean; notice?: string | null;
}) {
  const rows = useMemo(() => deriveRows(data), [data]);
  const retention = useMemo(() => summarizeClientRetention(data.clients, month), [data.clients, month]);
  const [search, setSearch] = useState('');
  const active = rows.filter(row => clientActive(row.client, data));
  const relevant = rows.filter(row => row.revenue.status !== 'outside_service');
  const calculated = relevant.filter(row => row.revenue.status === 'calculated');
  const subtotal = calculated.reduce((sum, row) => sum + (row.revenue.revenueCents ?? 0), 0);
  const ready = relevant.length > 0 && relevant.length === calculated.length;
  const setup = rows.filter(row => !row.client.serviceStart || !selectMonthTerms(row.client.terms, month));
  const assigned = new Set(data.clients.flatMap(client => client.brandIds));
  const unassigned = data.brands.filter(brand => !brand.archived && !assigned.has(brand.id));
  const allGmvReady = active.length > 0 && active.every(row => row.gmv !== null);
  const totalGmv = allGmvReady ? active.reduce((sum, row) => sum + (row.gmv ?? 0), 0) : null;
  const visibleRows = rows.filter(row => `${row.client.name} ${row.brands.map(brand => brand.name).join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  return <div className={styles.workspace} aria-busy={loading}>
    <WorkspaceHeading view={view} month={month} onMonthChange={onMonthChange} onAdd={data.canEdit && data.storageReady ? () => onAdd() : undefined} />
    {notice && <div className={styles.savedNotice} role="status"><Check size={15} />{notice}</div>}
    {data.performanceWarning && <div className={styles.infoBanner}><CircleAlert size={17} /><span>{data.performanceWarning}</span></div>}
    {!data.storageReady && <div className={styles.infoBanner}><CircleAlert size={17} /><span>Client agreements are not available yet. Agency revenue and retention will appear once client records can be saved.</span></div>}
    {!data.clients.length ? <EmptyClients canAdd={data.canEdit && data.storageReady} onAdd={() => onAdd()} /> : <>
      <section className={styles.metricRail} aria-label="Agency metrics">
        <Metric label="Calculated service fees" value={ready ? headlineMoney(subtotal / 100) : 'Pending'} detail={ready ? `${calculated.length} saved ${calculated.length === 1 ? 'client' : 'clients'} · ${monthName(month, true)}` : calculated.length ? `${money.format(subtotal / 100)} · ${calculated.length} saved clients · ${relevant.length - calculated.length} pending` : 'Complete agreements and coverage needed'} accent />
        <Metric label="Active clients" value={number.format(active.length)} detail={retention.missingLifecycle ? `${retention.missingLifecycle} missing service dates` : 'In service during this month'} />
        <Metric label="Client retention" value={!retention.missingLifecycle && retention.retentionRate !== null ? `${(retention.retentionRate * 100).toFixed(0)}%` : 'Pending'} detail={retention.missingLifecycle ? 'Add service dates to complete retention' : retention.opening ? `${retention.retained} retained of ${retention.opening} opening` : 'No opening client cohort'} />
        <Metric label="Managed GMV" value={totalGmv === null ? 'Pending' : headlineMoney(totalGmv)} detail={allGmvReady ? 'Linked brands · active clients' : 'Complete linked-brand coverage needed'} />
      </section>
      {view === 'overview' && <>
        <div className={styles.overviewGrid}>
          <section className={styles.panel}><PanelHeader title="Client lifecycle" description="Verified service dates define the client relationship." icon={<Users size={17} />} /><div className={styles.lifecycleStats}><SmallStat label="Opening clients" value={retention.opening} /><SmallStat label="New this month" value={retention.newClients} /><SmallStat label="Exited this month" value={retention.exitedClients} /><SmallStat label="Retained" value={retention.retained} /></div><div className={styles.churnNote}><span>Opening-cohort churn</span><strong>{!retention.missingLifecycle && retention.churnRate !== null ? `${(retention.churnRate * 100).toFixed(0)}%` : 'Pending'}</strong><span>{retention.missingLifecycle ? 'Service dates needed' : `${retention.churned} exits / ${retention.opening} opening clients`}</span></div><TenureDistribution rows={active} month={month} missing={retention.missingLifecycle} /></section>
          <section className={styles.panel}><PanelHeader title="Month readiness" description="A clear view of what is ready to review." icon={<FileCheck2 size={17} />} /><div className={styles.readiness}><ReadinessRow label="Revenue ready" value={`${calculated.length} / ${relevant.length}`} description="Clients with supported terms and complete inputs" positive={ready} /><ReadinessRow label="Client setup" value={setup.length ? `${setup.length} to complete` : 'Up to date'} description="Service start and effective agency terms" positive={!setup.length} /><ReadinessRow label="Unlinked brands" value={String(unassigned.length)} description="Available to link to a client agreement" positive={!unassigned.length} /></div><Link className={styles.panelLink} href="/agency/revenue">Review revenue<ArrowUpRight size={15} /></Link></section>
        </div>
        <section className={styles.panel}><PanelHeader title="Client performance by tenure" description="Complete managed GMV for the selected month and the previous month. Groups reflect service tenure this month." icon={<Clock3 size={17} />} /><CohortPerformance rows={active} month={month} data={data} /></section>
      </>}
      {(view === 'clients' || view === 'revenue') && <section className={styles.panel}>
        <div className={styles.tableToolbar}><div><h2>{view === 'clients' ? 'Client directory' : 'Agency revenue ledger'}<span className={styles.count}>{rows.length}</span></h2><p>{view === 'clients' ? 'Every saved client, including exited relationships.' : 'Service revenue follows the agreement in effect for this month.'}</p></div><SearchInput aria-label="Search clients" placeholder="Search clients" value={search} onChange={event => setSearch(event.target.value)} onClear={() => setSearch('')} /></div>
        {visibleRows.length ? <ClientTable rows={visibleRows} data={data} view={view} onEdit={onEdit} /> : <div className={styles.noMatches}>No clients match “{search}”.<button type="button" className={styles.textButton} onClick={() => setSearch('')}>Clear search</button></div>}
        {view === 'revenue' && <div className={styles.tableNote}><CircleAlert size={14} /><span>Calculated service revenue is not invoiced or collected cash. Manager payees and creator retainers are excluded. Partial service months and refund adjustments require review. Historical views use the current client-to-brand links and saved terms; they are not frozen invoices.</span></div>}
      </section>}
    </>}
    {!!unassigned.length && (view === 'clients' || !data.clients.length) && <section className={styles.unassigned}><div><h2>Brands without a client agreement<span className={styles.count}>{unassigned.length}</span></h2><p>Link these brands when you set up a client. They are not included in client or retention counts.</p></div><div className={styles.unassignedList}>{unassigned.map(brand => <div className={styles.unassignedBrand} key={brand.id}><BrandIdentity brand={brand} /><span className={styles.status}>Needs setup</span>{data.canEdit && data.storageReady && <button type="button" className={styles.iconButton} aria-label={`Set up ${brand.name}`} onClick={() => onAdd(brand.id)}><Plus size={16} /></button>}</div>)}</div></section>}
    <p className={styles.scopeNote}><Building2 size={14} />Completed months only. Agency agreements are separate from individual team earnings and creator payouts.</p>
  </div>;
}

function EmptyClients({ canAdd, onAdd }: { canAdd: boolean; onAdd: () => void }) { return <section className={styles.empty}><span className={styles.emptyIcon}><Building2 size={26} strokeWidth={1.5} /></span><h2>Build your client picture</h2><p>Add your first client, link their brands, and enter the actual service start and agency terms. Revenue and retention will use those saved records.</p>{canAdd && <button type="button" className={styles.primaryButton} onClick={onAdd}><Plus size={15} />Add your first client</button>}</section>; }
function Metric({ label, value, detail, accent }: { label: string; value: string; detail: string; accent?: boolean }) { return <div className={`${styles.metric} ${accent ? styles.metricAccent : ''}`}><span className={styles.metricLabel}>{label}</span><strong>{value}</strong><span className={styles.metricDetail}>{detail}</span></div>; }
function SmallStat({ label, value }: { label: string; value: number }) { return <div><strong>{number.format(value)}</strong><span>{label}</span></div>; }
function PanelHeader({ title, description, icon }: { title: string; description: string; icon: ReactNode }) { return <div className={styles.panelHeader}><div><h2>{title}</h2><p>{description}</p></div><span className={styles.panelIcon}>{icon}</span></div>; }
function ReadinessRow({ label, value, description, positive }: { label: string; value: string; description: string; positive: boolean }) { return <div className={styles.readinessRow}><span className={positive ? styles.readyIcon : styles.pendingIcon}>{positive ? <Check size={15} /> : <Clock3 size={15} />}</span><div><span>{label}</span><p>{description}</p></div><strong>{value}</strong></div>; }
const TENURE_GROUPS = [{ label: 'First 3 months', min: 1, max: 3 }, { label: 'Months 4–6', min: 4, max: 6 }, { label: 'Months 7–12', min: 7, max: 12 }, { label: 'Over 12 months', min: 13, max: Infinity }];
function TenureDistribution({ rows, month, missing }: { rows: ClientRow[]; month: string; missing: number }) { return <div className={styles.tenure}><div className={styles.sectionCaption}>ACTIVE CLIENT TENURE</div>{TENURE_GROUPS.map(group => { const count = rows.filter(row => row.client.serviceStart && tenureMonths(row.client.serviceStart, month) >= group.min && tenureMonths(row.client.serviceStart, month) <= group.max).length; return <div className={styles.tenureRow} key={group.label}><span>{group.label}</span><div className={styles.barTrack}><span style={{ width: `${rows.length ? count / rows.length * 100 : 0}%` }} /></div><strong>{count}</strong></div>; })}{missing > 0 && <p className={styles.missingNote}>{missing} {missing === 1 ? 'client needs a service start date' : 'clients need service start dates'} to join a tenure group.</p>}</div>; }
function CohortPerformance({ rows, month, data }: { rows: ClientRow[]; month: string; data: AgencyBusinessResponse }) {
  const summary = summarizeTenureGrowth(data.clients, month, Object.fromEntries(rows.map(row => [row.client.id, { currentGmvCents: row.gmv === null ? null : Math.round(row.gmv * 100), priorGmvCents: row.priorGmv === null ? null : Math.round(row.priorGmv * 100), currentComplete: row.gmv !== null, priorComplete: row.priorGmv !== null }])));
  return <div className={styles.tableScroll}><table className={styles.cohortTable}><thead><tr><th scope="col">Service tenure</th><th scope="col">Clients</th><th scope="col">Comparable GMV</th><th scope="col">Month-over-month change</th></tr></thead><tbody>{summary.cohorts.map(group => <tr key={group.key}><th scope="row">{group.label}</th><td>{group.clientCount}</td><td>{group.currentGmvCents !== null ? money.format(group.currentGmvCents / 100) : <span className={styles.muted}>{group.missingDataCount ? 'Incomplete coverage' : group.reviewCount ? 'Review needed' : group.clientCount ? 'Not comparable' : 'No clients'}</span>}</td><td>{group.growthRate !== null ? <span className={group.growthRate >= 0 ? styles.positive : styles.negative}>{group.growthRate > 0 ? '+' : ''}{(group.growthRate * 100).toFixed(1)}%</span> : <span className={styles.muted}>Not comparable</span>}{group.currentGmvCents !== null && group.priorGmvCents !== null && <span className={styles.cellSub}>{group.currentGmvCents > group.priorGmvCents ? '+' : ''}{money.format((group.currentGmvCents - group.priorGmvCents) / 100)} vs prior month</span>}{group.clientCount > 0 && <span className={styles.cellSub}>{group.comparableCount} comparable{group.nonComparableCount ? ` · ${group.nonComparableCount} outside full service periods` : ''}{group.missingDataCount ? ` · ${group.missingDataCount} missing coverage` : ''}{group.reviewCount ? ` · ${group.reviewCount} to review` : ''}</span>}</td></tr>)}</tbody></table><div className={styles.tableNote}>Compares the same clients in full service across both months. Missing eligible data holds the group total. Change is weighted by managed GMV and does not establish the effect of tenure.</div></div>;
}function BrandIdentity({ brand }: { brand: AgencyBrand }) { return <Link className={styles.brandIdentity} href={`/dashboard?brand=${encodeURIComponent(brand.slug)}`}><span className={styles.avatar}>{brand.logoUrl ? <BrandPortrait src={brand.logoUrl} name={brand.name} /> : <Building2 size={15} />}</span><span>{brand.name}</span></Link>; }
function BrandPortrait({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Building2 size={15} />;
  // Authorized brand logos retain their original URL without a separate image proxy.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" aria-label={`${name} logo`} loading="lazy" onError={() => setFailed(true)} />;
}
function ClientIdentity({ row }: { row: ClientRow }) { return <div className={styles.clientIdentity}><strong>{row.client.name}</strong><div className={styles.linkedBrands}>{row.brands.length ? row.brands.map(brand => <BrandIdentity key={brand.id} brand={brand} />) : <span className={styles.muted}>No linked brands</span>}</div></div>; }
function ClientTable({ rows, data, view, onEdit }: { rows: ClientRow[]; data: AgencyBusinessResponse; view: 'clients' | 'revenue'; onEdit: (client: ClientRecord) => void }) { return <div className={styles.tableScroll}><table className={styles.clientTable}><thead><tr><th scope="col">Client / linked brands</th>{view === 'clients' ? <><th scope="col">Relationship</th><th scope="col">Service start</th><th scope="col">Agency terms</th></> : <><th scope="col">Agency agreement</th><th scope="col">Managed GMV</th><th scope="col">Service revenue</th></>}<th scope="col">{view === 'clients' ? 'Setup' : 'Readiness'}</th>{data.canEdit && <th scope="col"><span className={styles.srOnly}>Actions</span></th>}</tr></thead><tbody>{rows.map(row => <tr key={row.client.id}><td><ClientIdentity row={row} /></td>{view === 'clients' ? <><td><span className={`${styles.status} ${row.lifecycle === 'Active' ? styles.statusActive : ''}`}>{row.lifecycle}</span>{row.client.serviceEnd && <span className={styles.cellSub}>End {dateName(row.client.serviceEnd)}</span>}</td><td>{dateName(row.client.serviceStart)}{row.client.serviceStart && row.lifecycle === 'Active' && <span className={styles.cellSub}>Service month {tenureMonths(row.client.serviceStart, data.month)}</span>}</td><td>{termsLabel(selectMonthTerms(row.client.terms, data.month))}</td></> : <><td>{termsLabel(row.revenue.terms)}{row.revenue.terms && <span className={styles.cellSub}>From {monthName(row.revenue.terms.effectiveMonth, true)}</span>}</td><td className={styles.numeric}>{row.recordedGmv === null ? <span className={styles.muted}>Unavailable</span> : preciseMoney.format(row.recordedGmv)}{row.gmv === null && row.recordedGmv !== null && <span className={styles.cellSub}>Partial coverage{row.recordedThrough ? ` · through ${dateName(row.recordedThrough)}` : ''}</span>}</td><td className={`${styles.numeric} ${styles.revenueValue}`}>{row.revenue.revenueCents === null ? <span className={styles.muted}>Pending</span> : preciseMoney.format(row.revenue.revenueCents / 100)}</td></>}<td><span className={`${styles.status} ${row.revenue.status === 'calculated' ? styles.statusReady : ''}`}>{view === 'clients' ? (!row.client.serviceStart || !selectMonthTerms(row.client.terms, data.month) ? 'Needs setup' : 'Configured') : statusLabel[row.revenue.status]}</span></td>{data.canEdit && <td><button type="button" className={styles.iconButton} onClick={() => onEdit(row.client)} aria-label={`Edit ${row.client.name}`}><Pencil size={15} /></button></td>}</tr>)}</tbody></table></div>; }

type Draft = Pick<ClientRecord, 'name' | 'brandIds' | 'serviceStart' | 'serviceEnd' | 'exitReason' | 'terms'>;
function draftFor(client: ClientRecord | null, month: string, brand?: AgencyBrand): Draft { return client ? { name: client.name, brandIds: [...client.brandIds], serviceStart: client.serviceStart, serviceEnd: client.serviceEnd, exitReason: client.exitReason, terms: client.terms.map(term => ({ ...term })) } : { name: brand?.name ?? '', brandIds: brand ? [brand.id] : [], serviceStart: null, serviceEnd: null, exitReason: null, terms: [{ effectiveMonth: month, monthlyRetainer: 0, revSharePercent: 0, feeModel: 'fixed' }] }; }
export function ClientEditor({ client, defaultBrandId, data, month, returnFocus, onClose, onSaved }: { client: ClientRecord | null; defaultBrandId?: string; data: AgencyBusinessResponse; month: string; returnFocus: HTMLElement | null; onClose: () => void; onSaved: (client: ClientRecord) => void }) {
  const [draft, setDraft] = useState<Draft>(() => draftFor(client, month, data.brands.find(brand => brand.id === defaultBrandId)));
  const [baseline, setBaseline] = useState<Draft>(() => draftFor(client, month, data.brands.find(brand => brand.id === defaultBrandId)));
  const [revision, setRevision] = useState(client?.revision ?? 0);
  const [termMonth, setTermMonth] = useState(selectMonthTerms(client?.terms ?? [], month)?.effectiveMonth ?? client?.terms.at(-1)?.effectiveMonth ?? month);
  const [newTermMonth, setNewTermMonth] = useState(month);
  const [addingTerm, setAddingTerm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closeNotice, setCloseNotice] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<ClientRecord | null>(null);
  const [loadingLatest, setLoadingLatest] = useState(false);
  const [brandSearch, setBrandSearch] = useState('');
  const [customName, setCustomName] = useState(Boolean(client));
  const toggleBrand = (brand: AgencyBrand, checked: boolean) => {
    setDraft(previous => {
      const brandIds = checked ? [...previous.brandIds, brand.id] : previous.brandIds.filter(id => id !== brand.id);
      return { ...previous, brandIds, name: customName ? previous.name : data.brands.find(value => value.id === brandIds[0])?.name ?? '' };
    });
    setCloseNotice(false);
  };
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const term = draft.terms.find(value => value.effectiveMonth === termMonth);
  const nextTerm = [...draft.terms].sort((a, b) => a.effectiveMonth.localeCompare(b.effectiveMonth)).find(value => value.effectiveMonth > termMonth);
  const assignedElsewhere = new Set(data.clients.filter(value => value.id !== client?.id).flatMap(value => value.brandIds));
  const visibleBrands = data.brands.filter(brand => (draft.brandIds.includes(brand.id) || !brand.archived) && brand.name.toLowerCase().includes(brandSearch.toLowerCase())).sort((a, b) => Number(draft.brandIds.includes(b.id)) - Number(draft.brandIds.includes(a.id)) || a.name.localeCompare(b.name));
  const setField = <K extends keyof Draft>(key: K, value: Draft[K]) => { setDraft(previous => ({ ...previous, [key]: value })); setCloseNotice(false); };
  const updateTerm = (patch: Partial<AgencyTerms>) => setField('terms', draft.terms.map(value => value.effectiveMonth === termMonth ? { ...value, ...patch } : value));
  const requestClose = () => { if (saving) return; if (dirty) setCloseNotice(true); else onClose(); };
  const loadLatest = async () => {
    setLoadingLatest(true);
    try { const response = await fetch(`/api/agency/business?month=${encodeURIComponent(month)}`, { cache: 'no-store' }); const payload = await response.json().catch(() => null); if (!response.ok) throw new Error(payload?.error || 'Unable to load the latest client.'); const record = (payload as AgencyBusinessResponse).clients.find(value => value.id === client?.id); if (!record) throw new Error('This client is no longer available. Your draft has been preserved.'); setLatest(record); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load the latest client.'); } finally { setLoadingLatest(false); }
  };
  const rebase = () => {
    if (!latest) return;
    const next = draftFor(latest, month);
    for (const field of ['name', 'brandIds', 'serviceStart', 'serviceEnd', 'exitReason'] as const) { if (JSON.stringify(draft[field]) !== JSON.stringify(baseline[field])) Object.assign(next, { [field]: draft[field] }); }
    const terms = new Map(next.terms.map(value => [value.effectiveMonth, value]));
    draft.terms.forEach(value => { if (JSON.stringify(value) !== JSON.stringify(baseline.terms.find(previous => previous.effectiveMonth === value.effectiveMonth))) terms.set(value.effectiveMonth, value); });
    next.terms = [...terms.values()].sort((a, b) => a.effectiveMonth.localeCompare(b.effectiveMonth));
    setBaseline(draftFor(latest, month)); setRevision(latest.revision); setDraft(next); setConflict(false); setLatest(null); setError('Your edits are applied to the latest saved version. Review the fields, then save.');
  };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (saving || conflict) return; setSaving(true); setError(null);
    try { const response = await fetch('/api/agency/business', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(client ? { id: client.id } : {}), expectedRevision: revision, ...draft, name: draft.name.trim(), exitReason: draft.exitReason?.trim() || null, terms: [...draft.terms].sort((a, b) => a.effectiveMonth.localeCompare(b.effectiveMonth)) }) }); const payload = await response.json().catch(() => null); if (response.status === 409) { setConflict(true); setError('This client changed while you were editing. Your draft is preserved. Load the latest saved details to review the changes.'); return; } if (!response.ok) throw new Error(payload?.error || 'Unable to save this client. Your draft is preserved; please try again.'); const saved = payload?.client ?? payload; if (!saved?.id || !Number.isInteger(saved.revision)) throw new Error('The saved client could not be verified. Your draft is preserved; reload the latest details before retrying.'); onSaved(saved as ClientRecord); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save this client. Your draft is preserved.'); } finally { setSaving(false); }
  };
  return <Dialog.Root open onOpenChange={open => { if (!open) requestClose(); }}><Dialog.Portal><Dialog.Overlay className={styles.overlay} /><Dialog.Content className={styles.editor} onCloseAutoFocus={event => { event.preventDefault(); returnFocus?.focus(); }} data-lenis-prevent>
    <header className={styles.editorHeader}><div><div className={styles.eyebrow}>CLIENT AGREEMENT</div><Dialog.Title>{client ? 'Edit client' : 'Add client'}</Dialog.Title><Dialog.Description>Keep agency terms and service history together.</Dialog.Description></div><button type="button" className={styles.iconButton} disabled={saving} onClick={requestClose} aria-label="Close client editor"><X size={19} /></button></header>
    <form onSubmit={save} className={styles.editorForm}>
      <div className={styles.editorBody}>

        {error && <div className={styles.editorNotice} role="alert"><p>{error}</p>{conflict && <button type="button" className={styles.textButton} disabled={loadingLatest} onClick={loadLatest}>{loadingLatest ? <Loader2 size={14} className={styles.spin} /> : <RefreshCw size={14} />}Load latest saved details</button>}</div>}
        {latest && <section className={styles.latestVersion}><h3>Latest saved details</h3><p><strong>{latest.name}</strong> · {latest.brandIds.map(id => data.brands.find(brand => brand.id === id)?.name ?? 'Linked brand').join(', ') || 'No linked brands'}</p><p>{dateName(latest.serviceStart)} to {latest.serviceEnd ? dateName(latest.serviceEnd) : 'Ongoing'}{latest.exitReason ? ` · ${latest.exitReason}` : ''}</p>{latest.terms.map(value => <p key={value.effectiveMonth}>{monthName(value.effectiveMonth, true)}: {termsLabel(value)}</p>)}<button type="button" className={styles.secondaryButton} onClick={rebase}>Apply my edits to this version</button><small>Unchanged fields and newly saved term periods will be kept.</small></section>}
        <section className={styles.editorSection}><h3>Choose the brand</h3><p className={styles.help}>A client is the company paying your agency. Choose its brand below and we will fill in the name. Link multiple brands only when they share one agency agreement.</p><div className={styles.field}><span id="agency-linked-brands">Linked brands</span><p>Managed GMV is combined across these brands. A brand can belong to one client.</p><SearchInput aria-label="Find a brand to link" placeholder="Find a brand" value={brandSearch} onChange={event => setBrandSearch(event.target.value)} onClear={() => setBrandSearch('')} /><div className={styles.brandPicker} role="group" aria-labelledby="agency-linked-brands">{visibleBrands.map(brand => { const disabled = saving || assignedElsewhere.has(brand.id); return <label className={styles.brandOption} key={brand.id}><input type="checkbox" checked={draft.brandIds.includes(brand.id)} disabled={disabled} onChange={event => toggleBrand(brand, event.target.checked)} /><span className={styles.avatar}>{brand.logoUrl ? <BrandPortrait src={brand.logoUrl} name={brand.name} /> : <Building2 size={15} />}</span><span>{brand.name}<small>{assignedElsewhere.has(brand.id) ? 'Linked to another client' : brand.archived ? 'Archived brand' : ''}</small></span></label>; })}{!visibleBrands.length && <p className={styles.brandEmpty}>No brands match this search.</p>}</div></div><label className={styles.field}><span>Client name</span><Input required maxLength={160} value={draft.name} onChange={event => { setCustomName(true); setField('name', event.target.value); }} placeholder="Choose a brand above or enter a company name" disabled={saving} /><p>Use a parent company name if needed. This does not rename the brand in Tempo.</p></label></section>
        <section className={styles.editorSection}><h3>Service history</h3><p className={styles.help}>Use the actual dates the client relationship began and ended. Missing dates remain unknown in retention and revenue.</p><div className={styles.fieldPair}><label className={styles.field}><span>Service start <small>Optional</small></span><DateField value={draft.serviceStart ?? ''} onValueChange={value => setField('serviceStart', value || null)} max={draft.serviceEnd ?? undefined} aria-label="Service start" disabled={saving} /></label><label className={styles.field}><span>Service end <small>Optional</small></span><DateField value={draft.serviceEnd ?? ''} onValueChange={value => { setDraft(previous => ({ ...previous, serviceEnd: value || null, exitReason: value ? previous.exitReason : null })); setCloseNotice(false); }} min={draft.serviceStart ?? undefined} aria-label="Service end" disabled={saving} /></label></div>{draft.serviceEnd && <label className={styles.field}><span>Exit reason</span><Textarea required value={draft.exitReason ?? ''} maxLength={1000} onChange={event => setField('exitReason', event.target.value || null)} placeholder="Why did the client relationship end?" disabled={saving} /></label>}</section>
        <section className={styles.editorSection}><div className={styles.sectionHeading}><h3>Agency terms</h3><button type="button" className={styles.textButton} disabled={saving} onClick={() => { setAddingTerm(value => !value); setNewTermMonth(draft.terms.some(value => value.effectiveMonth === month) ? shiftMonth(month, 1) : month); }}><Plus size={14} />Add terms period</button></div><p className={styles.help}>The monthly fee starts at $0. Enter only the agency fee and agency revenue share; creator retainers and individual payee arrangements are separate.</p>
          {draft.terms.length > 0 && <ChoiceMenu label="Effective terms period" value={termMonth} options={[...draft.terms].sort((a, b) => b.effectiveMonth.localeCompare(a.effectiveMonth)).map(value => ({ value: value.effectiveMonth, label: `From ${monthName(value.effectiveMonth)}` }))} onChange={value => { if (draft.terms.some(period => period.effectiveMonth === value)) setTermMonth(value); }} disabled={saving} />}
          {addingTerm && <div className={styles.addTerm}><div className={styles.field}><span>New terms effective from</span><div className={styles.monthControls}><ChoiceMenu compact label="Terms effective month" value={newTermMonth.slice(5)} options={Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1).padStart(2, '0'), label: new Date(2000, index, 1).toLocaleDateString('en-US', { month: 'short' }) }))} onChange={value => { if (/^(0[1-9]|1[0-2])$/.test(value)) setNewTermMonth(`${newTermMonth.slice(0, 4)}-${value}`); }} disabled={saving} /><ChoiceMenu compact label="Terms effective year" value={newTermMonth.slice(0, 4)} options={Array.from({ length: 101 }, (_, index) => ({ value: String(2000 + index), label: String(2000 + index) }))} onChange={value => { if (/^20\d{2}$|^2100$/.test(value)) setNewTermMonth(`${value}-${newTermMonth.slice(5)}`); }} disabled={saving} /></div></div><button type="button" className={styles.secondaryButton} disabled={!/^\d{4}-\d{2}$/.test(newTermMonth) || draft.terms.some(value => value.effectiveMonth === newTermMonth)} onClick={() => { setField('terms', [...draft.terms, { ...(term ?? { monthlyRetainer: 0, revSharePercent: 0, feeModel: 'fixed' as const }), effectiveMonth: newTermMonth }]); setTermMonth(newTermMonth); setAddingTerm(false); }}>Add period</button><p>Earlier terms are preserved. The selected agreement is copied into the new period for you to update.</p></div>}
          {term ? <div className={styles.termFields}><div className={styles.termRange}><CalendarDays size={14} /><span>Applies from {monthName(term.effectiveMonth)} {nextTerm ? `until ${monthName(nextTerm.effectiveMonth)}` : 'until the next terms change'}.</span></div><div className={styles.field}><span>Fee model</span><ChoiceMenu label="Agency fee model" value={term.feeModel} options={FEE_MODELS} onChange={value => { if (FEE_MODELS.some(model => model.value === value)) updateTerm({ feeModel: value as AgencyTerms['feeModel'] }); }} disabled={saving} /></div><div className={styles.fieldPair}>{term.feeModel !== 'share' && <label className={styles.field}><span>Monthly agency fee <small>USD</small></span><NumberInput key={`fee-${term.effectiveMonth}`} value={term.monthlyRetainer} step={0.01} max={100000000} disabled={saving} onChange={value => updateTerm({ monthlyRetainer: value })} /></label>}{term.feeModel !== 'fixed' && <label className={styles.field}><span>Agency revenue share <small>%</small></span><NumberInput key={`share-${term.effectiveMonth}`} value={term.revSharePercent} step={0.01} max={100} disabled={saving} onChange={value => updateTerm({ revSharePercent: value })} /></label>}</div><div className={styles.formula}><span>{FEE_MODELS.find(model => model.value === term.feeModel)?.description}</span><strong>{termsLabel(term)}</strong></div></div> : <div className={styles.help}>No agency terms saved. Add a terms period to configure this agreement.</div>}
        </section>
      </div>
      {closeNotice && <div className={styles.editorNotice} role="status"><p>You have unsaved changes.</p><div><button type="button" className={styles.textButton} onClick={() => setCloseNotice(false)}>Keep editing</button><button type="button" className={styles.textButton} onClick={onClose}>Discard and close</button></div></div>}<footer className={styles.editorFooter}><p>{dirty ? 'Unsaved changes' : client ? 'Saved client agreement' : 'New client · Needs setup'}</p><div><button type="button" className={styles.secondaryButton} onClick={requestClose} disabled={saving}>Cancel</button><button type="submit" className={styles.primaryButton} disabled={saving || conflict}>{saving ? <Loader2 size={15} className={styles.spin} /> : <Save size={15} />}{saving ? 'Saving' : 'Save client'}</button></div></footer>
    </form>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}

function NumberInput({ value, step, max, disabled, onChange }: { value: number; step: number; max?: number; disabled?: boolean; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState({ text: String(value), synced: value });
  if (draft.synced !== value) setDraft({ text: String(value), synced: value });
  return <Input type="number" inputMode="decimal" min={0} max={max} step={step} value={draft.text} disabled={disabled} onBlur={() => { if (draft.text === '') setDraft({ text: '0', synced: 0 }); }} onChange={event => {
    const next = Number(event.target.value);
    const valid = Number.isFinite(next) && next >= 0;
    setDraft({ text: event.target.value, synced: valid ? next : value });
    if (valid) onChange(next);
  }} />;
}
