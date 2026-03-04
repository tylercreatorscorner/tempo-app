'use client';

import { useState } from 'react';
import { X, Loader2, UserPlus } from 'lucide-react';

interface AddCreatorModalProps {
  tenantId: string;
  brandId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddCreatorModal({ tenantId, brandId, onClose, onSuccess }: AddCreatorModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    creator_handle: '',
    creator_name: '',
    retainer_amount: '',
    start_date: '',
    notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.creator_handle.trim()) {
      setError('Creator handle is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          brand_id: brandId,
          creator_handle: form.creator_handle.trim(),
          creator_name: form.creator_name.trim() || null,
          retainer_amount: form.retainer_amount ? Number(form.retainer_amount) : null,
          start_date: form.start_date || null,
          notes: form.notes.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to add creator');
        return;
      }

      onSuccess();
      onClose();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-[#E91E8C]" />
            <h2 className="text-lg font-bold text-[#1A1B3A]">Add Creator</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Creator Handle *</label>
            <input
              type="text"
              placeholder="@creator_handle"
              value={form.creator_handle}
              onChange={(e) => setForm({ ...form, creator_handle: e.target.value })}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-200 focus:border-[#E91E8C]"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Display Name</label>
            <input
              type="text"
              placeholder="Creator's name"
              value={form.creator_name}
              onChange={(e) => setForm({ ...form, creator_name: e.target.value })}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-200 focus:border-[#E91E8C]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Retainer ($/mo)</label>
              <input
                type="number"
                placeholder="0"
                value={form.retainer_amount}
                onChange={(e) => setForm({ ...form, retainer_amount: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-200 focus:border-[#E91E8C]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-200 focus:border-[#E91E8C]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <textarea
              placeholder="Optional notes..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-200 focus:border-[#E91E8C] resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#E91E8C] rounded-xl hover:bg-[#d4177d] transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Add to Roster
          </button>
        </form>
      </div>
    </div>
  );
}
