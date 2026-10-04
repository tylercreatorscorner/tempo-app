import Link from 'next/link';
import { ArrowUpRight, CalendarDays, FileBarChart, Library } from 'lucide-react';

export default function AgencyReportsPage() {
  const reports = [
    { title: 'Weekly manager meeting', description: 'Portfolio performance, manager updates, goals, and the next actions for each brand.', href: '/reporting/agency/weekly', icon: CalendarDays },
    { title: 'Monthly & month-to-date', description: 'Prepare and share an agency portfolio report using the existing reporting workflow.', href: '/reporting?view=agency', icon: FileBarChart },
    { title: 'Report library', description: 'Find previously shared reports and preserve what recipients received.', href: '/reporting?view=library', icon: Library },
  ];
  return <div className="mx-auto w-full max-w-[1440px] space-y-6 p-5 sm:p-7"><header><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-primary">Agency workspace</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Reports</h1><p className="mt-2 text-sm text-muted-foreground">Bring a clear portfolio view to your leadership meetings.</p></header><div className="grid gap-3 lg:grid-cols-3">{reports.map(({ title, description, href, icon: Icon }) => <Link key={href} href={href} className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-muted/30"><div className="flex items-center justify-between"><Icon className="h-5 w-5 text-primary" /><ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transform-none" /></div><h2 className="mt-4 text-sm font-semibold">{title}</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p></Link>)}</div><p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">These reports cover brand and creator performance. The new agency service-fee calculations remain internal and are not added to shared reports.</p></div>;
}
