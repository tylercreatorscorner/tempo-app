'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { ChoiceMenu } from '@/components/ui/choice-menu';
import { DateField } from '@/components/ui/date-field';
import { agencyMonthBounds, selectMonthTerms, type ClientRecord } from '@/lib/agency/model';
import { addDays, shiftMonth } from '@/lib/agency/finance-model';
import { calculateCreatorBilling, creatorBillingPeriodsSchema, type CreatorBillingCreator, type CreatorBillingPeriod, type CreatorBillingResult } from '@/lib/agency/creator-billing';
import s from './creator-billing.module.css';

const money = (cents: number | null | undefined) => cents == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const monthName = (month: string) => new Date(`${month}-01T12:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
const dateName = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const CREATORS_PER_PAGE = 8;
const requirements: Array<{ key: 'approved' | 'onboarded' | 'tapAuthorized'; label: string }> = [{ key: 'approved', label: 'Client approved' }, { key: 'onboarded', label: 'Onboarded' }, { key: 'tapAuthorized', label: 'TAP authorized' }];
function requestedMonth(current: string) {
  const requested = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('billingMonth');
  return requested && /^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(requested) && requested <= current ? requested : current;
}

export function CreatorBillingLedger({ client, periods, onChange, canEdit, currentDay, initialMonth, unsavedChanges = false, persistedMonths }: { client: ClientRecord; periods: CreatorBillingPeriod[]; onChange: (periods: CreatorBillingPeriod[]) => void; canEdit: boolean; currentDay: string; initialMonth?: string; unsavedChanges?: boolean; persistedMonths?: string[] }) {
  const currentMonth = currentDay.slice(0, 7);
  const recordedMonths = new Set(persistedMonths ?? periods.map(period => period.month));
  const [month, setMonth] = useState(() => initialMonth ?? requestedMonth(currentMonth));
  const [view, setView] = useState('to-date');
  const [creatorSearch, setCreatorSearch] = useState(''), [creatorPage, setCreatorPage] = useState(0);
  const saved = periods.find(period => period.month === month);
  const period: CreatorBillingPeriod = saved ?? { month, rosterConfirmed: false, headcountApproval: '', budgetApproval: '', creators: [] };
  const matchingCreators = period.creators.map((creator, index) => ({ creator, index })).filter(({ creator }) => creator.handle.toLowerCase().includes(creatorSearch.trim().replace(/^@+/, '').toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(matchingCreators.length / CREATORS_PER_PAGE)), page = Math.min(creatorPage, pageCount - 1);
  const visibleCreators = matchingCreators.slice(page * CREATORS_PER_PAGE, (page + 1) * CREATORS_PER_PAGE);
  const terms = selectMonthTerms(client.terms, month), rate = terms?.feeModel === 'per_creator' ? terms.creatorRate : null;
  const bounds = agencyMonthBounds(month);
  const cutoff = month === currentMonth ? addDays(currentDay, -1) : bounds.end;
  const throughDate = view === 'month-end' ? bounds.end : cutoff;
  const creatorTermMonths = client.terms.filter(term => term.feeModel === 'per_creator').map(term => term.effectiveMonth).sort();
  const firstBillingMonth = [client.serviceStart?.slice(0, 7) ?? currentMonth, creatorTermMonths[0] ?? currentMonth].sort().at(-1)!;
  const generatedMonths = [currentMonth, ...Array.from({ length: 24 }, (_, index) => shiftMonth(currentMonth, -index)), ...creatorTermMonths].filter(value => value >= firstBillingMonth && value <= currentMonth);
  const months = [...new Set([...generatedMonths, ...periods.map(row => row.month)])].filter(value => value <= currentMonth).sort().reverse();
  let result: CreatorBillingResult | null = null, validation = '';
  const parsed = creatorBillingPeriodsSchema.safeParse([period]);
  if (!parsed.success) validation = parsed.error.issues[0]?.message ?? 'Complete each creator handle and active dates.';
  else if (rate) {
    try { result = calculateCreatorBilling({ client, month, throughDate, rate, period: saved ? parsed.data[0] : null }); }
    catch { validation = 'Review the saved rate, creator handles, and active dates.'; }
  }
  const update = (patch: Partial<CreatorBillingPeriod>) => onChange([...periods.filter(row => row.month !== month), { ...period, ...patch }].sort((a, b) => a.month.localeCompare(b.month)));
  const updateCreator = (id: string, patch: Partial<CreatorBillingCreator>) => update({ rosterConfirmed: false, creators: period.creators.map(row => row.id === id ? { ...row, ...patch } : row) });
  const selectMonth = (value: string) => { setMonth(value); setCreatorSearch(''); setCreatorPage(0); const url = new URL(window.location.href); url.searchParams.set('billingMonth', value); window.history.replaceState(null, '', url); };
  const addCreator = () => { setCreatorSearch(''); setCreatorPage(Math.floor(period.creators.length / CREATORS_PER_PAGE)); update({ rosterConfirmed: false, creators: [...period.creators, { id: crypto.randomUUID(), handle: '', activeFrom: '', activeThrough: null, approved: false, onboarded: false, tapAuthorized: false, tier: 'L2' }] }); };
  const headcountApprovalNeeded = Boolean(rate && result?.eligibleCount != null && result.eligibleCount > rate.maxCreators);
  const budgetApprovalNeeded = Boolean(rate && result?.fullMonthCombinedCents != null && result.fullMonthCombinedCents > Math.round(rate.monthlyBudgetCap * 100));
  const confirmedEmpty = period.rosterConfirmed && period.creators.length === 0 && !result?.blocked;
  return <section className={s.panel} aria-labelledby="creator-billing-heading">
    <header className={s.header}><div><h2 id="creator-billing-heading">Creator billing</h2><p>Source fees use each eligible creator’s active days. Creator stipends are separate from agency income.</p></div><ChoiceMenu compact label="Creator billing month" value={month} options={months.map(value => ({ value, label: monthName(value), description: recordedMonths.has(value) ? 'Saved ledger' : periods.some(row => row.month === value) ? 'Unsaved ledger' : 'No saved ledger' }))} onChange={selectMonth} /></header>
    {unsavedChanges && <div className={s.unsaved} role="status"><strong>Unsaved calculation preview.</strong> Save creator billing to update Revenue.</div>}
    {!rate ? <div className={s.notice}>Per-creator agency terms are not configured for {monthName(month)}. Choose a month with saved per-creator terms or review the agency agreement.</div> : <>
      <div className={s.rate}><strong>{money(Math.round(rate.monthlyFee * 100))} per eligible creator / month</strong><span>{rate.maxCreators} creators · {money(Math.round(rate.monthlyBudgetCap * 100))} monthly budget cap</span></div>
      <div className={s.viewBar}><div><strong>{view === 'month-end' ? 'Month-end schedule preview' : 'Active days through cutoff'}</strong><small>{throughDate < bounds.start ? 'No closed days in this month yet' : `${dateName(bounds.start)}–${dateName(throughDate)} · ${result?.daysInMonth ?? bounds.end.slice(8)} calendar days in month`}</small></div><ChoiceMenu compact label="Creator billing calculation period" value={view} options={[{ value: 'to-date', label: month === currentMonth ? 'Through last closed day' : 'Completed month' }, { value: 'month-end', label: 'Month-end roster schedule' }]} onChange={setView} /></div>
      {view === 'month-end' && <p className={s.scheduleNote}>Uses the entered active dates and eligibility through month-end. This is schedule exposure, not a recorded payment or an extrapolation of GMV.</p>}
      <div className={s.amounts}><div><span>Agency sourcing fees</span><strong>{money(result?.feeCents)}</strong><small>{result?.blocked ? 'Roster or approval pending' : unsavedChanges ? 'Unsaved calculation' : view === 'month-end' ? 'Saved schedule amount' : 'Known through cutoff'}</small></div><div><span>Creator stipends · separate</span><strong>{money(result?.stipendCents)}</strong><small>Creator funding, not agency income</small></div><div><span>Eligible creators</span><strong>{result?.eligibleCount ?? '—'}</strong><small>{confirmedEmpty ? unsavedChanges ? 'Empty roster · review not saved' : 'Verified empty roster' : !recordedMonths.has(month) ? 'Roster not saved' : period.rosterConfirmed ? unsavedChanges ? 'Roster review not saved' : 'Roster reviewed' : 'Roster not confirmed'}</small></div></div>
      {(validation || result?.reasons.length) ? <div className={s.notice} role="status">{validation ? <p>{validation}</p> : result?.reasons.map((reason, index) => <p key={index}>{reason}</p>)}</div> : null}
      {!saved && <p className={s.emptyNote}>No roster is saved for this month. Missing roster data stays unknown. Confirm an empty roster only after verifying there were no eligible creators.</p>}
      {period.creators.length > 0 && <div className={s.creatorTools}><input type="search" value={creatorSearch} placeholder="Find a creator by handle" aria-label="Find a creator by handle" onChange={event => { setCreatorSearch(event.target.value); setCreatorPage(0); }} /><small>{matchingCreators.length ? `${page * CREATORS_PER_PAGE + 1}–${Math.min((page + 1) * CREATORS_PER_PAGE, matchingCreators.length)} of ${matchingCreators.length}` : 'No matching creators'}{creatorSearch ? ` matching · ${period.creators.length} total` : ' creators'}</small></div>}
      <fieldset disabled={!canEdit} className={s.editable}>
        <p className={s.activeDateHelp}>Active from is the date client approval, onboarding, and TAP authorization were all complete. Active through is the last eligible day.</p>
        <div className={s.creatorList}>{visibleCreators.map(({ creator, index }) => {
          const row = result?.creators.find(value => value.id === creator.id);
          const amountsKnown = Boolean(period.rosterConfirmed && row && client.serviceStart && parsed.success);
          return <div className={s.creator} key={creator.id}><div className={s.creatorHeading}><label className={s.handle}><span>Creator {index + 1}</span><input required value={creator.handle} placeholder="TikTok handle" maxLength={101} aria-label={`Creator ${index + 1} handle`} onChange={event => updateCreator(creator.id, { handle: event.target.value })} /></label><div className={s.tier}><span>Stipend tier</span><ChoiceMenu compact label={`Creator ${index + 1} tier`} value={creator.tier} options={[{ value: 'L2', label: 'L2 · $500 / month' }, { value: 'L3', label: 'L3 · $1,500 / month' }, { value: 'L4', label: 'L4 · $3,500 / month' }]} onChange={value => { if (value === 'L2' || value === 'L3' || value === 'L4') updateCreator(creator.id, { tier: value }); }} /></div><button type="button" className={s.iconButton} aria-label={`Remove creator ${index + 1}`} onClick={() => update({ rosterConfirmed: false, creators: period.creators.filter(value => value.id !== creator.id) })}><Trash2 size={15} /></button></div>
            <div className={s.creatorBody}><div className={s.dates}><label><span>Active from</span><DateField required value={creator.activeFrom} max={creator.activeThrough ?? undefined} aria-label={`Creator ${index + 1} active from`} onValueChange={value => updateCreator(creator.id, { activeFrom: value })} /></label><label><span>Active through <small>optional</small></span><DateField value={creator.activeThrough ?? ''} min={creator.activeFrom || undefined} aria-label={`Creator ${index + 1} active through`} onValueChange={value => updateCreator(creator.id, { activeThrough: value || null })} /></label></div><div className={s.criteria}><span>All three required for eligibility</span>{requirements.map(requirement => <label key={requirement.key}><input type="checkbox" checked={creator[requirement.key]} onChange={event => updateCreator(creator.id, { [requirement.key]: event.target.checked })} />{requirement.label}</label>)}</div><dl className={s.breakdown}><div><dt>Active days</dt><dd>{amountsKnown ? `${row!.activeDays} / ${result!.daysInMonth}` : '—'}</dd></div><div><dt>Sourcing fee</dt><dd>{money(amountsKnown ? row!.sourceFeeCents : null)}</dd></div><div><dt>Stipend</dt><dd>{money(amountsKnown ? row!.stipendCents : null)}</dd></div></dl></div>
            <small className={s.eligibility}>{!period.rosterConfirmed ? 'Confirm the roster to calculate this row.' : row?.eligible ? 'Meets all eligibility criteria; dates determine the billable days.' : row?.missingRequirements.length ? `Not eligible: ${row.missingRequirements.map(key => requirements.find(requirement => requirement.key === key)?.label ?? key).join(', ')}.` : 'No active days overlap this client service month.'}</small>
          </div>;
        })}</div>
        <button type="button" className={s.button} onClick={addCreator}><Plus size={14} />Add creator</button>
        <label className={s.confirm}><input type="checkbox" checked={period.rosterConfirmed} onChange={event => update({ rosterConfirmed: event.target.checked })} /><span><strong>I reviewed the complete creator roster for {monthName(month)}.</strong><small>Changing a creator row resets this confirmation. A confirmed empty roster means zero eligible creators.</small></span></label>
        {(headcountApprovalNeeded || budgetApprovalNeeded || period.headcountApproval || period.budgetApproval) && <div className={s.approvals}><h3>Written approvals</h3><p>Record the written approval reference or decision. Saving the roster does not grant approval or move money.</p>{(headcountApprovalNeeded || period.headcountApproval) && <label><span>Headcount approval {headcountApprovalNeeded && <small>required above {rate.maxCreators} creators</small>}</span><textarea value={period.headcountApproval} maxLength={4000} onChange={event => update({ headcountApproval: event.target.value })} placeholder="Who approved, when, and where the written approval is recorded" /></label>}{(budgetApprovalNeeded || period.budgetApproval) && <label><span>Budget approval {budgetApprovalNeeded && <small>required above {money(Math.round(rate.monthlyBudgetCap * 100))}</small>}</span><textarea value={period.budgetApproval} maxLength={4000} onChange={event => update({ budgetApproval: event.target.value })} placeholder="Who approved, when, and where the written approval is recorded" /></label>}</div>}
      </fieldset>
      {period.creators.length > 0 && <div className={s.pagination}><small>Calculations include all {period.creators.length} creator rows.</small><div><button type="button" disabled={page === 0} aria-label="Previous creator page" onClick={() => setCreatorPage(page - 1)}>Previous</button><span>Page {page + 1} of {pageCount}</span><button type="button" disabled={page >= pageCount - 1} aria-label="Next creator page" onClick={() => setCreatorPage(page + 1)}>Next</button></div></div>}
      <p className={s.footer}>Dates are inclusive and fees are prorated over the actual calendar days in the month. Monthly budget review includes sourcing fees and creator stipends{result?.fullMonthCombinedCents != null ? `: ${money(result.fullMonthCombinedCents)} in the entered full-month schedule` : ''}. Use Save creator billing to record this ledger.</p>
    </>}
  </section>;
}
