'use client';

/**
 * TeamMembersSection — Settings card for managing payees who can invoice brands.
 *
 * Each team member has their own bill-from info (name, email, address) and
 * payment instructions. Their per-brand compensation arrangements (retainer +
 * commission rate + launch fee + comp model) live in `brand_compensation` and
 * are managed in CompensationArrangementsSection below.
 */

import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, UserPlus, Loader2, Check, X } from 'lucide-react';

interface TeamMember {
  id: string;
  name: string;
  email: string | null;
  address: string | null;
  payment_instructions: string | null;
  is_archived: boolean;
}

interface FormState {
  id?: string;
  name: string;
  email: string;
  address: string;
  payment_instructions: string;
}

const EMPTY: FormState = { name: '', email: '', address: '', payment_instructions: '' };

export function TeamMembersSection() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/team-members');
      const json = await res.json();
      setMembers(json.teamMembers ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load team members');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function startEdit(m: TeamMember) {
    setEditingId(m.id);
    setForm({
      id: m.id,
      name: m.name,
      email: m.email ?? '',
      address: m.address ?? '',
      payment_instructions: m.payment_instructions ?? '',
    });
    setError(null);
  }

  function startAdd() {
    setEditingId('new');
    setForm(EMPTY);
    setError(null);
  }

  function cancel() {
    setEditingId(null);
    setForm(EMPTY);
    setError(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const isNew = editingId === 'new';
      const url = isNew ? '/api/team-members' : `/api/team-members/${form.id}`;
      const method = isNew ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email || null,
          address: form.address || null,
          payment_instructions: form.payment_instructions || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      cancel();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Archive ${name}? Their historical invoices stay intact and they can be restored later.`)) return;
    try {
      const res = await fetch(`/api/team-members/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Archive failed');
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Archive failed');
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="p-6 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <UserPlus className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-lg">Team Members</h2>
            <p className="text-sm text-muted-foreground">People who issue invoices to brands. Each has their own bill-from info + payment details.</p>
          </div>
        </div>
        {editingId === null && (
          <button
            onClick={startAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border hover:bg-muted/40 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        )}
      </div>

      <div className="p-6 space-y-3">
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        {!loading && members.length === 0 && editingId !== 'new' && (
          <p className="text-sm text-muted-foreground text-center py-4">No team members yet. Add yourself or a collaborator to start invoicing.</p>
        )}

        {!loading && members.map(m => (
          editingId === m.id ? (
            <EditForm key={m.id} form={form} setForm={setForm} onSave={save} onCancel={cancel} saving={saving} />
          ) : (
            <div key={m.id} className="flex items-start justify-between p-3 rounded-lg border border-border/50">
              <div className="min-w-0">
                <p className="font-medium text-sm">{m.name}</p>
                {m.email && <p className="text-xs text-muted-foreground mt-0.5">{m.email}</p>}
                {m.payment_instructions && <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 max-w-md">{m.payment_instructions.replace(/\n/g, ' · ')}</p>}
              </div>
              {editingId === null && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => startEdit(m)} className="p-1.5 rounded-lg hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors" title="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => remove(m.id, m.name)} className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors" title="Archive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          )
        ))}

        {editingId === 'new' && (
          <EditForm form={form} setForm={setForm} onSave={save} onCancel={cancel} saving={saving} />
        )}
      </div>
    </div>
  );
}

function EditForm({
  form, setForm, onSave, onCancel, saving,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm({ ...form, [k]: v });
  return (
    <div className="p-4 rounded-lg border-2 border-primary/30 bg-primary/5 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Name *</label>
          <input
            type="text"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="Tyler Drinkard"
            className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={e => set('email', e.target.value)}
            placeholder="tyler@…"
            className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Address (multi-line)</label>
        <textarea
          rows={2}
          value={form.address}
          onChange={e => set('address', e.target.value)}
          placeholder="123 Main St&#10;Atlanta, GA 30303"
          className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
        />
      </div>
      <div>
        <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Payment Instructions</label>
        <textarea
          rows={4}
          value={form.payment_instructions}
          onChange={e => set('payment_instructions', e.target.value)}
          placeholder="Bank name, ACH/wire details, or check payable to…"
          className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
        />
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={onSave}
          disabled={saving || !form.name.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border text-muted-foreground hover:bg-muted/40 disabled:opacity-50 transition-colors"
        >
          <X className="h-3.5 w-3.5" /> Cancel
        </button>
      </div>
    </div>
  );
}
