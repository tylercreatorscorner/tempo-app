'use client';

import { useState } from 'react';
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
}

const ROLES = ['Incubator', 'Creatives', 'Retainer', 'Ambassador'];
const STATUSES = ['Active', 'Churned', 'Applied', 'Pending'];

export function CreatorEditButton({ creator }: { creator: CreatorData }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        title="Edit Profile"
      >
        <Pencil className="h-4 w-4 text-gray-400" />
      </button>
      {open && <EditPanel creator={creator} onClose={() => setOpen(false)} />}
    </>
  );
}

function EditPanel({ creator, onClose }: { creator: CreatorData; onClose: () => void }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    real_name: creator.real_name,
    email: creator.email ?? '',
    phone: creator.phone ?? '',
    role: creator.role ?? '',
    status: creator.status ?? '',
    notes: creator.notes ?? '',
  });

  // Account management
  const [accounts, setAccounts] = useState(creator.accounts.map((a) => a.tiktok_username));
  const [newHandle, setNewHandle] = useState('');
  const [accountSaving, setAccountSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/creators/${creator.id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        router.refresh();
        onClose();
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
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white shadow-xl overflow-y-auto animate-in slide-in-from-right">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#1A1B3A]">Edit Profile</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Profile Fields */}
          <div className="space-y-4">
            <Field label="Real Name" value={form.real_name} onChange={(v) => setForm({ ...form, real_name: v })} />
            <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" />
            <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} type="tel" />

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Role</label>
              <select
                value={ROLES.includes(form.role) ? form.role : '__custom'}
                onChange={(e) => {
                  if (e.target.value === '__custom') setForm({ ...form, role: '' });
                  else setForm({ ...form, role: e.target.value });
                }}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/20"
              >
                <option value="">None</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
                <option value="__custom">Custom...</option>
              </select>
              {!ROLES.includes(form.role) && form.role !== '' && (
                <input
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  placeholder="Custom role"
                  className="w-full mt-2 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/20"
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/20"
              >
                <option value="">None</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s.toLowerCase()}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/20 resize-none"
              />
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[var(--primary)] rounded-xl hover:bg-[#E91E8C] transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Profile
          </button>

          {/* TikTok Accounts */}
          <div className="pt-4 border-t border-gray-100">
            <h3 className="text-sm font-bold text-[#1A1B3A] mb-3">TikTok Accounts</h3>
            <div className="space-y-2">
              {accounts.map((handle) => (
                <div key={handle} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-xl">
                  <span className="text-sm text-gray-700">@{handle}</span>
                  <button
                    onClick={() => removeAccount(handle)}
                    disabled={accountSaving}
                    className="p-1 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <input
                value={newHandle}
                onChange={(e) => setNewHandle(e.target.value)}
                placeholder="@username"
                onKeyDown={(e) => e.key === 'Enter' && addAccount()}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/20"
              />
              <button
                onClick={addAccount}
                disabled={accountSaving || !newHandle.trim()}
                className="px-3 py-2 text-sm font-medium text-[var(--primary)] border border-primary/15 rounded-xl hover:bg-primary/10 transition-colors disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
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
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/20"
      />
    </div>
  );
}
