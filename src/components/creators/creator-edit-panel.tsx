'use client';

import { useId, useState } from 'react';
import { Dialog } from 'radix-ui';
import { ChoiceMenu } from '@/components/ui/choice-menu';
import styles from './creator-editor.module.css';
import { Pencil, X, Save, Loader2, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface CreatorData {
  id: number | string;
  real_name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  status: string | null;
  notes: string | null;
  accounts: { tiktok_username: string; is_primary: boolean }[];
  /**
   * The brand that role and status apply to. Those live in creator_brands, one
   * row per creator per brand, so an edit without a brand used to overwrite
   * every brand at once. Null when the creator holds no contract, in which case
   * the per-brand fields are hidden rather than shown editing nothing.
   */
  brandId: string | null;
  brandLabel: string | null;
  /**
   * Notes for THIS brand, from the managed_creators contract row. Separate from
   * `notes`, which is the person-level note shared across every brand. Both are
   * real and both are in use: 1,082 contract rows carry per-brand notes and 209
   * creators already have different notes on different brands, while 610
   * creators have a person-level note.
   */
  brandNotes: string | null;
}

const ROLES = ['Incubator', 'Creatives', 'Retainer', 'Ambassador'];
const STATUSES = ['Active', 'Churned', 'Applied', 'Pending'];

export function CreatorEditButton({ creator }: { creator: CreatorData }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card hover:bg-secondary transition-colors text-xs font-medium"
        title="Edit Profile"
      >
        <Pencil className="h-4 w-4 text-muted-foreground" /> Edit profile
      </button>
      {open && <EditPanel creator={creator} onClose={() => setOpen(false)} />}
    </>
  );
}

function EditPanel({ creator, onClose }: { creator: CreatorData; onClose: () => void }) {
  const router = useRouter();
  const [customRole,setCustomRole]=useState(Boolean(creator.role && !ROLES.includes(creator.role)));
  const [saving, setSaving] = useState(false);
  // A failed save used to do nothing at all: `if (res.ok)` with no else, so the
  // panel just sat there. Now that a per-brand edit can be REJECTED for a
  // missing brand, silence would read as "saved".
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    real_name: creator.real_name,
    email: creator.email ?? '',
    phone: creator.phone ?? '',
    role: creator.role ?? '',
    status: creator.status ?? '',
    notes: creator.notes ?? '',
    brand_notes: creator.brandNotes ?? '',
  });

  // Account management
  const [accounts, setAccounts] = useState(() => Array.from(new Map(creator.accounts.map(a => [a.tiktok_username.trim().replace(/^@/, '').toLowerCase(), a.tiktok_username])).values()));
  const [newHandle, setNewHandle] = useState('');
  const [accountSaving, setAccountSaving] = useState(false);
  // Two-step confirm on removal. Not a browser confirm(): this is a rare,
  // destructive, cross-brand action and it deserves to state its reach in place.
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      // Role and status live on creator_brands, one row per brand, so the brand
      // travels with them. Without it the server rejects the write rather than
      // applying it to every brand the creator works.
      const payload: Record<string, unknown> = { ...form };
      if (creator.brandId) payload.brand_id = creator.brandId;
      // No brand in context means nothing per-brand can be saved: drop those
      // rather than let the server guess which brand was meant.
      else { delete payload.role; delete payload.status; delete payload.brand_notes; }

      const res = await fetch(`/api/creators/${creator.id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        router.refresh();
        onClose();
      } else {
        const j = await res.json().catch(() => ({}));
        setError((j as { error?: string }).error || `Save failed (${res.status}).`);
      }
    } finally {
      setSaving(false);
    }
  };

  const addAccount = async () => {
    const handle = newHandle.replace(/^@/, '').trim().toLowerCase();
    if (!handle) return;
    setAccountSaving(true);
    try {
      const res = await fetch(`/api/creators/${creator.id}/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tiktok_username: handle }),
      });
      if (res.ok) {
        setAccounts([...accounts, handle]);
        setNewHandle('');
        router.refresh();
      }
    } finally {
      setAccountSaving(false);
    }
  };

  const removeAccount = async (handle: string) => {
    setConfirmRemove(null);
    setAccountSaving(true);
    try {
      const res = await fetch(`/api/creators/${creator.id}/accounts`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tiktok_username: handle }),
      });
      if (res.ok) {
        setAccounts(accounts.filter((a) => a !== handle));
        router.refresh();
      }
    } finally {
      setAccountSaving(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={open => { if (!open && !saving && !accountSaving) onClose(); }}><Dialog.Portal><Dialog.Overlay className={styles.overlay} /><Dialog.Content className={styles.panel} data-lenis-prevent>
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
          <div><Dialog.Title className="text-xl font-semibold">Edit creator</Dialog.Title><Dialog.Description className="mt-1 text-xs text-muted-foreground">{creator.real_name} · Profile and brand relationship</Dialog.Description></div>
          <button onClick={onClose} disabled={saving || accountSaving} aria-label="Close editor" className="p-2 rounded-lg hover:bg-muted">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className={styles.body}>
          {/* Profile Fields */}
          <div className={styles.fields}><h3 className={styles.groupTitle}>Creator details</h3>
            <Field label="Real Name" value={form.real_name} onChange={(v) => setForm({ ...form, real_name: v })} />
            <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" />
            <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} type="tel" />

            {/* Role and status are PER BRAND. Naming the brand is the whole
                point: without it these were written to every brand at once. */}
            {creator.brandId ? (
              <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                Role, status and the brand notes below apply to{' '}
                <b className="text-foreground">{creator.brandLabel ?? 'this brand'}</b> only. Name,
                email, phone and general notes are shared across all of this creator&rsquo;s brands.
              </p>
            ) : (
              <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                Select a brand on the profile to edit its role and status.
              </p>
            )}

            {creator.brandId && (
            <>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Role</label>
              <ChoiceMenu label="Creator role" value={customRole ? '__custom' : form.role || '__none'} options={[{value:'__none',label:'None'},...ROLES.map(role=>({value:role,label:role})),{value:'__custom',label:'Custom role'}]} onChange={value=>{setCustomRole(value==='__custom');setForm({...form,role:value==='__none'||value==='__custom'?'':value});}} />              {customRole && (
                <input
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  placeholder="Custom role" aria-label="Custom role"
                  className="w-full mt-2 px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/20"
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Status</label>
              <ChoiceMenu label="Relationship status" value={form.status || '__none'} options={[{value:'__none',label:'None'},...STATUSES.map(status=>({value:status.toLowerCase(),label:status}))]} onChange={value=>setForm({...form,status:value==='__none'?'':value})} />
            </div>
            </>
            )}

            {creator.brandId && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Notes for{' '}
                  <span className="text-foreground font-semibold">
                    {creator.brandLabel ?? 'this brand'}
                  </span>
                </label>
                <textarea
                  aria-label="Brand notes" value={form.brand_notes}
                  onChange={(e) => setForm({ ...form, brand_notes: e.target.value })}
                  rows={3}
                  placeholder="Only shown against this brand."
                  className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/20 resize-none"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                General notes <span className="font-normal">(shared across all brands)</span>
              </label>
              <textarea
                aria-label="General notes" value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/20 resize-none"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
              {error}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[var(--primary)] rounded-xl hover:bg-[var(--primary)] transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save profile details
          </button>

          <p className="text-xs text-muted-foreground">Profile details save above. Account additions and removals below apply separately.</p>
          {/* TikTok Accounts.

              Unlike everything above, these are NOT per brand. A handle
              identifies the person, so adding or removing one applies to every
              brand they work. Said out loud here because the reach is invisible
              otherwise, and because managed-GMV membership resolves handles
              through this table: removing one drops the creator out of capture
              rate on every brand at once. */}
          <div className="pt-4 border-t border-border">
            <h3 className="text-sm font-bold text-[var(--foreground)]">Linked TikTok accounts</h3>
            <p className="mt-1 mb-3 text-xs text-muted-foreground">
              Shared across all of this creator&rsquo;s brands, not just{' '}
              {creator.brandLabel ?? 'the selected one'}. Removing an account here removes it
              everywhere.
            </p>
            <div className="space-y-2">
              {accounts.map((handle) => (
                <div key={handle} className="px-3 py-2 bg-muted rounded-xl">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-foreground truncate">@{handle}</span>
                    {confirmRemove === handle ? (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => removeAccount(handle)}
                          disabled={accountSaving}
                          className="px-2 py-1 text-[11px] font-bold rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                        >
                          Remove everywhere
                        </button>
                        <button
                          onClick={() => setConfirmRemove(null)}
                          className="px-2 py-1 text-[11px] font-medium rounded-lg text-muted-foreground hover:bg-muted-foreground/10 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmRemove(handle)}
                        disabled={accountSaving}
                        title="Remove this account from every brand"
                        className="p-1 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors flex-shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {confirmRemove === handle && (
                    <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                      This detaches @{handle} from every brand, and any GMV earned under it stops
                      counting as managed.
                    </p>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <input
                value={newHandle}
                onChange={(e) => setNewHandle(e.target.value)}
                placeholder="@username" aria-label="New TikTok handle"
                onKeyDown={(e) => e.key === 'Enter' && addAccount()}
                className="flex-1 px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/20"
              />
              <button
                onClick={addAccount} aria-label="Add TikTok account"
                disabled={accountSaving || !newHandle.trim()}
                className="px-3 py-2 text-sm font-medium text-[var(--primary)] border border-primary/15 rounded-xl hover:bg-primary/10 transition-colors disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  const id=useId();
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
      <input
        id={id} type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/20"
      />
    </div>
  );
}

