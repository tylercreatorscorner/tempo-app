'use client';

/**
 * Mint the agency's own portfolio report.
 *
 * Sits beside the client reporting table rather than on its own page: it is the
 * same job (freeze a period, get a link to send) for a different audience, and
 * a separate destination for one button would be a nav row nobody remembers.
 *
 * ⚠️ Defaults to LAST COMPLETE MONTH, never the current one. A portfolio report
 * for a month still running invites comparison against a full prior month and
 * reads as a collapse; the client reports learned the same lesson.
 */

import { useState } from 'react';
import { Loader2, Building2, Check, Copy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

/** Last 12 complete months, newest first. */
function monthChoices(): { value: string; label: string; start: string; end: string }[] {
  const out: { value: string; label: string; start: string; end: string }[] = [];
  const now = new Date();
  // Start from the month BEFORE the current one.
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth(); // 0-indexed; this is already "last month" as a 1-indexed value
  for (let i = 0; i < 12; i++) {
    if (m === 0) { m = 12; y -= 1; }
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 0));
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    out.push({
      value: iso(start),
      label: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      start: iso(start),
      end: iso(end),
    });
    m -= 1;
  }
  return out;
}

export function AgencyPanel() {
  const months = monthChoices();
  const [month, setMonth] = useState(months[0]?.value ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ url: string; label: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const chosen = months.find((x) => x.value === month);

  async function generate() {
    if (!chosen) return;
    setBusy(true); setError(null); setMade(null);
    try {
      const res = await fetch('/api/agency-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: chosen.start, end: chosen.end }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setMade({ url: data.url, label: data.periodLabel });
      try {
        await navigator.clipboard.writeText(data.url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch {
        // Clipboard can be blocked; the link is on screen either way.
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--pulse-elev-2)]">
      <div className="flex items-start gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-primary/10 text-primary">
          <Building2 className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[13.5px] font-bold tracking-tight text-foreground">Agency report</h2>
          <p className="text-[12px] leading-[1.5] text-muted-foreground">
            The whole portfolio in one page, for leadership. Not a client report: it names the
            accounts that went backwards.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <Label htmlFor="ag-month">Month</Label>
          <Select
            id="ag-month"
            className="mt-1.5"
            value={month}
            disabled={busy}
            onChange={(e) => { setMonth(e.target.value); setMade(null); }}
          >
            {months.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </Select>
        </div>
        <Button onClick={generate} disabled={busy || !chosen} className="shrink-0">
          {busy ? <><Loader2 className="animate-spin" />Building…</> : <>Generate link</>}
        </Button>
      </div>

      {error && (
        <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-600">
          {error}
        </p>
      )}

      {made && (
        <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
          <p className="text-[12.5px] font-semibold text-emerald-700 dark:text-emerald-400">
            {made.label} ready{copied ? ', link copied' : ''}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-card px-2 py-1 text-[11.5px] text-muted-foreground">
              {made.url}
            </code>
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(made.url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); }).catch(() => {}); }}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              title="Copy link"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            <a
              href={made.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              title="Open"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
