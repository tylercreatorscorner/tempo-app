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

interface Candidate {
  id: string;
  name: string;
  handles: string[];
}

export function InvitesClient() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [dryRun, setDryRun] = useState(true);
  const [testDiscord, setTestDiscord] = useState('');
  const [testCreator, setTestCreator] = useState('');
  // One-off link minting
  const [mintQuery, setMintQuery] = useState('');
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [mintedUrl, setMintedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
      } else if (data.outcome === 'error') {
        addLog(`❌ ${label}: ${data.error ?? 'error'}`);
      } else if (data.outcome) {
        addLog(
          `${data.outcome === 'sent' ? '✅' : '⚠️'} ${label}: ${data.outcome}${data.creatorName ? ` (as ${data.creatorName})` : ''}${data.url ? ` — ${data.url}` : ''}`,
        );
      } else {
        addLog(`✅ ${label}`);
      }
    } catch {
      addLog(`❌ ${label}: network error`);
    }
    setBusy(null);
    refresh();
  }

  async function findCandidates() {
    setBusy('find');
    setMintedUrl(null);
    try {
      const res = await fetch('/api/admin/creator-invites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'mint_link', query: mintQuery.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        addLog(`❌ find creator: ${data.error ?? res.status}`);
        setCandidates([]);
      } else {
        const list = (data.candidates ?? []) as Candidate[];
        setCandidates(list);
        // Exactly one match → mint straight away, no extra click.
        if (list.length === 1) await mintFor(list[0]);
      }
    } catch {
      addLog('❌ find creator: network error');
    }
    setBusy(null);
  }

  async function mintFor(c: Candidate) {
    setBusy('mint');
    try {
      const res = await fetch('/api/admin/creator-invites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'mint_link', creatorId: c.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.minted?.url) {
        addLog(`❌ mint link: ${data.error ?? res.status}`);
      } else {
        setMintedUrl(data.minted.url as string);
        addLog(`✅ minted invite link for ${c.name}`);
      }
    } catch {
      addLog('❌ mint link: network error');
    }
    setBusy(null);
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

      {/* One-off link — for a single creator, no DM (most creators have no
          email on file, so the email login can't reach them; copy this link and
          send it by text/DM yourself). */}
      <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-[var(--pulse-elev-1)]">
        <h3 className="font-bold text-foreground">One-off invite link</h3>
        <p className="text-sm text-muted-foreground">
          Mint a personal sign-in link for one creator and send it however you like (text, DM). Single-use,
          valid 60 days. Search by name or @handle.
        </p>
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Creator name or @handle…"
            value={mintQuery}
            onChange={(e) => {
              setMintQuery(e.target.value);
              setCandidates(null);
              setMintedUrl(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && mintQuery.trim().length >= 2) {
                void findCandidates();
              }
            }}
            className="w-72"
          />
          <Button
            variant="outline"
            disabled={!!busy || mintQuery.trim().length < 2}
            onClick={() => void findCandidates()}
          >
            Find
          </Button>
        </div>
        {candidates && candidates.length === 0 && (
          <p className="text-sm text-muted-foreground">No creators match that search.</p>
        )}
        {candidates && candidates.length > 0 && !mintedUrl && (
          <div className="flex flex-wrap gap-2">
            {candidates.map((c) => (
              <Button
                key={c.id}
                variant="outline"
                disabled={!!busy}
                onClick={() => void mintFor(c)}
                title={c.id}
              >
                {c.name}
                {c.handles.length > 0 && (
                  <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                    @{c.handles[0]}
                    {c.handles.length > 1 ? ` +${c.handles.length - 1}` : ''}
                  </span>
                )}
              </Button>
            ))}
          </div>
        )}
        {mintedUrl && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/50 p-2.5">
            <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{mintedUrl}</code>
            <Button
              variant="primary"
              onClick={() => {
                navigator.clipboard.writeText(mintedUrl).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
            >
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          </div>
        )}
      </div>

      {/* 1. Test on yourself */}
      <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-[var(--pulse-elev-1)]">
        <h3 className="font-bold text-foreground">1 · Test on yourself first</h3>
        <p className="text-sm text-muted-foreground">
          Send one real invite to your own Discord to check the DM + login flow. You only need your Discord{' '}
          <strong>user id</strong> — in Discord: Settings → Advanced → <strong>Developer Mode</strong> on, then
          right-click your name → <strong>Copy User ID</strong> (a ~19-digit number). Leave the creator field blank to
          auto-pick one.
        </p>
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Your Discord user id (e.g. 144445…)" value={testDiscord} onChange={(e) => setTestDiscord(e.target.value)} className="w-64" />
          <Input placeholder="Creator id (optional — auto-picks one)" value={testCreator} onChange={(e) => setTestCreator(e.target.value)} className="w-72" />
          <Button
            variant="outline"
            disabled={!!busy || !testDiscord}
            onClick={() => post({ action: 'test', discordId: testDiscord, creatorId: testCreator || undefined }, 'test DM')}
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
