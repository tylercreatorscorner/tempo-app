import { CreatorPortrait } from '@/components/creators/creator-portrait';
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
export function TopCreators({ creators, label, brand }: { creators: TopCreatorRow[]; label: string; brand?: string | null }) {
  const rows = creators.map((c, i) => {
            const display = c.name ?? `@${c.handle}`;
            const href = `/creators/${encodeURIComponent(c.id ?? c.handle)}${brand ? `?brand=${encodeURIComponent(brand)}` : ""}`;
            return (
              <Link
                key={`${c.id ?? c.handle}-${i}`}
                href={href}
                className="group flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-muted/60"
              >
                <span className="w-4 text-right text-xs font-bold tabular-nums text-muted-foreground">{i + 1}</span>
                <CreatorPortrait creatorId={c.id} name={display} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-secondary object-cover text-xs font-semibold" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground transition-colors group-hover:text-[var(--primary)]">
                    {display}
                  </span>
                  {c.name && <span className="block truncate text-xs text-muted-foreground">@{c.handle}</span>}
                </span>
                <span className="text-sm font-bold tabular-nums text-foreground">{formatCurrency(c.gmv)}</span>
              </Link>
            );
          });
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle eyebrow>Top Creators · {label}</CardTitle>
        <Link href={brand ? `/roster?brand=${encodeURIComponent(brand)}` : "/roster"} className="text-xs font-semibold text-[var(--primary)] hover:underline">
          View roster →
        </Link>
      </CardHeader>

      {creators.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">No managed creator GMV in this period.</div>
      ) : (
        <div className="divide-y divide-border">
          {rows.slice(0,5)}
          {rows.length > 5 && <details><summary className="cursor-pointer px-5 py-3 text-xs font-medium text-primary">Show {rows.length - 5} more</summary><div className="divide-y divide-border">{rows.slice(5)}</div></details>}
        </div>
      )}
    </Card>
  );
}
