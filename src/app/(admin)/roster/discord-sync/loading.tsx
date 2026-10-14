import { PageHeaderSkeleton, TableSkeleton } from '@/components/ui/page-skeletons';
export default function DiscordGroupsLoading() {
  return <div className="space-y-4" aria-busy="true"><PageHeaderSkeleton withControls={false} /><TableSkeleton rows={6} cols={4} /></div>;
}
