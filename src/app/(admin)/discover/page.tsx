import { Compass } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { NavigationLink } from '@/components/ui/navigation-link';
export default function DiscoverPage() {
  return <div className="space-y-4">
    <PageHeader eyebrow="Content" title="Discover" subtitle="Explore the content already available in your workspace." />
    <EmptyState icon={<Compass size={20} />} title="Discovery is not available yet" description="Review your brands’ videos and creator performance in Content. Cross-platform discovery has not launched." action={<NavigationLink href="/posts">Explore video performance</NavigationLink>} />
  </div>;
}
