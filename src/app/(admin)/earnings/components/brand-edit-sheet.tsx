'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CreatorOverridesSection } from './creator-overrides-section';

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
  initialValues: BrandSettingsValues;
  /**
   * Marketing GMV for the active month (read+edit). Lives in marketing_gmv table.
   * Pass null when editing brand settings outside a month context (e.g. /settings/brands).
   */
  marketingGmv: number | null;
  /** Active "YYYY-MM" being edited, or null when context-free. */
  activeMonth: string | null;
  onClose: () => void;
  onSaved: () => void;
}

const MODEL_OPTIONS: { value: CompensationModel; label: string; description: string }[] = [
  { value: 'standard', label: 'Standard', description: 'Retainer + commission (additive). Most brands.' },
  { value: 'revshare_max', label: 'Revshare Max', description: 'MAX(retainer, commission). Whichever is higher.' },
  { value: 'commission_only', label: 'Commission Only', description: 'No retainer applied.' },
  { value: 'retainer_only', label: 'Retainer Only', description: 'Flat retainer, no commission.' },
];

export function BrandEditSheet({ open, brand, brandLabel, initialValues, marketingGmv, activeMonth, onClose, onSaved }: Props) {
  const [values, setValues] = useState<BrandSettingsValues>(initialValues);
  const [marketing, setMarketing] = useState<number>(marketingGmv ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Whether we're operating in a month-specific context (i.e. earnings page)
  // vs context-free (i.e. /settings/brands).
  const hasMonthContext = activeMonth !== null && marketingGmv !== null;

  useEffect(() => {
    if (open) {
      setValues(initialValues);
      setMarketing(marketingGmv ?? 0);
      setError(null);
    }
  }, [open, initialValues, marketingGmv]);

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

      // Marketing GMV (separate table) — only when we have a month context
      if (hasMonthContext && marketing !== marketingGmv) {
        tasks.push(
          fetch('/api/earnings/marketing-gmv', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ brand, month: activeMonth, amount: marketing }),
          }),
        );
      }

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
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <button
        aria-label="Close"
        className="flex-1 bg-black/30 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400">Edit Brand</p>
            <h2 className="text-lg font-extrabold text-[#1A1B3A]">{brandLabel}</h2>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg hover:bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Compensation model */}
          <Section title="Compensation Model">
            <div className="space-y-2">
              {MODEL_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={cn(
                    'block rounded-xl border-2 p-3 cursor-pointer transition-colors',
                    values.compensation_model === opt.value
                      ? 'border-[#FF4D8D] bg-[#FFF0F5]'
                      : 'border-gray-200 hover:border-gray-300 bg-white',
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
                    <span className="text-sm font-bold text-[#1A1B3A]">{opt.label}</span>
                    {values.compensation_model === opt.value && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#FF4D8D]">Active</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>
                </label>
              ))}
            </div>
          </Section>

          {/* Rates */}
          <Section title="Rates">
            <Field label="Commission Rate" suffix="%" hint="Your commission on creator GMV">
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
            <Field label="Monthly Retainer" prefix="$">
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

          {/* This-month-specific (only when there's a month context) */}
          {hasMonthContext && (
            <Section title={`This Month (${activeMonth})`}>
              <Field label="Marketing GMV" prefix="$" hint="Manual entry for this month only">
                <NumberInput value={marketing} step={100} onChange={setMarketing} />
              </Field>
            </Section>
          )}

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3 bg-gray-50/40">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-[#FF4D8D] rounded-xl hover:bg-[#E91E8C] disabled:opacity-50 transition-colors shadow-sm"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Form atoms ────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500 mb-3">{title}</h3>
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
        <span className="text-xs font-semibold text-gray-700">{label}</span>
        {hint && <span className="text-[11px] text-gray-400 font-normal">{hint}</span>}
      </div>
      <div className="relative flex items-center">
        {prefix && <span className="absolute left-3 text-sm text-gray-400 pointer-events-none">{prefix}</span>}
        <div className={cn('w-full', prefix && '[&_input]:pl-7', suffix && '[&_input]:pr-8')}>
          {children}
        </div>
        {suffix && <span className="absolute right-3 text-sm text-gray-400 pointer-events-none">{suffix}</span>}
      </div>
    </label>
  );
}

function NumberInput({ value, step, onChange }: { value: number; step: number; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  return (
    <input
      type="number"
      step={step}
      min={0}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = parseFloat(e.target.value);
        if (Number.isFinite(n) && n >= 0) onChange(n);
      }}
      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-[#1A1B3A] bg-white tabular-nums focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30 focus:border-[#FF4D8D] transition-colors"
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
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-[#1A1B3A] bg-white focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30 focus:border-[#FF4D8D] transition-colors"
    />
  );
}

function TextArea({ value, placeholder, onChange }: { value: string; placeholder?: string; onChange: (v: string) => void }) {
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-[#1A1B3A] bg-white focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30 focus:border-[#FF4D8D] transition-colors resize-y"
    />
  );
}
