/**
 * Anthropic Claude action library — Tempo-managed AI.
 *
 * Per Tyler's design call: AI is part of the paid plan, not BYOK. Tempo
 * holds the API key, eats the per-call cost, meters per-tenant usage via
 * the `ai_usage_log` table.
 *
 * Curated actions only (no generic "generate text"). Each action:
 *   1. Fetches the data it needs from Tempo's DB
 *   2. Builds a focused prompt
 *   3. Calls Claude with a hardcoded system prompt (quality is Tempo's
 *      responsibility, not the user's)
 *   4. Logs token usage
 *   5. Returns the generated text + structured metadata in `output`
 *
 * Env required:
 *   ANTHROPIC_API_KEY   — set in Vercel. Shared across all tenants.
 */
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/server';
import type { ActionResult, IntegrationContext } from './registry';
import { expandBrandToDataSlugs } from '@/lib/utils/constants';

const MODEL = 'claude-haiku-4-5';

// Pricing in $/MTok at time of writing (May 2026). Stored so we can compute
// per-call cost at log time — keeps historical attribution accurate even
// when prices change later.
const PRICING_PER_MTOK_USD: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-haiku-4-5': { input: 1.0, output: 5.0, cacheRead: 0.1, cacheWrite: 1.25 },
};

// ─── Internals ─────────────────────────────────────────────────────────────

interface CallArgs {
  system: string;
  user: string;
  maxTokens?: number;
  /** Used to attach the usage log row to an automation run when applicable. */
  automationRunId?: string | null;
  /** Identifies which curated action consumed tokens. */
  action: string;
  /** For metering — which tenant ran this. */
  tenantId: string | null;
}

interface CallResult {
  ok: boolean;
  text?: string;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
}

async function callClaude({ system, user, maxTokens = 800, automationRunId, action, tenantId }: CallArgs): Promise<CallResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: 'ANTHROPIC_API_KEY env var is not set' };
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    });

    const text = msg.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('\n')
      .trim();

    const inputTokens = msg.usage.input_tokens;
    const outputTokens = msg.usage.output_tokens;

    // Fire-and-forget usage log — don't block the response on Supabase write.
    void logAiUsage({
      tenantId,
      automationRunId: automationRunId ?? null,
      action,
      model: MODEL,
      inputTokens,
      outputTokens,
      status: 'success',
    });

    return { ok: true, text, inputTokens, outputTokens };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Claude call failed';
    void logAiUsage({
      tenantId,
      automationRunId: automationRunId ?? null,
      action,
      model: MODEL,
      inputTokens: 0,
      outputTokens: 0,
      status: 'failed',
      errorMessage: message,
    });
    return { ok: false, error: message };
  }
}

async function logAiUsage(args: {
  tenantId: string | null;
  automationRunId: string | null;
  action: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  status: 'success' | 'failed';
  errorMessage?: string;
}): Promise<void> {
  try {
    const supabase = await createAdminClient();
    const pricing = PRICING_PER_MTOK_USD[args.model];
    const costUsd = pricing
      ? (args.inputTokens / 1_000_000) * pricing.input + (args.outputTokens / 1_000_000) * pricing.output
      : 0;
    await supabase.from('ai_usage_log').insert({
      tenant_id: args.tenantId,
      automation_run_id: args.automationRunId,
      action: args.action,
      model: args.model,
      input_tokens: args.inputTokens,
      output_tokens: args.outputTokens,
      cost_cents_estimate: Math.round(costUsd * 100 * 10000) / 10000,
      status: args.status,
      error_message: args.errorMessage ?? null,
    });
  } catch {
    // Best-effort logging; never break the user's action because of a log
    // table hiccup.
  }
}

// ─── Curated actions ───────────────────────────────────────────────────────

/**
 * Generate a Discord-style "Daily Drop" — yesterday's GMV recap in the
 * brand-server voice.
 */
export async function generateDailyDrop({
  integration: _integration,
  params,
  automationRunId,
  tenantId,
}: {
  integration: IntegrationContext;
  params: Record<string, unknown>;
  automationRunId?: string | null;
  tenantId: string | null;
}): Promise<ActionResult> {
  const brandSlug = String(params.brand_slug ?? '').trim().toLowerCase();
  const tone = String(params.tone ?? 'energetic and concise').trim();
  if (!brandSlug) return { ok: false, error: 'brand_slug is required' };

  const supabase = await createAdminClient();

  // Resolve the brand. Accept umbrella slugs (e.g. 'leefar') by expanding to
  // store slugs for the data lookup.
  const dataSlugs = Array.from(expandBrandToDataSlugs(brandSlug));
  const { data: brand } = await supabase
    .from('brands_v2')
    .select('name, display_name')
    .eq('slug', brandSlug)
    .maybeSingle();

  // Find the latest report date with data for this brand. Anchor relative to
  // that — never just "yesterday" since data can lag a day or two.
  const { data: latest } = await supabase
    .from('creator_performance')
    .select('report_date')
    .in('brand', dataSlugs)
    .order('report_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  const reportDate = latest?.report_date as string | undefined;
  if (!reportDate) {
    return { ok: false, error: `No performance data found for brand "${brandSlug}"` };
  }

  // Pull that day's per-creator GMV + the top-grossing video for context.
  const [{ data: perfRows }, { data: videoRows }] = await Promise.all([
    supabase
      .from('creator_performance')
      .select('creator_name, gmv, orders, videos_posted')
      .in('brand', dataSlugs)
      .eq('report_date', reportDate),
    supabase
      .from('video_performance')
      .select('video_id, video_title, creator_name, gmv')
      .in('brand', dataSlugs)
      .eq('report_date', reportDate)
      .order('gmv', { ascending: false })
      .limit(1),
  ]);

  const totalGmv = (perfRows ?? []).reduce((s, r) => s + Number(r.gmv ?? 0), 0);
  const totalOrders = (perfRows ?? []).reduce((s, r) => s + Number(r.orders ?? 0), 0);
  const totalVideos = (perfRows ?? []).reduce((s, r) => s + Number(r.videos_posted ?? 0), 0);
  const topCreators = (perfRows ?? [])
    .filter(r => Number(r.gmv ?? 0) > 0)
    .sort((a, b) => Number(b.gmv) - Number(a.gmv))
    .slice(0, 3);
  const topVideo = videoRows?.[0];

  const brandLabel = brand?.display_name || brand?.name || brandSlug;
  const fmtCurrency = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

  const brief = [
    `Brand: ${brandLabel}`,
    `Date: ${reportDate}`,
    `Total GMV: ${fmtCurrency(totalGmv)}`,
    `Total orders: ${totalOrders.toLocaleString()}`,
    `Videos posted: ${totalVideos}`,
    topCreators.length > 0
      ? `Top creators by GMV:\n${topCreators.map(c => `  • @${c.creator_name} — ${fmtCurrency(Number(c.gmv))}`).join('\n')}`
      : 'No creator GMV recorded.',
    topVideo
      ? `Top video: "${topVideo.video_title ?? 'untitled'}" by @${topVideo.creator_name} — ${fmtCurrency(Number(topVideo.gmv))}`
      : '',
  ].filter(Boolean).join('\n');

  const system = `You are writing a daily "Daily Drop" Discord post for a TikTok Shop brand's creator community. Tone: ${tone}.

Format the post:
  - Start with a punchy headline line like "📊 Daily Drop — ${brandLabel}, ${reportDate}"
  - One short paragraph (2-3 sentences) summarizing yesterday's numbers
  - Bullet list of top 3 creators with their GMV
  - One line shouting out the top video (or skip if no top video data)
  - End with a one-line CTA encouraging creators to keep posting

Style:
  - Discord markdown (\\*\\*bold\\*\\*, \\*italic\\*) — NOT slack mrkdwn
  - Use specific numbers from the brief
  - No marketing fluff or filler
  - Keep total length under 150 words`;

  const result = await callClaude({
    system,
    user: brief,
    maxTokens: 600,
    action: 'generate_daily_drop',
    automationRunId,
    tenantId,
  });
  if (!result.ok) return { ok: false, error: result.error };

  return {
    ok: true,
    summary: `Drafted Daily Drop for ${brandLabel} (${reportDate})`,
    output: {
      text: result.text,
      brand_slug: brandSlug,
      brand_label: brandLabel,
      report_date: reportDate,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
    },
  };
}
