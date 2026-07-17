'use client';

import { useState } from 'react';
import { FileText, ChevronRight, ChevronLeft, Search } from 'lucide-react';
import { MESSAGE_TEMPLATES, fillTemplate, type MessageTemplate } from '@/lib/messages/templates';
import { cn } from '@/lib/utils';

interface Props {
  creatorName?: string;
  brandName?: string;
  postCount?: number;
  gmv?: number;
  onSelect: (content: string) => void;
}

export function TemplateSidebar({ creatorName, brandName, postCount, gmv, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = MESSAGE_TEMPLATES.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.category.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (template: MessageTemplate) => {
    const values: Record<string, string> = {};
    if (creatorName) values.creator_name = creatorName;
    if (brandName)   values.brand_name = brandName;
    if (postCount !== undefined) values.post_count = String(postCount);
    if (gmv !== undefined) {
      values.gmv = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(gmv);
    }
    const filled = fillTemplate(template.content, values);
    onSelect(filled);
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-purple-600 hover:bg-purple-500/10 transition-all"
        title="Message templates"
      >
        <FileText className="h-3.5 w-3.5" />
        Templates
      </button>
    );
  }

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-card shadow-2xl border-l border-border z-40 flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-purple-500" />
          <span className="text-sm font-semibold text-[var(--foreground)]">Templates</span>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-muted-foreground hover:text-muted-foreground transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search templates..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 rounded-lg border border-border bg-muted text-xs focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-transparent"
          />
        </div>
      </div>

      {/* Templates list */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">No templates found</p>
        ) : (
          <div className="space-y-2">
            {filtered.map(template => (
              <button
                key={template.id}
                onClick={() => handleSelect(template)}
                className="w-full text-left p-3 rounded-xl border border-border hover:border-purple-500/25 hover:bg-purple-500/10 transition-all group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">{template.icon}</span>
                  <span className="text-xs font-semibold text-[var(--foreground)] group-hover:text-purple-600 transition-colors">
                    {template.name}
                  </span>
                  <span className="ml-auto text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {template.category}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                  {template.content.slice(0, 100)}...
                </p>
                {template.variables.length > 0 && (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {template.variables.map(v => (
                      <span
                        key={v}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-600 font-mono"
                      >
                        {`{${v}}`}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-4 py-3 border-t border-border">
        <p className="text-[10px] text-muted-foreground text-center">
          Click a template to populate the compose box. Variables like {'{creator_name}'} will be auto-filled when possible.
        </p>
      </div>
    </div>
  );
}
