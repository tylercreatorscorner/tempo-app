import { InterfaceIcon } from '@/components/ui/interface-icon';
import styles from './performance.module.css';

export interface MetricCell {
  label: string;
  value: string;
  delta?: number | null;
  foot?: string;
}

/** Values must already be scoped/redacted on the server. This component does not fetch data. */
export function CreatorMetricReadout({ cells, label = 'Creator performance' }: { cells: readonly MetricCell[]; label?: string }) {
  return (
    <dl className={`${styles.theme} ${styles.metrics}`} aria-label={label}>
      {cells.map(cell => (
        <div className={styles.metric} key={cell.label}>
          <dt>{cell.label}</dt>
          <dd className={styles.value}>{cell.value}</dd>
          {cell.delta != null && Number.isFinite(cell.delta) && (
            <dd className={cell.delta >= 0 ? styles.positive : styles.negative}>
              {<><InterfaceIcon name={cell.delta >= 0 ? 'increase' : 'decrease'} className="size-3"/><span className="sr-only">{cell.delta >= 0 ? 'Up ' : 'Down '}</span></>} {Math.abs(cell.delta).toFixed(0)}%
            </dd>
          )}
          {cell.foot && <dd className={styles.foot}>{cell.foot}</dd>}
        </div>
      ))}
    </dl>
  );
}
