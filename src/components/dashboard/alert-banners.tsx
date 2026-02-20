'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AlertData } from '@/lib/data/alerts';

interface Props {
  alerts: AlertData[];
}

function getAlertStyle(change: number) {
  if (change <= -15) return { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', icon: '🚨' };
  if (change <= -5) return { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400', icon: '⚠️' };
  if (change >= 10) return { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400', icon: '🔥' };
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
              'flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border backdrop-blur-xl transition-all duration-300',
              style.bg,
              style.border,
            )}
          >
            <p className={cn('text-sm font-medium', style.text)}>
              {style.icon} {alert.message}
            </p>
            <button
              onClick={() => setDismissed((s) => new Set(s).add(alert.id))}
              className="shrink-0 p-1 rounded-lg hover:bg-white/10 transition-colors text-muted-foreground/50 hover:text-white"
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
