import Link from 'next/link';
import { formatCurrency } from '@/lib/utils/format';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

export interface TopCreatorRow {
  name: string | null;
  id?: string;
  handle: string;
  gmv: number;
}

/**
 * Top managed creators by managed GMV for the period. Ranked from the canonical
 * computeManagedGmv (ties to the Managed GMV hero). Click-through to the
 * creator's detail page.
 */
export function TopCreators({ creators, label }: { creators: TopCreatorRow[]; label: string }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle eyebrow>Top Creators · {label}</CardTitle>
        <Link href="/roster" className="text-xs font-semibold text-[var(--primary)] hover:underline">
          View roster →
        </Link>
      </CardHeader>

      {creators.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">No managed creator GMV in this period.</div>
      ) : (
        <div className="divide-y divide-border">
          {creators.map((c, i) => {
            const display = c.name ?? `@${c.handle}`;
            const initial = (display.replace(/^@/, '')[0] ?? '?').toUpperCase();
            const href = `/creators/${encodeURIComponent(c.id ?? c.handle)}`;
            return (
              <Link
                key={`${c.id ?? c.handle}-${i}`}
                href={href}
                className="group flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-muted/60"
              >
                <span className="w-4 text-right text-xs font-bold tabular-nums text-muted-foreground">{i + 1}</span>
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-pulse-grad text-xs font-bold text-white">
                  {initial}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground transition-colors group-hover:text-[var(--primary)]">
                    {display}
                  </span>
                  {c.name && <span className="block truncate text-xs text-muted-foreground">@{c.handle}</span>}
                </span>
                <span className="text-sm font-bold tabular-nums text-foreground">{formatCurrency(c.gmv)}</span>
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}
