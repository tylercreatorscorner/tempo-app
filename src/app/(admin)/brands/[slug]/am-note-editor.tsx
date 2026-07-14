'use client';

import { useState, useTransition } from 'react';
import { Check, Loader2, MessageCircle, Pencil, X } from 'lucide-react';
import { updateBrandOverviewNote } from '@/app/actions/brand-overview-note';

const MAX_LEN = 2000;

interface Props {
  brandSlug: string;
  initialNote: string;
  initialUpdatedAt: string | null;
  initialAuthorName: string | null;
}

export function AmNoteEditor({ brandSlug, initialNote, initialUpdatedAt, initialAuthorName }: Props) {
  const [saved, setSaved] = useState(initialNote);
  const [draft, setDraft] = useState(initialNote);
  const [editing, setEditing] = useState(initialNote.length === 0);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [authorName, setAuthorName] = useState(initialAuthorName);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function cancel() {
    setDraft(saved);
    setErr(null);
    setEditing(saved.length === 0);
  }

  function save() {
    setErr(null);
    if (draft.length > MAX_LEN) {
      setErr(`Note is too long (max ${MAX_LEN} chars).`);
      return;
    }
    startTransition(async () => {
      try {
        await updateBrandOverviewNote(brandSlug, draft);
        setSaved(draft);
        setUpdatedAt(new Date().toISOString());
        setAuthorName('You');
        setEditing(draft.length === 0);
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  const updatedLabel = updatedAt
    ? new Date(updatedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <MessageCircle className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">Client portal note</h3>
            <p className="text-xs text-muted-foreground">
              Surfaces on the brand&apos;s /brand-dashboard. Plain text — no markdown.
            </p>
          </div>
        </div>
        {!editing && saved && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-muted-foreground hover:text-[var(--foreground)] hover:bg-muted/50 transition-colors"
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <>
          <textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setErr(null);
            }}
            rows={4}
            maxLength={MAX_LEN}
            disabled={pending}
            placeholder="e.g. This week we onboarded 3 new creators — expect lift starting May 8. Top performer @vanessafoundit hit 12× ROI."
            className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60 resize-none"
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {draft.length} / {MAX_LEN}
            </p>
            <div className="flex items-center gap-2">
              {saved && (
                <button
                  type="button"
                  onClick={cancel}
                  disabled={pending}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted/50 disabled:opacity-50 transition-colors"
                >
                  <X className="h-3 w-3" />
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={save}
                disabled={pending || draft.trim() === saved.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Save & publish
              </button>
            </div>
          </div>
          {err && (
            <p className="text-xs text-rose-600 bg-rose-500/10 px-3 py-2 rounded-md">{err}</p>
          )}
        </>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-[var(--foreground)] whitespace-pre-wrap">
            {saved}
          </p>
          {(authorName || updatedLabel) && (
            <p className="text-xs text-muted-foreground">
              Last updated by {authorName ?? 'unknown'}
              {updatedLabel && ` · ${updatedLabel}`}
            </p>
          )}
        </>
      )}
    </div>
  );
}
