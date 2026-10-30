'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Popover } from 'radix-ui';
import { ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Equal, Loader2, Minus, RefreshCw } from 'lucide-react';
import type { AgencyTerms } from '@/lib/agency/model';
import type { ManagerTerms } from '@/lib/agency/finance-model';
import type { AgencyRevenueResponse } from '@/lib/data/agency-revenue';
import s from './revenue.module.css';

// The API supplies all money and cohort decisions. This view only formats them.
type RevenueRow = AgencyRevenueResponse['rows'][number];
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const feeUsd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const money = (cents: number | null) => cents === null ? '—' : usd.format(cents / 100);
const monthName = (month: string, short = false) => new Date(`${month}-01T12:00:00`).toLocaleDateString('en-US', { month: short ? 'short' : 'long', year: 'numeric' });
const dateName = (date: string | null) => date ? new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Unknown';
const currentMonth = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
function shiftMonth(month: string, offset: number) { const [year, part] = month.split('-').map(Number); return new Date(Date.UTC(year, part - 1 + offset, 1)).toISOString().slice(0, 7); }
function financeLink(id: string) { return `/agency/finance?client=${encodeURIComponent(id)}`; }

export function AgencyRevenueWorkspace({ initialData, initialMonth, latestMonth: latestMonthInput }: { initialData?: AgencyRevenueResponse; initialMonth?: string; latestMonth?: string }) {
  const [latestMonth] = useState(() => latestMonthInput ?? currentMonth());
  const [month, setMonth] = useState(() => initialData?.month ?? initialMonth ?? latestMonth);
  const [data, setData] = useState<AgencyRevenueResponse | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData), [error, setError] = useState(''), [refresh, setRefresh] = useState(0);
  const [search, setSearch] = useState('');
  useEffect(() => {
    if (initialData && refresh === 0 && initialData.month === month) return;
    const abort = new AbortController();
    fetch(`/api/agency/revenue?month=${encodeURIComponent(month)}`, { cache: 'no-store', signal: abort.signal })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to load revenue. Please retry.');
        if (result.month !== month || !Array.isArray(result.rows)) throw new Error('The revenue response could not be verified. Please retry.');
        if (!abort.signal.aborted) { setData(result as AgencyRevenueResponse); setError(''); setLoading(false); }
      }).catch(cause => { if (!abort.signal.aborted) { setError(cause instanceof Error ? cause.message : 'Unable to load revenue. Please retry.'); setLoading(false); } });
    return () => abort.abort();
  }, [initialData, month, refresh]);
  const changeMonth = (value: string) => {
    if (value === month || value > latestMonth) return;
    setMonth(value); setData(null); setLoading(true); setError('');
    const url = new URL(window.location.href); url.searchParams.set('month', value); window.history.replaceState(null, '', url);
  };
  const reload = () => { setLoading(true); setError(''); setRefresh(value => value + 1); };
  const current = month === latestMonth;
  const activeRows = data?.rows.filter(row => row.status !== 'outside_service') ?? [];
  const outsideRows = data?.rows.filter(row => row.status === 'outside_service') ?? [];
  const visibleRows = activeRows.filter(row => row.clientName.toLowerCase().includes(search.trim().toLowerCase()));
  const supported = data?.totals.supportedCount ?? 0;
  const activeExcluded = activeRows.filter(row => row.excludedFromTotals).length;
  const knownDates = activeRows.map(row => row.recordedThrough).filter((value): value is string => Boolean(value));
  const oldestDate = knownDates.length ? [...knownDates].sort()[0] : null;
  const hasClosedDates = Boolean(data && data.throughDate >= data.periodStart);
  return <main className={s.page} aria-busy={loading}>
    <header className={s.header}><div><h1>Revenue</h1><p>Client fees and manager pay, calculated from recorded GMV.</p></div><div className={s.actions}><Link href="/agency/finance" className={s.secondary}>Client finance <ArrowUpRight size={14} /></Link><button className={s.iconButton} type="button" disabled={loading} onClick={reload} aria-label="Refresh revenue"><RefreshCw size={16} className={loading ? s.spin : undefined} /></button></div></header>
    <section className={s.periodBar} aria-label="Revenue period"><div className={s.periodIdentity}><span className={s.periodDot} /><strong>{current ? 'Month to date' : 'Completed service month'}</strong><span>{data ? data.throughDate < `${month}-01` ? 'No closed service days yet' : `${dateName(`${month}-01`)}–${dateName(data.throughDate)}` : monthName(month)}</span></div><div className={s.periodControls}><button type="button" className={s.iconButton} disabled={loading || month <= '2000-01'} onClick={() => changeMonth(shiftMonth(month, -1))} aria-label="Previous service month"><ChevronLeft size={16} /></button><RevenueMonthPicker month={month} latestMonth={latestMonth} disabled={loading} onChange={changeMonth} /><button type="button" className={s.iconButton} disabled={loading || month >= latestMonth} onClick={() => changeMonth(shiftMonth(month, 1))} aria-label="Next service month"><ChevronRight size={16} /></button></div></section>
    {error && <div className={s.error} role="alert"><CircleAlert size={17} /><div><strong>Revenue could not be loaded</strong><p>{error}</p></div><button type="button" onClick={reload}>Try again</button></div>}
    {loading && !data && <div className={s.loading} role="status"><Loader2 className={s.spin} size={18} />Loading recorded performance and effective terms…</div>}
    {data && <>
      <section className={s.summary} aria-label="Revenue estimate"><div className={s.summaryHeader}><div><h2>{current ? 'Current month estimate' : 'Recorded-month estimate'}</h2><p>Full monthly fixed fees plus the share of recorded GMV. No month-end extrapolation.</p></div><span className={s.estimateBadge}>Included client subtotal</span></div><div className={s.metricRail}>
        <div className={s.metric}><span>Estimated gross billings</span><strong>{money(data.totals.feeCents)}</strong><small>Full client fee before manager pay</small></div><span className={s.operator} aria-hidden="true"><Minus size={17} /></span>
        <div className={s.metric}><span>Estimated manager pay</span><strong>{money(data.totals.managerCents)}</strong><small>Effective compensation for included clients</small></div><span className={s.operator} aria-hidden="true"><Equal size={17} /></span>
        <div className={`${s.metric} ${s.retained} ${data.totals.retainedCents !== null && data.totals.retainedCents < 0 ? s.negative : ''}`}><span>CC retained before overhead</span><strong>{money(data.totals.retainedCents)}</strong><small>Gross billings less manager pay</small></div>
      </div><div className={s.cohort}><span><Check size={13} />{supported} {supported === 1 ? 'client' : 'clients'} included in all three amounts</span><span>{activeExcluded} excluded</span>{outsideRows.length > 0 && <span>{outsideRows.length} outside period</span>}<span>{data.totals.partialCount} partial period / coverage</span>{!supported && <strong>No included client amounts yet</strong>}</div></section>
      <div className={s.coverageBar}><CalendarDays size={15} /><p>Cutoff <strong>{dateName(data.throughDate)}, {data.throughDate.slice(0, 4)}</strong>{oldestDate && <> · Oldest client data through <strong>{dateName(oldestDate)}</strong></>}. {current ? 'Uses closed days only; estimates change as GMV is recorded.' : 'Amounts use the recorded GMV available for this service month.'}</p></div>
      {data.warnings.length > 0 && <div className={s.warning} role="status"><CircleAlert size={16} /><div>{data.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</div></div>}
      <section className={s.panel} aria-labelledby="client-revenue-heading"><div className={s.tableHeader}><div><h2 id="client-revenue-heading">Client detail <span>{activeRows.length}</span></h2><p>Missing or review-blocked amounts stay unknown. Only the marked clients enter the subtotal.</p></div><input className={s.search} type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a client" aria-label="Find a revenue client" /></div><div className={s.tableScroll}><table className={s.table}><thead><tr><th scope="col">Client / coverage</th><th scope="col" className={s.number}>Managed GMV</th><th scope="col">Client fee terms</th><th scope="col" className={s.number}>Est. gross</th><th scope="col" className={s.number}>Manager pay</th><th scope="col" className={s.number}>CC retained</th><th scope="col">Review</th></tr></thead><tbody>{visibleRows.map(row => <RevenueClientRow key={row.clientId} row={row} throughDate={data.throughDate} />)}{!visibleRows.length && <tr><td colSpan={7} className={s.empty}>{search ? 'No clients match this search.' : 'No clients are active or awaiting setup for this service month.'}</td></tr>}</tbody>{supported > 0 && !search && <tfoot><tr><th scope="row" colSpan={3}>Included client subtotal <span>{supported} {supported === 1 ? 'client' : 'clients'}</span></th><td className={s.number}>{money(data.totals.feeCents)}</td><td className={s.number}>{money(data.totals.managerCents)}</td><td className={`${s.number} ${data.totals.retainedCents !== null && data.totals.retainedCents < 0 ? s.negative : s.retainedAmount}`}>{money(data.totals.retainedCents)}</td><td /></tr></tfoot>}</table></div><div className={s.tableNote}>Estimates require agreement review before billing. Full monthly fixed fees are included; partial service months require review.</div></section>
      {outsideRows.length > 0 && <details className={s.outside}><summary>{outsideRows.length} {outsideRows.length === 1 ? 'client is' : 'clients are'} outside this service month</summary><div>{outsideRows.map(row => <Link key={row.clientId} href={financeLink(row.clientId)}>{row.clientName}<ArrowUpRight size={12} /></Link>)}</div></details>}
      <section className={s.cash} aria-labelledby="recorded-cash-heading"><div className={s.cashHeading}><div className={s.eyebrow}>ACTUAL RECORDED CASH</div><h2 id="recorded-cash-heading">Collections and payments</h2><p>{hasClosedDates ? <>Cash dates {dateName(data.periodStart)}–{dateName(data.throughDate)}. Includes invoices from any service month.</> : <>No closed cash dates in {monthName(month)} yet.</>}</p><Link href="/agency/finance">View client finance <ArrowRight size={13} /></Link></div><dl className={s.cashValues}><div><dt>Recorded client collections</dt><dd>{money(data.cash.collectedCents)}</dd><small>{data.cash.collectedCount} recorded {data.cash.collectedCount === 1 ? 'collection' : 'collections'}</small></div><div><dt>Manager cash paid</dt><dd>{money(data.cash.managerPaidCents)}</dd><small>{data.cash.managerPaidCount} settled {data.cash.managerPaidCount === 1 ? 'invoice' : 'invoices'}</small></div><div><dt>Retained cash before overhead</dt><dd>{money(data.cash.retainedCashCents)}</dd><small>Recorded collections less recorded payments</small></div></dl><p className={s.cashSource}>Only payments recorded in Tempo; not a bank or accounting feed.</p>{!data.cash.complete && <p className={s.cashIncomplete}>{hasClosedDates ? 'Cash records are incomplete. Unknown amounts are not included as zero.' : 'Cash totals begin after the first completed day.'}</p>}</section>
    </>}
  </main>;
}

function RevenueClientRow({ row, throughDate }: { row: RevenueRow; throughDate: string }) {
  const included = !row.excludedFromTotals && row.feeCents !== null && row.managerCents !== null && row.retainedCents !== null;
  const managerNames = row.managerTerms ? (row.managerTerms.allocations ?? [row.managerTerms]).map(recipient => recipientName(recipient.managerId, row.managerRecipients)).join(' + ') : '';
  const partial = !row.gmvComplete || !row.recordedThrough || row.recordedThrough < throughDate;
  const needsDataReview = row.coverage !== 'complete';
  const needsFinanceReview = !row.agencyTerms || !row.managerTerms || (row.status === 'review_required' && !row.reasons.some(reason => reason.includes('recorded GMV amount'))) || (row.status === 'needs_setup' && row.reasons.some(reason => reason.startsWith('Add ')));
  const specificReasons = row.reasons.filter(reason => !reason.startsWith('Full monthly fixed fees') && !reason.startsWith('Recorded GMV coverage is partial'));
  const label = row.status === 'ready' ? 'Calculated' : row.status === 'provisional' ? partial ? 'Partial data' : 'Estimate' : row.status === 'review_required' ? 'Review required' : row.status === 'needs_setup' ? needsFinanceReview ? 'Needs setup' : 'Data needed' : 'Outside service';
  return <tr className={included ? undefined : s.excludedRow}><th scope="row"><Link className={s.clientName} href={financeLink(row.clientId)}>{row.clientName}</Link><span className={`${s.rowStatus} ${included ? s.includedStatus : ''}`}>{included ? <Check size={11} /> : <CircleAlert size={11} />}{included ? 'In subtotal' : 'Excluded'}</span><small>{row.recordedThrough ? `Data through ${dateName(row.recordedThrough)}` : 'GMV coverage unknown'}{partial && row.recordedThrough ? ' · Partial' : ''}</small></th><td className={s.number}>{money(row.gmvCents)}<small>{row.gmvCents === null ? 'Unknown' : partial ? 'Recorded, partial coverage' : 'Recorded through cutoff'}</small></td><td className={s.termsCell}><FeeTerms terms={row.agencyTerms} /><details className={s.termsDetails}><summary>Exact terms</summary><div><p>Agency terms effective {row.agencyTerms ? monthName(row.agencyTerms.effectiveMonth, true) : 'not set'}.</p>{row.agencyTerms?.feeModel === 'tiered' && <><p>{row.agencyTerms.tierCalculation === 'marginal' ? 'Marginal bands' : row.agencyTerms.tierCalculation === 'whole' ? 'Whole GMV rate' : 'Calculation method unconfirmed'} · {row.agencyTerms.gmvBasis === 'managed' ? 'Managed GMV' : 'Agency-supported affiliate GMV'}.</p><ul>{row.agencyTerms.revShareTiers?.map((tier, index, tiers) => <li key={index}>{index === 0 ? 'From $0' : `Above ${feeUsd.format(tiers[index - 1].upToGmv ?? 0)}`}{tier.upToGmv !== null ? ` through ${feeUsd.format(tier.upToGmv)}` : ''}: {tier.percent}%</li>)}</ul></>}<ManagerTermsText terms={row.managerTerms} recipients={row.managerRecipients} /><p>{row.gmvComplete ? 'Daily creator data is present for each expected date.' : 'Daily creator data is missing for some expected dates or stores.'} Recorded through {row.recordedThrough ? dateName(row.recordedThrough) : 'an unknown date'}; cutoff {dateName(throughDate)}. Source presence does not verify every sale in an export.</p>{row.brandCoverage.length > 0 && <ul>{row.brandCoverage.map(brand => <li key={brand.brandId}>{brand.brandName}: {brand.recordedDays}/{brand.expectedDays} dates with creator data across all expected stores{brand.latestRecordedThrough ? `; latest source ${dateName(brand.latestRecordedThrough)}` : '; source date unknown'}.</li>)}</ul>}<Link href={financeLink(row.clientId)}>Open agreement and arrangements <ArrowUpRight size={12} /></Link></div></details></td><td className={s.number}>{money(row.feeCents)}</td><td className={s.number}>{money(row.managerCents)}{managerNames && <small>{managerNames}</small>}</td><td className={`${s.number} ${row.retainedCents !== null && row.retainedCents < 0 ? s.negative : included ? s.retainedAmount : ''}`}>{money(row.retainedCents)}</td><td className={s.reviewCell}><span className={`${s.status} ${included ? s.provisional : ''}`}>{label}</span>{specificReasons.map((reason, index) => <small key={index}>{shortReason(reason)}</small>)}<div className={s.reviewActions}>{needsDataReview && <Link href="/upload">Review data <ArrowUpRight size={12} /></Link>}{needsFinanceReview && <Link href={financeLink(row.clientId)}>Review setup <ArrowUpRight size={12} /></Link>}</div></td></tr>;
}
function shortReason(reason: string) {
  const labels: Record<string, string> = {
    'Managed GMV is not recorded for this period.': 'Managed GMV missing.',
    'Add a manager pay arrangement effective for this month.': 'Manager arrangement missing.',
    'Resolve the flagged agreement terms before including this client.': 'Agreement terms need review.',
    'Add the confirmed service start date.': 'Service start unconfirmed.',
    'Partial service month requires an agreed fee; no automatic proration is applied.': 'Partial service month; agreed fee needed.',
    'No completed source dates in this service month yet.': 'No closed source dates yet.',
    'Add agency fee terms effective for this month.': 'Agency terms missing.',
    'Review the agency fee calculation, tier method, or contract GMV basis.': 'Fee calculation needs review.',
  };
  return labels[reason] ?? reason;
}
function FeeTerms({ terms }: { terms: AgencyTerms | null }) {
  if (!terms) return <span className={s.muted}>Agency terms missing</span>;
  if (terms.feeModel === 'components') return <div className={s.componentTerms}><span><b>CC</b>{feeUsd.format(terms.monthlyRetainer)} + {terms.revSharePercent}%</span><span><b>Manager</b>{terms.managerComponent ? `${terms.managerComponent.feeModel === 'minimum' ? 'Higher of ' : ''}${feeUsd.format(terms.managerComponent.monthlyRetainer)} ${terms.managerComponent.feeModel === 'minimum' ? 'or' : '+'} ${terms.managerComponent.revSharePercent}%` : 'Component missing'}</span></div>;
  return <span className={s.feeFormula}>{terms.feeModel === 'fixed' ? `${feeUsd.format(terms.monthlyRetainer)} / month` : terms.feeModel === 'share' ? `${terms.revSharePercent}% of managed GMV` : terms.feeModel === 'minimum' ? `Higher of ${feeUsd.format(terms.monthlyRetainer)} or ${terms.revSharePercent}%` : terms.feeModel === 'tiered' ? `${feeUsd.format(terms.monthlyRetainer)} + tiered share` : `${feeUsd.format(terms.monthlyRetainer)} + ${terms.revSharePercent}%`}</span>;
}
function recipientName(managerId: string, recipients: Array<{ managerId: string; name: string | null }> = []) { return recipients.find(recipient => recipient.managerId.toLowerCase() === managerId.toLowerCase())?.name?.trim() || 'Unnamed manager'; }
function ManagerTermsText({ terms, recipients }: { terms: ManagerTerms | null; recipients: Array<{ managerId: string; name: string | null }> }) {
  if (!terms) return <p>Manager arrangement is not set.</p>;
  const allocations = terms.allocations ?? [terms];
  return <><p>Manager arrangement effective {monthName(terms.effectiveMonth, true)}. {allocations.length > 1 ? `${allocations.length} recipient allocations, each rounded separately.` : 'One pay recipient.'}</p><ul>{allocations.map((row, index) => <li key={index}>{recipientName(row.managerId, recipients)}: {row.compensationModel === 'minimum' ? 'Higher of ' : ''}{feeUsd.format(row.fixedMonthly)} {row.compensationModel === 'minimum' ? 'or' : '+'} {row.gmvPercent}% of managed GMV.</li>)}</ul></>;
}
function RevenueMonthPicker({ month, latestMonth, disabled, onChange }: { month: string; latestMonth: string; disabled: boolean; onChange: (month: string) => void }) {
  const [open, setOpen] = useState(false), [year, setYear] = useState(Number(month.slice(0, 4)));
  return <Popover.Root open={open} onOpenChange={value => { setOpen(value); if (value) setYear(Number(month.slice(0, 4))); }}><Popover.Trigger className={s.monthTrigger} disabled={disabled} aria-label={`Service month: ${monthName(month)}`}><CalendarDays size={14} />{monthName(month, true)}<ChevronDown size={13} /></Popover.Trigger><Popover.Portal><Popover.Content className={s.monthPopover} sideOffset={8} align="end" collisionPadding={12} data-lenis-prevent><div className={s.yearNav}><button type="button" disabled={year <= 2000} onClick={() => setYear(value => value - 1)} aria-label="Previous year"><ChevronLeft size={15} /></button><strong>{year}</strong><button type="button" disabled={year >= Number(latestMonth.slice(0, 4))} onClick={() => setYear(value => value + 1)} aria-label="Next year"><ChevronRight size={15} /></button></div><div className={s.monthGrid}>{Array.from({ length: 12 }, (_, index) => { const value = `${year}-${String(index + 1).padStart(2, '0')}`; return <button key={value} type="button" aria-pressed={value === month} disabled={value > latestMonth} onClick={() => { onChange(value); setOpen(false); }}>{new Date(year, index, 1).toLocaleDateString('en-US', { month: 'short' })}</button>; })}</div><button className={s.thisMonth} type="button" onClick={() => { onChange(latestMonth); setOpen(false); }}>This month <ArrowRight size={12} /></button></Popover.Content></Popover.Portal></Popover.Root>;
}
