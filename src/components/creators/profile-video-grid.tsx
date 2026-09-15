'use client';
import { useState } from 'react';
import type { CreatorVideo } from '@/lib/data/creator-profile';
import { VideoCover } from '@/components/video/video-cover';
import { VideoTitleButton } from '@/components/video/video-title-button';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import styles from './profile-workspace.module.css';

export function ProfileVideoGrid({videos,start,end,labels}: {videos:CreatorVideo[];start:string;end:string;labels:Record<string,string>}) {
  const [filter,setFilter]=useState('all');
  const recent=(video:CreatorVideo)=>!!video.posted_date && video.posted_date>=start && video.posted_date<=end;
  const displayed=videos.filter(video=>filter==='all' || (filter==='recent'?recent(video):!!video.posted_date && video.posted_date<start));
  return <div>
    <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter ranked videos by publication date">
      {[['all','All leading videos'],['recent','Published this period'],['older','Older videos still earning']].map(([value,label])=><button type="button" key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)} className="rounded-lg border border-border px-3 py-2 text-xs aria-pressed:border-primary aria-pressed:bg-accent aria-pressed:text-accent-foreground">{label}</button>)}
    </div>
    <p className="mb-4 text-xs text-muted-foreground">Filters apply to the top {videos.length} videos by GMV, not the full publication history.</p>
    {!displayed.length ? <div className={styles.empty}>No matching videos in this ranked set. This does not mean no videos were published.</div> : <div className={styles.videoGrid}>{displayed.map(video=><article className={styles.video} key={`${video.video_id}:${video.brand}`}>
      <div className={styles.contentCover}><VideoCover video={{...video,date_range:`${start} – ${end}`}} stored={video.thumbnail_url}/></div>
      <span className={styles.rank}>{labels[video.brand] || video.brand} · {video.posted_date ? `Published ${video.posted_date}` : 'Date unavailable'}</span>
      <h3><VideoTitleButton videoData={{...video,date_range:`${start} – ${end}`}} className="text-left hover:text-primary">{video.video_title || 'Review video'}</VideoTitleButton></h3>
      <footer><div><strong>{formatCurrency(video.gmv)}</strong>GMV in period</div><div>{formatNumber(video.orders)} orders<br/>@{video.creator_name}</div></footer>
    </article>)}</div>}
  </div>;
}
