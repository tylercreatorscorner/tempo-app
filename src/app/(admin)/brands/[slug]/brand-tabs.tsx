'use client';

import { useId, useState } from 'react';
import { Users, Package, BarChart3 } from 'lucide-react';
import styles from '../brands.module.css';

const TABS = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'creators', label: 'Creators', icon: Users },
  { id: 'products', label: 'Products', icon: Package },
] as const;

type TabId = typeof TABS[number]['id'];

export function BrandTabs({
  overview, creators, products,
}: {
  overview: React.ReactNode;
  creators: React.ReactNode;
  products: React.ReactNode;
}) {
  const [active, setActive] = useState<TabId>('overview');
  const instance = useId();

  return (
    <div className={styles.tabs}>
      <div className={styles.tabList} role="tablist" aria-label="Brand performance sections">
        {TABS.map(({ id, label, icon: Icon }, index) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`${instance}-${id}`}
            aria-selected={active===id}
            aria-controls={`${instance}-panel`}
            tabIndex={active===id ? 0 : -1}
            onClick={() => setActive(id)}
            onKeyDown={event=>{
              const next = event.key==='ArrowRight' ? (index+1)%TABS.length : event.key==='ArrowLeft' ? (index+TABS.length-1)%TABS.length : event.key==='Home' ? 0 : event.key==='End' ? TABS.length-1 : null;
              if(next===null) return;
              event.preventDefault();setActive(TABS[next].id);
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
            }}
            className={styles.tab}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
      <div id={`${instance}-panel`} role="tabpanel" aria-labelledby={`${instance}-${active}`} tabIndex={0} className={styles.tabPanel}>
        {active === 'overview' ? overview : active === 'creators' ? creators : products}
      </div>
    </div>
  );
}
