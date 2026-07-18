'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, X, Loader2 } from 'lucide-react';

function tagColor(tag: string) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  // Theme-safe: a translucent hue tint for the bg/border (reads on both light and
  // dark card surfaces) + a mid-lightness saturated hue for the text. The old
  // 95%-lightness bg was a near-white blob on a dark card.
  return {
    bg: `hsla(${hue}, 70%, 50%, 0.14)`,
    text: `hsl(${hue}, 70%, 52%)`,
    border: `hsla(${hue}, 65%, 50%, 0.32)`,
  };
}

export function CreatorTags({ creatorId }: { creatorId: string }) {
  const [tags, setTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/crm/tags/${creatorId}`).then(r => r.json()).then(d => setTags((d.tags || []).map((t: any) => t.tag)));
  }, [creatorId]);

  const openDropdown = async () => {
    setOpen(true);
    setQuery('');
    const res = await fetch('/api/crm/tags');
    const d = await res.json();
    setAllTags(d.tags || []);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const addTag = async (tag: string) => {
    const t = tag.trim().toLowerCase();
    if (!t || tags.includes(t)) return;
    setLoading(true);
    await fetch('/api/crm/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creator_id: creatorId, tag: t, created_by: 'tyler' }),
    });
    setTags(prev => [...prev, t]);
    setOpen(false);
    setQuery('');
    setLoading(false);
  };

  const removeTag = async (tag: string) => {
    setTags(prev => prev.filter(t => t !== tag));
    await fetch('/api/crm/tags', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creator_id: creatorId, tag }),
    });
  };

  const filtered = allTags.filter(t => !tags.includes(t) && t.includes(query.toLowerCase()));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map(tag => {
        const c = tagColor(tag);
        return (
          <span
            key={tag}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium border"
            style={{ backgroundColor: c.bg, color: c.text, borderColor: c.border }}
          >
            {tag}
            <button onClick={() => removeTag(tag)} className="hover:opacity-70 transition">
              <X className="h-3 w-3" />
            </button>
          </span>
        );
      })}

      <div className="relative">
        <button
          onClick={openDropdown}
          className="h-6 w-6 rounded-full bg-muted hover:bg-secondary flex items-center justify-center transition"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /> : <Plus className="h-3 w-3 text-muted-foreground" />}
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute top-8 left-0 z-50 w-48 bg-card rounded-xl border border-border shadow-lg overflow-hidden">
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && query.trim()) addTag(query); }}
                placeholder="Search or create..."
                className="w-full px-3 py-2 text-sm border-b border-border focus:outline-none"
              />
              <div className="max-h-32 overflow-y-auto">
                {filtered.map(t => (
                  <button key={t} onClick={() => addTag(t)} className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition">
                    {t}
                  </button>
                ))}
                {query.trim() && !allTags.includes(query.trim().toLowerCase()) && (
                  <button onClick={() => addTag(query)} className="w-full text-left px-3 py-1.5 text-sm text-[var(--primary)] hover:bg-primary/10 transition">
                    Create &quot;{query.trim()}&quot;
                  </button>
                )}
                {filtered.length === 0 && !query.trim() && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No tags yet</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
