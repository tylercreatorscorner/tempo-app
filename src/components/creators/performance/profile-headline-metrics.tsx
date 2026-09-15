import { getCreatorPerformanceHistory } from '@/lib/data/creator-performance-history';
import { getCreatorSummary } from '@/lib/data/creator-profile';
import { total } from './model';
import styles from '../profile-workspace.module.css';

export async function ProfileHeadlineMetrics({creatorId,start,end,brand,label,summary}: {
  creatorId:string; start:string; end:string; brand?:string; label:string;
  summary:{total_gmv:number;total_orders:number;total_videos:number};
}) {
  const first=Date.parse(`${start}T00:00:00Z`), duration=Date.parse(`${end}T00:00:00Z`)-first+86400000;
  const valid=Number.isFinite(duration) && duration>0 && duration<=366*86400000;
  const previousStart=valid?new Date(first-duration).toISOString().slice(0,10):start;
  const previousEnd=valid?new Date(first-86400000).toISOString().slice(0,10):end;
  const [current,previous,previousSummary]=await Promise.all([
    getCreatorPerformanceHistory(creatorId,start,end,brand),
    valid?getCreatorPerformanceHistory(creatorId,previousStart,previousEnd,brand):Promise.resolve(null),
    valid?getCreatorSummary(creatorId,previousStart,previousEnd,brand):Promise.resolve(null),
  ]);
  if(current.status==='denied') return null;
  const gmv=current.status==='ready'?total(current.points,'gmv'):null;
  const oldGmv=previous?.status==='ready'?total(previous.points,'gmv'):null;
  const posts=current.status==='ready'?total(current.points,'posts'):null;
  const oldPosts=previous?.status==='ready'?total(previous.points,'posts'):null;
  const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
  const number=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n);
  function change(now:number|null,before:number|null,currency=false) {
    if(now===null || before===null) return <p>Comparison unavailable · incomplete records</p>;
    const difference=now-before, percent=before>0?difference/before*100:null;
    return <p className={styles.metricDelta}>{difference>0?'+':''}{currency?money(difference):number(difference)}{percent!==null?` (${percent>0?'+':''}${percent.toFixed(1)}%)`:' · no percentage for a zero baseline'}</p>;
  }
  return <div>
    <div className={styles.metrics} aria-label="Selected-period metrics">
      <div className={styles.metric}><span className={styles.eyebrow}>GMV</span><strong>{money(summary.total_gmv)}</strong>{change(gmv,oldGmv,true)}<p>{gmv===null?'Recorded sales · coverage incomplete':label}</p></div>
      <div className={styles.metric}><span className={styles.eyebrow}>Orders</span><strong>{number(summary.total_orders)}</strong>{change(gmv===null?null:summary.total_orders,oldGmv===null?null:previousSummary?.total_orders??null)}<p>{number(summary.total_videos)} videos with sales activity</p></div>
      <div className={styles.metric}><span className={styles.eyebrow}>Published posts</span><strong>{posts===null?'—':number(posts)}</strong>{change(posts,oldPosts)}<p>Published in the selected period</p></div>
    </div>
    <p className={styles.freshness}>Changes vs. {previousStart}–{previousEnd} · same brand scope and period length</p>
  </div>;
}
