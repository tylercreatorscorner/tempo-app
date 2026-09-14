export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { CreatorPortrait } from '@/components/creators/creator-portrait';
import { CreatorEditButton } from '@/components/creators/creator-edit-panel';
import { CreatorChangeHistory } from '@/components/creators/creator-change-history';
import { ProfileSections } from '@/components/creators/profile-sections';
import { RelationshipHistory } from '@/components/creators/relationship-history';
import { ProfilePerformanceHistory } from '@/components/creators/performance/profile-history';
import { BrandFilter } from '@/components/creators/brand-filter';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { VideoTitleButton } from '@/components/video/video-title-button';
import { SetBreadcrumb } from '@/components/layout/breadcrumb-context';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { getDataAnchorDate } from '@/lib/data/data-anchor';
import { resolveDateRange } from '@/lib/data/date-utils';
import { getBrandRegistry, activeBrandSlugs, brandLabel, brandColor, slugToUuid } from '@/lib/data/brand-registry';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { getCreatorProfile, getCreatorIdByHandle, getCreatorContracts, getCreatorBrandRelationship,
  getCreatorSummary, getCreatorVideos, getCreatorBrandBreakdown, getCreatorLifetimeStats,
  getCreatorChangeHistory, getCreatorTopContent, getPostsPublishedThisMonth,
  getCreatorAccountBreakdown } from '@/lib/data/creator-profile';
import styles from '@/components/creators/profile-workspace.module.css';

interface Props {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ range?: string; brand?: string; start?: string; end?: string }>;
}

export default async function CreatorDetailPage({ params, searchParams }: Props) {
  const [{ name }, sp] = await Promise.all([params, searchParams]);
  const slug = decodeURIComponent(name);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
  const creatorId = isUuid ? slug : await getCreatorIdByHandle(slug);
  if (!creatorId) return <div className={styles.page}><Link href="/roster" className={styles.back}><ArrowLeft size={14} /> Back to creators</Link><div className={styles.empty}><h1>Profile not linked yet</h1><p>This roster entry needs a linked creator identity before performance history can be shown.</p></div></div>;
  if (!isUuid) {
    const query = new URLSearchParams();
    for (const key of ['brand', 'range', 'start', 'end'] as const) if (sp[key]) query.set(key, sp[key]!);
    redirect(`/creators/${creatorId}${query.size ? `?${query}` : ''}`);
  }
  const [profile, scope, reg, contracts] = await Promise.all([
    getCreatorProfile(creatorId), getWorkspaceScope(), getBrandRegistry(), getCreatorContracts(creatorId),
  ]);
  if (!scope) redirect('/login');
  if (!profile) notFound();
  const canViewCost = scope.canViewCreatorCost;
  const selectedBrand = sp.brand && sp.brand !== 'all' ? sp.brand : null;
  const activeSlugs = new Set(activeBrandSlugs(reg));
  const brands = profile.brands.filter(brand => activeSlugs.has(brand));
  const brandsWithData = profile.brandsWithData.filter(brand => activeSlugs.has(brand));
  const accounts = [...new Map(profile.accounts.map(account => [account.tiktok_username.trim().toLowerCase(), account])).values()];
  const allContracts = [contracts.primary, ...contracts.others].filter((contract): contract is NonNullable<typeof contract> => !!contract);
  const visibleContracts = selectedBrand ? allContracts.filter(contract => contract.brand === selectedBrand) : allContracts;
  const currentContract = selectedBrand ? visibleContracts[0] : contracts.primary;
  const editBrand = selectedBrand ?? currentContract?.brand ?? null;
  const editBrandId = editBrand ? slugToUuid(reg, editBrand) ?? null : null;
  const dataThrough = await getDataAnchorDate(selectedBrand ? [selectedBrand] : brandsWithData.length ? brandsWithData : null);
  const { startDate, endDate, lagDays, anchorDate } = resolveDateRange(sp.range, sp.start, sp.end, dataThrough);
  const label = selectedBrand ? brandLabel(reg, selectedBrand) : 'Authorized brands';
  const [summary, videos, brandRows, lifetime, changes, topContent, published, accountRows, relationship] = await Promise.all([
    getCreatorSummary(creatorId, startDate, endDate, selectedBrand ?? undefined),
    getCreatorVideos(creatorId, startDate, endDate, 12, selectedBrand ?? undefined),
    getCreatorBrandBreakdown(creatorId, startDate, endDate),
    getCreatorLifetimeStats(creatorId),
    getCreatorChangeHistory(visibleContracts.map(contract => contract.managedId), canViewCost),
    getCreatorTopContent(creatorId, startDate, endDate, 6, selectedBrand ?? undefined),
    currentContract ? getPostsPublishedThisMonth(creatorId, currentContract.brand) : Promise.resolve(null),
    getCreatorAccountBreakdown(creatorId, startDate, endDate, selectedBrand ?? undefined),
    getCreatorBrandRelationship(creatorId, editBrandId),
  ]);
  const monthlyCommitment = visibleContracts.reduce((sum, contract) => sum + contract.retainer, 0);
  const scopeHint = `${label} · ${startDate}–${endDate}`;
  const historyEnd = dataThrough ?? endDate;
  const empty = <div className={styles.empty}>No recorded activity in this period. Select another date range to explore earlier performance.</div>;

  const performance = <div className={styles.grid}>
    <div className={styles.stack}>
      <Suspense fallback={<div className={styles.empty} role="status">Loading twelve months of relationship history…</div>}><RelationshipHistory creatorId={creatorId} brand={selectedBrand ?? undefined} end={historyEnd} label={label} /></Suspense>
      <section className={styles.section}>
        <div className={styles.sectionHead}><div><h2>Brand performance</h2><p>Brands you are authorized to manage · {startDate}–{endDate}</p></div></div>
        <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Brand</th><th>GMV</th><th>Active videos</th>{canViewCost && <th>Current monthly fee</th>}</tr></thead><tbody>
          {brandRows.filter(row => activeSlugs.has(row.brand)).sort((a,b) => b.gmv-a.gmv).map(row => <tr key={row.brand}>
            <td data-label="Brand"><span className={styles.brand}><i style={{background:brandColor(reg,row.brand)}} />{brandLabel(reg,row.brand)}</span></td>
            <td data-label="GMV">{formatCurrency(row.gmv)}</td><td data-label="Active videos">{formatNumber(row.videos)}</td>
            {canViewCost && <td data-label="Current monthly fee">{allContracts.some(contract => contract.brand === row.brand) ? formatCurrency(allContracts.filter(contract => contract.brand === row.brand).reduce((sum,c) => sum+c.retainer,0)) : '—'}</td>}
          </tr>)}
        </tbody></table></div>
      </section>
    </div>
    <aside className={styles.stack}>
      <section className={styles.aside}><p className={styles.eyebrow}>Current relationship</p><h2>{currentContract ? brandLabel(reg,currentContract.brand) : label}</h2>
        <dl><div><dt>Agreement</dt><dd>{currentContract ? 'Current roster terms' : 'No terms recorded'}</dd></div>
          {canViewCost && <div><dt>Monthly fee</dt><dd>{currentContract ? formatCurrency(currentContract.retainer) : '—'}</dd></div>}
          <div><dt>Monthly posts</dt><dd>{currentContract?.monthlyPostRequirement || 'No target recorded'}</dd></div><div><dt>Start date</dt><dd>{currentContract?.retainerStartDate || 'Not recorded'}</dd></div>
        </dl>
      </section>
      <section className={styles.aside}><p className={styles.eyebrow}>Posting reliability</p><h2>This month’s activity</h2>
        {published !== null ? <><div className="mt-5"><strong>{published}</strong><span className="text-xs text-muted-foreground"> published{currentContract?.monthlyPostRequirement ? ` / ${currentContract.monthlyPostRequirement} target` : ''}</span></div>
          {!!currentContract?.monthlyPostRequirement && <div className={styles.progress}><span style={{width:`${Math.min(100, published/currentContract.monthlyPostRequirement*100)}%`}} /></div>}
          <p>{currentContract && brandLabel(reg,currentContract.brand)} · calendar month to date</p></> : <p>No brand-specific posting target available.</p>}
        <dl><div><dt>On-time delivery</dt><dd>Not assessed</dd></div><div><dt>Accepted deliverables</dt><dd>Not recorded</dd></div></dl>
        <p>Publication volume is visible in monthly history. It does not establish whether agreed deliverables were accepted or on time.</p>
      </section>
      <section className={styles.aside}><p className={styles.eyebrow}>Across the relationship</p><div className="mt-3"><strong>{formatCurrency(lifetime.total_gmv)}</strong></div><p>Recorded lifetime GMV · authorized brands</p><dl><div><dt>Orders</dt><dd>{formatNumber(lifetime.total_orders)}</dd></div><div><dt>First activity</dt><dd>{lifetime.first_active_date || 'Not recorded'}</dd></div></dl></section>
    </aside>
  </div>;

  const agreements = <div className={styles.stack}>
    <div className={styles.sectionHead}><div><h2>Agreements & terms</h2><p>Current commitments and the changes Tempo has recorded.</p></div><span className={styles.eyebrow}>{label}</span></div>
    <div className={styles.agreementGrid}>{visibleContracts.map(contract => <article key={contract.managedId} className={styles.agreement}>
      <h3><span className={styles.brand}><i style={{background:brandColor(reg,contract.brand)}} />{brandLabel(reg,contract.brand)}</span></h3>
      {canViewCost && <strong>{formatCurrency(contract.retainer)}<span className="text-xs text-muted-foreground font-normal"> / month</span></strong>}
      <dl className={styles.terms}><div><dt>Recorded commitment</dt><dd>{contract.monthlyPostRequirement ? `${contract.monthlyPostRequirement} posts / month` : 'No target recorded'}</dd></div><div><dt>Status</dt><dd>{contract.status || 'Not recorded'}</dd></div><div><dt>Start date</dt><dd>{contract.retainerStartDate || 'Not recorded'}</dd></div><div><dt>Renewal / end date</dt><dd>Not recorded</dd></div></dl>
      {contract.notes && <p className="mt-6 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">{contract.notes}</p>}
    </article>)}</div>
    {!visibleContracts.length && <div className={styles.empty}>No agreement terms are recorded for this brand.</div>}
    <div className={styles.notice}>These cards show current roster terms. Historical fixed-post packages, rollover rules, commission terms and signed agreement dates are not yet stored as a complete agreement ledger. Recorded changes below preserve the available history; current fees are never projected backward.</div>
    <section className={styles.section}><div className={styles.sectionHead}><div><h2>Agreement change history</h2><p>Recorded updates, with original before-and-after values.</p></div></div><div className="px-6 pb-6"><CreatorChangeHistory entries={changes} brandLabelFor={brand => brand ? brandLabel(reg,brand) : null} multiBrand={!selectedBrand} /></div></section>
  </div>;

  const content = <div className={styles.stack}>
    <div className={styles.sectionHead}><div><h2>Content driving revenue</h2><p>Top tracked videos by GMV · {scopeHint}</p></div></div>
    {!videos.length ? empty : <div className={styles.videoGrid}>{videos.map((video,index) => <article className={styles.video} key={`${video.video_id}:${video.brand}`}>
      <span className={styles.rank}>#{index+1} · {brandLabel(reg,video.brand)}</span>
      <h3><VideoTitleButton videoData={{...video,date_range:`${startDate} – ${endDate}`}} className="text-left hover:text-primary">{video.video_title || 'View video'} <ExternalLink size={12} className="inline" /></VideoTitleButton></h3>
      <footer><div><strong>{formatCurrency(video.gmv)}</strong>GMV</div><div>{formatNumber(video.orders)} orders<br />@{video.creator_name}</div></footer>
    </article>)}</div>}
    <section className={styles.section}><div className={styles.sectionHead}><div><h2>Content that earned attention</h2><p>Ranked by views to surface hooks worth studying.</p></div></div><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Video</th><th>Views</th><th>Likes</th><th>GMV</th></tr></thead><tbody>{topContent.map(video => <tr key={video.videoId}><td data-label="Video"><VideoTitleButton videoData={{video_id:video.videoId,video_title:video.title,creator_name:accounts[0]?.tiktok_username || profile.real_name,brand:video.brand || undefined,gmv:video.gmv}} className="text-left hover:text-primary">{video.title || 'View video'}</VideoTitleButton><small>{video.postDate || 'Publication date unavailable'}</small></td><td data-label="Views">{formatNumber(video.views)}</td><td data-label="Likes">{formatNumber(video.likes)}</td><td data-label="GMV">{formatCurrency(video.gmv)}</td></tr>)}</tbody></table></div></section>
    <section className={styles.section}><div className={styles.sectionHead}><div><h2>TikTok accounts</h2><p>Performance by linked handle in the selected period.</p></div></div><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Account</th><th>GMV</th><th>Orders</th><th>Active videos</th></tr></thead><tbody>{accountRows.map(account => <tr key={account.tiktok_username}><td data-label="Account">@{account.tiktok_username}</td><td data-label="GMV">{formatCurrency(account.gmv)}</td><td data-label="Orders">{formatNumber(account.orders)}</td><td data-label="Active videos">{formatNumber(account.videos)}</td></tr>)}</tbody></table></div></section>
  </div>;

  return <div className={styles.page}>
    <SetBreadcrumb label={profile.real_name} />
    <Link href={selectedBrand ? `/roster?brand=${selectedBrand}` : '/roster'} className={styles.back}><ArrowLeft size={14} /> Creator roster</Link>
    <header className={styles.hero}><div className={styles.identity}>
      <CreatorPortrait creatorId={creatorId} name={profile.real_name} className={styles.portrait} />
      <div className="min-w-0"><div className={styles.name}><h1>{profile.real_name}</h1>{profile.status && <span className={styles.status}>{profile.status}</span>}</div>
        <div className={styles.handles}>{accounts.map(account => <a key={account.tiktok_username} href={`https://www.tiktok.com/@${account.tiktok_username}`} target="_blank" rel="noopener noreferrer">@{account.tiktok_username}<ExternalLink size={10} /></a>)}</div>
        <div className={styles.handles}><span>{accounts.length} linked accounts</span><span>{brands.length} authorized brands</span>{profile.email && <span>{profile.email}</span>}</div>
      </div>
    </div><div className={styles.actions}>
      <CreatorEditButton creator={{id:profile.id,real_name:profile.real_name,email:profile.email,phone:profile.phone,role:relationship.role,status:relationship.status,notes:profile.notes,accounts:profile.accounts.map(account=>({tiktok_username:account.tiktok_username,is_primary:account.is_primary})),brandId:editBrandId,brandLabel:editBrand ? brandLabel(reg,editBrand) : null,brandNotes:allContracts.find(contract=>contract.brand===editBrand)?.notes ?? null}} />
      <a href={`/api/admin/view-as-creator?creatorId=${profile.id}`} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> Creator portal</a>
    </div></header>
    <div className={styles.scope}><div><span className={styles.eyebrow}>Relationship scope</span><Suspense fallback={null}><BrandFilter appearance="creator" brands={brands} brandsWithData={brandsWithData} selectedBrand={selectedBrand} /></Suspense></div><div><span className={styles.eyebrow}>Reporting period</span><Suspense fallback={null}><DateRangePicker staleThrough={lagDays>0 ? anchorDate : null} /></Suspense></div></div>
    <div className={styles.metrics}>
      <div className={styles.metric}><span className={styles.eyebrow}>GMV · selected period</span><strong>{formatCurrency(summary.total_gmv)}</strong><p>{scopeHint}</p></div>
      <div className={styles.metric}><span className={styles.eyebrow}>Orders · selected period</span><strong>{formatNumber(summary.total_orders)}</strong><p>{formatNumber(summary.total_videos)} tracked videos with activity</p></div>
      <div className={styles.metric}><span className={styles.eyebrow}>Current monthly commitment</span><strong>{canViewCost ? formatCurrency(monthlyCommitment) : '—'}</strong><p>{visibleContracts.length} recorded brand agreement{visibleContracts.length === 1 ? '' : 's'}{!canViewCost && ' · cost access restricted'}</p></div>
    </div>
    <ProfileSections sections={[
      {id:'performance',label:'Performance',content:performance},
      {id:'period',label:'Period detail',content:<Suspense fallback={<div className={styles.empty}>Loading daily performance…</div>}><ProfilePerformanceHistory creatorId={creatorId} start={startDate} end={endDate} brand={selectedBrand ?? undefined} label={label} /></Suspense>},
      {id:'agreements',label:'Agreements',content:agreements},
      {id:'content',label:'Content & accounts',content:content},
    ]} />
  </div>;
}
