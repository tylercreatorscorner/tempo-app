import Link from 'next/link';
import { ArrowUpRight, CalendarDays, FileBarChart, Library } from 'lucide-react';
import styles from '../agency.module.css';

export default function AgencyReportsPage() {
  const reports = [
    { title: 'Weekly manager meeting', description: 'Portfolio performance, manager updates, goals, and the next actions for each brand.', href: '/reporting/agency/weekly', icon: CalendarDays },
    { title: 'Monthly & month-to-date', description: 'Prepare and share an agency portfolio report using the existing reporting workflow.', href: '/reporting?view=agency', icon: FileBarChart },
    { title: 'Report library', description: 'Find previously shared reports and preserve what recipients received.', href: '/reporting?view=library', icon: Library },
  ];
  return <div className={styles.workspace}><header className={styles.pageHeader}><div><div className={styles.eyebrow}>AGENCY WORKSPACE</div><h1>Reports</h1><p>Prepare a portfolio review or revisit a shared report.</p></div></header><div className={styles.reportList}>{reports.map(({ title, description, href, icon: Icon }) => <Link key={href} href={href} className={styles.reportCard}><Icon size={22} /><div><h2>{title}</h2><p>{description}</p></div><ArrowUpRight size={18} /></Link>)}</div><p className={styles.scopeNote}>These reports cover brand and creator performance. Agency fees, manager compensation, and collections stay in the internal finance workspace.</p></div>;
}
