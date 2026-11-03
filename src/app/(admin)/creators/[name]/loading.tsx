import styles from '@/components/creators/studio-profile.module.css';

export default function Loading() {
  return <div className={styles.page} aria-busy="true">
    <div className={styles.recordBar}><p role="status" className={styles.freshness}>Loading creator profile…</p></div>
    <div className={styles.workspace} aria-hidden="true">
      <div className={styles.identity}><div className="aspect-square rounded-lg bg-secondary" /><div className="h-6 w-2/3 rounded bg-secondary" /><div className="h-3 w-full rounded bg-secondary" /><div className="h-8 rounded bg-accent" /></div>
      <div className={styles.workbench}><div className="h-8 w-2/3 rounded bg-secondary" /><div className={styles.metrics}>{Array.from({length:4},(_,index)=><div key={index}><div className="h-3 w-16 rounded bg-secondary"/><div className="mt-3 h-7 w-24 rounded bg-secondary"/></div>)}</div><div className="h-9 rounded bg-secondary"/><div className="h-80 rounded-xl border border-border bg-card"/></div>
      <div className={styles.asideSlot}><div className="h-40 rounded-xl bg-foreground/10"/><div className="h-36 rounded-xl border border-border bg-card"/><div className="h-36 rounded-xl border border-border bg-card"/></div>
    </div>
  </div>;
}
