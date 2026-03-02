'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, GripVertical } from 'lucide-react';

interface CreatorCard {
  id: string;
  real_name: string;
  status: string;
  brands: string[];
}

const COLUMNS = [
  { key: 'prospect', label: 'Prospect', color: '#6366F1' },
  { key: 'applied', label: 'Applied', color: '#3B82F6' },
  { key: 'onboarding', label: 'Onboarding', color: '#F59E0B' },
  { key: 'active', label: 'Active', color: '#10B981' },
  { key: 'at_risk', label: 'At Risk', color: '#EF4444' },
  { key: 'paused', label: 'Paused', color: '#9CA3AF' },
  { key: 'churned', label: 'Churned', color: '#6B7280' },
];

const BRAND_COLORS: Record<string, string> = {
  halara: '#FF6B6B', ourplace: '#E8A838', quince: '#6B8E6B', wildflower_cases: '#D946EF',
  anker: '#3B82F6', ridge: '#1A1B3A', vuori: '#10B981',
};

export function KanbanPipeline() {
  const [columns, setColumns] = useState<Record<string, CreatorCard[]>>({});
  const [loading, setLoading] = useState(true);
  const [dragItem, setDragItem] = useState<{ card: CreatorCard; fromCol: string } | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/crm/pipeline')
      .then(r => r.json())
      .then(d => {
        const grouped: Record<string, CreatorCard[]> = {};
        COLUMNS.forEach(c => grouped[c.key] = []);
        (d.creators || []).forEach((c: CreatorCard) => {
          const status = (c.status || 'prospect').toLowerCase().replace(' ', '_');
          if (grouped[status]) grouped[status].push(c);
          else grouped['prospect']?.push(c);
        });
        setColumns(grouped);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const onDragStart = (e: React.DragEvent, card: CreatorCard, fromCol: string) => {
    setDragItem({ card, fromCol });
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDrop = async (e: React.DragEvent, toCol: string) => {
    e.preventDefault();
    setDragOverCol(null);
    if (!dragItem || dragItem.fromCol === toCol) { setDragItem(null); return; }
    const { card, fromCol } = dragItem;

    // Optimistic update
    setColumns(prev => {
      const updated = { ...prev };
      updated[fromCol] = prev[fromCol].filter(c => c.id !== card.id);
      updated[toCol] = [...prev[toCol], { ...card, status: toCol }];
      return updated;
    });
    setDragItem(null);

    // Update status via creator edit + log timeline
    try {
      await fetch(`/api/creators/${card.id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: toCol }),
      });
      await fetch(`/api/crm/timeline/${card.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity_type: 'status_change',
          title: 'Status changed',
          body: `Moved from ${fromCol} to ${toCol}`,
          created_by: 'tyler',
        }),
      });
    } catch { /* revert would go here */ }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-gray-300" /></div>;

  return (
    <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: '60vh' }}>
      {COLUMNS.map(col => (
        <div
          key={col.key}
          className={`flex-shrink-0 w-64 rounded-2xl bg-gray-50 border transition-colors ${dragOverCol === col.key ? 'border-[#FF4D8D] bg-pink-50/30' : 'border-gray-100'}`}
          onDragOver={e => { e.preventDefault(); setDragOverCol(col.key); }}
          onDragLeave={() => setDragOverCol(null)}
          onDrop={e => onDrop(e, col.key)}
        >
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: col.color }} />
            <span className="text-sm font-semibold text-[#1A1B3A]">{col.label}</span>
            <span className="text-xs text-gray-400 ml-auto">{columns[col.key]?.length || 0}</span>
          </div>
          <div className="p-2 space-y-2 min-h-[100px]">
            {(columns[col.key] || []).map(card => (
              <div
                key={card.id}
                draggable
                onDragStart={e => onDragStart(e, card, col.key)}
                className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm hover:shadow-md transition cursor-grab active:cursor-grabbing"
              >
                <div className="flex items-center gap-2">
                  <GripVertical className="h-3.5 w-3.5 text-gray-300 flex-shrink-0" />
                  <a href={`/creators/${card.id}`} className="text-sm font-medium text-[#1A1B3A] hover:text-[#FF4D8D] transition truncate">
                    {card.real_name}
                  </a>
                </div>
                {card.brands.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2 ml-5">
                    {card.brands.slice(0, 3).map(b => (
                      <span key={b} className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: `${BRAND_COLORS[b] || '#6B7280'}15`, color: BRAND_COLORS[b] || '#6B7280' }}>
                        {b.replace(/_/g, ' ')}
                      </span>
                    ))}
                    {card.brands.length > 3 && <span className="text-[10px] text-gray-400">+{card.brands.length - 3}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
