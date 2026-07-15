import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import { formatNumber } from '@/lib/utils/format';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Props {
  total: number;
  healthy: number;
  behind: number;
  silent: number;
  unreadDms: number;
}

/**
 * Roster Health (mockup) — managed-creator counts by health bucket, sourced from
 * the SAME deriveHealth() classification the /roster page uses (so they tie out):
 * healthy · behind pace · silent 14d+, plus unread creator DMs.
 */
export function RosterHealthPanel({ total, healthy, behind, silent, unreadDms }: Props) {
  const rows = [
    { label: 'Healthy', count: healthy, color: 'var(--pulse-pos)' },
    { label: 'Behind pace', count: behind, color: 'var(--pulse-warn)' },
    { label: 'Silent 14d+', count: silent, color: 'var(--pulse-neg)' },
  ];
  const max = Math.max(total, healthy, behind, silent, 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Roster Health</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          <span className="text-2xl font-extrabold tracking-tight tabular-nums text-foreground">{formatNumber(total)}</span> active creators
        </p>

        <div className="space-y-4">
          {rows.map((r) => (
            <div key={r.label}>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{r.label}</span>
                <span className="font-bold tabular-nums text-foreground">{formatNumber(r.count)}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full" style={{ width: `${(r.count / max) * 100}%`, backgroundColor: r.color }} />
              </div>
            </div>
          ))}
        </div>

        <Link
          href="/messages"
          className="group flex items-center justify-between border-t border-border pt-4 text-sm transition-colors"
        >
          <span className="inline-flex items-center gap-2 text-muted-foreground group-hover:text-primary">
            <MessageSquare className="h-4 w-4" /> Unread creator DMs
          </span>
          <span className="font-bold tabular-nums text-foreground">{formatNumber(unreadDms)}</span>
        </Link>
      </CardContent>
    </Card>
  );
}
