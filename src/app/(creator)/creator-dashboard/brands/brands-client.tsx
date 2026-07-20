'use client';

import Link from 'next/link';
import { Briefcase, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { TableCard, Table, THead, TBody, TR, TH, TD, DataAvatar } from '@/components/ui/table';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { formatCurrency } from '@/lib/utils/format';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import type { BrandBreakdownRow, BrandStanding, UntappedProduct } from '@/lib/data/creator-portal';

/** Whole-dollar GMV, honest about missing data: null → "—", never a fake $0. */
function gmvLabel(n: number | null): string {
  return n == null ? '—' : formatCurrency(n);
}

/** Up-to-two-letter brand initials for the identity swatch. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

interface Props {
  realName: string;
  rangeLabel: string;
  rows: BrandBreakdownRow[];
  /** brandSlug → standing (brand totals + my share), from get_brand_standing. */
  standings: Record<string, BrandStanding>;
  untapped: UntappedProduct | null;
}

export function BrandsClient({ realName, rangeLabel, rows, standings, untapped }: Props) {
  const brandMeta = useBrandMeta();
  const firstName = realName.split(' ')[0] || realName;

  const totalRetainer = rows.reduce((s, r) => s + r.retainer, 0);
  const anyGmv = rows.some((r) => r.gmv != null);
  const totalGmv = anyGmv ? rows.reduce((s, r) => s + (r.gmv ?? 0), 0) : null;
  const anyPosts = rows.some((r) => r.postsThisMonth != null);
  const totalPosts = anyPosts ? rows.reduce((s, r) => s + (r.postsThisMonth ?? 0), 0) : null;
  const contractedCount = rows.filter((r) => r.retainer > 0).length;
  const affiliateCount = rows.length - contractedCount;

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-12">
      {/* Ledger page header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-ledger text-[13px] italic text-primary">My Brands</p>
          <h1 className="font-ledger mt-1 text-[26px] font-bold tracking-tight text-foreground">
            {firstName ? `${firstName}'s brands` : 'My Brands'}
          </h1>
          <p className="mt-1 text-[13.5px] text-muted-foreground">
            Every brand you&apos;re on — your retainer, pace, and slice of each brand&apos;s pie · {rangeLabel}
          </p>
        </div>
        <DateRangePicker defaultPreset="last30" />
      </div>

      {/* Ledger strip */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border shadow-[var(--pulse-elev-1)] sm:grid-cols-4">
        <StripCell
          k="Total retainer"
          v={`${formatCurrency(totalRetainer)}`}
          sub="per month"
        />
        <StripCell k={`GMV · you`} v={gmvLabel(totalGmv)} sub={rangeLabel.toLowerCase()} />
        <StripCell
          k="Posts this month"
          v={totalPosts == null ? '—' : totalPosts.toLocaleString('en-US')}
          sub="across all brands"
        />
        <StripCell
          k="Brands"
          v={String(rows.length)}
          sub={
            rows.length === 0
              ? undefined
              : `${contractedCount} contracted${affiliateCount > 0 ? ` · ${affiliateCount} affiliate` : ''}`
          }
        />
      </div>

      {/* Untapped-lane nudge */}
      {untapped && (
        <section
          className="flex items-center gap-3 rounded-2xl border px-4 py-3"
          style={{
            borderColor: 'color-mix(in srgb, var(--primary) 24%, var(--border))',
            background: 'color-mix(in srgb, var(--primary) 6%, var(--card))',
          }}
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-pulse-grad text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">
              You&apos;ve left {untapped.displayName} untapped.
            </span>{' '}
            It&apos;s assigned to you on {brandMeta.label(untapped.brandSlug)} and hasn&apos;t sold yet. One post
            could open a new lane.
          </p>
          <Link
            href="/creator-dashboard/discover"
            className="shrink-0 rounded-lg bg-primary/10 px-2.5 py-1 font-mono text-xs font-semibold text-primary hover:bg-primary/15"
          >
            Find an angle →
          </Link>
        </section>
      )}

      {/* Per-brand table */}
      {rows.length === 0 ? (
        <EmptyState
          icon={<Briefcase className="h-8 w-8" />}
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
                  <TH>Your GMV</TH>
                  <TH className="hidden md:table-cell">Brand GMV</TH>
                  <TH className="hidden md:table-cell">Your share</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => {
                  // A post commitment only exists on a CONTRACTED brand (retainer > 0).
                  // Affiliate-only brands ($0 retainer) carry a phantom
                  // monthly_post_requirement default and must NOT be flagged "Behind".
                  const contracted = r.retainer > 0;
                  const hasReq = contracted && r.monthlyPostRequirement > 0;
                  const behind =
                    r.postsThisMonth != null && hasReq && r.postsThisMonth < r.monthlyPostRequirement;
                  const standing = standings[r.brandSlug];
                  return (
                    <TR key={r.brandSlug} className="hover:bg-secondary/50">
                      <TD className="text-foreground">
                        <div className="flex items-center gap-3">
                          <DataAvatar color={r.brandColor}>{initials(r.brandDisplayName)}</DataAvatar>
                          <span className="font-semibold">{r.brandDisplayName}</span>
                        </div>
                      </TD>
                      <TD className="tabular-nums text-foreground">
                        {contracted ? (
                          formatCurrency(r.retainer)
                        ) : (
                          <Badge variant="neutral" size="sm">
                            Affiliate
                          </Badge>
                        )}
                      </TD>
                      <TD>
                        {r.postsThisMonth == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <span className="font-medium tabular-nums text-foreground">
                              {r.postsThisMonth}
                              {hasReq && (
                                <span className="text-muted-foreground"> / {r.monthlyPostRequirement}</span>
                              )}
                            </span>
                            {hasReq &&
                              (behind ? (
                                <Badge variant="warning" size="sm">
                                  Behind
                                </Badge>
                              ) : (
                                <Badge variant="positive" size="sm">
                                  On track
                                </Badge>
                              ))}
                          </div>
                        )}
                      </TD>
                      <TD className="font-bold tabular-nums text-[var(--pulse-pos)]">{gmvLabel(r.gmv)}</TD>
                      <TD className="hidden tabular-nums text-foreground md:table-cell">
                        {standing ? formatCurrency(standing.brandGmv) : '—'}
                      </TD>
                      <TD className="hidden md:table-cell">
                        {standing && standing.myShare > 0 ? (
                          <span className="text-pulse-grad font-ledger-num text-[15px] font-bold">
                            {(standing.myShare * 100).toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TD>
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

function StripCell({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="bg-card p-4 sm:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{k}</p>
      <p className="font-ledger-num mt-1.5 text-xl font-bold text-foreground sm:text-[23px]">{v}</p>
      {sub && <p className="mt-1 text-[11px] text-muted-foreground/70">{sub}</p>}
    </div>
  );
}
