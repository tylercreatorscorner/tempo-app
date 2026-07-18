'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Status {
  toEnqueue: number;
  pending: number;
  sent: number;
  blocked: number;
  failed: number;
  claimed: number;
}

export function InvitesClient() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [dryRun, setDryRun] = useState(true);
  const [testDiscord, setTestDiscord] = useState('');
  const [testCreator, setTestCreator] = useState('');

  const refresh = useCallback(async () => {
    const res = await fetch('/api/admin/creator-invites');
    if (res.ok) setStatus((await res.json()) as Status);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const addLog = (m: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString()} — ${m}`, ...l].slice(0, 40));

  async function post(body: Record<string, unknown>, label: string) {
    setBusy(label);
    try {
      const res = await fetch('/api/admin/creator-invites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        addLog(`❌ ${label}: ${data.error ?? res.status}`);
      } else if (data.attempted !== undefined) {
        addLog(
          `✅ ${label}: attempted ${data.attempted}, sent ${data.sent}, blocked ${data.blocked}, failed ${data.failed}${data.rateLimited ? ' (rate-limited — run again)' : ''} · ${data.remaining} left`,
        );
        if (data.status) setStatus(data.status as Status);
      } else if (data.enqueued !== undefined) {
        addLog(`✅ ${label}: enqueued ${data.enqueued}`);
        if (data.status) setStatus(data.status as Status);
      } else if (data.outcome) {
        addLog(`✅ ${label}: ${data.outcome} — ${data.url}`);
      } else {
        addLog(`✅ ${label}`);
      }
    } catch {
      addLog(`❌ ${label}: network error`);
    }
    setBusy(null);
    refresh();
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Creators"
        title="Portal Invites"
        subtitle="DM every managed creator (with a linked Discord) their personal sign-in link."
      />

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <StatCard label="To enqueue" value={String(status?.toEnqueue ?? '…')} accentColor="var(--primary)" />
        <StatCard label="Queued" value={String(status?.pending ?? '…')} accentColor="var(--pulse-warn)" />
        <StatCard label="Sent" value={String(status?.sent ?? '…')} accentColor="var(--pulse-accent-2)" />
        <StatCard label="Claimed" value={String(status?.claimed ?? '…')} accentColor="var(--pulse-pos)" />
        <StatCard label="DMs closed" value={String(status?.blocked ?? '…')} />
        <StatCard label="Failed" value={String(status?.failed ?? '…')} accentColor="var(--pulse-neg)" />
      </div>

      {/* 1. Test on yourself */}
      <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-[var(--pulse-elev-1)]">
        <h3 className="font-bold text-foreground">1 · Test on yourself first</h3>
        <p className="text-sm text-muted-foreground">
          Send one real invite to your own Discord user id (for any creator id) to check the DM + login flow before a blast.
        </p>
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Your Discord user id" value={testDiscord} onChange={(e) => setTestDiscord(e.target.value)} className="w-56" />
          <Input placeholder="Creator id (uuid)" value={testCreator} onChange={(e) => setTestCreator(e.target.value)} className="w-72" />
          <Button
            variant="outline"
            disabled={!!busy || !testDiscord || !testCreator}
            onClick={() => post({ action: 'test', discordId: testDiscord, creatorId: testCreator }, 'test DM')}
          >
            Send test DM
          </Button>
        </div>
      </div>

      {/* 2. Enqueue + send */}
      <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-[var(--pulse-elev-1)]">
        <h3 className="font-bold text-foreground">2 · Enqueue &amp; send</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" disabled={!!busy} onClick={() => post({ action: 'enqueue' }, 'enqueue')}>
            Enqueue links ({status?.toEnqueue ?? 0})
          </Button>
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} /> Dry run
          </label>
          <Button
            variant="primary"
            disabled={!!busy || (status?.pending ?? 0) === 0}
            onClick={() => post({ action: 'send', limit: 40, dryRun }, dryRun ? 'send (dry run)' : 'send batch')}
          >
            {dryRun ? 'Dry-run 40' : 'Send batch of 40'}
          </Button>
          <span className="text-xs text-muted-foreground">{status?.pending ?? 0} queued</span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Uncheck &quot;Dry run&quot; and click &quot;Send batch&quot; until Queued hits 0. &quot;DMs closed&quot; = the creator
          doesn&apos;t accept DMs (post their link in their brand channel instead).
        </p>
      </div>

      {log.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--pulse-elev-1)]">
          <h3 className="mb-2 font-bold text-foreground">Log</h3>
          <ul className="space-y-1 font-mono text-xs text-muted-foreground">
            {log.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
