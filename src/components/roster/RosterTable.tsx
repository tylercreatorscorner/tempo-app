'use client';

import { useState } from 'react';
import { Search, Pencil, Trash2, X, Save, Loader2, MoreHorizontal } from 'lucide-react';

interface RosterEntry {
  id: string;
  creator_handle: string;
  creator_name: string | null;
  retainer_amount: number | null;
  retainer_currency: string;
  retainer_period: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

interface RosterTableProps {
  roster: RosterEntry[];
  onRefresh: () => void;
}

export function RosterTable({ roster, onRefresh }: RosterTableProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<RosterEntry>>({});
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = roster.filter((r) => {
    const matchesSearch =
      !search ||
      r.creator_handle.toLowerCase().includes(search.toLowerCase()) ||
      r.creator_name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleEdit = (entry: RosterEntry) => {
    setEditingId(entry.id);
    setEditForm({
      creator_name: entry.creator_name,
      retainer_amount: entry.retainer_amount,
      status: entry.status,
      notes: entry.notes,
    });
  };

  const handleSave = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/roster/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        setEditingId(null);
        onRefresh();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this creator from your roster?')) return;
    setDeletingId(id);
    try {
      await fetch(`/api/roster/${id}`, { method: 'DELETE' });
      onRefresh();
    } finally {
      setDeletingId(null);
    }
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-green-50 text-green-700',
      paused: 'bg-yellow-50 text-yellow-700',
      ended: 'bg-muted text-muted-foreground',
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] || styles.ended}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
      {/* Toolbar */}
      <div className="px-5 py-4 border-b border-border flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search creators..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-[#E91E8C]"
          />
        </div>
        <div className="flex items-center gap-2">
          {['all', 'active', 'paused', 'ended'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                statusFilter === s
                  ? 'bg-[#E91E8C] text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted'
              }`}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="px-5 py-12 text-center text-sm text-muted-foreground">
          {roster.length === 0 ? 'No creators in your roster yet.' : 'No creators match your search.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Creator</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Retainer</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Start Date</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Notes</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((entry) => (
                <tr key={entry.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-5 py-3">
                    <div>
                      <p className="font-medium text-[var(--foreground)]">@{entry.creator_handle}</p>
                      {entry.creator_name && (
                        <p className="text-xs text-muted-foreground">{entry.creator_name}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {entry.retainer_amount
                      ? `$${entry.retainer_amount.toLocaleString()}/${entry.retainer_period === 'monthly' ? 'mo' : entry.retainer_period}`
                      : '—'}
                  </td>
                  <td className="px-5 py-3">{statusBadge(entry.status)}</td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {entry.start_date
                      ? new Date(entry.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : '—'}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground max-w-[200px] truncate">
                    {entry.notes || '—'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleEdit(entry)}
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => handleDelete(entry.id)}
                        disabled={deletingId === entry.id}
                        className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                        title="Remove"
                      >
                        {deletingId === entry.id ? (
                          <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Inline edit drawer */}
      {editingId && (
        <div className="px-5 py-4 border-t border-border bg-muted/50">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold text-[var(--foreground)]">Edit Creator</h4>
            <button onClick={() => setEditingId(null)} className="p-1 rounded hover:bg-secondary">
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Name</label>
              <input
                type="text"
                value={editForm.creator_name || ''}
                onChange={(e) => setEditForm({ ...editForm, creator_name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Retainer ($)</label>
              <input
                type="number"
                value={editForm.retainer_amount ?? ''}
                onChange={(e) => setEditForm({ ...editForm, retainer_amount: e.target.value ? Number(e.target.value) : null })}
                className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Status</label>
              <select
                value={editForm.status || 'active'}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/15"
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="ended">Ended</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Notes</label>
              <input
                type="text"
                value={editForm.notes || ''}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="mt-3 flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#E91E8C] rounded-xl hover:bg-[#d4177d] transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </button>
        </div>
      )}
    </div>
  );
}
