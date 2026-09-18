'use client';

/** Sent links are immutable. Notes and data corrections create separate revisions. */

import { ModalOverlay } from '@/components/ui/modal-overlay';
import { useState, useTransition } from 'react';
import { Loader2, Pencil, RefreshCw, Ban, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/input';

export interface ReportActionsTarget {
  id: string;
  brandName: string;
  periodLabel: string | null;
  notes: string | null;
  plan: string | null;
  viewedAt: string | null;
}

export function ReportActions({
  target,
  onDone,
}: {
  target: ReportActionsTarget;
  /** Reload the table: every action changes something it displays. */
  onDone: () => void;
}) {
  const [open, setOpen] = useState<null | 'edit' | 'revoke'>(null);
  const [notes, setNotes] = useState(target.notes ?? '');
  const [plan, setPlan] = useState(target.plan ?? '');

  /**
   * ⚠️ SEED FROM THE PROP EVERY TIME THE EDITOR OPENS, not once at mount.
   * The row keeps its identity across a table reload, so this component is not
   * remounted after a save or a refresh; without this the second open would
   * show whatever was typed the first time rather than what is actually stored,
   * and saving would write stale copy back over good copy.
   */
  function openEditor() {
    setNotes(target.notes ?? '');
    setPlan(target.plan ?? '');
    setError(null);
    setOpen('edit');
  }
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [revisionLink, setRevisionLink] = useState<string | null>(null);

  async function call(path: string, init?: RequestInit) {
    const res = await fetch(`/api/client-reports/${target.id}${path}`, init);
    const data = (await res.json().catch(() => ({}))) as { error?: string; token?: string };
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (typeof data.token === 'string' && data.token) setRevisionLink(`/r/${encodeURIComponent(data.token)}?preview=1`);
    return data;
  }

  const run = (fn: () => Promise<void>) =>
    startTransition(async () => {
      setError(null);
      setRevisionLink(null);
      try {
        await fn();
      } catch (e) {
        setError((e as Error).message);
      }
    });

  return (
    <>
      <button
        type="button"
        onClick={openEditor}
        title="Create a new revision with updated notes and forward plan"
        className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Pencil className="h-3.5 w-3.5" />
        Revise notes
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          run(async () => {
            await call('/refresh', { method: 'POST' });

            onDone();
          })
        }
        title="Create a new report revision; preserve this link's figures"
        className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        Create revision
      </button>
      <button
        type="button"
        onClick={() => { setOpen('revoke'); setError(null); }}
        title="Kill this link"
        className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600"
      >
        <Ban className="h-3.5 w-3.5" />
        Revoke
      </button>

      {!open && error && <span role="alert" className="max-w-64 text-xs text-destructive">{error}</span>}
      {revisionLink && <span role="status"><a href={revisionLink} target="_blank" rel="noopener noreferrer" title="The previous report link is unchanged" className="whitespace-nowrap rounded-md bg-primary/5 px-2 py-1.5 text-xs font-semibold text-primary">Open new revision ↗</a></span>}

      {open && (
        <ModalOverlay onClose={() => { if (!busy) setOpen(null); }} closeOnBackdropClick={false} closeOnEsc={!busy}>
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onKeyDown={(e) => { if (e.key === 'Escape') setOpen(null); }}
        >
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={() => setOpen(null)} />
          <div className="relative flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div className="min-w-0">
                <h2 className="truncate text-[13.5px] font-bold tracking-tight text-foreground">
                  {open === 'revoke' ? 'Revoke this link' : 'Revise report copy'}
                </h2>
                <p className="truncate text-[12px] text-muted-foreground">
                  {target.brandName}
                  {target.periodLabel ? ` · ${target.periodLabel}` : ''}
                </p>
              </div>
              <button onClick={() => setOpen(null)} aria-label="Close" className="rounded-md p-1.5 hover:bg-secondary">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
              {error && (
                <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-600">
                  {error}
                </p>
              )}

              {open === 'revoke' ? (
                <>
                  <p className="text-[13.5px] leading-[1.6] text-foreground">
                    The link stops working immediately and shows &ldquo;This report link is no longer
                    active&rdquo;. The report stays in your history.
                  </p>
                  {/* Worth saying plainly: a client who has opened it has the URL. */}
                  {target.viewedAt && (
                    <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12.5px] leading-[1.6] text-amber-600 dark:text-amber-400">
                      This report has been opened. If the client bookmarked it, revoking breaks the
                      link they have.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">Saving creates a new report link. The previously shared report stays unchanged.</p>
                  <div>
                    <Label htmlFor="ra-notes">Notes for this period</Label>
                    <Textarea
                      id="ra-notes"
                      className="mt-1.5"
                      rows={6}
                      maxLength={2000}
                      value={notes}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="ra-plan">What happens next</Label>
                    <Textarea
                      id="ra-plan"
                      className="mt-1.5"
                      rows={3}
                      maxLength={2000}
                      placeholder="What you are committing to for the coming period."
                      value={plan}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPlan(e.target.value)}
                    />
                    <p className="mt-1 text-[11.5px] text-muted-foreground">
                      Leave either blank to remove it from the report.
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
              <Button variant="secondary" onClick={() => setOpen(null)}>Cancel</Button>
              {open === 'revoke' ? (
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await call('/revoke', { method: 'POST' });
                      setOpen(null);
                      onDone();
                    })
                  }
                >
                  {busy && <Loader2 className="animate-spin" />}
                  Revoke link
                </Button>
              ) : (
                <Button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await call('', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ notes, plan }),
                      });
                      setOpen(null);
                      onDone();
                    })
                  }
                >
                  {busy && <Loader2 className="animate-spin" />}
                  Save
                </Button>
              )}
            </div>
          </div>
        </div>
        </ModalOverlay>
      )}
    </>
  );
}
