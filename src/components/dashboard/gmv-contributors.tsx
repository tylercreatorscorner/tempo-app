import Link from 'next/link';
import { CreatorPortrait } from '@/components/creators/creator-portrait';
import { formatCurrency } from '@/lib/utils/format';
import type { Contributor } from '@/lib/data/dashboard-contributors';

export function GmvContributors({ rows, available, brand, coverage, start, end }: { rows: Contributor[]; available: boolean; brand: string | null; coverage: string; start: string; end: string }) {
  const params = new URLSearchParams({ range: 'custom', start, end });
  if (brand) params.set('brand', brand);
  return <section className="rounded-2xl border border-border bg-card p-4" aria-label="Managed GMV contributors">
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-sm font-semibold">What drove the managed GMV change?</h2><span className="text-xs text-muted-foreground">{coverage} · vs prior period</span></div>
    {!available ? <p className="text-xs text-muted-foreground">Creator comparisons will appear when both periods have recorded daily coverage.</p> : !rows.length ? <p className="text-xs text-muted-foreground">No managed creator changes of $1 or more in this period.</p> : <div className="grid gap-3 md:grid-cols-3">{rows.slice(0,3).map(row => <Link key={row.key} href={`/creators/${encodeURIComponent(row.id ?? row.handle)}?${params}`} className="flex items-center gap-3 rounded-xl border border-border p-3 hover:bg-muted focus-visible:outline-primary">
      <CreatorPortrait creatorId={row.id} name={row.name} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-secondary object-cover text-xs"/>
      <div className="min-w-0"><p className="truncate text-sm font-medium">{row.name}</p><p className="text-sm font-semibold tabular-nums" style={{color:row.delta >= 0 ? 'var(--pulse-pos)' : 'var(--pulse-neg)'}}>{row.delta >= 0 ? '+' : '−'}{formatCurrency(Math.abs(row.delta))}</p><p className="text-[11px] text-muted-foreground">{formatCurrency(row.previous)} → {formatCurrency(row.current)}</p></div>
    </Link>)}</div>}
  </section>;
}
