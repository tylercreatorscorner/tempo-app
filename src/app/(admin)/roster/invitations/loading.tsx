import { Skeleton } from '@/components/ui/skeleton';
import { PageHeaderSkeleton } from '@/components/ui/page-skeletons';
import layout from '@/components/ui/workspace-layout.module.css';
export default function OnboardingLoading() {
  return <div className={layout.page} aria-busy="true" aria-label="Loading onboarding"><PageHeaderSkeleton withControls={false} /><div className={layout.columns}><Skeleton className="h-60 rounded-xl" /><div className={layout.stack}><Skeleton className="h-28 rounded-xl" /><Skeleton className="h-36 rounded-xl" /></div></div></div>;
}
