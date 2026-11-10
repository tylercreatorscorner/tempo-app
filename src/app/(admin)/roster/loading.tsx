import { LoadingStatus } from '@/components/ui/loading-status';
import styles from '@/components/roster/roster-layout.module.css';

export default function Loading() {
  return <div className={styles.page} aria-busy="true">
    <header className={styles.header}>
      <div><h1>Creators</h1><p>A clear view of every creator, their work, and the next conversation.</p></div>
      <LoadingStatus label="Loading creators and performance" />
    </header>
    <div className={styles.tabsRow} aria-hidden="true"><div className={styles.tabs}>{['Creators', 'Top creators', 'Elites'].map((tab, index) => <span key={tab} className={`inline-flex h-9 items-center rounded-lg px-3 text-xs ${index === 0 ? 'bg-foreground text-background' : 'text-muted-foreground'}`}>{tab}</span>)}</div></div>
    <div className={styles.toolbar} aria-hidden="true"><div className="h-9 min-w-48 flex-1 rounded-lg border border-border bg-card" /><div className="h-9 w-32 rounded-lg border border-border bg-card" /><div className="h-9 w-28 rounded-lg border border-border bg-card" /></div>
    <div className={styles.tableCard} aria-hidden="true">
      <div className="h-10 border-b border-border bg-secondary/40" />
      <div className={styles.tableScroll}><table className={styles.table}><tbody>{Array.from({ length: 8 }, (_, index) => <tr key={index}><td colSpan={8}><div className={styles.skeletonRow}><i /><span /><span /></div></td></tr>)}</tbody></table></div>
    </div>
  </div>;
}
