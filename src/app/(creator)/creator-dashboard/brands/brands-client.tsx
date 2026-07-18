'use client';

import { StatCard } from '@/components/ui/stat-card';
import type { BrandBreakdownRow } from '@/lib/data/creator-portal';

function money(n: number | null): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

export function BrandsClient({ realName, rows }: { realName: string; rows: BrandBreakdownRow[] }) {
  const totalRetainer = rows.reduce((s, r) => s + r.retainer, 0);
  const anyGmv = rows.some((r) => r.gmv != null);
  const totalGmv = anyGmv ? rows.reduce((s, r) => s + (r.gmv ?? 0), 0) : null;
  const anyPosts = rows.some((r) => r.postsThisMonth != null);
  const totalPosts = anyPosts ? rows.reduce((s, r) => s + (r.postsThisMonth ?? 0), 0) : null;
  const totalRequired = rows.reduce((s, r) => s + r.monthlyPostRequirement, 0);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
          {realName ? `${realName}'s brands` : 'My Brands'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every brand you&apos;re on — your retainer, posts this month, and GMV over the last 30 days.
        </p>
      </div>

      {/* Cross-brand summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard hero label="Total Retainer" value={money(totalRetainer)} subValue="per month" />
        <StatCard label="GMV · 30d" value={money(totalGmv)} accentColor="var(--pulse-pos)" />
        <StatCard
          label="Posts this month"
          value={totalPosts == null ? '—' : `${totalPosts}${totalRequired > 0 ? ` / ${totalRequired}` : ''}`}
          accentColor="var(--pulse-accent-2)"
        />
        <StatCard label="Brands" value={String(rows.length)} accentColor="var(--primary)" />
      </div>

      {/* Per-brand table */}
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-[var(--pulse-elev-1)]">
          <p className="text-sm text-muted-foreground">You&apos;re not contracted on any brands yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--pulse-elev-1)]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Brand</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Retainer / mo</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Posts (mo)</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">GMV · 30d</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const behind =
                    r.postsThisMonth != null &&
                    r.monthlyPostRequirement > 0 &&
                    r.postsThisMonth < r.monthlyPostRequirement;
                  return (
                    <tr key={r.brandSlug} className="transition-colors hover:bg-secondary/50">
                      <td className="px-5 py-3.5 font-semibold text-foreground">{r.brandDisplayName}</td>
                      <td className="px-5 py-3.5 text-right tabular-nums text-foreground">{money(r.retainer)}</td>
                      <td className="px-5 py-3.5 text-right tabular-nums">
                        {r.postsThisMonth == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className={behind ? 'font-semibold text-[var(--pulse-warn)]' : 'text-foreground'}>
                            {r.postsThisMonth}
                            {r.monthlyPostRequirement > 0 ? (
                              <span className="text-muted-foreground"> / {r.monthlyPostRequirement}</span>
                            ) : null}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-[var(--pulse-pos)]">
                        {money(r.gmv)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Your retainer is your monthly agreement per brand. Posts and GMV update as your TikTok Shop data syncs.
      </p>
    </div>
  );
}
