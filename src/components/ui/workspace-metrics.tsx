import type { ReactNode } from 'react';
import s from './workspace-layout.module.css';

/** Compact, labelled facts. Values are supplied by the page's existing data model. */
export function WorkspaceMetrics({ items, label = 'Summary' }: {
  items: { label: string; value: ReactNode; detail?: ReactNode }[];
  label?: string;
}) {
  return <dl className={s.metrics} aria-label={label}>{items.map(item => <div key={item.label} className={s.metric}>
    <dt>{item.label}</dt><dd>{item.value}{item.detail != null && <small>{item.detail}</small>}</dd>
  </div>)}</dl>;
}
