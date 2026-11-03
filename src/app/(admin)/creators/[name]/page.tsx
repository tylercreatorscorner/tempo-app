export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { can } from '@/lib/auth/permissions';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { getDataAnchorDate } from '@/lib/data/data-anchor';
import { resolveDateRange } from '@/lib/data/date-utils';
import { getBrandRegistry, activeBrandSlugs, brandLabel, slugToUuid } from '@/lib/data/brand-registry';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import {
  getCreatorProfile, getCreatorIdByHandle, getCreatorBrandRelationship, getCreatorSummary,
  getCreatorVideos, getCreatorBrandBreakdown, getCreatorLifetimeStats, getCreatorChangeHistory,
  getCreatorTopContent, getCreatorAccountBreakdown,
} from '@/lib/data/creator-profile';
import { getCreatorStudioContracts, getCreatorPublicationEvidence, type CreatorStudioContract } from '@/lib/data/creator-profile-studio';
import { CreatorPortrait } from '@/components/creators/creator-portrait';
import { CreatorEditButton } from '@/components/creators/creator-edit-panel';
import { CreatorChangeHistory } from '@/components/creators/creator-change-history';
import { ReportingStartDate } from '@/components/creators/reporting-start-date';
import { AgreementWorkspace } from '@/components/creators/agreement-workspace';
import { RelationshipHistory } from '@/components/creators/relationship-history';
import { ProfilePerformanceHistory } from '@/components/creators/performance/profile-history';
import { ProfileHeadlineMetrics } from '@/components/creators/performance/profile-headline-metrics';
import { BrandFilter } from '@/components/creators/brand-filter';
import { BrandIdentity } from '@/components/creators/brand-identity';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { ProfileVideoGrid } from '@/components/creators/profile-video-grid';
import { CoachingBrief } from '@/components/creators/coaching-brief';
import { VideoTitleButton } from '@/components/video/video-title-button';
import { SetBreadcrumb } from '@/components/layout/breadcrumb-context';
import { CreatorProfileWorkspace, ProfileWorkspaceLink, ProfileReviewButton } from '@/components/creators/studio-profile-workspace';
import { ProfileCreatorTags, StudioVideoCover, ProfileRefreshButton } from '@/components/creators/studio-profile-controls';
import { CreatorDeliveryReview, CreatorCoachingReview } from '@/components/creators/studio-profile-reviews';
import styles from '@/components/creators/studio-profile.module.css';

interface Props {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ range?: string; brand?: string; start?: string; end?: string }>;
}

function date(value?: string | null) {
  if (!value) return null;
  const calendar = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = new Date(calendar ? `${value}T12:00:00Z` : value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: calendar ? 'UTC' : 'America/Chicago',
  }) : null;
}

function ContractTerms({ contract, canViewCost }: { contract: CreatorStudioContract; canViewCost: boolean }) {
  const agreement = contract.studio.agreement;
  const basis = agreement.source === 'ledger' && !agreement.comparable ? 'agreement period' : 'month';
  const affiliate = agreement.partnershipType === 'affiliate';
  return <>
    {agreement.status === 'ended' && <p>Agreement ended</p>}
    {agreement.status === 'awaiting_renewal' && <p>Awaiting renewal</p>}
    {affiliate ? <strong>Affiliate</strong> : canViewCost && <strong>{agreement.retainer == null ? 'Fee unavailable' : `${formatCurrency(agreement.retainer)} / ${basis}`}</strong>}
    <p>{affiliate ? 'No monthly deliverables' : agreement.requiredPosts == null ? 'Deliverable requirement unavailable' : `${agreement.requiredPosts} videos / ${basis}`}</p>
    {agreement.periodStart && agreement.periodEnd ? <p>{date(agreement.periodStart)} to {date(agreement.periodEnd)}</p> : contract.retainerStartDate ? <p>Recorded partnership start: {date(contract.retainerStartDate)}</p> : <p>Partnership date not recorded</p>}
    {agreement.source !== 'ledger' && <p>Current roster terms. Historical terms are unverified.</p>}
  </>;
}

async function DeliveryEvidence({ creatorId, creatorName, selectedBrand, label, end, contract }: {
  creatorId: string; creatorName: string; selectedBrand: string | null; label: string; end: string; contract: CreatorStudioContract | null;
}) {
  const evidence = selectedBrand ? await getCreatorPublicationEvidence(creatorId, selectedBrand, `${end.slice(0, 7)}-01`, end) : null;
  return <CreatorDeliveryReview creatorName={creatorName} brandLabel={label} asOf={end} studio={contract?.studio}
    videos={evidence?.status === 'ready' ? evidence.videos.map(video => ({ ...video, url: video.watchUrl })) : []}
    evidenceStatus={evidence?.status ?? 'unavailable'} />;
}

export default async function CreatorDetailPage({ params, searchParams }: Props) {
  const [{ name }, sp, scope] = await Promise.all([params, searchParams, getWorkspaceScope()]);
  if (!scope) redirect('/login');
  if (!can(scope, 'roster', 'read')) return <div className={styles.page}><div className={styles.empty}><h1>Creator profile unavailable</h1><p>Your workspace access does not include creator records.</p><Link href="/dashboard" className={styles.back}>Return to dashboard</Link></div></div>;
  const slug = decodeURIComponent(name);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
  const creatorId = isUuid ? slug : await getCreatorIdByHandle(slug);
  if (!creatorId) return <div className={styles.page}><Link href="/roster" className={styles.back}><ArrowLeft size={14} />Back to creators</Link><div className={styles.empty}><h1>Profile not linked yet</h1><p>Link this roster entry to a creator identity to view performance and history.</p></div></div>;
  if (!isUuid) {
    const query = new URLSearchParams();
    for (const key of ['brand', 'range', 'start', 'end'] as const) if (sp[key]) query.set(key, sp[key]!);
    redirect(`/creators/${creatorId}${query.size ? `?${query}` : ''}`);
  }
  const [profile, registry] = await Promise.all([getCreatorProfile(creatorId), getBrandRegistry()]);
  if (!profile) notFound();
  const active = new Set(activeBrandSlugs(registry));
  const brands = profile.brands.filter(brand => active.has(brand));
  const brandsWithData = profile.brandsWithData.filter(brand => active.has(brand));
  const selectedBrand = sp.brand && sp.brand !== 'all' ? sp.brand : null;
  if (selectedBrand && !brands.includes(selectedBrand)) return <div className={styles.page}><Link href={`/creators/${creatorId}`} className={styles.back}><ArrowLeft size={14} />Authorized brand relationships</Link><div className={styles.empty}><h1>Brand view unavailable</h1><p>Choose an authorized brand relationship to view this creator.</p></div></div>;
  const canViewCost = scope.canViewCreatorCost;
  const canEdit = can(scope, 'roster', 'write') && !scope.impersonating;
  const accounts = [...new Map(profile.accounts.map(account => [account.tiktok_username.trim().toLowerCase(), account])).values()];
  const dataThrough = await getDataAnchorDate(selectedBrand ? [selectedBrand] : brandsWithData.length ? brandsWithData : null);
  const { startDate, endDate, lagDays, anchorDate } = resolveDateRange(sp.range, sp.start, sp.end, dataThrough);
  const brandId = selectedBrand ? slugToUuid(registry, selectedBrand) ?? null : null;
  const label = selectedBrand ? brandLabel(registry, selectedBrand) : 'Authorized brands';
  const [contractsResult, summary, fetchedVideos, brandRows, lifetime, topContent, accountRows, relationship] = await Promise.all([
    getCreatorStudioContracts(creatorId, endDate, selectedBrand ?? undefined),
    getCreatorSummary(creatorId, startDate, endDate, selectedBrand ?? undefined),
    getCreatorVideos(creatorId, startDate, endDate, 12, selectedBrand ?? undefined),
    selectedBrand ? Promise.resolve([]) : getCreatorBrandBreakdown(creatorId, startDate, endDate),
    selectedBrand ? Promise.resolve(null) : getCreatorLifetimeStats(creatorId),
    getCreatorTopContent(creatorId, startDate, endDate, 6, selectedBrand ?? undefined),
    getCreatorAccountBreakdown(creatorId, startDate, endDate, selectedBrand ?? undefined),
    getCreatorBrandRelationship(creatorId, brandId),
  ]);
  const allContracts = contractsResult.contracts.filter(contract => active.has(contract.brand)).map(contract => canViewCost ? contract : ({
    ...contract, studio: { ...contract.studio, agreement: { ...contract.studio.agreement, retainer: null } },
  }));
  const visibleContracts = selectedBrand ? allContracts.filter(contract => contract.brand === selectedBrand) : allContracts;
  const currentContract = selectedBrand && visibleContracts.length === 1 ? visibleContracts[0] : null;
  const studio = currentContract?.studio;
  const agreement = studio?.agreement;
  const owner = studio?.owner;
  const changes = await getCreatorChangeHistory(visibleContracts.map(contract => contract.managedId), canViewCost);
  const datesByVideo = new Map(topContent.map(video => [video.videoId, video.postDate]));
  const videos = fetchedVideos.map(video => ({ ...video, posted_date: video.posted_date ?? datesByVideo.get(video.video_id) ?? null }));
  const leadingVideo = videos[0];
  const monthName = new Date(`${endDate.slice(0, 7)}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  const recordedMonth = studio?.delivery.published;
  const status = selectedBrand ? relationship.status : profile.status;
  const scopeHint = `${label} · ${date(startDate)} to ${date(endDate)}`;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  const empty = <div className={styles.empty}>No recorded activity in this period. Select another date range to explore earlier results.</div>;
  const contractWarning = contractsResult.status !== 'ready' ? 'Agreement context could not be loaded.' : visibleContracts.length > 1 && selectedBrand ? 'Multiple roster records exist for this brand. Review their terms individually.' : null;

  const identity = <section className={styles.identity} aria-label="Creator identity">
    <div className={styles.identityHeader}><CreatorPortrait creatorId={creatorId} name={profile.real_name} className={styles.portrait} /><div className={styles.name}><h1>{profile.real_name}</h1><p>{accounts[0] ? `@${accounts[0].tiktok_username}` : 'TikTok account not linked'}</p></div></div>
    <div className={styles.tags}>{currentContract ? <ProfileCreatorTags brand={currentContract.brand} managedId={currentContract.managedId} tags={currentContract.creatorTags} /> : <span className={styles.tag}>{selectedBrand ? 'Tags by roster record' : 'Tags by brand'}</span>}{status && <span className={styles.tag}>{status}</span>}</div>
    <div className={styles.identityDetails}><strong>{label}</strong><p>{currentContract?.retainerStartDate ? `Partnership since ${date(currentContract.retainerStartDate)}` : selectedBrand ? 'Partnership date not recorded' : `${brands.length} authorized brand relationships`}</p>
      <div className={styles.owner}>{owner ? <><CreatorPortrait name={owner.name} source={owner.avatar} className="size-6 shrink-0 rounded-full object-cover" /><div><p>Brand manager</p><strong>{owner.name}</strong></div></> : <p>{selectedBrand ? 'Brand manager not available' : 'Select a brand for its manager'}</p>}</div>
    </div>
    <div className={styles.connections}><span className={styles.eyebrow}>Connected accounts</span><ul className={styles.accountList}>{accounts.map(account => <li key={account.tiktok_username}><a href={`https://www.tiktok.com/@${encodeURIComponent(account.tiktok_username)}`} target="_blank" rel="noopener noreferrer">@{account.tiktok_username}<ExternalLink size={11} aria-hidden="true" /></a></li>)}</ul><p>{accounts.length} linked TikTok {accounts.length === 1 ? 'account' : 'accounts'}</p></div>
    <div className={styles.identityActions}>{canEdit && <CreatorEditButton key={`${creatorId}:${selectedBrand??"all"}`} creator={{ id: profile.id, real_name: profile.real_name, email: profile.email, phone: profile.phone, role: relationship.role, status: relationship.status, notes: profile.notes, accounts: profile.accounts.map(account => ({ tiktok_username: account.tiktok_username, is_primary: account.is_primary })), brandId: visibleContracts.length > 1 && selectedBrand ? null : brandId, brandLabel: selectedBrand ? label : null, brandNotes: currentContract?.notes ?? null }} />}
      {['owner', 'admin'].includes(scope.role) && !scope.impersonating && <a href={`/api/admin/view-as-creator?creatorId=${profile.id}`} target="_blank" rel="noopener noreferrer">Creator portal<ExternalLink size={12} aria-hidden="true" /></a>}
    </div>
  </section>;

  const headline = <><div className={styles.mobileTitle}><strong>Creator profile</strong><p>Identity, results and the next conversation.</p></div><div className={styles.heading}><h2>Creator performance</h2><p className={styles.freshness}>Sales through {date(dataThrough ?? endDate)} · {date(startDate)} to {date(endDate)}<ProfileRefreshButton /></p></div><Suspense fallback={<p className={styles.notice} role="status">Loading selected-period metrics…</p>}><ProfileHeadlineMetrics creatorId={creatorId} start={startDate} end={endDate} brand={selectedBrand ?? undefined} label={label} summary={summary} appearance="studio" /></Suspense></>;

  const overview = <div className={styles.stack}>
    {leadingVideo ? <article className={styles.videoHero}><div className={styles.heroCover}><StudioVideoCover video={{ ...leadingVideo, date_range: `${startDate} to ${endDate}` }} /></div><div className={styles.heroCopy}><span className={styles.eyebrow}>Top period video</span><h2>{leadingVideo.video_title || 'Leading video'}</h2><p>Leading tracked content by GMV for the selected dates.</p><strong className={styles.videoMetric}>{formatCurrency(leadingVideo.gmv)} GMV</strong><p className={styles.videoFacts}>{formatNumber(leadingVideo.orders)} orders · {formatNumber(leadingVideo.items_sold)} units</p><p className={styles.videoMeta}>{leadingVideo.posted_date ? `Published ${date(leadingVideo.posted_date)}` : 'Publication date unavailable'}</p><VideoTitleButton videoData={{ ...leadingVideo, date_range: `${startDate} to ${endDate}` }} className={styles.primaryAction}>Open video</VideoTitleButton></div></article> : empty}
    <section className={styles.section}><div className={styles.sectionHead}><h2>Recent activity</h2><ProfileWorkspaceLink section="activity">View history</ProfileWorkspaceLink></div><ul className={styles.activityList}>{changes.slice(0, 2).map(change => <li key={change.id}><span>{date(change.changedAt)}</span><p>{change.action === 'create' ? 'Roster record created' : change.action === 'archive' ? 'Roster record archived' : 'Roster record updated'}{!selectedBrand && change.brand ? ` · ${brandLabel(registry, change.brand)}` : ''}</p></li>)}{!changes.length && <li><p>No recent roster changes recorded.</p></li>}</ul></section>
    <Suspense fallback={<p className={styles.notice} role="status">Loading performance trend…</p>}><ProfilePerformanceHistory creatorId={creatorId} start={startDate} end={endDate} brand={selectedBrand ?? undefined} label={label} /></Suspense>
    {!selectedBrand && <section className={styles.section}><div className={styles.sectionHead}><h2>Brand performance</h2></div><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Brand</th><th>GMV</th><th>Orders</th><th>Units</th></tr></thead><tbody>{brandRows.filter(row => active.has(row.brand)).sort((a, b) => b.gmv - a.gmv).map(row => <tr key={row.brand}><td><Link href={`/creators/${creatorId}?${new URLSearchParams({brand:row.brand,range:'custom',start:startDate,end:endDate})}`}><BrandIdentity brand={row.brand} label={brandLabel(registry, row.brand)} /></Link></td><td>{formatCurrency(row.gmv)}</td><td>{formatNumber(row.orders)}</td><td>{formatNumber(row.items_sold)}</td></tr>)}</tbody></table></div></section>}
  </div>;

  const content = <div className={styles.stack}><div className={styles.sectionHead}><div><h2>Content driving revenue</h2><p>{scopeHint}</p></div></div><ProfileVideoGrid videos={videos} start={startDate} end={endDate} labels={Object.fromEntries(brands.map(brand => [brand, brandLabel(registry, brand)]))} appearance="studio" /><section className={styles.section}><div className={styles.sectionHead}><h2>Linked account performance</h2></div><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Account</th><th>GMV</th><th>Orders</th><th>Units</th><th>Explore</th></tr></thead><tbody>{accountRows.map(account => <tr key={account.tiktok_username}><td>@{account.tiktok_username}</td><td>{formatCurrency(account.gmv)}</td><td>{formatNumber(account.orders)}</td><td>{formatNumber(account.items_sold)}</td><td><Link className={styles.textAction} href={`/posts?${new URLSearchParams({creator:account.tiktok_username,range:'custom',start:startDate,end:endDate,...(selectedBrand?{brand:selectedBrand}:{})})}`}>Videos by age</Link></td></tr>)}</tbody></table></div></section><section className={styles.section}><div className={styles.sectionHead}><h2>Content by views</h2></div><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Video</th><th>Views</th><th>Likes</th><th>GMV</th></tr></thead><tbody>{topContent.map(video => <tr key={video.videoId}><td><VideoTitleButton videoData={{video_id:video.videoId,video_title:video.title,creator_name:videos.find(row=>row.video_id===video.videoId)?.creator_name || accounts[0]?.tiktok_username || '',brand:video.brand ?? undefined,gmv:video.gmv}} className={styles.textAction}>{video.title || 'Review video'}</VideoTitleButton></td><td>{formatNumber(video.views)}</td><td>{formatNumber(video.likes)}</td><td>{formatCurrency(video.gmv)}</td></tr>)}</tbody></table></div></section></div>;

  const agreements = <div className={styles.stack}><section className={styles.section}><div className={styles.sectionHead}><div><h2>Agreement context</h2><p>Terms for the month ending {date(endDate)}. Current fees are never projected backward.</p></div></div>{contractWarning && <p className={styles.notice}>{contractWarning}</p>}{visibleContracts.map(contract => <article key={contract.managedId} className={styles.asideCard}><h3><BrandIdentity brand={contract.brand} label={brandLabel(registry, contract.brand)} /></h3><ContractTerms contract={contract} canViewCost={canViewCost} />{canEdit && <ReportingStartDate key={`${contract.managedId}:${contract.reportingStartDate}`} managedId={contract.managedId} startDate={contract.reportingStartDate} brand={brandLabel(registry, contract.brand)} />}</article>)}{!visibleContracts.length && <p className={styles.empty}>No agreement records are available in this brand view.</p>}</section>
    {process.env.CREATOR_AGREEMENTS_ENABLED === 'true' && canViewCost && can(scope, 'roster', 'read') && <AgreementWorkspace key={`${creatorId}:${selectedBrand??"all"}`} creatorId={creatorId} brands={(selectedBrand ? brands.filter(brand => brand === selectedBrand) : brands).flatMap(brand => { const id=slugToUuid(registry,brand); return id?[{value:id,label:brandLabel(registry,brand)}]:[]; })} today={today} initialMonth={endDate.slice(0,7)} canWrite={canEdit} canSave={process.env.CREATOR_AGREEMENTS_WRITES_ENABLED === 'true'} readOnlyLoad />}
    <Suspense fallback={<p className={styles.notice}>Loading renewal evidence…</p>}><RelationshipHistory compact creatorId={creatorId} brand={selectedBrand ?? undefined} end={endDate} label={label} /></Suspense>
    <section className={styles.section}><div className={styles.sectionHead}><div><h2>Recorded term changes</h2><p>Edit dates show when Tempo was updated. They may differ from the effective agreement dates.</p></div></div><CreatorChangeHistory agreementOnly entries={changes} brandLabelFor={brand => brand ? brandLabel(registry, brand) : null} multiBrand={!selectedBrand} /></section>
  </div>;

  const coaching = <div className={styles.stack}><section className={styles.section}><div className={styles.sectionHead}><h2>Coaching context</h2><ProfileReviewButton review="coaching">Review notes</ProfileReviewButton></div><p>Discord feedback is creator-initiated in a shared channel. Submissions are not linked to this profile yet.</p>{currentContract?.notes && <div className={styles.coachingNote}><strong>{label} notes</strong><p className="whitespace-pre-wrap">{currentContract.notes}</p></div>}{profile.notes && <div className={styles.coachingNote}><strong>Shared creator notes</strong><p className="whitespace-pre-wrap">{profile.notes}</p></div>}{!profile.notes && !currentContract?.notes && <p>No coaching notes recorded in this view.</p>}<CoachingBrief draftKey={`${creatorId}:${selectedBrand??"all"}`} key={`${creatorId}:${selectedBrand??'all'}`} creator={profile.real_name} brand={label} /><Link href={`/reporting/coaching${selectedBrand?`?brand=${encodeURIComponent(selectedBrand)}`:''}`} className={styles.textAction}>Open coaching workspace</Link></section></div>;

  const activity = <div className={styles.stack}><section className={styles.section}><div className={styles.sectionHead}><h2>Creator activity</h2></div><CreatorChangeHistory entries={changes} brandLabelFor={brand => brand ? brandLabel(registry, brand) : null} multiBrand={!selectedBrand} /></section><Suspense fallback={<p className={styles.notice}>Loading relationship history…</p>}><RelationshipHistory creatorId={creatorId} brand={selectedBrand ?? undefined} end={dataThrough ?? endDate} label={label} /></Suspense>{!selectedBrand && lifetime && <section className={styles.asideCard}><h2>Across authorized brands</h2><strong>{formatCurrency(lifetime.total_gmv)}</strong><p>Recorded lifetime GMV</p><dl className={styles.terms}><div><dt>Orders</dt><dd>{formatNumber(lifetime.total_orders)}</dd></div><div><dt>First activity</dt><dd>{date(lifetime.first_active_date) || 'Not recorded'}</dd></div></dl></section>}</div>;

  const aside = <>
    <section className={styles.actionCard}><span className={styles.eyebrow}>Next action</span><h2>{!selectedBrand ? 'Review a brand relationship' : agreement?.status === 'awaiting_renewal' ? 'Review agreement renewal' : agreement?.status === 'ended' ? 'Review the ended agreement' : 'Review monthly publishing'}</h2><p>{!selectedBrand ? 'Choose a brand to see its agreement and publishing context.' : recordedMonth != null ? `${formatNumber(recordedMonth)} recorded publications in ${monthName}. Check the video evidence against the agreed terms.` : 'Review the available videos and agreement before assessing delivery.'}</p>{selectedBrand ? <ProfileReviewButton review="delivery" className={styles.lightAction}>Review {monthName} publishing</ProfileReviewButton> : <ProfileWorkspaceLink section="agreements" className={styles.lightAction}>View brand agreements</ProfileWorkspaceLink>}</section>
    <section className={styles.asideCard}><div className={styles.sectionHead}><h2>Agreement</h2><ProfileWorkspaceLink section="agreements">View history</ProfileWorkspaceLink></div>{currentContract ? <ContractTerms contract={currentContract} canViewCost={canViewCost} /> : <p>{contractWarning || (selectedBrand ? 'No terms recorded for this relationship.' : 'Select a brand to review its terms.')}</p>}</section>
    <section className={styles.asideCard}><h2>{monthName} publishing</h2><strong>{recordedMonth == null ? 'Unavailable' : `${formatNumber(recordedMonth)} recorded videos`}</strong><p>{date(`${endDate.slice(0,7)}-01`)} to {date(endDate)}</p><p>Qualifying delivery and pace have not been verified.</p>{selectedBrand && <ProfileReviewButton review="delivery">Review video links</ProfileReviewButton>}</section>
    <section className={styles.asideCard}><h2>Coaching</h2><p>{owner ? `${owner.name} · Brand manager` : 'No creator-specific coach linked'}</p><p>{currentContract?.notes ? 'Brand notes are available for review.' : profile.notes ? 'Shared creator notes are available.' : 'Start the next conversation from the creator’s content and agreement.'}</p><ProfileReviewButton review="coaching" className={styles.primaryAction}>Review coaching context</ProfileReviewButton></section>
  </>;

  return <div className={styles.page}>
    <SetBreadcrumb label={profile.real_name} />
    <div className={styles.recordBar}><Link href={`/roster?${new URLSearchParams({...(selectedBrand?{brand:selectedBrand}:{}),range:'custom',start:startDate,end:endDate})}`} className={styles.back}><ArrowLeft size={14} aria-hidden="true" />Creators / {profile.real_name}</Link><div className={styles.scope}><Suspense fallback={null}><BrandFilter appearance="studio" compact brands={brands} brandsWithData={brandsWithData} selectedBrand={selectedBrand} /></Suspense><Suspense fallback={null}><DateRangePicker appearance="studio" label="Creator reporting period" staleThrough={lagDays>0?anchorDate:null} displayRange={{start:startDate,end:endDate}} /></Suspense></div></div>
    <CreatorProfileWorkspace key={creatorId} identity={identity} headline={headline} aside={aside} sections={[{id:'performance',label:'Overview',content:overview},{id:'content',label:'Content',content},{id:'agreements',label:'Agreement',content:agreements},{id:'coaching',label:'Coaching',content:coaching},{id:'activity',label:'Activity',content:activity}]}
      deliveryReview={<Suspense fallback={<p className={styles.notice} role="status">Loading recorded video links…</p>}><DeliveryEvidence creatorId={creatorId} creatorName={profile.real_name} selectedBrand={selectedBrand} label={label} end={endDate} contract={currentContract} /></Suspense>}
      coachingReview={<CreatorCoachingReview creatorName={profile.real_name} brandLabel={label} brand={selectedBrand} studio={studio} brandNotes={currentContract?.notes} sharedNotes={profile.notes} brief={<ProfileWorkspaceLink section="coaching" className={styles.primaryAction}>Prepare coaching brief</ProfileWorkspaceLink>} />} />
  </div>;
}
