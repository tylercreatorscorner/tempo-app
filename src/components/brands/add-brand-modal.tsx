'use client';

import { useState } from 'react';
import { X, Plus, Loader2 } from 'lucide-react';

const BRAND_COLORS = [
  'var(--primary)', 'var(--pulse-accent-2)', '#3B82F6', '#10B981', '#F59E0B',
  '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#14B8A6',
];

interface AddBrandModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (brand: { id: string; name: string; brand_key: string }) => void;
}

export function AddBrandModal({ open, onClose, onCreated }: AddBrandModalProps) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [color, setColor] = useState(BRAND_COLORS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [slugManual, setSlugManual] = useState(false);

  function handleNameChange(val: string) {
    setName(val);
    if (!slugManual) {
      setSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/brands/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), slug: slug.trim(), color }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create brand');
        setLoading(false);
        return;
      }

      onCreated?.(data.brand);
      setName('');
      setSlug('');
      setSlugManual(false);
      setError('');
      onClose();
    } catch {
      setError('Something went wrong. Please try again.');
    }

    setLoading(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold">Add Brand</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 text-red-600 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Brand name</label>
            <input
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g., Glow Beauty"
              className="w-full px-4 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/50"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Brand slug</label>
            <input
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setSlugManual(true); }}
              placeholder="e.g., glow_beauty"
              className="w-full px-4 py-2.5 rounded-xl border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/50"
              required
            />
            <p className="text-xs text-muted-foreground">Used in URLs and data references</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Brand color</label>
            <div className="flex gap-2 flex-wrap">
              {BRAND_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded-full transition-all ${
                    color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-sm"
              style={{ backgroundColor: color }}
            >
              {name ? name.charAt(0).toUpperCase() : '?'}
            </div>
            <div>
              <p className="font-semibold text-sm">{name || 'Brand Name'}</p>
              <p className="text-xs text-muted-foreground font-mono">{slug || 'brand_slug'}</p>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || !slug.trim() || loading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-[var(--primary)] to-[var(--pulse-accent-2)] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <><Plus className="h-4 w-4" /> Add Brand</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
