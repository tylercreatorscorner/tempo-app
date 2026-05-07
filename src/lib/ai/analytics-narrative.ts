'use server';

import Anthropic from '@anthropic-ai/sdk';
import { formatCurrency } from '@/lib/utils/format';
import { BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';

/**
 * Compact metric pack that the LLM uses to write the narrative. Kept small
 * on purpose — the model writes better summaries from a curated brief than
 * from a kitchen-sink dump of every row.
 */
export interface NarrativeInput {
  periodLabel: string;
  prevPeriodLabel: string;
  brandFilter: string | null;          // null = all brands
  totals: {
    gmv: number;
    orders: number;
    videos: number;
    creators: number;
    aov: number;
    managedSharePct: number;
  };
  prevTotals: {
    gmv: number;
    orders: number;
    videos: number;
    creators: number;
    aov: number;
    managedSharePct: number;
  };
  brandRiser?:  { brand: string; current: number; prior: number; delta_pct: number } | null;
  brandFaller?: { brand: string; current: number; prior: number; delta_pct: number } | null;
  creatorBreakout?: { creator_name: string; brand: string; current_gmv: number; delta_pct: number; is_managed: boolean } | null;
  hotPost?: { video_title: string; creator_name: string; brand: string; total_gmv: number; days_active: number } | null;
  topProduct?: { product_name: string; brand: string; current_gmv: number; delta_pct: number; prior_gmv: number } | null;
  /** Concentration: top-N creators contribute X% of GMV */
  concentration?: {
    totalCreators: number;
    top1Pct: number;
    top10Pct: number;
  };
}

export type NarrativeResult =
  | { ok: true;  text: string; cachedAt: string }
  | { ok: false; error: string };

/** Builds a short, factual brief for the LLM. No JSON parsing on the response —
 * we ask for plain markdown so the UI can dangerouslySetInnerHTML or just render
 * via a markdown-aware text component. We keep the brief itself compact to
 * minimize tokens. */
function buildBrief(input: NarrativeInput): string {
  const brandLabel = input.brandFilter
    ? (BRAND_DISPLAY_NAMES[input.brandFilter] ?? input.brandFilter)
    : 'all brands';

  const fmt = (v: number) => formatCurrency(v);
  const pct = (cur: number, prev: number) =>
    prev === 0 ? (cur > 0 ? '+100%+' : '0%') : `${cur >= prev ? '+' : ''}${(((cur - prev) / prev) * 100).toFixed(1)}%`;

  const lines: string[] = [];
  lines.push(`Scope: ${brandLabel}`);
  lines.push(`Period: ${input.periodLabel} vs ${input.prevPeriodLabel}`);
  lines.push('');
  lines.push(`Totals:`);
  lines.push(`- GMV: ${fmt(input.totals.gmv)} (${pct(input.totals.gmv, input.prevTotals.gmv)})`);
  lines.push(`- Orders: ${input.totals.orders.toLocaleString()} (${pct(input.totals.orders, input.prevTotals.orders)})`);
  lines.push(`- Videos: ${input.totals.videos.toLocaleString()} (${pct(input.totals.videos, input.prevTotals.videos)})`);
  lines.push(`- Active creators: ${input.totals.creators.toLocaleString()} (${pct(input.totals.creators, input.prevTotals.creators)})`);
  lines.push(`- AOV: ${fmt(input.totals.aov)} (${pct(input.totals.aov, input.prevTotals.aov)})`);
  lines.push(`- Managed share: ${input.totals.managedSharePct.toFixed(0)}% (${input.prevTotals.managedSharePct.toFixed(0)}% prior)`);
  lines.push('');

  if (input.brandRiser) {
    const name = BRAND_DISPLAY_NAMES[input.brandRiser.brand] ?? input.brandRiser.brand;
    lines.push(`Top brand riser: ${name} — ${fmt(input.brandRiser.current)} (${input.brandRiser.delta_pct >= 0 ? '+' : ''}${input.brandRiser.delta_pct.toFixed(1)}%)`);
  }
  if (input.brandFaller) {
    const name = BRAND_DISPLAY_NAMES[input.brandFaller.brand] ?? input.brandFaller.brand;
    lines.push(`Biggest brand drop: ${name} — ${fmt(input.brandFaller.current)} (${input.brandFaller.delta_pct.toFixed(1)}%)`);
  }
  if (input.creatorBreakout) {
    const tag = input.creatorBreakout.is_managed ? 'managed' : 'unmanaged';
    lines.push(`Breakout creator: @${input.creatorBreakout.creator_name} (${tag}, ${BRAND_DISPLAY_NAMES[input.creatorBreakout.brand] ?? input.creatorBreakout.brand}) — ${fmt(input.creatorBreakout.current_gmv)} (+${input.creatorBreakout.delta_pct.toFixed(0)}%)`);
  }
  if (input.hotPost) {
    lines.push(`Hot post: "${input.hotPost.video_title}" by @${input.hotPost.creator_name} — ${fmt(input.hotPost.total_gmv)} in ${input.hotPost.days_active}d live`);
  }
  if (input.topProduct) {
    const name = BRAND_DISPLAY_NAMES[input.topProduct.brand] ?? input.topProduct.brand;
    lines.push(`Top product: ${input.topProduct.product_name} (${name}) — ${fmt(input.topProduct.current_gmv)}${input.topProduct.prior_gmv > 0 ? ` (${input.topProduct.delta_pct >= 0 ? '+' : ''}${input.topProduct.delta_pct.toFixed(1)}%)` : ''}`);
  }
  if (input.concentration && input.concentration.totalCreators >= 10) {
    lines.push(`Concentration: ${input.concentration.top1Pct.toFixed(0)}% from top creator, ${input.concentration.top10Pct.toFixed(0)}% from top 10 of ${input.concentration.totalCreators}.`);
  }

  return lines.join('\n');
}

const SYSTEM_PROMPT = `You are an analyst writing a short, sharp narrative for an agency operator who runs creator-marketing campaigns for TikTok Shop brands. Given a metrics brief, write 2-4 short paragraphs (under 180 words total) that:

1. Lead with the headline movement (GMV vs prior period) and what's actually driving it.
2. Call out the most actionable signal — biggest brand mover, breakout creator, hot post, or top product — and what it implies.
3. Note any risk signals (dropping brand, high concentration, declining managed share, etc.) if present.

Style:
- Plain language, no marketing fluff, no bullet lists.
- Use specific numbers from the brief.
- Don't hedge — be direct about what's working and what's not.
- No "the data shows..." filler. Just say what's happening.
- Markdown ok. **Bold** the most important figure once or twice.`;

export async function generateAnalyticsNarrative(input: NarrativeInput): Promise<NarrativeResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: 'ANTHROPIC_API_KEY not configured' };
  }

  const brief = buildBrief(input);
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: brief }],
    });

    const text = message.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('\n')
      .trim();

    return { ok: true, text, cachedAt: new Date().toISOString() };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error generating narrative';
    return { ok: false, error: msg };
  }
}
