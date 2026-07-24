'use client';

/**
 * The monthly invoice run (mockup Surface 2).
 *
 * Opens from the cockpit's "Run {month} invoices" button. Fetches the PLAN
 * (GET /api/invoices/run), shows the Ready / Already invoiced / Zero balance /
 * Run total band and the checklist (ready rows below the $100 minimum start
 * unchecked), then POSTs the checked brands and renders each brand's result
 * inline: created (with its invoice number), duplicate, or failed. Drafts
 * only — nothing is emailed.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, CheckCircle2, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatPeriod } from '@/lib/utils/format';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { Button } from '@/components/ui/button';
import { TableLoadBar } from '@/components/ui/table-load-bar';
import { useDelayedFlag } from '@/hooks/use-delayed-flag';
import { RUN_MINIMUM_USD, modelLabel, type RunPlan, type RunResult } from './types';

type Phase = 'loading' | 'ready' | 'running' | 'done';

export function RunInvoicesModal({
  month,
  teamMemberId,
  onClose,
  onRunCompleted,
}: {
  month: string;
  teamMemberId: string | null;
  onClose: () => void;
  /** Fired once a run finishes (any outcome) so the cockpit refetches. */
  onRunCompleted: () => void;
}) {
  const [plan, setPlan] = useState<RunPlan | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Map<string, RunResult> | null>(null);
  const showBar = useDelayedFlag(phase === 'loading' || phase === 'running');

  // Fresh plan on open — the page's counts may be minutes old.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tmParam = teamMemberId ? `&team_member_id=${teamMemberId}` : '';
        const res = await fetch(`/api/invoices/run?month=${month}${tmParam}`, { cache: 'no-store' });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        if (cancelled) return;
        const p = j as RunPlan;
        setPlan(p);
        // Default checks: everything ready at or above the minimum.
        setChecked(new Set(p.ready.filter((r) => r.total >= RUN_MINIMUM_USD).map((r) => r.brand)));
        setPhase('ready');
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load the run plan');
        setPhase('ready');
      }
    })();
    return () => { cancelled = true; };
  }, [month, teamMemberId]);

  const toggle = useCallback((brand: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(brand)) next.delete(brand); else next.add(brand);
      return next;
    });
  }, []);

  const runTotal = useMemo(
    () => (plan ? plan.ready.filter((r) => checked.has(r.brand)).reduce((s, r) => s + r.total, 0) : 0),
    [plan, checked],
  );

  const handleGenerate = useCallback(async () => {
    if (!plan || checked.size === 0) return;
    setPhase('running');
    setError(null);
    try {
      const res = await fetch('/api/invoices/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, teamMemberId: teamMemberId ?? undefined, brands: Array.from(checked) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      const map = new Map<string, RunResult>();
      for (const r of (j.results ?? []) as RunResult[]) map.set(r.brand, r);
      setResults(map);
      setPhase('done');
      onRunCompleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The run failed');
      setPhase('ready');
    }
  }, [plan, checked, month, teamMemberId, onRunCompleted]);

  const createdCount = results ? Array.from(results.values()).filter((r) => r.ok).length : 0;

  return (
    <ModalOverlay onClose={onClose} closeOnBackdropClick={phase !== 'running'} closeOnEsc={phase !== 'running'}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px]" aria-hidden="true" />
      <div className="fixed inset-0 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Run ${formatPeriod(month)} invoices`}
          className="relative w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <TableLoadBar active={showBar} />
          <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5 sm:px-6">
            <div>
              <h2 className="text-[15px] font-extrabold text-foreground">Run {formatPeriod(month)} invoices</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {plan?.teamMemberName ? `Payee: ${plan.teamMemberName} · ` : ''}numbers frozen from this month&apos;s earnings at generation time
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={phase === 'running'}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className={cn('px-5 pb-5 sm:px-6', showBar && plan && 'opacity-60 transition-opacity duration-200')}>
            {error && (
              <div className="mb-3 flex items-center gap-2 rounded-xl border border-[var(--pulse-neg)]/25 bg-[var(--pulse-neg-bg)] px-3.5 py-2.5 text-xs font-semibold text-[var(--pulse-neg)]">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {phase === 'loading' && !plan ? (
              <div className="space-y-3 py-2">
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
                  ))}
                </div>
                <div className="h-40 animate-pulse rounded-xl bg-muted" />
              </div>
            ) : plan ? (
              <>
                {/* Band */}
                <div className="mb-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <RunStat label="Ready" value={String(plan.ready.length)} valueClass="text-[var(--pulse-pos)]" />
                  <RunStat label="Already invoiced" value={String(plan.invoiced.length)} />
                  <RunStat label="Zero balance" value={String(plan.zero.length)} valueClass="text-muted-foreground" />
                  <RunStat label="Run total" value={formatCurrency(runTotal)} />
                </div>

                {/* Checklist */}
                <div className="mb-3.5 overflow-hidden rounded-xl border border-border bg-secondary/50">
                  {plan.ready.length === 0 && plan.invoiced.length === 0 && plan.zero.length === 0 && (
                    <div className="px-4 py-6 text-center text-xs text-muted-foreground">No brands in this month&apos;s earnings.</div>
                  )}
                  {plan.ready.map((r) => {
                    const isChecked = checked.has(r.brand);
                    const belowMin = r.total < RUN_MINIMUM_USD;
                    const result = results?.get(r.brand);
                    return (
                      <div key={r.brand} className="flex items-center gap-2.5 border-b border-border px-4 py-2.5 text-[12.5px] last:border-0">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={isChecked}
                          aria-label={`Include ${r.brandLabel}`}
                          disabled={phase !== 'ready'}
                          onClick={() => toggle(r.brand)}
                          className={cn(
                            'grid h-4 w-4 shrink-0 place-items-center rounded border-2 transition-colors',
                            isChecked ? 'border-[var(--primary)] bg-[var(--primary)] text-white' : 'border-muted-foreground/50 bg-transparent',
                            phase !== 'ready' && 'opacity-50',
                          )}
                        >
                          {isChecked && <Check className="h-3 w-3" strokeWidth={3} />}
                        </button>
                        <span className="font-semibold text-foreground">{r.brandLabel}</span>
                        <span className="text-[10.5px] text-muted-foreground">
                          {belowMin ? `${formatCurrency(r.total)} · below your ${formatCurrency(RUN_MINIMUM_USD)} minimum` : modelLabel(r.model)}
                        </span>
                        <span className="ml-auto flex items-center gap-2">
                          {result && <ResultTag result={result} />}
                          <span className={cn('font-bold tabular-nums', belowMin ? 'text-muted-foreground' : 'text-foreground')}>
                            {formatCurrency(r.total)}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                  {plan.invoiced.map((r) => (
                    <div key={r.brand} className="flex items-center gap-2.5 border-b border-border px-4 py-2.5 text-[12.5px] last:border-0 opacity-70">
                      <span className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="font-semibold text-foreground">{r.brandLabel}</span>
                      <span className="ml-auto rounded-md bg-[var(--pulse-warn-bg)] px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.06em] text-[var(--pulse-warn)]">
                        {r.status === 'pending' ? 'Draft' : r.status} · {r.invoiceNumber}
                      </span>
                    </div>
                  ))}
                  {plan.zero.map((r) => (
                    <div key={r.brand} className="flex items-center gap-2.5 border-b border-border px-4 py-2.5 text-[12.5px] last:border-0 opacity-60">
                      <span className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="font-semibold text-muted-foreground">{r.brandLabel}</span>
                      <span className="text-[10.5px] text-muted-foreground">zero balance</span>
                      <span className="ml-auto font-bold tabular-nums text-muted-foreground">{formatCurrency(r.total)}</span>
                    </div>
                  ))}
                </div>

                {/* Drafts-only note */}
                <div className="rounded-xl border border-[var(--pulse-warn)]/25 bg-[var(--pulse-warn-bg)] px-3.5 py-2.5 text-[11.5px] text-muted-foreground">
                  <b className="font-bold text-[var(--pulse-warn)]">Nothing is emailed automatically.</b>{' '}
                  The run creates draft invoices only - you review each one, then send by email or share link exactly as today.
                </div>

                {/* Actions */}
                <div className="mt-4 flex items-center gap-2">
                  {phase === 'done' ? (
                    <>
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--pulse-pos)]">
                        <CheckCircle2 className="h-4 w-4" />
                        Created {createdCount} invoice{createdCount === 1 ? '' : 's'}
                      </span>
                      <Button variant="secondary" size="md" className="ml-auto" onClick={onClose}>
                        Done
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="primary"
                        size="md"
                        className="flex-1"
                        disabled={phase !== 'ready' || checked.size === 0}
                        onClick={handleGenerate}
                      >
                        {phase === 'running' && <Loader2 className="animate-spin" />}
                        {phase === 'running'
                          ? 'Generating…'
                          : `Generate ${checked.size} invoice${checked.size === 1 ? '' : 's'}`}
                      </Button>
                      <Button variant="outline" size="md" disabled={phase === 'running'} onClick={onClose}>
                        Cancel
                      </Button>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="py-6 text-center text-sm text-muted-foreground">The run plan could not be loaded.</div>
            )}
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}

function RunStat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/60 px-3 py-2.5">
      <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</div>
      <div className={cn('mt-0.5 text-lg font-extrabold tabular-nums text-foreground', valueClass)}>{value}</div>
    </div>
  );
}

/** Inline per-brand outcome after the run: created / duplicate / failed. */
function ResultTag({ result }: { result: RunResult }) {
  if (result.ok) {
    return (
      <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-[var(--pulse-pos)]">
        <CheckCircle2 className="h-3 w-3" />
        {result.invoiceNumber}
      </span>
    );
  }
  if (result.duplicate) {
    return (
      <span className="text-[10.5px] font-bold text-[var(--pulse-warn)]" title={result.error}>
        already invoiced{result.invoiceNumber ? ` · ${result.invoiceNumber}` : ''}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-[var(--pulse-neg)]" title={result.error}>
      <AlertCircle className="h-3 w-3" />
      failed
    </span>
  );
}
