'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AlertData } from '@/lib/data/alerts';

interface Props {
  alerts: AlertData[];
}

function getAlertStyle(change: number) {
  if (change <= -15) return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-600', icon: '\u{1F6A8}' };
  if (change <= -5) return { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', icon: '\u26A0\uFE0F' };
  if (change >= 10) return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', icon: '\u{1F389}' };
  return null;
}

export function AlertBanners({ alerts }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = alerts.filter((a) => {
    if (dismissed.has(a.id)) return false;
    return getAlertStyle(a.change) !== null;
  });

  if (visible.length === 0) return null;

  return (
    <div className="space-y-2">
      {visible.slice(0, 4).map((alert) => {
        const style = getAlertStyle(alert.change)!;
        return (
          <div
            key={alert.id}
            className={cn(
              'flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border transition-all duration-300',
              style.bg,
              style.border,
            )}
          >
            <p className={cn('text-sm font-medium', style.text)}>
              {style.icon} {alert.message}
            </p>
            <button
              onClick={() => setDismissed((s) => new Set(s).add(alert.id))}
              className="shrink-0 p-1 rounded-lg hover:bg-white/50 transition-colors text-gray-400 hover:text-gray-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// generateAlerts moved to @/lib/data/alerts.ts (server-safe)
