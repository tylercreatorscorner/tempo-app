import { Skeleton } from '@/components/ui/skeleton';
import { PageHeaderSkeleton } from '@/components/ui/page-skeletons';
export default function OnboardingLoading() {
  return <div className="max-w-5xl space-y-4" aria-busy="true"><PageHeaderSkeleton withControls={false} /><div className="grid gap-3 md:grid-cols-2"><Skeleton className="h-28 rounded-xl" /><Skeleton className="h-28 rounded-xl" /></div><Skeleton className="h-40 rounded-xl" /></div>;
}
