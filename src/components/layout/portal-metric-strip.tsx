import type { ReactNode } from 'react';
import portal from './portal-workspace.module.css';

/** Presentation only: callers supply already-authorized, defined metrics. */
export function PortalMetricStrip({ items }: { items: { label: string; value: ReactNode; note?: ReactNode }[] }) {
  return (
    <dl className={portal.metrics}>
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 break-words text-[23px] font-semibold leading-tight tabular-nums text-foreground">{item.value}</dd>
          {item.note && <dd className="mt-1 text-xs text-muted-foreground">{item.note}</dd>}
        </div>
      ))}
    </dl>
  );
}
