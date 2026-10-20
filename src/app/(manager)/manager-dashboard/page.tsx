import Link from 'next/link';
import { BarChart3, ChevronRight, Users, Video } from 'lucide-react';
import portal from '@/components/layout/portal-workspace.module.css';

const DESTINATIONS = [
  { href: '/dashboard', title: 'Performance dashboard', description: 'Review brand performance, recent changes, and the creators driving sales.', icon: BarChart3 },
  { href: '/roster', title: 'Creator roster', description: 'Find creators, review their activity, and open their profiles.', icon: Users },
  { href: '/posts', title: 'Content performance', description: 'Explore tracked posts and see which content is producing GMV.', icon: Video },
];

export default function ManagerDashboard() {
  return (
    <div className={portal.page}>
      <div className={portal.pageHeader}><div><p className={portal.eyebrow}>Your workspace</p><h1>Manager dashboard</h1><p className="mt-1 text-sm text-muted-foreground">Manage creators and monitor brand performance.</p></div></div>
      <div className={portal.managerCards}>
        {DESTINATIONS.map(({ href, title, description, icon: Icon }) => (
          <Link key={href} href={href} className={`${portal.panel} group flex items-start gap-3 p-4 transition-colors hover:border-primary/40`}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent text-primary"><Icon className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p></div>
            <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}
