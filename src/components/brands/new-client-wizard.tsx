'use client';

/**
 * New Client Wizard — three-step modal that creates a brand, fills in
 * financial terms, and invites client contacts in a single flow.
 *
 * Step 1: Identity (slug, name, color)         — required
 * Step 2: Financial terms                       — optional, recommended
 * Step 3: Invite contacts                       — optional
 *
 * All three steps are submitted in one POST /api/clients call. Server
 * returns warnings + per-contact invite status; the wizard surfaces them
 * before closing so partial failures aren't silent.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  X, Loader2, ArrowRight, ArrowLeft, Sparkles, DollarSign, UserPlus,
  Check, Trash2, AlertCircle, Mail, Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type CompensationModel = 'standard' | 'revshare_max' | 'commission_only' | 'retainer_only';

const COLOR_PRESETS = [
  '#FF4D8D', '#7C5CFC', '#3B82F6', '#10B981', '#F59E0B',
  '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#14B8A6',
];

const MODEL_OPTIONS: { value: CompensationModel; label: string; description: string }[] = [
  { value: 'standard', label: 'Standard', description: 'Retainer + commission (additive). Most brands.' },
  { value: 'revshare_max', label: 'Revshare Max', description: 'MAX(retainer, commission). Whichever is higher.' },
  { value: 'commission_only', label: 'Commission Only', description: 'No retainer applied.' },
  { value: 'retainer_only', label: 'Retainer Only', description: 'Flat retainer, no commission.' },
];

interface InviteResult {
  email: string;
  status: 'invited' | 'existing' | 'error';
  error?: string;
}

interface Identity {
  name: string;
  slug: string;
  color: string;
}

interface Financial {
  compensation_model: CompensationModel;
  commission_rate: string;        // % as user-typed string
  retainer: string;               // $
  launch_fee: string;             // $
  launch_fee_name: string;
  launch_fee_ends: string;        // YYYY-MM-DD
  product_retainer_amount: string;
  product_retainer_name: string;
  monthly_gmv_goal: string;
  marketing_commission_rate: string; // % as user-typed
  bill_to_name: string;
  bill_to_email: string;
  bill_to_address: string;
}

const EMPTY_FIN: Financial = {
  compensation_model: 'standard',
  commission_rate: '',
  retainer: '',
  launch_fee: '',
  launch_fee_name: '',
  launch_fee_ends: '',
  product_retainer_amount: '',
  product_retainer_name: '',
  monthly_gmv_goal: '',
  marketing_commission_rate: '2',
  bill_to_name: '',
  bill_to_email: '',
  bill_to_address: '',
};

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (brand: { id: string; slug: string; name: string }) => void;
}

export function NewClientWizard({ open, onClose, onCreated }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [identity, setIdentity] = useState<Identity>({ name: '', slug: '', color: COLOR_PRESETS[0] });
  const [slugDirty, setSlugDirty] = useState(false);
  const [financial, setFinancial] = useState<Financial>(EMPTY_FIN);
  const [contactEmails, setContactEmails] = useState<string[]>([]);
  const [pendingEmail, setPendingEmail] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [contactResults, setContactResults] = useState<InviteResult[]>([]);
  const [successBrand, setSuccessBrand] = useState<{ id: string; slug: string; name: string } | null>(null);

  useEffect(() => {
    if (open) {
      setStep(1);
      setIdentity({ name: '', slug: '', color: COLOR_PRESETS[0] });
      setSlugDirty(false);
      setFinancial(EMPTY_FIN);
      setContactEmails([]);
      setPendingEmail('');
      setError(null);
      setWarnings([]);
      setContactResults([]);
      setSuccessBrand(null);
      setSubmitting(false);
    }
  }, [open]);

  const slugValid = /^[a-z0-9_]+$/.test(identity.slug);
  const canAdvanceStep1 = identity.name.trim().length > 0 && identity.slug.length > 0 && slugValid;

  const pendingEmailValid = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pendingEmail.trim()),
    [pendingEmail],
  );

  if (!open) return null;

  function handleNameChange(v: string) {
    setIdentity((p) => ({
      ...p,
      name: v,
      slug: slugDirty
        ? p.slug
        : v.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
    }));
  }

  function handleSlugChange(v: string) {
    setSlugDirty(true);
    setIdentity((p) => ({ ...p, slug: v.toLowerCase().replace(/[^a-z0-9_]/g, '_') }));
  }

  function addContact() {
    const e = pendingEmail.trim().toLowerCase();
    if (!e || !pendingEmailValid) return;
    if (contactEmails.includes(e)) {
      setPendingEmail('');
      return;
    }
    setContactEmails((prev) => [...prev, e]);
    setPendingEmail('');
  }

  function removeContact(e: string) {
    setContactEmails((prev) => prev.filter((x) => x !== e));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    setWarnings([]);
    setContactResults([]);

    const numOrUndef = (s: string) => {
      const t = s.trim();
      if (t === '') return undefined;
      const n = parseFloat(t);
      return Number.isFinite(n) ? n : undefined;
    };
    const strOrUndef = (s: string) => (s.trim() === '' ? undefined : s.trim());

    const payload = {
      identity: {
        slug: identity.slug,
        name: identity.name.trim(),
        color: identity.color,
      },
      settings: {
        monthly_gmv_goal: numOrUndef(financial.monthly_gmv_goal),
        bill_to_name: strOrUndef(financial.bill_to_name),
        bill_to_email: strOrUndef(financial.bill_to_email),
        bill_to_address: strOrUndef(financial.bill_to_address),
      },
      compensation: {
        compensation_model: financial.compensation_model,
        commission_rate: numOrUndef(financial.commission_rate),
        retainer: numOrUndef(financial.retainer),
        launch_fee: numOrUndef(financial.launch_fee),
        launch_fee_name: strOrUndef(financial.launch_fee_name),
        launch_fee_ends: strOrUndef(financial.launch_fee_ends),
        product_retainer_amount: numOrUndef(financial.product_retainer_amount),
        product_retainer_name: strOrUndef(financial.product_retainer_name),
        marketing_commission_rate: (() => {
          const n = numOrUndef(financial.marketing_commission_rate);
          return n === undefined ? undefined : n / 100;
        })(),
      },
      contacts: contactEmails.map((email) => ({ email })),
    };

    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || `HTTP ${res.status}`);
        setSubmitting(false);
        return;
      }
      setWarnings(j.warnings ?? []);
      setContactResults(j.contacts ?? []);
      setSuccessBrand({ id: j.brand.id, slug: j.brand.slug, name: j.brand.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setSubmitting(false);
    }
  }

  function finish() {
    if (successBrand) onCreated(successBrand);
    onClose();
  }

  // ── Success / partial-failure screen ──────────────────────────────
  if (successBrand) {
    const hadContactErrors = contactResults.some((c) => c.status === 'error');
    return (
      <ModalShell onClose={finish}>
        <div className="px-8 py-8">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-4">
            <Check className="h-7 w-7 text-emerald-600" />
          </div>
          <h2 className="text-xl font-extrabold text-[#1A1B3A] text-center">
            {successBrand.name} is set up
          </h2>
          <p className="text-sm text-gray-500 text-center mt-1">
            The brand was created and your inputs were saved.
          </p>

          {warnings.length > 0 && (
            <div className="mt-5 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-xs text-amber-800">
              <div className="font-bold mb-1 flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" />
                Some fields needed attention
              </div>
              <ul className="list-disc pl-5 space-y-0.5">
                {warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          {contactResults.length > 0 && (
            <div className="mt-5 space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Contacts</p>
              {contactResults.map((c) => (
                <div
                  key={c.email}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-xs',
                    c.status === 'error'
                      ? 'bg-red-50 border-red-100 text-red-700'
                      : 'bg-emerald-50/70 border-emerald-100 text-emerald-700',
                  )}
                >
                  <span className="font-medium truncate">{c.email}</span>
                  <span className="font-bold uppercase tracking-wider text-[10px] flex-shrink-0">
                    {c.status === 'invited' && 'Sent'}
                    {c.status === 'existing' && 'Magic link sent'}
                    {c.status === 'error' && (c.error || 'Failed')}
                  </span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={finish}
            className="w-full mt-6 px-4 py-3 rounded-xl bg-[#FF4D8D] text-white text-sm font-bold hover:bg-[#E91E8C] transition-colors shadow-sm"
          >
            {hadContactErrors ? 'Close — review contacts in Settings' : 'Done'}
          </button>
        </div>
      </ModalShell>
    );
  }

  // ── Wizard ────────────────────────────────────────────────────────
  return (
    <ModalShell onClose={onClose}>
      {/* Header with stepper */}
      <div className="px-6 py-5 border-b border-gray-100">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400">New Client</p>
            <h2 className="text-lg font-extrabold text-[#1A1B3A]">Onboard a brand</h2>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="h-8 w-8 rounded-lg hover:bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <Stepper step={step} />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 max-h-[60vh]">
        {step === 1 && (
          <Step1Identity
            identity={identity}
            slugValid={slugValid}
            onNameChange={handleNameChange}
            onSlugChange={handleSlugChange}
            onColorChange={(c) => setIdentity((p) => ({ ...p, color: c }))}
          />
        )}
        {step === 2 && <Step2Financial financial={financial} setFinancial={setFinancial} />}
        {step === 3 && (
          <Step3Contacts
            emails={contactEmails}
            pending={pendingEmail}
            pendingValid={pendingEmailValid}
            onPendingChange={setPendingEmail}
            onAdd={addContact}
            onRemove={removeContact}
          />
        )}

        {error && (
          <div className="mt-5 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3 bg-gray-50/40">
        <button
          onClick={() => (step === 1 ? onClose() : setStep((s) => (s - 1) as 1 | 2))}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 disabled:opacity-40"
        >
          {step === 1 ? 'Cancel' : (<><ArrowLeft className="h-4 w-4" />Back</>)}
        </button>

        {step < 3 ? (
          <button
            onClick={() => setStep((s) => (s + 1) as 2 | 3)}
            disabled={step === 1 && !canAdvanceStep1}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-[#FF4D8D] rounded-xl hover:bg-[#E91E8C] disabled:opacity-50 transition-colors shadow-sm"
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting || !canAdvanceStep1}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-[#FF4D8D] rounded-xl hover:bg-[#E91E8C] disabled:opacity-50 transition-colors shadow-sm"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {submitting ? 'Creating…' : 'Create Client'}
          </button>
        )}
      </div>
    </ModalShell>
  );
}

// ── Shell ──────────────────────────────────────────────────────────

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button aria-label="Close" className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200 max-h-[90vh]">
        {children}
      </div>
    </div>
  );
}

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: 'Identity', Icon: Building2 },
    { n: 2, label: 'Financials', Icon: DollarSign },
    { n: 3, label: 'Contacts', Icon: UserPlus },
  ];
  return (
    <div className="flex items-center gap-2 mt-4">
      {steps.map(({ n, label, Icon }, idx) => {
        const active = step === n;
        const done = step > n;
        return (
          <div key={n} className="flex items-center gap-2 flex-1">
            <div
              className={cn(
                'h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0',
                active && 'bg-[#FF4D8D] text-white',
                done && 'bg-emerald-500 text-white',
                !active && !done && 'bg-gray-100 text-gray-400',
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
            </div>
            <span
              className={cn(
                'text-[11px] font-bold uppercase tracking-wider',
                active ? 'text-[#1A1B3A]' : done ? 'text-emerald-700' : 'text-gray-400',
              )}
            >
              {label}
            </span>
            {idx < steps.length - 1 && (
              <div className={cn('flex-1 h-px', done ? 'bg-emerald-200' : 'bg-gray-100')} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 1: Identity ──────────────────────────────────────────────

function Step1Identity({
  identity, slugValid, onNameChange, onSlugChange, onColorChange,
}: {
  identity: Identity;
  slugValid: boolean;
  onNameChange: (v: string) => void;
  onSlugChange: (v: string) => void;
  onColorChange: (c: string) => void;
}) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500">Start with the basics. You can edit everything later.</p>

      <Field label="Display Name" hint="Shown across the app">
        <input
          type="text"
          value={identity.name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. COSRX"
          autoFocus
          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-[#1A1B3A] focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30 focus:border-[#FF4D8D]"
        />
      </Field>

      <Field
        label="Slug"
        hint="lowercase_with_underscores · used in URLs and uploads"
        tone={identity.slug && !slugValid ? 'error' : 'default'}
      >
        <input
          type="text"
          value={identity.slug}
          onChange={(e) => onSlugChange(e.target.value)}
          placeholder="cosrx"
          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm font-mono text-[#1A1B3A] focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30 focus:border-[#FF4D8D]"
        />
      </Field>

      <Field label="Brand Color" hint="Used in charts and badges">
        <div className="flex items-center gap-2 flex-wrap">
          {COLOR_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onColorChange(c)}
              className={cn(
                'h-8 w-8 rounded-full transition-all',
                identity.color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105',
              )}
              style={{ backgroundColor: c }}
              aria-label={`Color ${c}`}
            />
          ))}
          <input
            type="color"
            value={identity.color}
            onChange={(e) => onColorChange(e.target.value)}
            className="h-8 w-8 rounded-full cursor-pointer border border-gray-200 ml-1"
          />
          <input
            type="text"
            value={identity.color}
            onChange={(e) => onColorChange(e.target.value)}
            className="flex-1 min-w-[120px] px-3 py-2 rounded-xl border border-gray-200 text-sm font-mono text-[#1A1B3A] focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30 focus:border-[#FF4D8D]"
          />
        </div>
      </Field>

      {/* Live preview */}
      <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 flex items-center gap-3">
        <div
          className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-extrabold text-sm"
          style={{ backgroundColor: identity.color }}
        >
          {identity.name ? identity.name.charAt(0).toUpperCase() : '?'}
        </div>
        <div>
          <p className="font-bold text-sm text-[#1A1B3A]">{identity.name || 'Brand name'}</p>
          <p className="text-xs text-gray-400 font-mono">{identity.slug || 'brand_slug'}</p>
        </div>
      </div>
    </div>
  );
}

// ── Step 2: Financial terms ───────────────────────────────────────

function Step2Financial({
  financial, setFinancial,
}: {
  financial: Financial;
  setFinancial: React.Dispatch<React.SetStateAction<Financial>>;
}) {
  const set = <K extends keyof Financial>(k: K, v: Financial[K]) =>
    setFinancial((p) => ({ ...p, [k]: v }));

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        All financial fields are optional — you can fill them in now or after creating the brand.
      </p>

      <Section title="Compensation Model">
        <div className="space-y-2">
          {MODEL_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={cn(
                'block rounded-xl border-2 p-3 cursor-pointer transition-colors',
                financial.compensation_model === opt.value
                  ? 'border-[#FF4D8D] bg-[#FFF0F5]'
                  : 'border-gray-200 hover:border-gray-300 bg-white',
              )}
            >
              <input
                type="radio"
                className="sr-only"
                name="compensation_model"
                value={opt.value}
                checked={financial.compensation_model === opt.value}
                onChange={() => set('compensation_model', opt.value)}
              />
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-bold text-[#1A1B3A]">{opt.label}</span>
                {financial.compensation_model === opt.value && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#FF4D8D]">Active</span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>
            </label>
          ))}
        </div>
      </Section>

      <Section title="Rates">
        <Field label="Commission Rate" suffix="%" hint="Your commission on creator GMV">
          <NumberInput value={financial.commission_rate} step={0.25} onChange={(v) => set('commission_rate', v)} />
        </Field>
        <Field label="Marketing Commission Rate" suffix="%" hint="Rate on manually-entered marketing GMV">
          <NumberInput value={financial.marketing_commission_rate} step={0.25} onChange={(v) => set('marketing_commission_rate', v)} />
        </Field>
      </Section>

      <Section title="Retainer & Fees">
        <Field label="Monthly Retainer" prefix="$">
          <NumberInput value={financial.retainer} step={100} onChange={(v) => set('retainer', v)} />
        </Field>
        <Field label="Launch Fee" prefix="$" hint="One-time or limited-period">
          <NumberInput value={financial.launch_fee} step={100} onChange={(v) => set('launch_fee', v)} />
        </Field>
        {Number(financial.launch_fee) > 0 && (
          <>
            <Field label="Launch Fee Label">
              <TextInput
                value={financial.launch_fee_name}
                placeholder="e.g. Q3 Launch"
                onChange={(v) => set('launch_fee_name', v)}
              />
            </Field>
            <Field label="Launch Fee Ends" hint="Optional date when this fee stops">
              <TextInput
                type="date"
                value={financial.launch_fee_ends}
                onChange={(v) => set('launch_fee_ends', v)}
              />
            </Field>
          </>
        )}
      </Section>

      <Section title="Goals">
        <Field label="Monthly GMV Goal" prefix="$" hint="Used by the goal gauge on Earnings">
          <NumberInput value={financial.monthly_gmv_goal} step={1000} onChange={(v) => set('monthly_gmv_goal', v)} />
        </Field>
      </Section>

      <Section title="Invoice Recipient">
        <Field label="Recipient Name" hint="Used as default on invoices">
          <TextInput
            value={financial.bill_to_name}
            placeholder="e.g. Jane Smith, Accounts Payable"
            onChange={(v) => set('bill_to_name', v)}
          />
        </Field>
        <Field label="Email">
          <TextInput
            value={financial.bill_to_email}
            placeholder="ap@brand.com"
            onChange={(v) => set('bill_to_email', v)}
          />
        </Field>
        <Field label="Address" hint="Multi-line">
          <TextArea
            value={financial.bill_to_address}
            placeholder={'123 Main St\nAtlanta, GA 30303'}
            onChange={(v) => set('bill_to_address', v)}
          />
        </Field>
      </Section>
    </div>
  );
}

// ── Step 3: Contacts ──────────────────────────────────────────────

function Step3Contacts({
  emails, pending, pendingValid, onPendingChange, onAdd, onRemove,
}: {
  emails: string[];
  pending: string;
  pendingValid: boolean;
  onPendingChange: (v: string) => void;
  onAdd: () => void;
  onRemove: (e: string) => void;
}) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500">
        Invite anyone on the client&apos;s side who needs to see their brand portal. They&apos;ll receive a
        magic-link email and be scoped to this brand only.
      </p>

      <Field label="Email" hint="Press Enter or click Add to add another">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300 pointer-events-none" />
            <input
              type="email"
              value={pending}
              onChange={(e) => onPendingChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); onAdd(); }
              }}
              placeholder="contact@brand.com"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm text-[#1A1B3A] focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30 focus:border-[#FF4D8D]"
            />
          </div>
          <button
            type="button"
            onClick={onAdd}
            disabled={!pendingValid}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold text-[#1A1B3A] hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            Add
          </button>
        </div>
      </Field>

      {emails.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center">
          <p className="text-xs text-gray-400">No contacts yet — you can also add them later from Settings.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
            Will receive invite ({emails.length})
          </p>
          {emails.map((e) => (
            <div key={e} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <Mail className="h-3.5 w-3.5 text-gray-300 flex-shrink-0" />
                <span className="text-sm text-[#1A1B3A] truncate">{e}</span>
              </div>
              <button
                onClick={() => onRemove(e)}
                className="p-1 rounded-md text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                aria-label={`Remove ${e}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
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

function Field({ label, hint, tone = 'default', prefix, suffix, children }: {
  label: string;
  hint?: string;
  tone?: 'default' | 'error';
  prefix?: string;
  suffix?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-semibold text-gray-700">{label}</span>
        {hint && <span className={cn('text-[11px]', tone === 'error' ? 'text-red-600 font-medium' : 'text-gray-400')}>{hint}</span>}
      </div>
      <div className="relative flex items-center">
        {prefix && <span className="absolute left-3 text-sm text-gray-400 pointer-events-none z-10">{prefix}</span>}
        <div className={cn('w-full', prefix && '[&_input]:pl-7', suffix && '[&_input]:pr-8')}>
          {children}
        </div>
        {suffix && <span className="absolute right-3 text-sm text-gray-400 pointer-events-none z-10">{suffix}</span>}
      </div>
    </label>
  );
}

function NumberInput({ value, step, onChange }: { value: string; step: number; onChange: (v: string) => void }) {
  return (
    <input
      type="number"
      step={step}
      min={0}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="0"
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
