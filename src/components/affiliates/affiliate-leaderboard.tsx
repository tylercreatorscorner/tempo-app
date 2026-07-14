'use client';

import { useState } from 'react';
import { Trophy, ChevronDown, ChevronRight, UserCheck } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import type { AffiliateRow } from '@/lib/data/affiliate-leaderboard';

export function AffiliateLeaderboard({
  rows,
  brandColors,
}: {
  rows: AffiliateRow[];
  brandColors: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const color = (name: string) => brandColors[name] || 'var(--muted-foreground)';

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card shadow-sm py-16 text-center">
        <Trophy className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No affiliate GMV in this period.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Column header */}
      <div className="hidden sm:flex items-center gap-3 px-5 py-2.5 border-b border-border text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
        <span className="w-5 text-center shrink-0">#</span>
        <span className="flex-1">Creator</span>
        <span className="w-28 text-right shrink-0">Agency GMV</span>
        <span className="w-24 text-right shrink-0">Brands</span>
      </div>

      <div className="divide-y divide-border">
        {rows.map((r, i) => {
          const open = expanded.has(r.identity);
          const label = r.name || `@${r.handle}`;
          return (
            <div key={r.identity}>
              <div
                className="flex items-center gap-3 px-5 py-3 hover:bg-muted/60 transition-colors cursor-pointer"
                onClick={() => toggle(r.identity)}
              >
                {/* Rank */}
                <span className={cn('w-5 text-center text-sm font-bold tabular-nums shrink-0', i < 3 ? 'text-[#E91E8C]' : 'text-muted-foreground')}>
                  {i + 1}
                </span>

                {/* Creator */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {r.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.avatar} alt="" referrerPolicy="no-referrer" className="h-9 w-9 rounded-full object-cover bg-muted shrink-0" />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[var(--primary)] to-[var(--pulse-accent-2)] flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {label[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-[var(--foreground)] truncate">{label}</p>
                      {r.isManaged && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/25 shrink-0">
                          <UserCheck className="h-2.5 w-2.5" /> Managed
                        </span>
                      )}
                    </div>
                    <a
                      href={`https://tiktok.com/@${r.handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-muted-foreground hover:text-[#E91E8C] transition-colors"
                    >
                      @{r.handle}
                    </a>
                  </div>
                </div>

                {/* Agency GMV */}
                <div className="w-28 text-right shrink-0">
                  <span className="text-sm font-bold text-[var(--foreground)] font-mono tabular-nums">{formatCurrency(r.agencyGmv)}</span>
                </div>

                {/* Brand overlap */}
                <div className="w-24 flex items-center justify-end gap-1.5 shrink-0">
                  <span className="flex items-center -space-x-1">
                    {r.breakdown.slice(0, 4).map((b, j) => (
                      <span key={j} className="h-2.5 w-2.5 rounded-full ring-1 ring-card" style={{ backgroundColor: color(b.brand) }} />
                    ))}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground tabular-nums w-4 text-right">{r.brandOverlap}</span>
                  {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                </div>
              </div>

              {/* Per-brand breakdown */}
              {open && (
                <div className="px-5 pb-4 pt-1 bg-muted/60 sm:pl-[3.25rem]">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Brand breakdown</p>
                  <div className="space-y-1.5 max-w-lg">
                    {r.breakdown.map((b, j) => {
                      const pct = r.agencyGmv > 0 ? (b.gmv / r.agencyGmv) * 100 : 0;
                      return (
                        <div key={j} className="flex items-center gap-2 text-xs">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color(b.brand) }} />
                          <span className="w-28 sm:w-36 truncate text-muted-foreground">{b.brand}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color(b.brand) }} />
                          </div>
                          <span className="w-20 text-right font-mono tabular-nums text-[var(--foreground)]">{formatCurrency(b.gmv)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
