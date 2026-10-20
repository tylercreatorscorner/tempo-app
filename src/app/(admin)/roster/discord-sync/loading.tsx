import { PageHeaderSkeleton, TableSkeleton } from '@/components/ui/page-skeletons';
import { Skeleton } from '@/components/ui/skeleton';
import styles from './workspace.module.css';
export default function DiscordGroupsLoading() {
  return <div className={styles.page} aria-busy="true"><PageHeaderSkeleton withControls={false} /><Skeleton className="h-14 rounded-xl" /><Skeleton className="h-20 rounded-xl" /><div className={styles.cohortLayout}><TableSkeleton rows={6} cols={4} /><Skeleton className="h-72 rounded-xl" /></div></div>;
}
