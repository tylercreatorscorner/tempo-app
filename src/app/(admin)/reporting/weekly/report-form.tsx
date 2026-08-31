'use client';

/**
 * One brand's weekly report.
 *
 * The shape of this form is the argument: the top half is COMPUTED and cannot
 * be edited, the bottom half is the manager's judgement and cannot be derived.
 * Capture rate sits in the computed half because it is the metric the whole
 * system rests on and the one a manager is most likely to get wrong by hand.
 */

import { useState, useTransition } from 'react';
import { AlertTriangle, Check, ChevronDown, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { submitWeeklyReport } from '@/app/actions/weekly-manager-report';
import type { WeeklyReportRow } from '@/lib/data/weekly-manager-report';

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/** Percentage-point change, or null when either side is missing. */
function ppChange(cur: number | null, prior: number | null): number | null {
  if (cur === null || prior === null) return null;
  return cur - prior;
}

function pctChange(cur: number, prior: number): number | null {
  if (prior === 0) return null; // "from zero" has no percentage; render as new
  return ((cur - prior) / prior) * 100;
}

/** A computed figure. Never an input: that is the whole point of the form. */
function Computed({
  label,
  value,
  delta,
  deltaSuffix = '%',
  foot,
}: {
  label: string;
  value: string;
  delta?: number | null;
  deltaSuffix?: string;
  foot?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-lg font-semibold tabular-nums text-foreground">{value}</span>
        {delta !== null && delta !== undefined && (
          <span
            className={cn(
              'text-xs font-bold tabular-nums',
              delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
            )}
          >
            {delta >= 0 ? '+' : ''}
            {delta.toFixed(1)}
            {deltaSuffix}
          </span>
        )}
      </div>
      {foot && <div className="mt-0.5 text-[11px] text-muted-foreground">{foot}</div>}
    </div>
  );
}

export function ReportForm({ row, weekEnding }: { row: WeeklyReportRow; weekEnding: string }) {
  const s = row.submission;
  const [open, setOpen] = useState(!s);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [creatorsRecruited, setCreatorsRecruited] = useState(
    s?.creatorsRecruited != null ? String(s.creatorsRecruited) : '',
  );
  const [biggestWin, setBiggestWin] = useState(s?.biggestWin ?? '');
  const [biggestChallenge, setBiggestChallenge] = useState(s?.biggestChallenge ?? '');
  const [nextAction, setNextAction] = useState(s?.nextAction ?? '');
  const [nextActionDue, setNextActionDue] = useState(s?.nextActionDue ?? '');
  const [clientHealth, setClientHealth] = useState(s?.clientHealth ?? '');
  const [clientHealthNote, setClientHealthNote] = useState(s?.clientHealthNote ?? '');
  const [renewalRisk, setRenewalRisk] = useState(s?.renewalRisk ?? '');
  const [renewalNote, setRenewalNote] = useState(s?.renewalNote ?? '');
  const [contractEndsOn, setContractEndsOn] = useState(s?.contractEndsOn ?? '');

  const shortWeek = row.coverage.daysCovered < row.coverage.daysInWeek;
  const captureDelta = ppChange(row.current.capturePct, row.prior.capturePct);

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await submitWeeklyReport({
        brandSlug: row.brandSlug,
        weekEnding,
        creatorsRecruited: creatorsRecruited === '' ? null : Number(creatorsRecruited),
        biggestWin,
        biggestChallenge,
        nextAction,
        nextActionDue: nextActionDue || null,
        clientHealth: clientHealth as 'green' | 'yellow' | 'red',
        clientHealthNote,
        renewalRisk: renewalRisk as 'none' | 'watch' | 'at_risk',
        renewalNote,
        contractEndsOn: contractEndsOn || null,
      });
      if (res.ok) {
        setSaved(true);
        setOpen(false);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* ── Header row: brand, who owns it, whether it is filed ─────────── */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">{row.brandLabel}</span>
            {s || saved ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                <Check className="h-3 w-3" /> Filed
              </span>
            ) : (
              <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                Not filed
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {row.managerName ?? 'Unassigned'}
            {row.current.capturePct !== null && (
              <> · capture {row.current.capturePct.toFixed(1)}%</>
            )}
            {' · '}
            {money(row.current.managedGmv)} managed
          </div>
        </div>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="border-t border-border px-4 py-4 space-y-5">
          {/* ── Computed. Read-only by design. ──────────────────────────── */}
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              <Lock className="h-3 w-3" />
              Calculated from Tempo, not editable
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Computed
                label="Brand GMV"
                value={money(row.current.brandGmv)}
                delta={pctChange(row.current.brandGmv, row.prior.brandGmv)}
                foot={`vs ${money(row.prior.brandGmv)} prior week`}
              />
              <Computed
                label="CC managed GMV"
                value={money(row.current.managedGmv)}
                delta={pctChange(row.current.managedGmv, row.prior.managedGmv)}
                foot={`vs ${money(row.prior.managedGmv)} prior week`}
              />
              <Computed
                label="Capture rate"
                value={row.current.capturePct !== null ? `${row.current.capturePct.toFixed(1)}%` : '—'}
                delta={captureDelta}
                deltaSuffix="pts"
                foot={
                  row.prior.capturePct !== null
                    ? `vs ${row.prior.capturePct.toFixed(1)}% prior week`
                    : 'no prior week to compare'
                }
              />
              <Computed
                label="Posts published"
                value={row.current.posts.toLocaleString('en-US')}
                delta={pctChange(row.current.posts, row.prior.posts)}
                foot={`vs ${row.prior.posts.toLocaleString('en-US')} prior week`}
              />
            </div>

            {/* A short week is stated, never silently reported as a decline. */}
            {shortWeek && (
              <div className="mt-2 flex gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  Only <b>{row.coverage.daysCovered} of {row.coverage.daysInWeek} days</b> have data
                  {row.coverage.lastDayWithData && <> (last is {row.coverage.lastDayWithData})</>}, so
                  these figures are short against a full prior week. Worth saying so in your notes
                  rather than reading it as a drop.
                </span>
              </div>
            )}

            {/* The live figure has moved away from what this was graded on. */}
            {s?.snapCapturePct != null &&
              row.current.capturePct !== null &&
              Math.abs(row.current.capturePct - s.snapCapturePct) >= 0.5 && (
                <div className="mt-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                  Filed at <b className="text-foreground">{s.snapCapturePct.toFixed(1)}%</b> capture,
                  now reads <b className="text-foreground">{row.current.capturePct.toFixed(1)}%</b>.
                  Past weeks move when creators are added to the roster later, so this usually means a
                  roster backfill rather than a mistake.
                </div>
              )}
          </div>

          {/* ── Typed. The judgement only a manager has. ────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor={`win-${row.brandSlug}`}>Biggest win this week</Label>
              <Textarea
                id={`win-${row.brandSlug}`}
                rows={2}
                value={biggestWin}
                onChange={(e) => setBiggestWin(e.target.value)}
                placeholder="What worked, specifically enough that another brand could steal it."
              />
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor={`chal-${row.brandSlug}`}>Biggest challenge</Label>
              <Textarea
                id={`chal-${row.brandSlug}`}
                rows={2}
                value={biggestChallenge}
                onChange={(e) => setBiggestChallenge(e.target.value)}
                placeholder="The thing most likely to hurt this account if nobody touches it."
              />
            </div>

            <div>
              <Label htmlFor={`action-${row.brandSlug}`}>Next action (one thing)</Label>
              <Input
                id={`action-${row.brandSlug}`}
                value={nextAction}
                onChange={(e) => setNextAction(e.target.value)}
                placeholder="One action, not a list."
              />
            </div>
            <div>
              <Label htmlFor={`due-${row.brandSlug}`}>Due by</Label>
              <Input
                id={`due-${row.brandSlug}`}
                type="date"
                value={nextActionDue}
                onChange={(e) => setNextActionDue(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor={`recruited-${row.brandSlug}`}>Creators recruited this week</Label>
              <Input
                id={`recruited-${row.brandSlug}`}
                type="number"
                min={0}
                value={creatorsRecruited}
                onChange={(e) => setCreatorsRecruited(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <Label htmlFor={`contract-${row.brandSlug}`}>Contract ends</Label>
              <Input
                id={`contract-${row.brandSlug}`}
                type="date"
                value={contractEndsOn}
                onChange={(e) => setContractEndsOn(e.target.value)}
              />
            </div>

            {/* The two fields that never appear in a client report. */}
            <div>
              <Label htmlFor={`health-${row.brandSlug}`}>Client health</Label>
              <Select
                id={`health-${row.brandSlug}`}
                value={clientHealth}
                onChange={(e) => setClientHealth(e.target.value)}
              >
                <option value="">Choose…</option>
                <option value="green">Green, relationship is solid</option>
                <option value="yellow">Yellow, something feels off</option>
                <option value="red">Red, actively at risk</option>
              </Select>
            </div>
            <div>
              <Label htmlFor={`renewal-${row.brandSlug}`}>Renewal risk</Label>
              <Select
                id={`renewal-${row.brandSlug}`}
                value={renewalRisk}
                onChange={(e) => setRenewalRisk(e.target.value)}
              >
                <option value="">Choose…</option>
                <option value="none">None</option>
                <option value="watch">Watch</option>
                <option value="at_risk">At risk</option>
              </Select>
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor={`healthnote-${row.brandSlug}`}>
                How the relationship actually feels
              </Label>
              <Textarea
                id={`healthnote-${row.brandSlug}`}
                rows={2}
                value={clientHealthNote}
                onChange={(e) => setClientHealthNote(e.target.value)}
                placeholder="Internal only. Never shown to the client. Say the thing you would say out loud."
              />
            </div>

            {renewalRisk !== 'none' && renewalRisk !== '' && (
              <div className="sm:col-span-2">
                <Label htmlFor={`renewalnote-${row.brandSlug}`}>What the renewal risk is</Label>
                <Textarea
                  id={`renewalnote-${row.brandSlug}`}
                  rows={2}
                  value={renewalNote}
                  onChange={(e) => setRenewalNote(e.target.value)}
                  placeholder="What would have to change for this to renew."
                />
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={pending}>
              {pending ? 'Saving…' : s ? 'Update report' : 'Submit report'}
            </Button>
            {s && (
              <span className="text-xs text-muted-foreground">
                Filed {new Date(s.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {s.submittedByName ? ` by ${s.submittedByName}` : ''}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
