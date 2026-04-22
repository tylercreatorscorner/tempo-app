'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { LayoutDashboard, Video, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

const TABS = [
  { key: 'overview', label: 'Overview',  icon: LayoutDashboard },
  { key: 'videos',   label: 'Videos',    icon: Video },
  { key: 'crm',      label: 'CRM',       icon: MessageSquare },
] as const;

type TabKey = typeof TABS[number]['key'];

interface CreatorPageTabsProps {
  activeTab: string;
  children: Record<TabKey, ReactNode>;
}

export function CreatorPageTabs({ activeTab, children }: CreatorPageTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const current = (TABS.find(t => t.key === activeTab) ? activeTab : 'overview') as TabKey;

  const handleTab = (key: TabKey) => {
    const params = new URLSearchParams(searchParams.toString());
    if (key === 'overview') {
      params.delete('tab');
    } else {
      params.set('tab', key);
    }
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => handleTab(key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors',
              current === key
                ? 'bg-white text-[#1A1B3A] shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Active tab content */}
      {children[current]}
    </div>
  );
}
