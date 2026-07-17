import Link from 'next/link';
import { formatNumber } from '@/lib/utils/format';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { InfoTooltip } from '@/components/ui/info-tooltip';

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
 *
 * Tooltip copy is written from deriveHealth() itself (SILENT_DAYS_THRESHOLD = 14,
 * the 10-point pace slack) rather than from intent — if the rule changes, the
 * copy has to change with it.
 */
export function RosterHealthPanel({ total, healthy, behind, silent, unreadDms }: Props) {
  const rows = [
    {
      label: 'Healthy',
      count: healthy,
      color: 'var(--pulse-pos)',
      tip: 'Posted within the last 14 days and, if they have a monthly post quota, keeping up with it.',
    },
    {
      label: 'Behind pace',
      count: behind,
      color: 'var(--pulse-warn)',
      tip: 'Has a monthly post quota and is tracking behind the pace needed to hit it, with 10 points of slack before flagging so one missed post doesn’t trip it. Creators with no quota are never counted here.',
    },
    {
      label: 'Silent 14d+',
      count: silent,
      color: 'var(--pulse-neg)',
      tip: 'No post in more than 14 days — or no posts on record at all while on a retainer. Churned and inactive creators are excluded.',
    },
  ];
  const max = Math.max(total, healthy, behind, silent, 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle eyebrow>Roster Health</CardTitle>
        <InfoTooltip label="Your managed roster's posting health, using the same classification as the Creators page — so the numbers tie out. Scoped to the selected brand, but NOT to the period above: these are current-state signals (roster size, a fixed 14-day silence threshold, month-to-date pace)." />
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="flex items-center gap-1 text-muted-foreground">
          <span className="text-[15px] font-bold tabular-nums text-foreground">{formatNumber(total)}</span>{' '}
          <span className="text-[13px]">active creators</span>
          <InfoTooltip label="Managed creators on your roster that aren't archived, for the selected brand. Independent of the period selector." />
        </p>

        <div className="space-y-4">
          {rows.map((r) => (
            <div key={r.label}>
              <div className="flex items-center justify-between text-[13px]">
                <InfoTooltip label={r.tip}>
                  <span className="cursor-help font-semibold text-muted-foreground underline decoration-muted-foreground/30 decoration-dotted underline-offset-2">
                    {r.label}
                  </span>
                </InfoTooltip>
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
          <InfoTooltip label="Creator DMs still waiting on a reply, across the roster. Opens Messages.">
            <span className="cursor-help text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground group-hover:text-primary">
              Unread creator DMs
            </span>
          </InfoTooltip>
          <span className="text-[20px] font-bold tabular-nums text-foreground">{formatNumber(unreadDms)}</span>
        </Link>
      </CardContent>
    </Card>
  );
}
