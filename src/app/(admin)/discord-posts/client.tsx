'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Copy, Check, MessageSquare, Filter } from 'lucide-react';

interface Post {
  id: string;
  title: string;
  content: string;
}

interface BrandOption {
  value: string;
  label: string;
}

interface Props {
  posts: Post[];
  brandOptions: BrandOption[];
  currentBrand: string | null;
  currentRange: string;
}

const RANGE_OPTIONS = [
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last14', label: 'Last 14 days' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
];

export function DiscordPostsClient({ posts, brandOptions, currentBrand, currentRange }: Props) {
  const router = useRouter();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<string>(posts[0]?.id ?? '');

  const handleCopy = async (id: string, content: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleFilterChange = (brand: string, range: string) => {
    const params = new URLSearchParams();
    if (brand) params.set('brand', brand);
    if (range) params.set('range', range);
    router.push(`/discord-posts?${params.toString()}`);
  };

  const activePost = posts.find((p) => p.id === selectedPost) ?? posts[0];

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground/50" />
          <select
            value={currentBrand ?? ''}
            onChange={(e) => handleFilterChange(e.target.value, currentRange)}
            className="bg-white/[0.06] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:ring-1 focus:ring-primary/50"
          >
            <option value="">All Brands</option>
            {brandOptions.map((b) => (
              <option key={b.value} value={b.value}>{b.label}</option>
            ))}
          </select>
          <select
            value={currentRange}
            onChange={(e) => handleFilterChange(currentBrand ?? '', e.target.value)}
            className="bg-white/[0.06] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:ring-1 focus:ring-primary/50"
          >
            {RANGE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Post type selector */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground/50 uppercase tracking-wider mb-3">Post Type</p>
          {posts.map((post) => (
            <button
              key={post.id}
              onClick={() => setSelectedPost(post.id)}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all duration-200 border ${
                selectedPost === post.id
                  ? 'bg-primary/10 border-primary/30 text-white'
                  : 'bg-white/[0.03] border-white/[0.06] text-white/60 hover:bg-white/[0.06] hover:text-white/80'
              }`}
            >
              {post.title}
            </button>
          ))}
        </div>

        {/* Preview */}
        {activePost && (
          <div className="rounded-2xl overflow-hidden border border-white/[0.08] shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
            {/* Discord-style header */}
            <div className="px-5 py-3 bg-[#36393f] border-b border-[#202225] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-[#72767d]" />
                <span className="text-sm font-semibold text-[#dcddde]">Preview</span>
              </div>
              <button
                onClick={() => handleCopy(activePost.id, activePost.content)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#5865F2] hover:bg-[#4752c4] text-white text-xs font-medium transition-colors"
              >
                {copiedId === activePost.id ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy to Clipboard
                  </>
                )}
              </button>
            </div>

            {/* Discord-style message body */}
            <div className="bg-[#36393f] p-5">
              <div className="flex gap-4">
                {/* Bot avatar */}
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-sm">T</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-white">Tempo Bot</span>
                    <span className="text-[10px] bg-[#5865F2] text-white px-1.5 py-0.5 rounded font-medium">BOT</span>
                    <span className="text-[11px] text-[#72767d]">Today at {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                  </div>
                  <div className="text-sm text-[#dcddde] whitespace-pre-wrap leading-[1.375rem] font-[Whitney,_Helvetica_Neue,_Helvetica,_Arial,_sans-serif]">
                    {renderDiscordMarkdown(activePost.content)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Simple Discord markdown renderer — handles **bold** and > quotes */
function renderDiscordMarkdown(text: string) {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('> ')) {
      return (
        <div key={i} className="border-l-[3px] border-[#4f545c] pl-3 my-1 text-[#b9bbbe] italic">
          {parseBold(line.slice(2))}
        </div>
      );
    }
    if (line === '') return <br key={i} />;
    return <div key={i}>{parseBold(line)}</div>;
  });
}

function parseBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-bold text-white">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}
