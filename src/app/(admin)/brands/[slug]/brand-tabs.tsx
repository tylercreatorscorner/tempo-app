'use client';

import { useState } from 'react';
import { Users, Package, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

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

  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActive(id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors',
              active === id
                ? 'bg-card text-[var(--foreground)] shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
      {active === 'overview' && overview}
      {active === 'creators' && creators}
      {active === 'products' && products}
    </div>
  );
}
