'use client';

import { useState, useCallback } from 'react';
import { Clipboard, Check, Loader2, ChefHat, Flame, TrendingUp, ArrowUpRight, CalendarDays } from 'lucide-react';

const BRANDS = [
  { value: 'all', label: 'All Brands' },
  { value: 'jiyu', label: 'JiYu' },
  { value: 'catakor', label: 'Catakor' },
  { value: 'physicians_choice', label: "Physician's Choice" },
];

const PERIODS = [
  { value: '7d', label: '7 Day' },
  { value: '30d', label: 'Monthly' },
];

interface Stats {
  totalGmv: number;
  videoCount: number;
  creatorCount: number;
}

function PostCard({
  title,
  icon: Icon,
  type,
  showPeriod = true,
}: {
  title: string;
  icon: typeof Flame;
  type: 'whats-cooking' | 'whos-cooking' | 'daily-drop' | 'movers' | 'mtd';
  showPeriod?: boolean;
}) {
  const [brand, setBrand] = useState('all');
  const [period, setPeriod] = useState<'7d' | '30d'>('7d');
  const [text, setText] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [mentionMap, setMentionMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/discord-posts?type=${type}&brand=${brand}&period=${period}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setText(data.text);
      setStats(data.stats);
      setMentionMap(data.mentionMap || {});
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [type, brand, period]);

  const handleCopy = async () => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-2xl bg-card border border-border shadow-sm flex flex-col">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="h-5 w-5 text-[var(--primary)]" />
        </div>
        <h2 className="text-lg font-bold text-[var(--foreground)]">{title}</h2>
      </div>

      {/* Controls */}
      <div className="px-5 py-4 space-y-3">
        {/* Brand Filter */}
        <select
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--primary)]/50"
        >
          {BRANDS.map((b) => (
            <option key={b.value} value={b.value}>{b.label}</option>
          ))}
        </select>

        {/* Period Toggle */}
        {showPeriod && (
          <div className="flex bg-muted rounded-lg p-1">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value as '7d' | '30d')}
                className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-all ${
                  period === p.value
                    ? 'bg-card text-[var(--primary)] shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        {/* Generate Button */}
        <button
          onClick={generate}
          disabled={loading}
          className="w-full py-2.5 rounded-lg bg-[var(--primary)] hover:bg-[#e8437e] text-white font-medium text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            'Generate'
          )}
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="px-5 pb-3 flex gap-4 text-xs text-muted-foreground">
          <span>
            <strong className="text-foreground">${stats.totalGmv.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong> GMV
          </span>
          <span>
            <strong className="text-foreground">{stats.videoCount}</strong> videos
          </span>
          <span>
            <strong className="text-foreground">{stats.creatorCount}</strong> creators
          </span>
        </div>
      )}

      {/* Preview Area */}
      {text && (
        <div className="mx-5 mb-4 rounded-xl overflow-hidden border border-border flex-1 flex flex-col">
          {/* Discord-style header */}
          <div className="px-4 py-2 bg-[#36393f] flex items-center justify-between">
            <span className="text-xs font-semibold text-[#dcddde]">Preview</span>
            <button
              onClick={handleCopy}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                copied
                  ? 'bg-green-600 text-white'
                  : 'bg-[#5865F2] hover:bg-[#4752c4] text-white'
              }`}
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Copied!
                </>
              ) : (
                <>
                  <Clipboard className="h-3.5 w-3.5" />
                  Copy
                </>
              )}
            </button>
          </div>

          {/* Discord-style body */}
          <div className="bg-[#36393f] p-4 flex-1 overflow-auto max-h-[500px]">
            <div className="text-sm text-[#dcddde] whitespace-pre-wrap leading-[1.375rem] font-[Whitney,_Helvetica_Neue,_Helvetica,_Arial,_sans-serif]">
              {renderDiscordMarkdown(text, mentionMap)}
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mx-5 mb-4 px-3 py-2 rounded-lg bg-red-500/10 text-red-600 text-xs">
          {error}
        </div>
      )}

      {/* Big Copy Button */}
      {text && (
        <div className="px-5 pb-5">
          <button
            onClick={handleCopy}
            className={`w-full py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
              copied
                ? 'bg-green-500 text-white'
                : 'bg-[var(--foreground)] hover:bg-[#2a2b4a] text-white'
            }`}
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" />
                Copied to Clipboard!
              </>
            ) : (
              <>
                <Clipboard className="h-4 w-4" />
                Copy to Clipboard
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export function DiscordPostsClient() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <PostCard
        title="What's Cooking?"
        icon={Flame}
        type="whats-cooking"
      />
      <PostCard
        title="Who's Cooking?"
        icon={ChefHat}
        type="whos-cooking"
      />
      <PostCard
        title="Daily Drop"
        icon={TrendingUp}
        type="daily-drop"
        showPeriod={false}
      />
      {/* Ranked by GROWTH rather than absolute GMV — the point is that a
          different set of creators can win it than wins What's/Who's Cooking. */}
      <PostCard
        title="Biggest Movers"
        icon={ArrowUpRight}
        type="movers"
      />
      {/* Calendar-month board, so the 7d/30d selector does not apply. */}
      <PostCard
        title="Month-to-Date Leaderboard"
        icon={CalendarDays}
        type="mtd"
        showPeriod={false}
      />
    </div>
  );
}

// ─── Discord Markdown Renderer ──────────────────────────────────

function renderDiscordMarkdown(text: string, mentionMap: Record<string, string> = {}) {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('# ')) {
      return (
        <div key={i} className="text-xl font-bold text-white mt-1 mb-1">
          {parseInline(line.slice(2), mentionMap)}
        </div>
      );
    }
    if (line.startsWith('> ')) {
      return (
        <div key={i} className="border-l-[3px] border-[#4f545c] pl-3 my-0.5 text-[#b9bbbe]">
          {parseInline(line.slice(2), mentionMap)}
        </div>
      );
    }
    if (line === '') return <br key={i} />;
    return <div key={i}>{parseInline(line, mentionMap)}</div>;
  });
}

function parseInline(text: string, mentionMap: Record<string, string> = {}) {
  // Handle **bold**, *italic*, __underline__, [text](url), <@id>, :emoji:
  const parts: (string | React.ReactElement)[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
    if (boldMatch) {
      parts.push(<strong key={key++} className="font-bold text-white">{parseInline(boldMatch[1], mentionMap)}</strong>);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Italic
    const italicMatch = remaining.match(/^\*(.+?)\*/);
    if (italicMatch) {
      parts.push(<em key={key++} className="italic text-[#b9bbbe]">{italicMatch[1]}</em>);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Underline
    const underlineMatch = remaining.match(/^__(.+?)__/);
    if (underlineMatch) {
      parts.push(<span key={key++} className="underline">{parseInline(underlineMatch[1], mentionMap)}</span>);
      remaining = remaining.slice(underlineMatch[0].length);
      continue;
    }

    // Links [text](url)
    const linkMatch = remaining.match(/^\[(.+?)\]\((.+?)\)/);
    if (linkMatch) {
      parts.push(
        <a key={key++} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="text-[#00AFF4] hover:underline">
          {linkMatch[1]}
        </a>
      );
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // Discord mention <@id>
    const mentionMatch = remaining.match(/^<@(\d+)>/);
    if (mentionMatch) {
      const discordId = mentionMatch[1];
      const displayName = mentionMap[discordId] || 'user';
      parts.push(
        <span key={key++} className="bg-[#5865F2]/20 text-[#dee0fc] rounded px-1">@{displayName}</span>
      );
      remaining = remaining.slice(mentionMatch[0].length);
      continue;
    }

    // Discord emoji :name:
    const emojiMatch = remaining.match(/^:([a-z_]+):/);
    if (emojiMatch) {
      const emojiMap: Record<string, string> = {
        fire: '🔥',
        trophy: '🏆',
        star: '⭐',
        chart_with_upwards_trend: '📈',
      };
      parts.push(<span key={key++}>{emojiMap[emojiMatch[1]] || `:${emojiMatch[1]}:`}</span>);
      remaining = remaining.slice(emojiMatch[0].length);
      continue;
    }

    // Plain text (consume until next special char)
    const nextSpecial = remaining.slice(1).search(/[\*_\[<:]/);
    if (nextSpecial === -1) {
      parts.push(remaining);
      break;
    } else {
      parts.push(remaining.slice(0, nextSpecial + 1));
      remaining = remaining.slice(nextSpecial + 1);
    }
  }

  return <>{parts}</>;
}
