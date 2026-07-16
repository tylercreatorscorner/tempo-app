import Link from 'next/link';
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
        <CardTitle eyebrow>Roster Health</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-muted-foreground">
          <span className="text-[15px] font-bold tabular-nums text-foreground">{formatNumber(total)}</span>{' '}
          <span className="text-[13px]">active creators</span>
        </p>

        <div className="space-y-4">
          {rows.map((r) => (
            <div key={r.label}>
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-semibold text-muted-foreground">{r.label}</span>
                <span className="font-bold tabular-nums text-foreground">{formatNumber(r.count)}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-md bg-secondary">
                <div className="h-full rounded-md" style={{ width: `${(r.count / max) * 100}%`, backgroundColor: r.color }} />
              </div>
            </div>
          ))}
        </div>

        <Link
          href="/messages"
          className="group flex items-center justify-between border-t border-border pt-4 transition-colors"
        >
          <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground group-hover:text-primary">
            Unread creator DMs
          </span>
          <span className="text-[20px] font-bold tabular-nums text-foreground">{formatNumber(unreadDms)}</span>
        </Link>
      </CardContent>
    </Card>
  );
}
