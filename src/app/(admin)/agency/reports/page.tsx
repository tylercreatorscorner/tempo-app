import Link from 'next/link';
import { ArrowUpRight, CalendarDays, FileBarChart, Library } from 'lucide-react';
import shared from '../agency.module.css';
import styles from './reports.module.css';

const reports = [
  { title: 'Weekly manager meeting', description: 'Portfolio performance, manager updates, goals, and the next actions for each brand.', href: '/reporting/agency/weekly', icon: CalendarDays },
  { title: 'Monthly & month-to-date', description: 'Prepare and share an agency portfolio report using the existing reporting workflow.', href: '/reporting?view=agency', icon: FileBarChart },
  { title: 'Report library', description: 'Find previously shared reports and preserve what recipients received.', href: '/reporting?view=library', icon: Library },
];

export default function AgencyReportsPage() {
  return <div className={shared.workspace}>
    <header className={shared.pageHeader}><div>
      <div className={shared.eyebrow}>AGENCY WORKSPACE</div>
      <h1>Reports</h1>
      <p>Bring a clear portfolio view to your leadership meetings.</p>
    </div></header>
    <section className={shared.panel} aria-labelledby="agency-reporting-title">
      <div className={shared.panelHeader}><div><h2 id="agency-reporting-title">Performance reporting</h2><p>Prepare a meeting, share portfolio results, or revisit a published report.</p></div><FileBarChart size={17} className={shared.panelIcon} aria-hidden="true" /></div>
      <div className={styles.reportGrid}>{reports.map(({ title, description, href, icon: Icon }) =>
        <Link key={href} href={href} className={styles.reportLink}>
          <Icon size={17} className={styles.icon} aria-hidden="true" />
          <div><h3>{title}</h3><p>{description}</p><span className={styles.action}>Open workflow <ArrowUpRight size={12} aria-hidden="true" /></span></div>
        </Link>
      )}</div>
    </section>
    <p className={shared.scopeNote}>These reports cover brand and creator performance. Agency service fees, invoices, and collections stay internal and are not included in shared reports.</p>
  </div>;
}
