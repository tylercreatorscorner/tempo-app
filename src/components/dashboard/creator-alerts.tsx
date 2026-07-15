import { AlertTriangle, Flame, Star, CheckCircle2, Siren } from 'lucide-react';
import { rankAlerts, type CreatorAlert } from '@/lib/data/creator-alerts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge, type BadgeProps } from '@/components/ui/badge';

interface Props {
  alerts: CreatorAlert[];
}

const TYPE_LABEL: Record<CreatorAlert['type'], string> = {
  underperforming: 'Underperforming',
  crushing: 'Crushing it',
  breakout: 'Breakout',
};

const TYPE_ICON: Record<CreatorAlert['type'], React.ReactNode> = {
  underperforming: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  crushing: <Flame className="h-4 w-4 text-primary" />,
  breakout: <Star className="h-4 w-4 text-emerald-500" />,
};

const TYPE_BADGE: Record<CreatorAlert['type'], BadgeProps['variant']> = {
  underperforming: 'warning',
  crushing: 'positive',
  breakout: 'accent',
};

/**
 * Creator-level alerts card — surfaces underperforming / crushing / breakout
 * creators that need attention right now. Brand-level riser/faller signals
 * deliberately live on /analytics's Notable Changes section instead, so we
 * have one canonical home for "period vs prior period" comparisons.
 */
export function CreatorAlerts({ alerts }: Props) {
  const ranked = rankAlerts(alerts, 5);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border">
        <div className="flex items-center gap-2">
          <span className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Siren className="h-4 w-4" />
          </span>
          <CardTitle className="text-sm font-extrabold">Alerts</CardTitle>
        </div>
        <span className="text-xs text-muted-foreground">Needs attention</span>
      </CardHeader>

      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {ranked.length === 0 ? (
            <div className="px-5 py-8 flex flex-col items-center gap-2 text-center text-muted-foreground text-sm">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              No alerts right now. Your creators are on track!
            </div>
          ) : (
            ranked.map((alert, i) => (
              <div
                key={`${alert.name}-${alert.type}-${i}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-primary/10 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="flex items-center justify-center">{TYPE_ICON[alert.type]}</span>
                  <div>
                    <p className="text-sm font-medium text-foreground">{alert.name}</p>
                    <p className="text-xs text-muted-foreground">{alert.detail}</p>
                  </div>
                </div>
                <Badge variant={TYPE_BADGE[alert.type]} size="md">
                  {TYPE_LABEL[alert.type]}
                </Badge>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

