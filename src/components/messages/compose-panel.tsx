'use client';

/**
 * "New broadcast" panel — the right column of the Broadcasts tab. Mirrors the
 * Reporting create panel idiom: one Card, res.ok-guarded fetches, inline
 * pulse-neg errors, staleness guards on slow responses.
 *
 * Three states swap INSIDE the card (no route change):
 *   compose → 1 Audience (saved segments + prebuilts), 2 Channel (live
 *             reachability via POST /api/broadcasts/preview), 3 Message
 *             (template + tokens + highlighted preview)
 *   review  → will-receive / skipped / est-duration band, skip reasons with
 *             example handles, the consent note, Send + Back
 *   sent    → queued confirmation with a link to the delivery log
 *
 * Phase A: Discord DM only. Email shows its count but is disabled (Phase B);
 * SMS is gated until carrier registration + legal copy clear.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Loader2, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PREBUILT_SEGMENTS } from '@/lib/data/prebuilt-segments';
import type { Segment, SegmentFilterCriteria } from '@/lib/data/segments';
import { BROADCAST_TEMPLATES, BROADCAST_TOKENS, getBroadcastTemplate } from './templates';
import { ChannelChip, InlineError, TokenText, formatEstDuration, skipReasonLabel } from './comms-bits';

const BODY_MAX = 2000;

// ── API shapes (contract with /api/broadcasts + /preview) ───────────
interface SkipRow {
  reason: string;
  count: number;
  examples: string[];
}

interface PreviewResult {
  eligible: number;
  skipped: SkipRow[];
  estSeconds: number;
}

/** Selected audience, resolved from the select value. */
type Audience =
  | { kind: 'segment'; id: string; label: string }
  | { kind: 'prebuilt'; key: string; label: string; criteria: SegmentFilterCriteria };

function audienceBody(a: Audience): { segmentId?: string; criteria?: SegmentFilterCriteria } {
  return a.kind === 'segment' ? { segmentId: a.id } : { criteria: a.criteria };
}

function normalizePreview(data: unknown): PreviewResult {
  const d = (data ?? {}) as Partial<PreviewResult>;
  return {
    eligible: typeof d.eligible === 'number' ? d.eligible : 0,
    skipped: Array.isArray(d.skipped) ? d.skipped : [],
    estSeconds: typeof d.estSeconds === 'number' ? d.estSeconds : 0,
  };
}

function skippedTotal(p: PreviewResult): number {
  return p.skipped.reduce((sum, s) => sum + (s.count || 0), 0);
}

export function ComposePanel({
  onSent,
  onViewLog,
  templateToLoad,
  onTemplateConsumed,
}: {
  /** Bumps the feed after a broadcast is created. */
  onSent: () => void;
  /** Opens the delivery-log drawer for a broadcast id. */
  onViewLog: (id: string) => void;
  /** Template key pushed from the Templates tab ("Use"). Consumed once. */
  templateToLoad?: string | null;
  onTemplateConsumed?: () => void;
}) {
  const [step, setStep] = useState<'compose' | 'review' | 'sent'>('compose');

  // ── Audience ──────────────────────────────────────────────────────
  const [audienceValue, setAudienceValue] = useState('');
  const [customs, setCustoms] = useState<Segment[]>([]);
  const [segmentsError, setSegmentsError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/segments');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) setCustoms((json.segments ?? []) as Segment[]);
      } catch {
        if (!cancelled) setSegmentsError(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const audience: Audience | null = useMemo(() => {
    if (audienceValue.startsWith('prebuilt:')) {
      const p = PREBUILT_SEGMENTS.find((s) => s.key === audienceValue.slice(9));
      return p ? { kind: 'prebuilt', key: p.key, label: p.name, criteria: p.criteria } : null;
    }
    if (audienceValue.startsWith('segment:')) {
      const s = customs.find((c) => c.id === audienceValue.slice(8));
      return s ? { kind: 'segment', id: s.id, label: s.name } : null;
    }
    return null;
  }, [audienceValue, customs]);

  // ── Channel + reachability preview ────────────────────────────────
  // Phase A: discord_dm is the only selectable channel; email fires a preview
  // too so its row can show an honest count.
  const channel = 'discord_dm';
  const [dmPreview, setDmPreview] = useState<PreviewResult | null>(null);
  const [emailPreview, setEmailPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // Staleness guard: a slow preview must not land under a different audience.
  const previewSeq = useRef(0);

  useEffect(() => {
    previewSeq.current += 1;
    const seq = previewSeq.current;
    setDmPreview(null);
    setEmailPreview(null);
    setPreviewError(null);
    // An audience change invalidates a pending review (its numbers describe
    // the old audience). The sent state survives — audience didn't change.
    setStep((s) => (s === 'review' ? 'compose' : s));
    if (!audience) {
      setPreviewLoading(false);
      return;
    }
    setPreviewLoading(true);
    const timer = setTimeout(async () => {
      const fire = async (ch: string): Promise<PreviewResult> => {
        const res = await fetch('/api/broadcasts/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...audienceBody(audience), channel: ch, audienceLabel: audience.label }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
        return normalizePreview(data);
      };
      const [dm, em] = await Promise.allSettled([fire('discord_dm'), fire('email')]);
      if (seq !== previewSeq.current) return; // audience changed mid-flight
      if (dm.status === 'fulfilled') setDmPreview(dm.value);
      else setPreviewError(dm.reason instanceof Error ? dm.reason.message : 'Failed to check reachability');
      // Email count is informational — a failure renders "—", not an error.
      if (em.status === 'fulfilled') setEmailPreview(em.value);
      setPreviewLoading(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [audience]);

  // ── Message ───────────────────────────────────────────────────────
  const [templateKey, setTemplateKey] = useState('');
  const [body, setBody] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Template pushed from the Templates tab ("Use").
  useEffect(() => {
    if (!templateToLoad) return;
    const t = getBroadcastTemplate(templateToLoad);
    if (t) {
      setTemplateKey(t.key);
      setBody(t.body);
      setStep('compose');
    }
    onTemplateConsumed?.();
  }, [templateToLoad, onTemplateConsumed]);

  const pickTemplate = (key: string) => {
    setTemplateKey(key);
    const t = getBroadcastTemplate(key);
    if (t) setBody(t.body);
  };

  const insertToken = (tok: string) => {
    const el = textareaRef.current;
    const chip = `{${tok}}`;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? start;
    const next = (body.slice(0, start) + chip + body.slice(end)).slice(0, BODY_MAX);
    setBody(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = Math.min(start + chip.length, next.length);
      el.setSelectionRange(pos, pos);
    });
  };

  // ── Send ──────────────────────────────────────────────────────────
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentResult, setSentResult] = useState<{ id: string; eligible: number; skipped: SkipRow[] } | null>(null);
  // One key per composed broadcast: if the create times out after committing
  // and the operator retries, the server dedupes on this instead of enqueuing
  // (and DMing) the whole audience a second time. Regenerated whenever the
  // composed content changes (audience/channel/body edits re-enter compose).
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  const send = async () => {
    if (!audience || !body.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch('/api/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...audienceBody(audience),
          channel,
          audienceLabel: audience.label,
          body: body.trim(),
          idempotencyKey: idempotencyKeyRef.current,
          ...(templateKey ? { templateKey } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
      if (typeof (data as { id?: unknown }).id !== 'string') {
        throw new Error('The server did not return a broadcast id.');
      }
      const d = data as { id: string; eligible?: number; skipped?: SkipRow[] };
      setSentResult({
        id: d.id,
        eligible: typeof d.eligible === 'number' ? d.eligible : dmPreview?.eligible ?? 0,
        skipped: Array.isArray(d.skipped) ? d.skipped : dmPreview?.skipped ?? [],
      });
      setStep('sent');
      onSent();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to queue the broadcast');
    } finally {
      setSending(false);
    }
  };

  const resetForNew = () => {
    idempotencyKeyRef.current = crypto.randomUUID();
    setBody('');
    setTemplateKey('');
    setSentResult(null);
    setSendError(null);
    setStep('compose');
  };

  const eligible = dmPreview?.eligible ?? 0;
  const canReview = !!audience && eligible > 0 && body.trim().length > 0 && !previewLoading;
  const templateName = templateKey ? getBroadcastTemplate(templateKey)?.name : undefined;

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-base font-bold tracking-tight text-foreground">New broadcast</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Pick a segment, check reachability, send. Delivery is queued and logged per creator.
        </p>
      </div>

      {step === 'compose' && (
        <div className="space-y-5 p-5">
          {/* 1 · Audience */}
          <div>
            <Label htmlFor="bc-audience">1 · Audience</Label>
            <Select id="bc-audience" value={audienceValue} onChange={(e) => setAudienceValue(e.target.value)}>
              <option value="">Choose an audience…</option>
              <optgroup label="Prebuilt segments">
                {PREBUILT_SEGMENTS.map((p) => (
                  <option key={p.key} value={`prebuilt:${p.key}`}>{p.name}</option>
                ))}
              </optgroup>
              {customs.length > 0 && (
                <optgroup label="Your segments">
                  {customs.map((s) => (
                    <option key={s.id} value={`segment:${s.id}`}>{s.name}</option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Coming soon">
                <option value="roster-filter" disabled>Current roster filter (Phase B)</option>
              </optgroup>
            </Select>
            {segmentsError && (
              <p className="mt-1.5 text-[11px] text-[var(--pulse-warn)]">
                Couldn&apos;t load your saved segments. Prebuilt segments still work.
              </p>
            )}
          </div>

          {/* 2 · Channel */}
          <div>
            <Label>2 · Channel</Label>
            <div className="space-y-2">
              <ChannelRow
                selected
                name="Discord DM"
                metaTone={dmPreview ? 'pos' : 'muted'}
                meta={
                  !audience
                    ? 'pick an audience'
                    : previewLoading
                      ? 'checking reachability…'
                      : dmPreview
                        ? `${dmPreview.eligible} of ${dmPreview.eligible + skippedTotal(dmPreview)} reachable`
                        : '—'
                }
                sub="via the Tempo bot"
              />
              <ChannelRow
                disabled
                name="Email"
                metaTone="fg"
                meta={
                  emailPreview
                    ? `${emailPreview.eligible} of ${emailPreview.eligible + skippedTotal(emailPreview)} have an address`
                    : '—'
                }
                sub="Phase B · grows with portal onboarding"
              />
              <ChannelRow
                disabled
                gated
                name="SMS"
                metaTone="warn"
                meta="0 opted in - gated"
                sub="carrier registration + legal copy"
              />
            </div>
            {previewError && <div className="mt-2"><InlineError>{previewError}</InlineError></div>}
          </div>

          {/* 3 · Message */}
          <div className="space-y-2.5">
            <Label htmlFor="bc-template" className="mb-0">3 · Message</Label>
            <Select
              id="bc-template"
              value={templateKey}
              onChange={(e) => (e.target.value ? pickTemplate(e.target.value) : setTemplateKey(''))}
            >
              <option value="">Custom message</option>
              {BROADCAST_TEMPLATES.map((t) => (
                <option key={t.key} value={t.key}>Template: {t.name}</option>
              ))}
            </Select>
            <Textarea
              ref={textareaRef}
              rows={5}
              maxLength={BODY_MAX}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write the message. Tokens like {first_name} fill in per creator at send time."
              aria-label="Broadcast message"
            />
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {BROADCAST_TOKENS.map((tok) => (
                  <button
                    key={tok}
                    type="button"
                    onClick={() => insertToken(tok)}
                    className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10.5px] font-bold text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    {`{${tok}}`}
                  </button>
                ))}
              </div>
              <span className="shrink-0 text-[10.5px] tabular-nums text-muted-foreground">
                {body.length}/{BODY_MAX}
              </span>
            </div>
            {body.trim().length > 0 && (
              <div className="rounded-lg border border-border bg-secondary/60 px-3 py-2.5">
                <p className="mb-1 text-[9.5px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  Preview · tokens fill in per creator
                </p>
                <TokenText body={body} className="text-[12.5px] leading-relaxed text-foreground" />
              </div>
            )}
          </div>

          <Button
            size="lg"
            className="w-full"
            disabled={!canReview}
            onClick={() => {
              // New review = new send intent = fresh idempotency key. A retry
              // of a FAILED send stays on this review step and reuses the key.
              idempotencyKeyRef.current = crypto.randomUUID();
              setSendError(null);
              setStep('review');
            }}
          >
            {previewLoading
              ? <><Loader2 className="animate-spin" />Checking audience…</>
              : `Review send${eligible > 0 ? ` · ${eligible} creator${eligible === 1 ? '' : 's'}` : ''}`}
          </Button>
        </div>
      )}

      {step === 'review' && audience && dmPreview && (
        <ReviewStep
          audienceLabel={audience.label}
          templateName={templateName}
          preview={dmPreview}
          sending={sending}
          sendError={sendError}
          onBack={() => setStep('compose')}
          onSend={send}
        />
      )}

      {step === 'sent' && sentResult && (
        <div className="space-y-4 p-5">
          <div className="space-y-1.5 rounded-xl border border-[var(--pulse-pos)]/25 bg-[var(--pulse-pos-bg)] px-3.5 py-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--pulse-pos)]">
              <Check className="h-3.5 w-3.5" />
              Broadcast queued
            </div>
            <p className="text-xs text-muted-foreground">
              Sending to {sentResult.eligible} creator{sentResult.eligible === 1 ? '' : 's'} at about 1 per second.
              Delivery continues in the background; watch it live in the Log.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onViewLog(sentResult.id)}>
              View log
            </Button>
            <Button className="flex-1" onClick={resetForNew}>
              New broadcast
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Channel row (mockup .chan-row) ──────────────────────────────────
function ChannelRow({
  name, meta, sub, metaTone, selected, disabled, gated,
}: {
  name: string;
  meta: string;
  sub: string;
  metaTone: 'pos' | 'warn' | 'fg' | 'muted';
  selected?: boolean;
  disabled?: boolean;
  gated?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5',
        selected ? 'border-primary ring-1 ring-inset ring-primary' : 'border-border',
        (disabled || gated) && 'opacity-60',
      )}
      aria-disabled={disabled || undefined}
    >
      <span
        aria-hidden="true"
        className={cn(
          'h-3.5 w-3.5 shrink-0 rounded-full border-2',
          selected ? 'border-primary bg-primary shadow-[inset_0_0_0_2.5px_var(--card)]' : 'border-muted-foreground/50',
        )}
      />
      <span className="text-[12.5px] font-bold text-foreground">{name}</span>
      <span className="ml-auto text-right text-[11px] leading-tight text-muted-foreground">
        <span
          className={cn(
            'font-bold',
            metaTone === 'pos' && 'text-[var(--pulse-pos)]',
            metaTone === 'warn' && 'text-[var(--pulse-warn)]',
            metaTone === 'fg' && 'text-foreground',
          )}
        >
          {meta}
        </span>
        <br />
        {sub}
      </span>
    </div>
  );
}

// ── Review step (mockup Surface 2) ──────────────────────────────────
function ReviewStep({
  audienceLabel, templateName, preview, sending, sendError, onBack, onSend,
}: {
  audienceLabel: string;
  templateName?: string;
  preview: PreviewResult;
  sending: boolean;
  sendError: string | null;
  onBack: () => void;
  onSend: () => void;
}) {
  const skipped = skippedTotal(preview);
  return (
    <div className="space-y-4 p-5">
      <div>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm font-bold text-foreground">
          <span>Review · {templateName ?? 'Custom message'}</span>
          <span className="text-muted-foreground">to</span>
          <span>{audienceLabel}</span>
          <ChannelChip channel="discord_dm" />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Sends are rate-limited (about 1 per second) and continue in the background.
          You can watch delivery live in the Log.
        </p>
      </div>

      {/* Stat band */}
      <div className="grid grid-cols-3 gap-2">
        <ReviewStat label="Will receive" value={String(preview.eligible)} tone="pos" />
        <ReviewStat label="Skipped" value={String(skipped)} tone={skipped > 0 ? 'warn' : undefined} />
        <ReviewStat label="Est. duration" value={formatEstDuration(preview.estSeconds)} />
      </div>

      {/* Skip reasons with example handles */}
      {preview.skipped.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border">
          {preview.skipped.map((s, i) => (
            <div
              key={`${s.reason}-${i}`}
              className="flex items-baseline justify-between gap-3 border-b border-border px-3.5 py-2.5 text-xs last:border-b-0"
            >
              <span className="text-muted-foreground">{skipReasonLabel(s.reason)}</span>
              <span className="min-w-0 text-right font-bold tabular-nums text-foreground">
                {s.count}
                {s.count > 0 && s.examples.length > 0 && (
                  <span className="ml-1.5 truncate font-normal text-muted-foreground">
                    · {s.examples.slice(0, 3).map((h) => (h.startsWith('@') ? h : `@${h}`)).join(', ')}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Consent note */}
      <div className="rounded-lg border border-[var(--pulse-warn)]/25 bg-[var(--pulse-warn-bg)] px-3.5 py-2.5 text-xs text-muted-foreground">
        <strong className="text-[var(--pulse-warn)]">Consent is enforced at the send layer, not the button:</strong>{' '}
        the sender re-checks every recipient&apos;s contact and consent status at delivery time.
        An SMS broadcast can only ever reach opted-in numbers, and a STOP reply flips a creator
        out before the next message in the queue.
      </div>

      {sendError && <InlineError>{sendError}</InlineError>}

      <div className="flex gap-2">
        <Button size="lg" className="flex-1" onClick={onSend} disabled={sending || preview.eligible === 0}>
          {sending
            ? <><Loader2 className="animate-spin" />Queueing…</>
            : <><Send />Send to {preview.eligible} creator{preview.eligible === 1 ? '' : 's'}</>}
        </Button>
        <Button size="lg" variant="outline" onClick={onBack} disabled={sending}>
          <ArrowLeft />
          Back
        </Button>
      </div>
    </div>
  );
}

function ReviewStat({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'warn' }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/60 px-3 py-2.5">
      <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-0.5 text-lg font-extrabold tabular-nums text-foreground',
          tone === 'pos' && 'text-[var(--pulse-pos)]',
          tone === 'warn' && 'text-[var(--pulse-warn)]',
        )}
      >
        {value}
      </p>
    </div>
  );
}
