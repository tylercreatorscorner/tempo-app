'use client';

import Link from 'next/link';
import { StatCard } from '@/components/ui/stat-card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import {
  TableCard,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  DataAvatar,
} from '@/components/ui/table';
import { PageHeader } from '@/components/ui/page-header';
import { fmtCompactCurrency, formatCurrency } from '@/components/charts/format';
import type { BrandBreakdownRow } from '@/lib/data/creator-portal';

/** Compact GMV, honest about missing data: null → "—", never a fake $0. */
function gmvLabel(n: number | null): string {
  return n == null ? '—' : fmtCompactCurrency(n);
}

/** Up-to-two-letter brand initials for the identity swatch. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
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
      <PageHeader
        eyebrow="My Brands"
        title={realName ? `${realName}'s brands` : 'My Brands'}
        subtitle="Every brand you're on — retainer, posts this month, and GMV over the last 30 days."
      />

      {/* Cross-brand summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard hero label="Total Retainer" value={formatCurrency(totalRetainer)} subValue="per month" />
        <StatCard label="GMV · 30d" value={gmvLabel(totalGmv)} accentColor="var(--pulse-pos)" />
        <StatCard
          label="Posts this month"
          value={totalPosts == null ? '—' : `${totalPosts}${totalRequired > 0 ? ` / ${totalRequired}` : ''}`}
          accentColor="var(--pulse-accent-2)"
        />
        <StatCard label="Brands" value={String(rows.length)} accentColor="var(--primary)" />
      </div>

      {/* Per-brand table */}
      {rows.length === 0 ? (
        <EmptyState
          icon={<span className="text-3xl" aria-hidden>🎬</span>}
          title="No brand contracts yet"
          description="You're not contracted on any brands yet. Once you're set up, every brand you're on — with retainer, posts, and GMV — shows up right here."
          action={
            <Link
              href="/creator-dashboard"
              className="inline-flex items-center rounded-lg bg-pulse-grad px-4 py-2 text-sm font-semibold text-white shadow-[var(--pulse-elev-1)]"
            >
              Back to dashboard
            </Link>
          }
        />
      ) : (
        <TableCard>
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Brand</TH>
                  <TH>Retainer / mo</TH>
                  <TH>Posts (mo)</TH>
                  <TH>GMV · 30d</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => {
                  const hasReq = r.monthlyPostRequirement > 0;
                  const behind =
                    r.postsThisMonth != null && hasReq && r.postsThisMonth < r.monthlyPostRequirement;
                  return (
                    <TR key={r.brandSlug} className="hover:bg-secondary/50">
                      <TD className="text-foreground">
                        <div className="flex items-center gap-3">
                          <DataAvatar color={r.brandColor}>{initials(r.brandDisplayName)}</DataAvatar>
                          <span className="font-semibold">{r.brandDisplayName}</span>
                        </div>
                      </TD>
                      <TD className="text-foreground">{formatCurrency(r.retainer)}</TD>
                      <TD>
                        {r.postsThisMonth == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <span className="font-medium text-foreground">
                              {r.postsThisMonth}
                              {hasReq && (
                                <span className="text-muted-foreground"> / {r.monthlyPostRequirement}</span>
                              )}
                            </span>
                            {hasReq &&
                              (behind ? (
                                <Badge variant="warning" size="sm">Behind</Badge>
                              ) : (
                                <Badge variant="positive" size="sm">On track</Badge>
                              ))}
                          </div>
                        )}
                      </TD>
                      <TD className="font-semibold text-[var(--pulse-pos)]">{gmvLabel(r.gmv)}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
        </TableCard>
      )}

      <p className="text-[11px] text-muted-foreground">
        Your retainer is your monthly agreement per brand. Posts and GMV update as your TikTok Shop data syncs.
      </p>
    </div>
  );
}
