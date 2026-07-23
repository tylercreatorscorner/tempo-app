'use client';

/**
 * Generator cards for the Reporting page: the multi-page Brand Client PDF card,
 * the long-form text ReportCard, and the Discord/Slack PostCard, plus the
 * Discord-markdown preview renderer they share.
 *
 * Chrome is built on the Pulse kit (Card / Button / Select / SegmentedControl /
 * Label / Input) with pos/neg/warn tokens. The Discord (#5865F2 / #36393f) and
 * Slack (#4A154B) hexes appear ONLY inside the message preview panes, which
 * deliberately imitate those apps' own surfaces.
 */

import { useState, useCallback, useMemo } from 'react';
import {
  Clipboard, Check, Loader2, Send, Sparkles, Download, Briefcase,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/format';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SegmentedControl } from '@/components/ui/segmented';
import { useBrandSelect, BrandListWarning } from './use-report-brands';

/** Small tinted error line used under card controls. */
function InlineError({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-[var(--pulse-neg-bg)] px-3 py-2 text-xs text-[var(--pulse-neg)]">
      {children}
    </div>
  );
}

// ── Brand Client Report Card ────────────────────────────────────────
// Replaces the old throwaway one-pager with a deck-quality multi-page PDF
// (cover · exec summary · KPIs · managed/organic · new/returning · daily perf ·
// top creators · top videos · top products · per-product creator breakdown).
export function BrandClientReportCard() {
  const { brand, setBrand, options: brandOptions, error: brandsError } =
    useBrandSelect({ collapseUmbrella: true });

  // Custom reporting window — defaults to the last 7 days.
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [preset, setPreset] = useState<'7d' | '30d' | 'mtd' | 'custom'>('7d');
  const [startDate, setStartDate] = useState(() => new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [pdfLoading, setPdfLoading] = useState(false);
  const [slackLoading, setSlackLoading] = useState(false);
  const [slackText, setSlackText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const brandLabel = brandOptions.find(b => b.value === brand)?.label ?? brand;
  const rangeValid = startDate <= endDate;
  const query = `brand=${encodeURIComponent(brand)}&start=${startDate}&end=${endDate}&name=${encodeURIComponent(brandLabel)}`;

  const applyPreset = (kind: '7d' | '30d' | 'mtd') => {
    const end = new Date();
    const start = kind === 'mtd'
      ? new Date(end.getFullYear(), end.getMonth(), 1)
      : new Date(Date.now() - (kind === '30d' ? 29 : 6) * 86_400_000);
    setPreset(kind);
    setStartDate(start.toISOString().slice(0, 10));
    setEndDate(end.toISOString().slice(0, 10));
  };

  const downloadPdf = useCallback(async () => {
    setPdfLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/brand-client-pdf?${query}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const cd = res.headers.get('content-disposition') || '';
      const match = cd.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] || `brand-report.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF download failed');
    } finally {
      setPdfLoading(false);
    }
  }, [query]);

  const generateSlack = useCallback(async () => {
    setSlackLoading(true);
    setError(null);
    setSlackText(null);
    try {
      const res = await fetch(`/api/brand-client-summary?${query}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSlackText(data.text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build Slack message');
    } finally {
      setSlackLoading(false);
    }
  }, [query]);

  const copySlack = async () => {
    if (!slackText) return;
    try {
      await navigator.clipboard.writeText(slackText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copy failed. Select and copy manually from the preview.');
    }
  };

  return (
    <Card className="col-span-full overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-5">
        {/* Left: Configuration */}
        <div className="lg:col-span-3 p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--pulse-accent-2)]/10">
              <Briefcase className="h-5 w-5 text-[var(--pulse-accent-2)]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Brand Client Report</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Polished PDF plus a ready-to-paste Slack message. Send both to your brand contacts.</p>
            </div>
          </div>

          <div>
            <Label htmlFor="bcr-brand">Brand</Label>
            <Select id="bcr-brand" value={brand} onChange={e => setBrand(e.target.value)}>
              {brandOptions.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </Select>
            <BrandListWarning show={brandsError} />
          </div>

          <div>
            <Label>Reporting period</Label>
            <div className="mb-2">
              <SegmentedControl<'7d' | '30d' | 'mtd' | 'custom'>
                ariaLabel="Reporting period preset"
                size="sm"
                options={[
                  { value: '7d', label: 'Last 7d' },
                  { value: '30d', label: 'Last 30d' },
                  { value: 'mtd', label: 'This month' },
                ]}
                value={preset}
                onValueChange={(v) => applyPreset(v as '7d' | '30d' | 'mtd')}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date" value={startDate} max={endDate} aria-label="Start date"
                onChange={e => { setStartDate(e.target.value); setPreset('custom'); }}
              />
              <Input
                type="date" value={endDate} min={startDate} max={today} aria-label="End date"
                onChange={e => { setEndDate(e.target.value); setPreset('custom'); }}
              />
            </div>
            {!rangeValid && <p className="mt-1 text-[11px] text-[var(--pulse-neg)]">Start date must be on or before the end date.</p>}
          </div>

          {error && <InlineError>{error}</InlineError>}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button size="lg" className="flex-1" onClick={downloadPdf} disabled={pdfLoading || !rangeValid}>
              {pdfLoading
                ? <><Loader2 className="animate-spin" />Building (10-20s)…</>
                : <><Download />Download PDF</>}
            </Button>
            <Button variant="outline" size="lg" className="flex-1" onClick={generateSlack} disabled={slackLoading || !rangeValid}>
              {slackLoading
                ? <><Loader2 className="animate-spin" />Building…</>
                : <><Send />Slack message</>}
            </Button>
          </div>

          {/* Slack message — copy/paste alongside the PDF. The purple header +
              left rule imitate Slack's own surface (allowed in preview panes). */}
          {slackText && (
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="flex items-center justify-between bg-[#4A154B] px-4 py-2">
                <span className="text-xs font-semibold text-white">Slack message</span>
                <CopyBtn copied={copied} onClick={copySlack} variant="onDark" />
              </div>
              <div className="max-h-[320px] overflow-auto border-l-4 border-[#4A154B] bg-card p-4">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">{slackText}</pre>
              </div>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Filename: <code className="text-muted-foreground">{brandLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-custom-report-{endDate}.pdf</code>
          </p>
        </div>

        {/* Right: Sections preview */}
        <div className="lg:col-span-2 border-l border-border bg-gradient-to-br from-[var(--pulse-accent-2)]/10 via-primary/10 to-card p-6">
          <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--pulse-accent-2)]">What&apos;s inside</div>
          <ul className="space-y-2 text-xs text-foreground">
            {[
              'Branded cover page with reporting period',
              'Executive summary (narrative paragraph)',
              'Top creator · top video · best day highlights',
              'KPI strip with WoW deltas (orders, creators, videos)',
              'Managed vs organic split with donut visual',
              'New vs returning creators breakdown',
              'Day-of-week + daily performance with peak day',
              'Top 10 creators leaderboard with progress bars',
              'Top 10 videos with creator attribution',
              'Top 10 products with order counts',
              'Per-product creator breakdown (top 5 × top 3)',
            ].map(s => (
              <li key={s} className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-[var(--pulse-accent-2)]" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

// ── Report Card (long-form text reports) ────────────────────────────
export function ReportCard({
  title, description, icon: Icon, iconBg, iconColor, type, showPeriod, features,
}: {
  title: string; description: string; icon: LucideIcon;
  iconBg: string; iconColor: string; type: string;
  showPeriod?: boolean; features: string[];
}) {
  const { brand, setBrand, options: brandOptions, error: brandsError } = useBrandSelect();
  const [period, setPeriod] = useState<'7d' | '30d'>('7d');
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reporting?type=${type}&brand=${brand}&period=${period}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setText(data.text);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
      setText(null);
    } finally {
      setLoading(false);
    }
  }, [type, brand, period]);

  const handleCopy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copy failed: clipboard access blocked. Select and copy manually from the preview.');
    }
  };

  return (
    <Card className="flex flex-col">
      <div className="border-b border-border px-5 py-4">
        <div className="mb-2 flex items-center gap-3">
          <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', iconBg)}>
            <Icon className={cn('h-5 w-5', iconColor)} />
          </div>
          <h3 className="font-bold text-foreground">{title}</h3>
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="space-y-3 px-5 py-4">
        <div>
          <Select value={brand} onChange={e => setBrand(e.target.value)} aria-label="Brand">
            {brandOptions.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
          </Select>
          <BrandListWarning show={brandsError} />
        </div>

        {showPeriod && (
          <SegmentedControl<'7d' | '30d'>
            ariaLabel="Report period"
            options={[{ value: '7d', label: 'Weekly' }, { value: '30d', label: 'Monthly' }]}
            value={period}
            onValueChange={setPeriod}
          />
        )}

        {/* Features list */}
        <div className="space-y-1">
          {features.map(f => (
            <div key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-1 w-1 rounded-full bg-[var(--primary)]" />
              {f}
            </div>
          ))}
        </div>

        <Button size="lg" className="w-full" onClick={generate} disabled={loading}>
          {loading ? <><Loader2 className="animate-spin" />Generating…</> : 'Generate Report'}
        </Button>
      </div>

      {error && <div className="mx-5 mb-4"><InlineError>{error}</InlineError></div>}

      {text && (
        <div className="space-y-3 px-5 pb-5">
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="flex items-center justify-between border-b border-border bg-muted/80 px-4 py-2">
              <span className="text-xs font-semibold text-muted-foreground">Preview</span>
              <CopyBtn copied={copied} onClick={handleCopy} variant="neutral" />
            </div>
            <div className="max-h-[400px] overflow-auto bg-card p-4">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">{text}</pre>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Post Generator Card ─────────────────────────────────────────────
export function PostCard({
  title, icon: Icon, type, showPeriod = true, description, slackOnly = false, pdfEndpoint,
}: {
  title: string; icon: LucideIcon; type: string; showPeriod?: boolean; description: string;
  slackOnly?: boolean; pdfEndpoint?: string;
}) {
  const { brand, setBrand, options: brandOptions, error: brandsError } =
    useBrandSelect({ collapseUmbrella: true });
  const [period, setPeriod] = useState<'7d' | '30d'>('7d');
  const [format, setFormat] = useState<'discord' | 'slack'>(slackOnly ? 'slack' : 'discord');
  const [text, setText] = useState<string | null>(null);
  const [stats, setStats] = useState<{ totalGmv: number; videoCount: number; creatorCount: number } | null>(null);
  const [mentionMap, setMentionMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const downloadPdf = useCallback(async () => {
    if (!pdfEndpoint) return;
    setPdfLoading(true);
    try {
      const res = await fetch(`${pdfEndpoint}?brand=${brand}`);
      if (!res.ok) throw new Error(`PDF generation failed (${res.status})`);
      const blob = await res.blob();
      // Read filename from Content-Disposition if present
      const cd = res.headers.get('content-disposition') || '';
      const match = cd.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] || `brand-update-${brand}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF download failed');
    } finally {
      setPdfLoading(false);
    }
  }, [pdfEndpoint, brand]);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = `/api/discord-posts?type=${type}&brand=${brand}&period=${period}`;
      const res = await fetch(endpoint);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      let output = data.text;

      // Convert to Slack format if needed (skip for slackOnly — already Slack-formatted server-side)
      if (format === 'slack' && !slackOnly) {
        output = toSlackFormat(output);
      }

      setText(output);
      setStats(data.stats);
      setMentionMap(data.mentionMap || {});
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate post');
    } finally {
      setLoading(false);
    }
  }, [type, brand, period, format, slackOnly]);

  const handleCopy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copy failed: clipboard access blocked. Select and copy manually from the preview.');
    }
  };

  return (
    <Card className="flex flex-col">
      {/* Header */}
      <div className="border-b border-border px-5 py-4">
        <div className="mb-1 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-[var(--primary)]" />
          </div>
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      {/* Controls */}
      <div className="space-y-3 px-5 py-4">
        <div>
          <Select value={brand} onChange={e => setBrand(e.target.value)} aria-label="Brand">
            {brandOptions.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
          </Select>
          <BrandListWarning show={brandsError} />
        </div>

        {showPeriod && (
          <SegmentedControl<'7d' | '30d'>
            ariaLabel="Post period"
            options={[{ value: '7d', label: '7 Day' }, { value: '30d', label: 'Monthly' }]}
            value={period}
            onValueChange={setPeriod}
          />
        )}

        {/* Format toggle */}
        {slackOnly ? (
          <div className="flex items-center justify-center rounded-md border border-border bg-secondary px-3 py-2 text-xs font-semibold text-muted-foreground">
            Slack format (client-facing)
          </div>
        ) : (
          <SegmentedControl<'discord' | 'slack'>
            ariaLabel="Message format"
            options={[{ value: 'discord', label: 'Discord' }, { value: 'slack', label: 'Slack' }]}
            value={format}
            onValueChange={setFormat}
          />
        )}

        <Button size="lg" className="w-full" onClick={generate} disabled={loading}>
          {loading ? <><Loader2 className="animate-spin" />Generating…</> : 'Generate'}
        </Button>

        {pdfEndpoint && (
          <Button variant="outline" size="lg" className="w-full" onClick={downloadPdf} disabled={pdfLoading}>
            {pdfLoading ? <><Loader2 className="animate-spin" />Building PDF…</> : <><Download />Download PDF</>}
          </Button>
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div className="flex gap-4 px-5 pb-3 text-xs text-muted-foreground">
          <span><strong className="text-foreground">{formatCurrency(stats.totalGmv)}</strong> GMV</span>
          <span><strong className="text-foreground">{stats.videoCount}</strong> videos</span>
          <span><strong className="text-foreground">{stats.creatorCount}</strong> creators</span>
        </div>
      )}

      {/* Preview — the dark chrome imitates Discord's own surface */}
      {text && (
        <div className="mx-5 mb-4 flex flex-1 flex-col overflow-hidden rounded-xl border border-border">
          {format === 'discord' ? (
            <>
              <div className="flex items-center justify-between bg-[#36393f] px-4 py-2">
                <span className="text-xs font-semibold text-[#dcddde]">Discord Preview</span>
                <CopyBtn copied={copied} onClick={handleCopy} variant="discord" />
              </div>
              <div className="max-h-[500px] flex-1 overflow-auto bg-[#36393f] p-4">
                <div className="whitespace-pre-wrap text-sm leading-[1.375rem] text-[#dcddde]">
                  {renderDiscordMarkdown(text, mentionMap)}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
                <span className="text-xs font-semibold text-muted-foreground">Slack Preview</span>
                <CopyBtn copied={copied} onClick={handleCopy} variant="neutral" />
              </div>
              <div className="max-h-[500px] flex-1 overflow-auto border-l-4 border-[var(--primary)] bg-card p-4">
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {text}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {error && <div className="mx-5 mb-4"><InlineError>{error}</InlineError></div>}

      {text && (
        <div className="px-5 pb-5">
          <Button
            size="lg"
            className="w-full"
            onClick={handleCopy}
            // The primary gradient is a background-image; flip to the solid pos
            // token via inline style for the copied confirmation flash.
            style={copied ? { backgroundImage: 'none', backgroundColor: 'var(--pulse-pos)' } : undefined}
          >
            {copied ? <><Check />Copied</> : <><Clipboard />Copy to Clipboard</>}
          </Button>
        </div>
      )}
    </Card>
  );
}

// ── Shared Components ───────────────────────────────────────────────
/** Small copy chip for preview-pane headers. `discord` keeps the blurple hex —
 *  it lives inside the Discord-imitation pane; `onDark` sits on the Slack
 *  purple header; `neutral` is Tempo chrome. */
function CopyBtn({ copied, onClick, variant }: { copied: boolean; onClick: () => void; variant: 'discord' | 'neutral' | 'onDark' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors',
        copied
          ? 'bg-[var(--pulse-pos)] text-white'
          : variant === 'discord'
            ? 'bg-[#5865F2] text-white hover:bg-[#4752c4]'
            : variant === 'onDark'
              ? 'bg-white/15 text-white hover:bg-white/25'
              : 'bg-secondary text-foreground hover:bg-muted',
      )}
    >
      {copied ? <><Check className="h-3.5 w-3.5" />Copied</> : <><Clipboard className="h-3.5 w-3.5" />Copy</>}
    </button>
  );
}

// ── Discord Markdown Renderer ───────────────────────────────────────
function renderDiscordMarkdown(text: string, mentionMap: Record<string, string> = {}) {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('# ')) return <div key={i} className="text-xl font-bold text-white mt-1 mb-1">{parseInline(line.slice(2), mentionMap)}</div>;
    if (line.startsWith('> ')) return <div key={i} className="border-l-[3px] border-[#4f545c] pl-3 my-0.5 text-[#b9bbbe]">{parseInline(line.slice(2), mentionMap)}</div>;
    if (line === '') return <br key={i} />;
    return <div key={i}>{parseInline(line, mentionMap)}</div>;
  });
}

/**
 * Reject anything that isn't a plain http/https URL. Stops the markdown link
 * pattern from emitting `javascript:` or `data:` URLs even though the source
 * text is generated by our own server — defence in depth in case future
 * report content ever incorporates user-supplied strings.
 */
function safeHref(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function parseInline(text: string, mentionMap: Record<string, string> = {}): React.ReactNode {
  const parts: (string | React.ReactElement)[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
    if (boldMatch) { parts.push(<strong key={key++} className="font-bold text-white">{parseInline(boldMatch[1], mentionMap)}</strong>); remaining = remaining.slice(boldMatch[0].length); continue; }
    const italicMatch = remaining.match(/^\*(.+?)\*/);
    if (italicMatch) { parts.push(<em key={key++} className="italic text-[#b9bbbe]">{italicMatch[1]}</em>); remaining = remaining.slice(italicMatch[0].length); continue; }
    const linkMatch = remaining.match(/^\[(.+?)\]\((.+?)\)/);
    if (linkMatch) {
      const href = safeHref(linkMatch[2]);
      if (href) {
        parts.push(<a key={key++} href={href} target="_blank" rel="noopener noreferrer" className="text-[#00AFF4] hover:underline">{linkMatch[1]}</a>);
      } else {
        // Render as plain text so we never emit a dangerous href.
        parts.push(<span key={key++}>{linkMatch[1]}</span>);
      }
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }
    const mentionMatch = remaining.match(/^<@(\d+)>/);
    if (mentionMatch) { parts.push(<span key={key++} className="bg-[#5865F2]/20 text-[#dee0fc] rounded px-1">@{mentionMap[mentionMatch[1]] || 'user'}</span>); remaining = remaining.slice(mentionMatch[0].length); continue; }
    const nextSpecial = remaining.slice(1).search(/[\*\[<]/);
    if (nextSpecial === -1) { parts.push(remaining); break; }
    parts.push(remaining.slice(0, nextSpecial + 1));
    remaining = remaining.slice(nextSpecial + 1);
  }
  return <>{parts}</>;
}

// ── Slack Format Converter ──────────────────────────────────────────
function toSlackFormat(discordText: string): string {
  return discordText
    .replace(/^# (.+)$/gm, '*$1*')           // # Header -> *bold*
    .replace(/^> (.+)$/gm, '> $1')            // Keep blockquotes
    .replace(/\*\*(.+?)\*\*/g, '*$1*')        // **bold** -> *bold*
    .replace(/<@(\d+)>/g, '@user')             // Mentions simplified
    .replace(/__(.+?)__/g, '_$1_');            // __underline__ -> _italic_
}
