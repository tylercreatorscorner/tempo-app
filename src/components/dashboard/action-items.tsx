'use client';

import { ClipboardList } from 'lucide-react';
import Link from 'next/link';

export interface ActionItem {
  icon: string;
  text: string;
  link?: string;
  priority: 'high' | 'medium' | 'low';
}

interface Props {
  items: ActionItem[];
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

export function ActionItems({ items }: Props) {
  if (items.length === 0) return null;

  const sorted = [...items].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]).slice(0, 6);

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <ClipboardList className="h-5 w-5 text-[#FF4D8D]" />
        <h2 className="text-lg font-bold text-[#1A1B3A]">Action Items</h2>
        <span className="text-xs text-gray-400 font-medium">What to do today</span>
      </div>

      <div className="space-y-2">
        {sorted.map((item, i) => (
          <div key={i} className="flex items-start gap-3 py-2 px-3 rounded-xl hover:bg-gray-50/80 transition-colors">
            <span className="text-base leading-none mt-0.5 shrink-0">{item.icon}</span>
            <div className="flex-1 min-w-0">
              {item.link ? (
                <Link href={item.link} className="text-sm text-[#1A1B3A] hover:text-[#FF4D8D] transition-colors">
                  <span dangerouslySetInnerHTML={{ __html: item.text }} />
                </Link>
              ) : (
                <span className="text-sm text-[#1A1B3A]" dangerouslySetInnerHTML={{ __html: item.text }} />
              )}
            </div>
            {item.priority === 'high' && (
              <span className="text-xs font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded shrink-0">Urgent</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
