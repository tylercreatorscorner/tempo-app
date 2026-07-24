'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CreatorOverridesSection } from './creator-overrides-section';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export type CompensationModel = 'standard' | 'revshare_max' | 'commission_only' | 'retainer_only';

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

interface Props {
  open: boolean;
  brand: string;
  brandLabel: string;
  /** The payee whose compensation is being edited — must match the one the
   *  Earnings table is showing, or the save lands on the wrong row. */
  teamMemberId?: string | null;
  initialValues: BrandSettingsValues;
  /**
   * @deprecated Marketing GMV is now edited inline on the Earnings table, not in
   * this drawer. Retained as optional props so existing callers keep compiling;
   * the drawer no longer renders a Marketing GMV field.
   */
  marketingGmv?: number | null;
  /** @deprecated See marketingGmv — no longer used by the drawer. */
  activeMonth?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

const MODEL_OPTIONS: { value: CompensationModel; label: string; description: string }[] = [
  { value: 'standard', label: 'Standard', description: 'Retainer + commission (additive). Most brands.' },
  { value: 'revshare_max', label: 'Revshare Max', description: 'MAX(retainer, commission). Whichever is higher.' },
  { value: 'commission_only', label: 'Commission Only', description: 'No retainer applied.' },
  { value: 'retainer_only', label: 'Retainer Only', description: 'Flat retainer, no commission.' },
];

export function BrandEditSheet({ open, brand, brandLabel, teamMemberId, initialValues, onClose, onSaved }: Props) {
  const [values, setValues] = useState<BrandSettingsValues>(initialValues);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValues(initialValues);
      setError(null);
    }
  }, [open, initialValues]);

  if (!open) return null;

  const set = <K extends keyof BrandSettingsValues>(k: K, v: BrandSettingsValues[K]) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const tasks: Promise<Response>[] = [];

      // Brand settings patch
      tasks.push(
        fetch('/api/earnings/brand-settings', {
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
        }),
      );

      const results = await Promise.all(tasks);
      for (const r of results) {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || `HTTP ${r.status}`);
        }
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalOverlay onClose={onClose} closeOnBackdropClick={false}>
    <div className="absolute inset-0 flex">
      {/* Backdrop */}
      <button
        aria-label="Close"
        className="flex-1 bg-black/30 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="w-full max-w-md bg-card shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="px-6 py-5 border-b border-border flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Edit Brand</p>
            <h2 className="text-lg font-extrabold text-[var(--foreground)]">{brandLabel}</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Form */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-6">
          {/* Compensation model */}
          <Section title="Compensation Model">
            <div className="space-y-2">
              {MODEL_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={cn(
                    'block rounded-xl border-2 p-3 cursor-pointer transition-colors',
                    values.compensation_model === opt.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-border bg-card',
                  )}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    name="compensation_model"
                    value={opt.value}
                    checked={values.compensation_model === opt.value}
                    onChange={() => set('compensation_model', opt.value)}
                  />
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-bold text-[var(--foreground)]">{opt.label}</span>
                    {values.compensation_model === opt.value && (
                      <Badge variant="accent" size="sm">Active</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                </label>
              ))}
            </div>
          </Section>

          {/* Rates */}
          <Section title="Rates">
            <Field
              label="Commission Rate"
              suffix="%"
              hint={
                values.compensation_model === 'retainer_only'
                  ? 'Saved but NOT billed: this arrangement is retainer only. Change the model below to bill it.'
                  : 'Your commission on creator GMV'
              }
            >
              <NumberInput value={values.commission_rate} step={0.25} onChange={(v) => set('commission_rate', v)} />
            </Field>
            <Field label="Marketing Commission Rate" suffix="%" hint="Rate on manually-entered marketing GMV">
              <NumberInput
                value={values.marketing_commission_rate * 100}
                step={0.25}
                onChange={(v) => set('marketing_commission_rate', v / 100)}
              />
            </Field>
          </Section>

          {/* Retainers + fees */}
          <Section title="Retainer & Fees">
            <Field
              label="Monthly Retainer"
              prefix="$"
              hint={
                values.compensation_model === 'commission_only'
                  ? 'Saved but NOT billed: this arrangement is commission only. Change the model below to bill it.'
                  : values.compensation_model === 'revshare_max'
                    ? 'Billed only when it beats the commission (revshare max).'
                    : undefined
              }
            >
              <NumberInput value={values.retainer} step={100} onChange={(v) => set('retainer', v)} />
            </Field>
            <Field label="Product Retainer" prefix="$" hint="Optional — separate line item">
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

          {/* Bill-to (used for invoices) */}
          <Section title="Invoice Recipient">
            <Field label="Recipient Name" hint="Used as default on invoices">
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

          {/* Payment instructions (per-brand) */}
          <Section title="Payment Instructions">
            <Field label="How this brand pays you" hint="Multi-line · falls back to a global default if blank">
              <TextArea
                value={values.payment_instructions ?? ''}
                placeholder="Wire to:&#10;  Bank: ...&#10;  Routing #: ...&#10;  Account #: ..."
                onChange={(v) => set('payment_instructions', v || null)}
              />
            </Field>
          </Section>

          {/* Goals — always shown */}
          <Section title="Goals">
            <Field label="Monthly GMV Goal" prefix="$" hint="Used by the goal gauge on Earnings">
              <NumberInput value={values.monthly_gmv_goal} step={1000} onChange={(v) => set('monthly_gmv_goal', v)} />
            </Field>
          </Section>

          {error && (
            <div className="rounded-xl bg-[var(--pulse-neg-bg)] border border-[var(--pulse-neg)]/20 px-4 py-3 text-sm text-[var(--pulse-neg)]">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3 bg-muted/40">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </div>
    </ModalOverlay>
  );
}

// ── Form atoms ────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-3">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, hint, prefix, suffix, children }: {
  label: string;
  hint?: string;
  prefix?: string;
  suffix?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-semibold text-foreground">{label}</span>
        {hint && <span className="text-[11px] text-muted-foreground font-normal">{hint}</span>}
      </div>
      <div className="relative flex items-center">
        {prefix && <span className="absolute left-3 text-sm text-muted-foreground pointer-events-none">{prefix}</span>}
        <div className={cn('w-full', prefix && '[&_input]:pl-7', suffix && '[&_input]:pr-8')}>
          {children}
        </div>
        {suffix && <span className="absolute right-3 text-sm text-muted-foreground pointer-events-none">{suffix}</span>}
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
