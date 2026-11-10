'use client';
import { useState } from 'react';
import type { CreatorVideo } from '@/lib/data/creator-profile';
import { VideoCover } from '@/components/video/video-cover';
import { VideoTitleButton } from '@/components/video/video-title-button';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import styles from './profile-workspace.module.css';
import studioStyles from './studio-profile-content.module.css';
import { StudioVideoCover } from './studio-profile-controls';

export function ProfileVideoGrid({videos,start,end,labels,appearance='default'}: {videos:CreatorVideo[];start:string;end:string;labels:Record<string,string>;appearance?:'default'|'studio'}) {
  const [filter,setFilter]=useState('all');
  const recent=(video:CreatorVideo)=>!!video.posted_date && video.posted_date>=start && video.posted_date<=end;
  const displayed=videos.filter(video=>filter==='all' || (filter==='recent'?recent(video):!!video.posted_date && video.posted_date<start));
  const layout=appearance==='studio'?studioStyles:styles;
  return <div className={layout.root}>
    <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter ranked videos by publication date">
      {[['all','All leading videos'],['recent','Published this period'],['older','Older videos still earning']].map(([value,label])=><button type="button" key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)} className="rounded-lg border border-border px-3 py-2 text-xs aria-pressed:border-primary aria-pressed:bg-accent aria-pressed:text-accent-foreground">{label}</button>)}
    </div>
    <p className="mb-4 text-xs text-muted-foreground">Filters apply to the top {videos.length} videos by GMV, not the full publication history.</p>
    {!displayed.length ? <div className={layout.empty}>No matching videos in this ranked set. This does not mean no videos were published.</div> : <div className={layout.videoGrid}>{displayed.map(video=><article className={layout.video} key={`${video.video_id}:${video.brand}`}>
      <div className={layout.contentCover}>{appearance==='studio'?<StudioVideoCover video={{...video,date_range:`${start} to ${end}`}}/>:<VideoCover video={{...video,date_range:`${start} – ${end}`}} stored={video.thumbnail_url}/>}</div>
      <span className={layout.rank}>{labels[video.brand] || video.brand} · {video.posted_date ? `Published ${video.posted_date}` : 'Date unavailable'}</span>
      <h3><VideoTitleButton videoData={{...video,date_range:`${start} – ${end}`}} className="text-left hover:text-primary">{video.video_title || 'Review video'}</VideoTitleButton></h3>
      <footer><div><strong>{formatCurrency(video.gmv)}</strong>GMV in period</div><div>{formatNumber(video.orders)} orders{appearance==='studio'&&<><br/>{formatNumber(video.items_sold)} units</>}<br/>@{video.creator_name}</div></footer>
    </article>)}</div>}
  </div>;
}
