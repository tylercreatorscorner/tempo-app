'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Dialog } from 'radix-ui';
import { Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CreatorPortrait } from '@/components/creators/creator-portrait';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import { formatCurrency } from '@/lib/utils/format';
import type { Creator } from './types';
import styles from './creator-drawer.module.css';

interface Props {
  creator: Creator;
  periodLabel: string;
  start?: string | null;
  end?: string | null;
  range?: string;
  onClose: () => void;
  onEdit?: () => void;
  onEditTags?: () => void;
}

const number = (value?: number | null) => typeof value === 'number' && Number.isFinite(value)
  ? value.toLocaleString('en-US') : 'Unavailable';
const date = (value?: string | null) => {
  if (!value) return null;
  const calendarDate = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = new Date(calendarDate ? `${value}T12:00:00Z` : value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: calendarDate ? 'UTC' : 'America/Chicago',
  }) : null;
};
const monthName = (value?: string) => value && /^\d{4}-\d{2}$/.test(value)
  ? new Date(`${value}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }) : 'Monthly';

function Metric({ label, value, detail, large = false }: { label: string; value: string; detail?: string; large?: boolean }) {
  return <div className={`${styles.metric} ${large ? styles.largeMetric : ''}`}>
    <dt>{label}</dt><dd className={value === 'Unavailable' ? styles.unavailableValue : undefined}>{value}</dd>
    {detail && <p>{detail}</p>}
  </div>;
}

/** Source-backed overview. Existing edit and tag workflows are handed back to the roster. */
export function CreatorOverviewDrawer({ creator, periodLabel, start, end, range, onClose, onEdit, onEditTags }: Props) {
  const [open, setOpen] = useState(true);
  const closeButton = useRef<HTMLButtonElement>(null);
  const handoff = useRef(false);
  const opener = useRef(typeof document === 'undefined' ? null : document.activeElement as HTMLElement | null);
  const brandMeta = useBrandMeta();
  const handle = creator.handles?.[0] || creator.account_1;
  const name = creator.real_name || handle || 'Creator';
  const studio = creator.studio;
  const agreement = studio?.agreement;
  const delivery = studio?.delivery;
  const month = monthName(studio?.month);
  const tags = creator.creator_tags ?? [];
  const historical = agreement?.source === 'ledger';
  const rate = agreement ? agreement.retainer : creator.retainer;
  const requirement = agreement ? agreement.requiredPosts : creator.monthly_post_requirement;
  const affiliate = agreement?.partnershipType === 'affiliate' || agreement?.status === 'affiliate';
  const agreementBasis = historical && !agreement.comparable ? 'agreement period' : 'month';
  const agreementStatus = agreement?.status === 'ended' ? 'Agreement ended'
    : agreement?.status === 'awaiting_renewal' ? 'Awaiting renewal' : null;
  const terms = affiliate ? 'Affiliate'
    : `${rate != null ? `${formatCurrency(rate)} / ${agreementBasis}` : 'Rate unavailable'}${requirement != null ? ` · ${number(requirement)} videos / ${agreementBasis}` : ''}`;
  const delta = creator.gmv_delta;
  const comparison = delta != null && Number.isFinite(delta)
    ? `${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(1)}% vs prior period` : 'No prior comparison';
  const profileParams = new URLSearchParams();
  if (creator.brand) profileParams.set('brand', creator.brand);
  if (start && end) { profileParams.set('range', 'custom'); profileParams.set('start', start); profileParams.set('end', end); }
  else if (range) profileParams.set('range', range);
  const profileHref = creator.creator_id
    ? `/creators/${encodeURIComponent(creator.creator_id)}${profileParams.size ? `?${profileParams}` : ''}` : null;
  const agreementDates = agreement?.periodStart && agreement.periodEnd
    ? `${date(agreement.periodStart)} to ${date(agreement.periodEnd)}` : null;
  const contextTitle = agreement?.status === 'awaiting_renewal' ? 'Review the agreement renewal'
    : agreement?.status === 'ended' ? 'Review the ended agreement'
      : affiliate ? 'Affiliate partnership' : 'Review qualifying delivery';
  const contextCopy = agreement?.status === 'awaiting_renewal' ? 'This month’s agreement needs renewal before its delivery can be assessed.'
    : agreement?.status === 'ended' ? 'The recorded agreement has ended. Review the full profile for its terms and history.'
      : affiliate ? 'There is no monthly deliverable requirement for this agreement. Review publishing and sales for the next coaching conversation.'
        : delivery?.published != null ? `${number(delivery.published)} publications are recorded for ${month}. A qualifying-delivery record is not available.`
          : 'Review the creator’s videos and agreement before assessing qualifying delivery. Monthly publishing data is not available.';

  // Allow the specified closing transition to finish before the parent removes the drawer.
  useEffect(() => {
    if (open) return;
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180;
    const timer = window.setTimeout(onClose, delay);
    return () => window.clearTimeout(timer);
  }, [open, onClose]);

  const transfer = (action: () => void) => {
    handoff.current = true;
    action();
  };

  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Portal>
      <Dialog.Overlay className={styles.overlay} />
      <Dialog.Content className={styles.drawer} data-lenis-prevent
        onOpenAutoFocus={event => { event.preventDefault(); closeButton.current?.focus(); }}
        onCloseAutoFocus={event => { event.preventDefault(); if (!handoff.current && opener.current?.isConnected) opener.current.focus(); }}>
        <header className={styles.header}>
          <Dialog.Title>Creator overview</Dialog.Title>
          <div className={styles.headerActions}>
            {onEdit && <Button size="sm" variant="ghost" className={styles.editAction} onClick={() => transfer(onEdit)}><Pencil size={14} aria-hidden="true" />Edit details</Button>}
            <Dialog.Close asChild><Button ref={closeButton} size="icon" variant="ghost" className={styles.close} aria-label="Close creator overview"><X size={16} aria-hidden="true" /></Button></Dialog.Close>
          </div>
        </header>
        <Dialog.Description className="sr-only">{name}’s creator performance for {periodLabel}, with separately recorded monthly agreement and delivery information.</Dialog.Description>
        <div className={styles.scroller}>
          <div className={styles.content}>
            <div className={styles.identity}>
              <CreatorPortrait creatorId={creator.creator_id} source={creator.discord_avatar} name={name} className={styles.portrait} />
              <div><h3>{name}</h3><p>{handle ? `@${handle}` : 'No linked TikTok handle'}{creator.brand ? ` · ${brandMeta.label(creator.brand)}` : ''}</p></div>
            </div>
            <div className={styles.tagLine}>
              <div className={styles.tags}>{tags.length ? tags.map(tag => <span key={tag}>{tag}</span>) : <p className={styles.noTags}>No creator tags</p>}</div>
              {onEditTags && <Button size="sm" variant="ghost" className={styles.textAction} onClick={() => transfer(onEditTags)}>Edit tags</Button>}
            </div>
            <p className={styles.period}>{periodLabel} · Selected-period results</p>
            <dl className={styles.metrics} aria-label="Selected-period creator performance">
              <Metric label="GMV" value={Number.isFinite(creator.gmv_period) ? formatCurrency(creator.gmv_period) : 'Unavailable'} detail={comparison} large />
              <Metric label="Videos published" value={number(creator.posts_period)} detail="Recorded within selected dates" large />
              <Metric label="Orders" value={number(creator.orders_period)} />
              <Metric label="Units sold" value={number(creator.units_period)} />
            </dl>
            <section className={styles.agreement} aria-label="Creator agreement">
              <h4>{historical ? `${month} agreement` : 'Current roster terms'}</h4>
              <strong>{agreementStatus ?? terms}</strong>
              {agreementStatus && <p>Recorded terms: {terms}</p>}
              {agreementDates && <p>Agreement period: {agreementDates}</p>}
              {!agreementDates && date(creator.joined) && <p>Joined roster: {date(creator.joined)}</p>}
              <p>{historical ? 'Saved agreement terms. Prior versions remain in the agreement history.' : 'Unverified current terms. These do not confirm an earlier month’s agreement.'}</p>
            </section>
            <section className={styles.delivery} aria-label="Monthly publishing and delivery">
              <h4>{affiliate ? 'No monthly requirement' : delivery?.published != null ? `${number(delivery.published)} recorded videos in ${month}` : 'Monthly publishing unavailable'}</h4>
              {!affiliate && requirement != null && <p className={styles.requirement}>{number(requirement)} videos / {agreementBasis} in the {historical ? 'recorded agreement' : 'unverified current roster terms'}</p>}
              <p>{affiliate ? 'Affiliate agreement · No monthly deliverables.' : 'Recorded publications are separate from qualifying delivery. A qualifying count and pace are not available.'}</p>
              {delivery && <p>{date(delivery.start)} to {date(delivery.through)}</p>}
            </section>
            <section className={styles.context} aria-label="Next review">
              <h4>{contextTitle}</h4>
              {studio?.owner && <p className={styles.owner}>{studio.owner.name} · {studio.owner.role}</p>}
              {!studio?.owner && <p className={styles.owner}>{studio?.ownerStatus === 'unassigned' ? 'Brand manager unassigned' : 'Brand manager unavailable'}</p>}
              <p>{contextCopy}</p>
              <p className={styles.contextNote}>Creator tags organize the roster. Discord identity and role sync are tracked separately.</p>
            </section>
          </div>
        </div>
        <footer className={styles.footer}>
          {profileHref ? <Link href={profileHref} className={styles.primaryAction} onClick={() => { handoff.current = true; }}>Open full profile</Link>
            : onEdit ? <Button onClick={() => transfer(onEdit)} className={styles.primaryAction}>Edit creator details</Button>
              : <span className={styles.missingProfile}>Creator profile not linked</span>}
          <Dialog.Close asChild><Button size="sm" variant="outline" className={styles.footerClose}>Close</Button></Dialog.Close>
        </footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
