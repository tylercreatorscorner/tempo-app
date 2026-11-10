import type { ReactNode } from 'react';
import Link from 'next/link';
import { ExternalLink, Video } from 'lucide-react';
import { VideoThumbnail } from '@/components/dashboard/video-thumbnail';
import { CoachingBrief } from '@/components/creators/coaching-brief';
import { formatCurrency, isCanonicalVideoUrl } from '@/lib/utils/format';
import type { RosterStudioData } from '@/lib/roster/studio-types';
import { ProfileWorkspaceLink } from './studio-profile-workspace';
import styles from './studio-profile-reviews.module.css';

export interface ProfilePublicationVideo {
  videoId: string;
  url: string | null;
  title?: string | null;
  publishedAt?: string | null;
  thumbnailUrl?: string | null;
  creatorHandle?: string | null;
}

export interface CreatorDeliveryReviewProps {
  creatorName: string;
  brandLabel: string;
  asOf: string;
  studio?: RosterStudioData;
  videos?: ProfilePublicationVideo[];
  evidenceStatus: 'ready' | 'denied' | 'unavailable';
  allVideosHref?: string;
}

export interface CreatorCoachingReviewProps {
  creatorName: string;
  brandLabel: string;
  brand?: string | null;
  studio?: RosterStudioData;
  brandNotes?: string | null;
  sharedNotes?: string | null;
  brief?: ReactNode;
}

function date(value?: string | null) {
  if (!value) return null;
  const calendarDate = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = new Date(calendarDate ? `${value}T12:00:00Z` : value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: calendarDate ? 'UTC' : 'America/Chicago',
  }) : null;
}

function month(value: string) {
  return /^\d{4}-\d{2}/.test(value)
    ? new Date(`${value.slice(0, 7)}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })
    : 'Monthly';
}

function evidenceUrl(video: ProfilePublicationVideo) {
  return video.url && isCanonicalVideoUrl(video.url) ? video.url : null;
}

function EvidenceRow({ video }: { video: ProfilePublicationVideo }) {
  const url = evidenceUrl(video);
  return <article className={styles.evidenceRow}>
    <div className={styles.thumbnail} aria-hidden="true">
      {url ? <VideoThumbnail url={url} /> : <span className={styles.coverUnavailable}><Video size={17} /></span>}
    </div>
    <div className={styles.evidenceCopy}>
      <h4>{video.title?.trim() || 'Published video'}</h4>
      <p>{date(video.publishedAt) || 'Publication date unavailable'}{video.creatorHandle ? ` · @${video.creatorHandle.replace(/^@+/, '')}` : ''}</p>
      <p className={styles.recorded}>Recorded publication</p>
      {url ? <a href={url} target="_blank" rel="noopener noreferrer">Open TikTok video<ExternalLink size={12} aria-hidden="true" /></a> : <span className={styles.muted}>Video link unavailable</span>}
    </div>
  </article>;
}

/** Monthly publication evidence is kept separate from acceptance and agreement pace. */
export function CreatorDeliveryReview({ creatorName, brandLabel, asOf, studio, videos = [], evidenceStatus, allVideosHref }: CreatorDeliveryReviewProps) {
  const agreement = studio?.agreement;
  const delivery = studio?.delivery;
  const monthName = month(studio?.month || asOf);
  const published = delivery?.published;
  const periodTerms = agreement?.source === 'ledger' && !agreement.comparable;
  const basis = periodTerms ? 'agreement period' : 'month';
  const affiliate = agreement?.partnershipType === 'affiliate' || agreement?.status === 'affiliate';
  const status = agreement?.status === 'ended' ? 'Agreement ended'
    : agreement?.status === 'awaiting_renewal' ? 'Awaiting renewal' : null;
  const evidence = [...new Map(videos.filter(video => video.videoId).map(video => [video.videoId, video])).values()];
  const dates = agreement?.periodStart && agreement.periodEnd
    ? `${date(agreement.periodStart)} to ${date(agreement.periodEnd)}` : null;
  const firstVideos = evidence.slice(0, 2);
  const remainingVideos = evidence.slice(2);

  return <div className={styles.review}>
    <p className={styles.context}>{creatorName} · {brandLabel}</p>
    <section className={styles.summary} aria-label={`${monthName} recorded publishing`}>
      <p className={styles.eyebrow}>{monthName} publishing</p>
      <strong>{published == null ? 'Unavailable' : `${published.toLocaleString('en-US')} published`}</strong>
      <p>{delivery ? `${date(delivery.start)} to ${date(delivery.through)}` : `Through ${date(asOf) || asOf}`}</p>
      <p className={styles.muted}>Qualifying delivery and pace are unverified.</p>
    </section>
    <p className={styles.explanation}>Recorded publications show the videos Tempo can identify. Acceptance depends on the agreement’s dates and qualifying rules.</p>
    <section className={styles.card} aria-label="Applicable agreement context">
      <p className={styles.eyebrow}>{agreement?.source === 'ledger' ? 'Recorded agreement' : agreement?.source === 'current' ? 'Current roster terms' : 'Agreement unavailable'}</p>
      {status && <h3>{status}</h3>}
      <strong>{affiliate ? 'Affiliate' : agreement?.retainer != null ? `${formatCurrency(agreement.retainer)} / ${basis}` : 'Rate unavailable'}</strong>
      <p>{affiliate ? 'No monthly requirement' : agreement?.requiredPosts != null ? `${agreement.requiredPosts} videos / ${basis}` : 'Post requirement unavailable'}</p>
      <p className={styles.muted}>{dates || 'Historical agreement dates are unverified.'}</p>
      <ProfileWorkspaceLink section="agreements" className={styles.textAction}>Review agreement history</ProfileWorkspaceLink>
    </section>
    <section className={styles.evidence} aria-label="Recorded video evidence">
      <div className={styles.heading}><h3>Video evidence</h3>{evidenceStatus === 'ready' && <span>{evidence.length.toLocaleString('en-US')} recorded videos</span>}</div>
      {evidenceStatus === 'denied' ? <div className={styles.empty}>These video links are outside your current brand access.</div>
        : evidenceStatus === 'unavailable' ? <div className={styles.empty}>Video evidence is temporarily unavailable. Refresh the profile to try again.</div>
          : firstVideos.length ? <>
            {firstVideos.map(video => <EvidenceRow key={video.videoId} video={video} />)}
            {remainingVideos.length > 0 && <details className={styles.moreEvidence}>
              <summary>View all {evidence.length.toLocaleString('en-US')} recorded videos</summary>
              <div>{remainingVideos.map(video => <EvidenceRow key={video.videoId} video={video} />)}</div>
            </details>}
          </> : <div className={styles.empty}>No publication links are recorded for this creator in this month.</div>}
      {allVideosHref && <Link className={styles.secondaryAction} href={allVideosHref}>Explore recorded videos</Link>}
    </section>
    <section className={styles.card}>
      <h3>Review a discrepancy</h3>
      <p>Compare the video links with the applicable terms before changing a delivery count or an agreement.</p>
      <div className={styles.actions}><ProfileWorkspaceLink section="agreements" className={styles.secondaryAction}>Review terms</ProfileWorkspaceLink><ProfileWorkspaceLink section="content" className={styles.textAction}>Selected-period content</ProfileWorkspaceLink></div>
    </section>
  </div>;
}

/** Existing notes and a private working brief, without invented coaching assignments. */
export function CreatorCoachingReview({ creatorName, brandLabel, brand, studio, brandNotes, sharedNotes, brief }: CreatorCoachingReviewProps) {
  const specificNotes = brandNotes?.trim();
  const creatorNotes = sharedNotes?.trim();
  const owner = studio?.owner;
  const workspaceHref = `/reporting/coaching${brand ? `?${new URLSearchParams({ brand })}` : ''}`;

  return <div className={styles.review}>
    <p className={styles.context}>{creatorName} · {brandLabel}</p>
    <span className={styles.tag}>Coaching context</span>
    <h3 className={styles.lead}>Prepare the next conversation</h3>
    <p className={styles.context}>{owner ? `${owner.name} · ${owner.role}` : studio?.ownerStatus === 'unassigned' ? 'Brand manager unassigned' : 'Brand manager unavailable'}</p>
    {specificNotes && <section className={styles.card}><h3>{brandLabel} notes</h3><p className={styles.notes}>{specificNotes}</p></section>}
    {creatorNotes && <section className={styles.card}><h3>Shared creator notes</h3><p className={styles.notes}>{creatorNotes}</p></section>}
    {!specificNotes && !creatorNotes && <section className={styles.card}><h3>No coaching notes recorded</h3><p>Review the creator’s videos and add context during the next coaching conversation.</p></section>}
    <section className={styles.nextAction}><h3>Next review</h3><p>Use the content and recorded terms to agree on the next experiment and follow-up.</p><ProfileWorkspaceLink section="content" className={styles.textAction}>Review creator content</ProfileWorkspaceLink></section>
    <section className={styles.brief} aria-label="Private coaching brief">{brief ?? <CoachingBrief creator={creatorName} brand={brandLabel} />}</section>
    <div className={styles.actions}><Link href={workspaceHref} className={styles.primaryAction}>Open coaching workspace</Link><ProfileWorkspaceLink section="coaching" className={styles.secondaryAction}>Open coaching context</ProfileWorkspaceLink></div>
    <p className={styles.explanation}>Shared Discord feedback submissions are not linked to this creator profile yet.</p>
  </div>;
}
