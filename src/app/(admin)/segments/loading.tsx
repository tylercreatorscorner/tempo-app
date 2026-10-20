import { PageHeaderSkeleton, CardGridSkeleton } from '@/components/ui/page-skeletons';
import layout from '@/components/ui/workspace-layout.module.css';

export default function Loading() {
  return (
    <div className={layout.page}>
      <PageHeaderSkeleton />
      <div className={layout.balanced}><CardGridSkeleton count={5} height="h-20" className="grid gap-2" /><CardGridSkeleton count={3} height="h-20" className="grid gap-2" /></div>
    </div>
  );
}
