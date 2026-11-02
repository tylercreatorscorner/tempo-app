'use client';

import { Fragment } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { CreatorPortrait } from '@/components/creators/creator-portrait';
import { BrandIdentity } from '@/components/creators/brand-identity';
import { formatCurrency } from '@/lib/utils/format';
import { TableLoadBar } from '@/components/ui/table-load-bar';
import { RosterRowTags } from './studio-tag-controls';
import type { Creator, BrandChild } from './types';
import styles from './roster-layout.module.css';

export type RosterSortKey = 'real_name' | 'retainer' | 'posts_period' | 'last_post_date' | 'joined' | 'gmv_period' | 'roi_period';
type Props = {
  rows: Creator[]; brand: string; loading: boolean; showLoadBar: boolean; studioLoading: boolean;
  sort: RosterSortKey; direction: 'asc' | 'desc'; onSort: (key: RosterSortKey) => void;
  selected: Set<string>; onSelect: (creator: Creator) => void; onSelectPage: () => void;
  expanded: Set<string>; onActivate: (creator: Creator) => void; onOpenChild: (creator: Creator, child: BrandChild) => void;
  onEditTags: (id: string) => void; label: (brand: string) => string;
  page: number; total: number; pages: number; onPage: (page: number) => void;
  monthLabel: string;
};

export function RosterAgreementCell({ creator, pending = false }: { creator: Creator; pending?: boolean }) {
  if (creator.grouped) return <><strong>By brand</strong><small>Expand agreements</small></>;
  const agreement = creator.studio?.agreement;
  if (agreement?.status === 'affiliate') return <><strong>Affiliate</strong><small>No monthly requirement</small></>;
  if (agreement?.status === 'ended') return <><strong>Agreement ended</strong><small>Open profile for history</small></>;
  if (agreement?.status === 'awaiting_renewal') return <><strong>Awaiting renewal</strong><small>Review agreement terms</small></>;
  const retainer = agreement ? agreement.retainer : creator.retainer;
  const required = agreement ? agreement.requiredPosts : creator.monthly_post_requirement;
  const periodTerms = agreement?.source === 'ledger' && !agreement.comparable;
  return <>
    <strong>{retainer == null ? 'Rate unavailable' : `${formatCurrency(retainer)} / ${periodTerms ? 'agreement period' : 'month'}`}</strong>
    <small>{required == null ? 'Requirement unavailable' : `${required} videos / ${periodTerms ? 'agreement period' : 'month'}`}</small>
    <small>{pending && !agreement ? 'Checking agreement…' : agreement?.source === 'ledger' ? (agreement.comparable ? 'Monthly agreement' : 'Terms vary this month') : 'Current terms · history unverified'}</small>
  </>;
}

export function RosterDeliveryCell({ creator, pending = false }: { creator: Creator; pending?: boolean }) {
  if (creator.grouped) return <><strong>By brand</strong><small>Expand delivery</small></>;
  const delivery = creator.studio?.delivery;
  const agreement = creator.studio?.agreement;
  if (delivery?.reason === 'not_required') return <><strong>Not required</strong><small>No monthly requirement</small></>;
  if (!delivery || delivery.published == null) return <><strong>{pending ? 'Loading…' : 'Not available'}</strong><small>Month publication count</small></>;
  return <>
    <strong>{delivery.published.toLocaleString('en-US')}{agreement?.comparable && agreement.requiredPosts != null ? ` / ${agreement.requiredPosts}` : ''} published</strong>
    <small className={styles.warning}>Qualifying delivery unverified</small>
  </>;
}

function Delta({ value }: { value?: number | null }) {
  if (value == null || !Number.isFinite(value)) return <small>Comparison unavailable</small>;
  return <small className={value >= 0 ? styles.positive : styles.negative}>{value >= 0 ? '+' : '−'}{Math.abs(value).toFixed(1)}%</small>;
}

export function StudioRosterTable(props: Props) {
  const selectable = props.rows.filter(row => !row.grouped && (!row.is_managed || props.brand !== 'all'));
  const allSelected = selectable.length > 0 && selectable.every(row => props.selected.has(row.id));
  const partiallySelected = !allSelected && selectable.some(row => props.selected.has(row.id));
  const showBrand = props.brand === 'all';
  const name = (c: Creator) => c.real_name || c.handles?.[0] || c.account_1 || 'Creator';
  const column = (label: string, key: RosterSortKey) => <button type="button" onClick={() => props.onSort(key)}>{label}{props.sort === key && (props.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</button>;
  const owner = (c: Creator) => c.grouped ? <><strong>By brand</strong><small>Expand owners</small></> : c.studio?.owner ? <><strong>{c.studio.owner.name}</strong><small>{c.studio.owner.role}</small></> : <><strong>{props.studioLoading ? 'Loading…' : c.studio?.ownerStatus === 'unassigned' ? 'Unassigned' : 'Not available'}</strong><small>Brand manager</small></>;

  return <section className={styles.tableCard} aria-label="Creator roster" aria-busy={props.loading}>
    <TableLoadBar active={props.showLoadBar} />
    {props.loading && <p className={styles.loadStatus} role="status">{props.rows.length ? 'Updating creators. Previous results remain visible.' : 'Loading creators and performance…'}</p>}
    <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Creator roster table">
      <table className={styles.table}>
        <caption className="sr-only">Creators, cohort tags, selected-period performance, monthly agreements, recorded month publications, and assigned brand managers.</caption>
        <thead><tr>
          <th className={styles.selection}><label><input type="checkbox" aria-label="Select visible creators" checked={allSelected} ref={node => { if (node) node.indeterminate = partiallySelected; }} disabled={!selectable.length || props.loading} onChange={props.onSelectPage} /></label></th>
          <th scope="col">{column('Creator', 'real_name')}</th>
          {showBrand && <th scope="col">Brand</th>}
          <th scope="col">Tags</th>
          <th scope="col">{column('GMV / change', 'gmv_period')}</th>
          <th scope="col">{column('Published', 'posts_period')}</th>
          <th scope="col">{column('Monthly agreement', 'retainer')}</th>
          <th scope="col">{props.monthLabel} delivery</th>
          <th scope="col">Owner</th>
        </tr></thead>
        <tbody className={props.loading ? styles.updating : undefined}>
          {!props.rows.length && props.loading && Array.from({ length: 8 }, (_, i) => <tr key={i} aria-hidden="true"><td colSpan={showBrand ? 9 : 8}><div className={styles.skeletonRow}><i /><span /><span /></div></td></tr>)}
          {props.rows.map(c => <Fragment key={c.id}>
            <tr onClick={() => { if (!props.loading) props.onActivate(c); }} className={props.expanded.has(c.id) ? styles.expanded : undefined}>
              <td className={styles.selection} onClick={e => e.stopPropagation()}><label><input type="checkbox" aria-label={`Select ${name(c)}`} checked={props.selected.has(c.id)} disabled={props.loading || c.grouped || (c.is_managed && props.brand === 'all')} onChange={() => props.onSelect(c)} /></label></td>
              <td data-label="Creator"><button type="button" className={styles.person} disabled={props.loading} aria-label={`${c.grouped ? 'Expand brands for' : c.is_managed ? 'Open creator overview for' : 'Add'} ${name(c)}`} aria-expanded={c.grouped ? props.expanded.has(c.id) : undefined} onClick={e => { e.stopPropagation(); props.onActivate(c); }}>
                {c.grouped && (props.expanded.has(c.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                <CreatorPortrait creatorId={c.creator_id} name={name(c)} source={c.discord_avatar} className={styles.avatar} />
                <span><strong>{name(c)}</strong><small>{c.handles?.[0] || c.account_1 ? `@${c.handles?.[0] || c.account_1}` : 'Handle not linked'}{(c.handles?.length ?? 0) > 1 ? ` +${c.handles.length - 1}` : ''}</small>{!c.is_managed && <small>Unmanaged</small>}</span>
              </button></td>
              {showBrand && <td data-label="Brand">{c.grouped ? `${c.brands?.length ?? 0} brands` : c.brand ? <BrandIdentity brand={c.brand} label={props.label(c.brand)} /> : 'Unassigned'}</td>}
              <td data-label="Tags" onClick={e => e.stopPropagation()}>{c.grouped ? <span>By brand</span> : <RosterRowTags id={c.id} brand={c.brand} tags={c.creator_tags ?? []} isManaged={c.is_managed} onEditRequest={props.onEditTags} />}</td>
              <td data-label="GMV" className={styles.result}><strong>{formatCurrency(c.gmv_period)}</strong><Delta value={c.gmv_delta} /></td>
              <td data-label="Published"><strong className={styles.published}>{c.posts_period.toLocaleString('en-US')}</strong><span className={styles.mobileOnly}> videos in selected dates</span></td>
              <td data-label="Monthly agreement" className={styles.result}><RosterAgreementCell creator={c} pending={props.studioLoading} /></td>
              <td data-label={`${props.monthLabel} delivery`} className={styles.result}><RosterDeliveryCell creator={c} pending={props.studioLoading} /></td>
              <td data-label="Owner" className={styles.result}>{!c.is_managed ? <button className={styles.textButton} type="button" disabled={props.loading} onClick={e => { e.stopPropagation(); props.onActivate(c); }}><Plus size={13} />Add to roster</button> : owner(c)}</td>
            </tr>
            {props.expanded.has(c.id) && c.brands?.map(child => {
              const childCreator: Creator = { ...c, ...child, id: child.row_id, monthly_post_requirement: child.studio?.agreement.requiredPosts ?? null, gmv_delta: null, posts_delta: null, creator_tags: [], joined: null, grouped: false, brands: undefined, studio: child.studio };
              return <tr key={`${c.id}:${child.row_id}`} className={styles.child} onClick={() => props.onOpenChild(c, child)}>
                <td /><td data-label="Creator"><button type="button" className={styles.childButton} onClick={e => { e.stopPropagation(); props.onOpenChild(c, child); }}>{child.brand ? props.label(child.brand) : 'Unassigned'}<ChevronRight size={13} /></button></td>
                {showBrand && <td />}
                <td data-label="Tags">By brand</td><td data-label="GMV" className={styles.result}><strong>{formatCurrency(child.gmv_period)}</strong></td><td data-label="Published">{child.posts_period}</td>
                <td data-label="Monthly agreement" className={styles.result}><RosterAgreementCell creator={childCreator} pending={props.studioLoading} /></td><td data-label={`${props.monthLabel} delivery`} className={styles.result}><RosterDeliveryCell creator={childCreator} pending={props.studioLoading} /></td><td data-label="Owner" className={styles.result}>{owner(childCreator)}</td>
              </tr>;
            })}
          </Fragment>)}
        </tbody>
      </table>
    </div>
    <footer className={styles.pagination}><p>{props.loading && !props.rows.length ? 'Loading creator count…' : `${props.total.toLocaleString('en-US')} ${props.total === 1 ? 'creator' : 'creators'} · Page ${props.page} of ${props.pages}`}</p><div>
      <button type="button" disabled={props.loading || props.page === 1} onClick={() => props.onPage(props.page - 1)} aria-label="Previous page"><ChevronLeft size={14} /><span>Previous</span></button>
      <button type="button" disabled={props.loading || props.page >= props.pages} onClick={() => props.onPage(props.page + 1)} aria-label="Next page"><span>Next</span><ChevronRight size={14} /></button>
    </div></footer>
  </section>;
}
