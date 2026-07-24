'use client';

/**
 * The Arrangement Editor - slide-over for one (brand x payee) billing
 * arrangement.
 *
 * Rebuilt around the owner-reported "nothing saves" incident: every field DID
 * persist at the API layer; the experience hid it. This editor makes each
 * edit's consequence visible:
 *
 *  - Every section carries a WHERE-IT-SHOWS caption, so saving bill-to or the
 *    GMV goal (fields with no cockpit column) no longer looks like a no-op.
 *  - A sticky footer preview recomputes the billed total AS THE USER TYPES via
 *    the same pure math the server runs (applyCompensationModel), and says
 *    loudly when the model excludes an edited field (e.g. a commission_only
 *    retainer is saved but not billed).
 *  - The header names the payee: arrangements are keyed per (brand, team
 *    member), which was invisible before and made cross-payee edits look lost.
 *  - Draft state initializes on open and is NEVER clobbered by a background
 *    refetch landing mid-edit (the old sheet reset on every initialValues
 *    reference change). Dirty closes confirm before discarding.
 *
 * On save the sheet PATCHes /api/earnings/brand-settings (res.ok-guarded) and
 * hands the saved values back via onSaved(saved) so the caller can patch its
 * rows optimistically while the authoritative refetch reconciles.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Save, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/format';
import { applyCompensationModel, type CompensationModel } from '@/lib/finance/invoice-math';
import { CreatorOverridesSection } from './creator-overrides-section';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

// Re-exported for existing importers (./types, settings/brands) — the union
// itself lives with the shared invoice math so the two can never drift.
export type { CompensationModel };

export interface BrandSettingsValues {
  commission_rate: number;
  retainer: number;
  launch_fee: number;
  launch_fee_name: string | null;
  launch_fee_ends: string | null;
  product_retainer_amount: number;
  product_retainer_name: string | null;
  monthly_gmv_goal: number;
  marketing_commission_rate: number; // decimal e.g. 0.02
  compensation_model: CompensationModel;
  bill_to_name: string | null;
  bill_to_email: string | null;
  bill_to_address: string | null;
  payment_instructions: string | null;
}

/**
 * Month-scoped earnings context for the live billed preview strip. Callers
 * without a month in scope (Settings -> Brands) omit it; the strip hides.
 */
export interface ArrangementPreviewContext {
  /** e.g. "July" - names the month the preview is billing. */
  monthLabel: string;
  affiliateGmv: number;
  marketingGmv: number;
  /** Brand default rate (pct) the creator rows were computed against - used
   *  to tell per-creator overrides apart from the default when re-rating. */
  brandRate: number;
  /** Per-creator GMV + effective rate from the earnings row. May be empty
   *  when the server dropped the breakdown (model zeroed the commission). */
  creators: Array<{ gmv: number; rate: number }>;
}

interface Props {
  open: boolean;
  brand: string;
  brandLabel: string;
  /** The payee whose compensation is being edited — must match the one the
   *  Earnings table is showing, or the save lands on the wrong row. */
  teamMemberId?: string | null;
  /** Payee display name for the header — the arrangement is per (brand, payee). */
  payeeName?: string | null;
  initialValues: BrandSettingsValues;
  /** Earnings context for the live billed preview; omit to hide the strip. */
  preview?: ArrangementPreviewContext | null;
  /**
   * @deprecated Marketing GMV is now edited inline on the Earnings table, not in
   * this drawer. Retained as optional props so existing callers keep compiling;
   * the drawer no longer renders a Marketing GMV field.
   */
  marketingGmv?: number | null;
  /** @deprecated See marketingGmv — no longer used by the drawer. */
  activeMonth?: string | null;
  onClose: () => void;
  /** Called with the saved values so the caller can patch its rows optimistically. */
  onSaved: (saved: BrandSettingsValues) => void;
}

const MODEL_OPTIONS: { value: CompensationModel; label: string; formula: string }[] = [
  { value: 'standard', label: 'Standard', formula: 'Retainer + commission' },
  { value: 'revshare_max', label: 'Revshare Max', formula: 'MAX(retainer, commission)' },
  { value: 'commission_only', label: 'Commission Only', formula: 'Retainer not billed' },
  { value: 'retainer_only', label: 'Retainer Only', formula: 'Commission not billed' },
];

function modelLabelOf(m: CompensationModel): string {
  return MODEL_OPTIONS.find((o) => o.value === m)?.label ?? m;
}

export function BrandEditSheet({
  open, brand, brandLabel, teamMemberId, payeeName, initialValues, preview, onClose, onSaved,
}: Props) {
  const [values, setValues] = useState<BrandSettingsValues>(initialValues);
  const [baseline, setBaseline] = useState<BrandSettingsValues>(initialValues);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the draft ONLY on a closed -> open transition — deliberately NOT on
  // initialValues reference changes. The caller derives initialValues from its
  // live rows array, so a background refetch landing mid-edit would otherwise
  // clobber in-progress typing (the old sheet did exactly that).
  const initialRef = useRef(initialValues);
  initialRef.current = initialValues;
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setValues(initialRef.current);
      setBaseline(initialRef.current);
      setError(null);
    }
    wasOpen.current = open;
  }, [open]);

  // Live billed preview — the SAME pure combine math the server runs. The
  // affiliate side re-rates each creator's GMV: per-creator overrides (rate
  // differs from the brand default the row was computed at) keep their
  // override; everyone else takes the edited rate. When the server dropped
  // the creator breakdown (model had zeroed commission) we estimate at the
  // flat edited rate and say so.
  const previewCalc = useMemo(() => {
    if (!preview) return null;
    let affiliateCommission: number;
    let approximate = false;
    if (preview.creators.length > 0) {
      affiliateCommission = preview.creators.reduce((sum, c) => {
        const isOverride = Math.abs(c.rate - preview.brandRate) > 0.01;
        const pct = isOverride ? c.rate : values.commission_rate;
        return sum + (c.gmv * pct) / 100;
      }, 0);
    } else {
      affiliateCommission = (preview.affiliateGmv * values.commission_rate) / 100;
      approximate = preview.affiliateGmv > 0;
    }
    const marketingCommission = preview.marketingGmv * values.marketing_commission_rate;
    const commission = affiliateCommission + marketingCommission;
    const adj = applyCompensationModel(commission, values.retainer, values.compensation_model);
    const billed = adj.commission + adj.retainer + values.product_retainer_amount + values.launch_fee;
    return { commission, adj, billed, approximate };
  }, [preview, values]);

  if (!open) return null;

  const set = <K extends keyof BrandSettingsValues>(k: K, v: BrandSettingsValues[K]) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  const dirty = (Object.keys(values) as Array<keyof BrandSettingsValues>).some(
    (k) => values[k] !== baseline[k],
  );

  // Every close path (Esc, backdrop, Cancel, X) runs the unsaved-changes guard.
  const requestClose = () => {
    if (saving) return;
    if (dirty && !confirm('Discard unsaved changes?')) return;
    onClose();
  };

  // Model-exclusion notices — said loudly, not hinted. A saved-but-not-billed
  // field is exactly what read as "nothing saves" before.
  const modelNotices: string[] = [];
  if (values.compensation_model === 'commission_only' && values.retainer > 0) {
    modelNotices.push(
      `Retainer ${formatCurrency(values.retainer)} is saved but not billed - commission only`,
    );
  }
  if (values.compensation_model === 'retainer_only' && values.commission_rate > 0) {
    modelNotices.push('Commission is saved but not billed - retainer only');
  }
  if (values.compensation_model === 'revshare_max' && previewCalc?.adj.revshareMaxOutcome) {
    const o = previewCalc.adj.revshareMaxOutcome;
    const loser = o.winner === 'commission' ? 'retainer' : 'commission';
    modelNotices.push(
      `Revshare max: ${o.winner} wins at ${formatCurrency(o.activeAmount)} (vs ${formatCurrency(o.comparison)} ${loser}) - only the winner is billed`,
    );
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/earnings/brand-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand,
          // Target the payee currently shown in the table; without this the
          // API defaults to the first team member and the edit lands there.
          team_member_id: teamMemberId ?? undefined,
          patch: {
            commission_rate: values.commission_rate,
            retainer: values.retainer,
            launch_fee: values.launch_fee,
            launch_fee_name: values.launch_fee_name,
            launch_fee_ends: values.launch_fee_ends,
            product_retainer_amount: values.product_retainer_amount,
            product_retainer_name: values.product_retainer_name,
            monthly_gmv_goal: values.monthly_gmv_goal,
            marketing_commission_rate: values.marketing_commission_rate,
            compensation_model: values.compensation_model,
            bill_to_name: values.bill_to_name,
            bill_to_email: values.bill_to_email,
            bill_to_address: values.bill_to_address,
            payment_instructions: values.payment_instructions,
          },
        }),
      });
      if (!res.ok) {
        const j: { error?: string } = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      onSaved(values);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalOverlay onClose={requestClose} closeOnBackdropClick={false}>
      <div className="absolute inset-0 flex">
        {/* Backdrop */}
        <button
          aria-label="Close"
          className="flex-1 bg-black/30 backdrop-blur-sm transition-opacity"
          onClick={requestClose}
        />

        {/* Drawer */}
        <div className="flex w-full max-w-md animate-in slide-in-from-right flex-col bg-card shadow-2xl duration-300">
          {/* Header — names the payee: this arrangement is per (brand, payee). */}
          <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-5">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                Edit arrangement
              </p>
              <h2 className="truncate text-lg font-extrabold text-foreground">
                {brandLabel} arrangement
                {payeeName && (
                  <span className="font-semibold text-muted-foreground"> · {payeeName}</span>
                )}
              </h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {payeeName
                  ? 'Billing fields apply to this payee only. Invoicing details and the goal are brand-wide.'
                  : 'Billing fields are per payee. Invoicing details and the goal are brand-wide.'}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={requestClose} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Form */}
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
            {/* ── Billing arrangement (this payee) ── */}
            <Section
              title="Billing arrangement (this payee)"
              caption="Drives the Earnings table and invoices"
            >
              {/* Compensation model — how retainer and commission combine */}
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Compensation model">
                {MODEL_OPTIONS.map((opt) => {
                  const active = values.compensation_model === opt.value;
                  return (
                    <label
                      key={opt.value}
                      className={cn(
                        'block cursor-pointer rounded-xl border-2 p-2.5 transition-colors',
                        active ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/40',
                      )}
                    >
                      <input
                        type="radio"
                        className="sr-only"
                        name="compensation_model"
                        value={opt.value}
                        checked={active}
                        onChange={() => set('compensation_model', opt.value)}
                      />
                      <span className={cn('block text-xs font-bold', active ? 'text-primary' : 'text-foreground')}>
                        {opt.label}
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">
                        {opt.formula}
                      </span>
                    </label>
                  );
                })}
              </div>

              <Field
                label="Commission Rate"
                suffix="%"
                hint={
                  values.compensation_model === 'retainer_only'
                    ? <NotBilledHint text="retainer only" />
                    : 'Your rate on creator GMV'
                }
              >
                <NumberInput value={values.commission_rate} step={0.25} onChange={(v) => set('commission_rate', v)} />
              </Field>
              <Field
                label="Marketing Commission Rate"
                suffix="%"
                hint={
                  values.compensation_model === 'retainer_only'
                    ? <NotBilledHint text="retainer only" />
                    : 'Rate on manually-entered marketing GMV'
                }
              >
                <NumberInput
                  // Stored as a decimal (0.02 = 2%). The x100 display round-trip is
                  // float-unstable (0.07 * 100 = 7.000000000000001, rewriting the
                  // user's keystroke) — snap to 4 decimals of a percent.
                  value={Number((values.marketing_commission_rate * 100).toFixed(4))}
                  step={0.25}
                  onChange={(v) => set('marketing_commission_rate', v / 100)}
                />
              </Field>
              <Field
                label="Monthly Retainer"
                prefix="$"
                hint={
                  values.compensation_model === 'commission_only'
                    ? <NotBilledHint text="commission only" />
                    : values.compensation_model === 'revshare_max'
                      ? 'Billed only when it beats the commission'
                      : undefined
                }
              >
                <NumberInput value={values.retainer} step={100} onChange={(v) => set('retainer', v)} />
              </Field>
              <Field label="Product Retainer" prefix="$" hint="Optional separate line item, billed under every model">
                <NumberInput value={values.product_retainer_amount} step={100} onChange={(v) => set('product_retainer_amount', v)} />
              </Field>
              <Field label="Product Retainer Label">
                <TextInput
                  value={values.product_retainer_name ?? ''}
                  placeholder="e.g. Premium Membership"
                  onChange={(v) => set('product_retainer_name', v || null)}
                />
              </Field>
              <Field label="Launch Fee" prefix="$" hint="One-time or limited-period">
                <NumberInput value={values.launch_fee} step={100} onChange={(v) => set('launch_fee', v)} />
              </Field>
              <Field label="Launch Fee Label">
                <TextInput
                  value={values.launch_fee_name ?? ''}
                  placeholder="e.g. Q3 Launch"
                  onChange={(v) => set('launch_fee_name', v || null)}
                />
              </Field>
              <Field label="Launch Fee Ends" hint="Optional date when this fee stops">
                <TextInput
                  type="date"
                  value={values.launch_fee_ends ?? ''}
                  onChange={(v) => set('launch_fee_ends', v || null)}
                />
              </Field>
            </Section>

            {/* Per-creator rate overrides — saves immediately, separate from main form */}
            <CreatorOverridesSection brand={brand} brandRate={values.commission_rate} />

            {/* ── Brand invoicing details ── */}
            <Section title="Brand invoicing details" caption="Appears on invoices only">
              <Field label="Recipient Name" hint="Default bill-to on invoices">
                <TextInput
                  value={values.bill_to_name ?? ''}
                  placeholder="e.g. Jane Smith, Accounts Payable"
                  onChange={(v) => set('bill_to_name', v || null)}
                />
              </Field>
              <Field label="Email">
                <TextInput
                  value={values.bill_to_email ?? ''}
                  placeholder="ap@brand.com"
                  onChange={(v) => set('bill_to_email', v || null)}
                />
              </Field>
              <Field label="Address" hint="Multi-line">
                <TextArea
                  value={values.bill_to_address ?? ''}
                  placeholder="123 Main St&#10;Atlanta, GA 30303"
                  onChange={(v) => set('bill_to_address', v || null)}
                />
              </Field>
            </Section>

            {/* ── Goal ── */}
            <Section title="Goal" caption="Used by the Daily Drop goal pacing">
              <Field label="Monthly GMV Goal" prefix="$">
                <NumberInput value={values.monthly_gmv_goal} step={1000} onChange={(v) => set('monthly_gmv_goal', v)} />
              </Field>
            </Section>

            {/* ── Payment instructions (per-payee) ── */}
            <Section
              title="Payment instructions"
              caption={payeeName ? `Appears on invoices for ${payeeName}` : 'Appears on invoices for this payee'}
            >
              <Field label="How this brand pays you" hint="Multi-line · falls back to a global default if blank">
                <TextArea
                  value={values.payment_instructions ?? ''}
                  placeholder="Wire to:&#10;  Bank: ...&#10;  Routing #: ...&#10;  Account #: ..."
                  onChange={(v) => set('payment_instructions', v || null)}
                />
              </Field>
            </Section>
          </div>

          {/* Sticky footer: live billed preview + notices + actions */}
          <div className="border-t border-border bg-muted/40">
            {(previewCalc || modelNotices.length > 0) && (
              <div className="space-y-1.5 border-b border-border/70 px-6 py-3">
                {previewCalc && preview && (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground"
                        title="Recomputes as you type; reconciles with the server after save"
                      >
                        Billed this month · {preview.monthLabel}
                      </span>
                      <Badge variant="accent" size="sm">{modelLabelOf(values.compensation_model)}</Badge>
                    </div>
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-xl font-extrabold tabular-nums text-foreground">
                        {formatCurrency(previewCalc.billed)}
                      </span>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        = {formatCurrency(previewCalc.adj.commission)} commission
                        {' + '}{formatCurrency(previewCalc.adj.retainer)} retainer
                        {values.product_retainer_amount > 0 && <>{' + '}{formatCurrency(values.product_retainer_amount)} product</>}
                        {values.launch_fee > 0 && <>{' + '}{formatCurrency(values.launch_fee)} launch fee</>}
                      </span>
                    </div>
                    {previewCalc.approximate && (
                      <p className="text-[10px] text-muted-foreground">
                        Estimated at the flat rate - the saved calculation applies per-creator overrides.
                      </p>
                    )}
                  </>
                )}
                {modelNotices.map((n) => (
                  <p key={n} className="flex items-start gap-1.5 text-[11px] font-semibold text-[var(--pulse-warn)]">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    {n}
                  </p>
                ))}
              </div>
            )}

            {error && (
              <div className="px-6 pt-3">
                <div className="rounded-xl border border-[var(--pulse-neg)]/20 bg-[var(--pulse-neg-bg)] px-4 py-2.5 text-sm text-[var(--pulse-neg)]">
                  {error}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 px-6 py-4">
              <Button variant="ghost" onClick={requestClose} disabled={saving}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={saving || !dirty}
                title={dirty ? undefined : 'No changes to save'}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ── Form atoms ────────────────────────────────────────────────────

function Section({ title, caption, children }: {
  title: string;
  /** WHERE-IT-SHOWS: names the surface this section's fields appear on. */
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{title}</h3>
        {caption && <p className="mt-0.5 text-[11px] text-muted-foreground/80">{caption}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/** Loud "saved but not billed" field hint for model-excluded values. */
function NotBilledHint({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1 font-semibold text-[var(--pulse-warn)]">
      <AlertTriangle className="h-3 w-3" />
      Saved but not billed - {text}
    </span>
  );
}

function Field({ label, hint, prefix, suffix, children }: {
  label: string;
  hint?: React.ReactNode;
  prefix?: string;
  suffix?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">{label}</span>
        {hint && <span className="text-right text-[11px] font-normal text-muted-foreground">{hint}</span>}
      </div>
      <div className="relative flex items-center">
        {prefix && <span className="pointer-events-none absolute left-3 text-sm text-muted-foreground">{prefix}</span>}
        <div className={cn('w-full', prefix && '[&_input]:pl-7', suffix && '[&_input]:pr-8')}>
          {children}
        </div>
        {suffix && <span className="pointer-events-none absolute right-3 text-sm text-muted-foreground">{suffix}</span>}
      </div>
    </label>
  );
}

function NumberInput({ value, step, onChange }: { value: number; step: number; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  return (
    <Input
      type="number"
      step={step}
      min={0}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = parseFloat(e.target.value);
        if (Number.isFinite(n) && n >= 0) onChange(n);
      }}
      className="tabular-nums"
    />
  );
}

function TextInput({ value, placeholder, type = 'text', onChange }: {
  value: string;
  placeholder?: string;
  type?: 'text' | 'date';
  onChange: (v: string) => void;
}) {
  return (
    <Input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function TextArea({ value, placeholder, onChange }: { value: string; placeholder?: string; onChange: (v: string) => void }) {
  return (
    <Textarea
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
    />
  );
}
