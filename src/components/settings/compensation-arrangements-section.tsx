'use client';

/**
 * CompensationArrangementsSection — per-(brand × team member) editor.
 *
 * Shows a matrix of brands × team members. Click a cell to edit Vic's JiYu
 * arrangement (or any other combo). Each cell holds: retainer, commission
 * rate, launch fee, compensation model.
 */

import { useEffect, useState } from 'react';
import { DollarSign, Loader2, Check, X } from 'lucide-react';

interface TeamMember {
  id: string;
  name: string;
  is_archived: boolean;
}

interface Brand {
  slug: string;
  name: string;
  display_name?: string | null;
}

interface Arrangement {
  id: string;
  brand: string;
  team_member_id: string;
  retainer: number | string;
  commission_rate: number | string;
  revenue_share_rate: number | string;
  marketing_commission_rate: number | string;
  launch_fee: number | string;
  launch_fee_name: string | null;
  product_retainer_amount: number | string;
  product_retainer_name: string | null;
  compensation_model: string;
}

const COMP_MODELS: Array<{ value: string; label: string }> = [
  { value: 'standard', label: 'Standard (retainer + commission)' },
  { value: 'revshare_max', label: 'Revshare Max (greater of)' },
  { value: 'commission_only', label: 'Commission only' },
  { value: 'retainer_only', label: 'Retainer only' },
];

export function CompensationArrangementsSection({ brands }: { brands: Brand[] }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [arrangements, setArrangements] = useState<Arrangement[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ brand: string; teamMemberId: string } | null>(null);
  const [form, setForm] = useState<Partial<Arrangement>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [tmRes, baRes] = await Promise.all([
        fetch('/api/team-members'),
        fetch('/api/brand-compensation'),
      ]);
      const tmJson = await tmRes.json();
      const baJson = await baRes.json();
      setMembers(tmJson.teamMembers ?? []);
      setArrangements(baJson.arrangements ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function findArr(brand: string, memberId: string): Arrangement | undefined {
    return arrangements.find(a => a.brand === brand && a.team_member_id === memberId);
  }

  function startEdit(brand: string, memberId: string) {
    const existing = findArr(brand, memberId);
    setEditing({ brand, teamMemberId: memberId });
    setForm(existing ? { ...existing } : {
      brand,
      team_member_id: memberId,
      retainer: 0,
      commission_rate: 0,
      revenue_share_rate: 0,
      marketing_commission_rate: 0.02,
      launch_fee: 0,
      product_retainer_amount: 0,
      compensation_model: 'standard',
    });
    setError(null);
  }

  function cancelEdit() {
    setEditing(null);
    setForm({});
    setError(null);
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        brand: editing.brand,
        team_member_id: editing.teamMemberId,
        retainer: numOrNull(form.retainer),
        commission_rate: numOrNull(form.commission_rate),
        revenue_share_rate: numOrNull(form.revenue_share_rate),
        marketing_commission_rate: numOrNull(form.marketing_commission_rate),
        launch_fee: numOrNull(form.launch_fee),
        launch_fee_name: form.launch_fee_name || null,
        product_retainer_amount: numOrNull(form.product_retainer_amount),
        product_retainer_name: form.product_retainer_name || null,
        compensation_model: form.compensation_model || 'standard',
      };
      const res = await fetch('/api/brand-compensation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      cancelEdit();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">Loading compensation arrangements…</p>
      </div>
    );
  }

  if (members.length === 0) {
    return null; // hide until at least one team member exists
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="p-6 border-b border-border flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <DollarSign className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="font-semibold text-lg">Compensation Arrangements</h2>
          <p className="text-sm text-muted-foreground">Each team member&apos;s per-brand retainer + commission rate. Drives the earnings + invoicing math.</p>
        </div>
      </div>

      {error && <p className="mx-6 mt-4 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Brand</th>
              {members.map(m => (
                <th key={m.id} className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                  {m.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {brands.map(b => (
              <tr key={b.slug}>
                <td className="px-4 py-3 font-medium">{b.display_name || b.name}</td>
                {members.map(m => {
                  const arr = findArr(b.slug, m.id);
                  return (
                    <td key={m.id} className="px-4 py-3">
                      <button
                        onClick={() => startEdit(b.slug, m.id)}
                        className="text-left hover:bg-muted/40 rounded-md px-2 py-1 -mx-2 -my-1 transition-colors w-full"
                      >
                        {arr ? (
                          <div>
                            <p className="text-sm">
                              <span className="font-medium">{Number(arr.commission_rate || 0).toFixed(2)}%</span>
                              <span className="text-muted-foreground"> rev</span>
                              {Number(arr.retainer || 0) > 0 && (
                                <> · <span className="font-medium">${Number(arr.retainer).toLocaleString()}</span><span className="text-muted-foreground">/mo</span></>
                              )}
                            </p>
                            {Number(arr.launch_fee || 0) > 0 && (
                              <p className="text-[11px] text-muted-foreground">+ ${Number(arr.launch_fee).toLocaleString()} launch</p>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground italic">— not set —</p>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditModal
          brandLabel={brands.find(b => b.slug === editing.brand)?.name || editing.brand}
          memberName={members.find(m => m.id === editing.teamMemberId)?.name || ''}
          form={form}
          setForm={setForm}
          onSave={save}
          onCancel={cancelEdit}
          saving={saving}
        />
      )}
    </div>
  );
}

function numOrNull(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function EditModal({
  brandLabel, memberName, form, setForm, onSave, onCancel, saving,
}: {
  brandLabel: string;
  memberName: string;
  form: Partial<Arrangement>;
  setForm: (f: Partial<Arrangement>) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const set = <K extends keyof Arrangement>(k: K, v: Arrangement[K] | string | number | null) =>
    setForm({ ...form, [k]: v });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-md bg-card rounded-2xl shadow-2xl"
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Compensation</p>
            <h3 className="text-base font-bold">{memberName} · {brandLabel}</h3>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-muted/40">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Commission % (e.g. 1.5)</label>
              <input
                type="number" step="0.01" min="0"
                value={String(form.commission_rate ?? '')}
                onChange={e => set('commission_rate', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Retainer ($/mo)</label>
              <input
                type="number" step="100" min="0"
                value={String(form.retainer ?? '')}
                onChange={e => set('retainer', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Launch Fee ($)</label>
              <input
                type="number" step="100" min="0"
                value={String(form.launch_fee ?? '')}
                onChange={e => set('launch_fee', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Marketing Comm. % (e.g. 0.02)</label>
              <input
                type="number" step="0.005" min="0"
                value={String(form.marketing_commission_rate ?? '')}
                onChange={e => set('marketing_commission_rate', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Compensation Model</label>
            <select
              value={form.compensation_model ?? 'standard'}
              onChange={e => set('compensation_model', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {COMP_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={onSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={onCancel}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold border border-border text-muted-foreground hover:bg-muted/40 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
