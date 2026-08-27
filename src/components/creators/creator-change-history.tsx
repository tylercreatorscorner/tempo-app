/**
 * Creator change timeline (Phase 3 of creator change history).
 *
 * Reads roster_audit_log via getCreatorChangeHistory. Every entry is a real
 * recorded change — the trigger writes nothing for a save that changed nothing,
 * so an empty timeline means nobody has edited this creator since history began
 * on 27 Aug 2026, not that the feature is broken.
 *
 * ⚠️ Retainer is already stripped upstream for finance-blind viewers, and an
 * entry left with nothing else to show is dropped there too. This component
 * must not reintroduce it.
 */
import { formatCurrency } from '@/lib/utils/format';
import type { CreatorChangeEntry } from '@/lib/data/creator-profile';

/** Column names are not labels. Anything unmapped falls back to a de-snaked name. */
const FIELD_LABELS: Record<string, string> = {
  retainer: 'Retainer',
  monthly_post_requirement: 'Monthly post requirement',
  real_name: 'Name',
  brand: 'Brand',
  status: 'Status',
  employment_status: 'Employment status',
  notes: 'Notes',
  discord_name: 'Discord name',
  discord_id: 'Discord ID',
  archived_at: 'Archived',
  product_assignments: 'Products',
  product_retainers: 'Per-product retainers',
  creator_id: 'Linked identity',
  contract_length_days: 'Contract length',
  termination_reason: 'Termination reason',
  current_tier: 'Tier',
  email: 'Email',
  phone: 'Phone',
  account_1: 'TikTok handle',
  account_2: 'TikTok handle 2',
  account_3: 'TikTok handle 3',
  account_4: 'TikTok handle 4',
  account_5: 'TikTok handle 5',
};

function label(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Render a stored jsonb value.
 *
 * Absence is an em dash, never "0" or "none" — a retainer that went from
 * nothing to $1,500 and one that went from $0 to $1,500 are the same change,
 * but "—" does not assert a figure we never held.
 */
function value(field: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (field === 'retainer' && (typeof v === 'number' || typeof v === 'string')) {
    const n = Number(v);
    return Number.isFinite(n) ? formatCurrency(n) : String(v);
  }
  if (Array.isArray(v)) return v.length === 0 ? '—' : v.join(', ');
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'object') {
    const keys = Object.keys(v as Record<string, unknown>);
    return keys.length === 0 ? '—' : `${keys.length} item${keys.length === 1 ? '' : 's'}`;
  }
  const s = String(v);
  // Timestamps read as noise at full precision.
  const m = /^(\d{4})-(\d{2})-(\d{2})T/.exec(s);
  if (m) return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return s.length > 60 ? s.slice(0, 60) + '…' : s;
}

const ACTION_LABEL: Record<string, string> = {
  create: 'Added to roster',
  update: 'Edited',
  archive: 'Archived',
  unarchive: 'Restored to roster',
  delete: 'Removed',
};

function when(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export function CreatorChangeHistory({
  entries,
  brandLabelFor,
  multiBrand,
}: {
  entries: CreatorChangeEntry[];
  /** Slug -> display name, resolved by the page (the registry is DB-driven). */
  brandLabelFor: (slug: string | null) => string | null;
  /** Only worth showing a brand chip when the creator is on more than one. */
  multiBrand: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-3.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.075em] text-muted-foreground">
          Change history
        </span>
        <span className="text-[11px] text-muted-foreground">
          Recording began 27 Aug 2026
        </span>
      </div>

      {entries.length === 0 ? (
        // Says which of the two possible reasons this is. An empty feed that
        // does not distinguish "no edits" from "not working" teaches people to
        // distrust it.
        <p className="px-5 py-4 text-sm text-muted-foreground">
          No changes recorded since 27 Aug 2026. Edits made before then were not tracked.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {entries.map((e) => {
            const brand = multiBrand ? brandLabelFor(e.brand) : null;
            return (
              <li key={e.id} className="px-5 py-3">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold text-foreground">
                    {ACTION_LABEL[e.action] ?? e.action}
                  </span>
                  {brand && (
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {brand}
                    </span>
                  )}
                  <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{when(e.changedAt)}</span>
                </div>

                {e.fields.length > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {e.fields.map((f) => (
                      <li key={f.field} className="text-[13px] leading-snug text-muted-foreground">
                        <span className="font-medium text-foreground">{label(f.field)}</span>{' '}
                        <span className="tabular-nums">{value(f.field, f.from)}</span>
                        <span className="mx-1.5 text-muted-foreground/70">&rarr;</span>
                        <span className="font-semibold tabular-nums text-foreground">
                          {value(f.field, f.to)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-1 text-[11px] text-muted-foreground">
                  {/* Never invent an actor. A write that did not identify a user
                      says so — attributing it to the last known editor would be
                      worse than admitting we do not know. */}
                  {e.changedBy ? `by ${e.changedBy}` : 'by an unrecorded user'}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
