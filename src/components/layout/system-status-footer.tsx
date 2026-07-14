'use client';

/**
 * SystemStatusFooter — small status indicator pinned to the bottom of the
 * sidebar (admin only). Pings /api/system/health every 60s, rolls the response
 * up into a single green/amber/red dot, and links to /system for the full
 * detail page.
 *
 * Severity rollup (worst signal wins):
 *   RED   → any critical alert, or any session expired, or freshness 'critical'
 *   AMBER → any warning alert, expiring sessions, or freshness 'stale'
 *   GREEN → everything healthy
 *   GRAY  → loading / fetch error (shown but not alarming)
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type Status = 'green' | 'amber' | 'red' | 'gray';

interface HealthPayload {
  sessions?: Array<{ status?: string; consecutive_failures?: number }>;
  alerts?: Array<{ severity?: string; acknowledged?: boolean }>;
  freshness?: Array<{ freshness?: string }>;
}

function rollup(data: HealthPayload | null): { status: Status; label: string } {
  if (!data) return { status: 'gray', label: 'Checking…' };

  const alerts = data.alerts ?? [];
  const sessions = data.sessions ?? [];
  const freshness = data.freshness ?? [];

  const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;
  const warningAlerts = alerts.filter(a => a.severity === 'warning').length;

  const hasExpired = sessions.some(s => s.status === 'expired' || s.status === 'error');
  const hasExpiring = sessions.some(s => s.status === 'expiring');

  const hasCriticalFreshness = freshness.some(f => f.freshness === 'critical');
  const hasStaleFreshness = freshness.some(f => f.freshness === 'stale');

  if (criticalAlerts > 0 || hasExpired || hasCriticalFreshness) {
    const issueCount = criticalAlerts + (hasExpired ? 1 : 0);
    return { status: 'red', label: issueCount > 1 ? `${issueCount} issues` : 'Issue' };
  }

  if (warningAlerts > 0 || hasExpiring || hasStaleFreshness) {
    return { status: 'amber', label: 'Degraded' };
  }

  return { status: 'green', label: 'All systems' };
}

const DOT_COLORS: Record<Status, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  gray: 'bg-secondary',
};

const TEXT_COLORS: Record<Status, string> = {
  green: 'text-muted-foreground',
  amber: 'text-amber-500',
  red: 'text-red-500',
  gray: 'text-muted-foreground',
};

export function SystemStatusFooter() {
  const [data, setData] = useState<HealthPayload | null>(null);
  const [errored, setErrored] = useState(false);

  async function load() {
    try {
      const res = await fetch('/api/system/health', { cache: 'no-store' });
      if (!res.ok) { setErrored(true); return; }
      const json = (await res.json()) as HealthPayload;
      setData(json);
      setErrored(false);
    } catch {
      setErrored(true);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  const { status, label } = errored
    ? { status: 'gray' as Status, label: 'Offline' }
    : rollup(data);

  return (
    <Link
      href="/system"
      className="group flex items-center gap-2 px-3 py-2 rounded-lg text-xs hover:bg-muted transition-colors"
      title="View system health"
    >
      <span className="relative flex h-2 w-2 flex-shrink-0">
        {status === 'red' && (
          <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping" />
        )}
        <span className={cn('relative inline-flex rounded-full h-2 w-2', DOT_COLORS[status])} />
      </span>
      <span className={cn('font-medium', TEXT_COLORS[status])}>{label}</span>
      <span className="ml-auto text-[10px] text-muted-foreground group-hover:text-muted-foreground transition-colors">
        System
      </span>
    </Link>
  );
}
