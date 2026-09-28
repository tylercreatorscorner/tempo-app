'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Circle, ExternalLink, Loader2 } from 'lucide-react';
import type { CreatorHubCompletion } from '@/lib/creator-hub/completion';

type Item = {
  id: string; kind: string; required: boolean; completed_at: string | null; accepted_at: string | null;
  title: string; version: number; body: string; url: string | null;
};

export function CreatorHubChecklist({ enrollmentId, brandName, creatorName, items, completion, preview = false }: {
  enrollmentId: string; brandName: string; creatorName: string; items: Item[]; completion: CreatorHubCompletion;
  preview?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  async function complete(item: Item) {
    if (preview) return;
    setBusy(item.id); setError('');
    try {
      const response = await fetch(`/api/creator-hub/enrollments/${enrollmentId}/complete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id, acceptAcknowledgement: item.kind === 'acknowledgement' }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not save your progress.');
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save your progress.'); }
    finally { setBusy(null); }
  }
  return <main className="min-h-screen bg-[#f7f6fa] px-4 py-8 text-[#24212e] sm:py-12">
    <div className="mx-auto max-w-2xl">
      {preview && <div role="status" className="mb-5 rounded-xl border border-[#d9c8f5] bg-[#f5efff] px-4 py-3 text-sm text-[#50337b]">
        Creator-view preview. These steps are examples; no terms are published and nothing you click will save progress.
      </div>}
      <div className="mb-6 flex items-center gap-3 text-sm font-semibold"><span className="flex size-9 items-center justify-center rounded-xl bg-[#7548ca] text-white">T</span> Tempo <span className="text-[#b9b2c4]">/</span> {brandName}</div>
      <section className="rounded-2xl border border-[#e8e5ee] bg-white p-6 shadow-[0_14px_40px_-30px_rgba(44,29,72,.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#7548ca]">Creator Hub</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Welcome, {creatorName}</h1>
        <p className="mt-2 text-sm leading-6 text-[#696574]">Finish the required steps to unlock the creator channels and your private coaching chat. Optional resources stay here for reference.</p>
        <div className="mt-5 rounded-xl bg-[#f5f1fc] px-4 py-3 text-sm font-medium text-[#5e3a9f]">
          {completion.canUnlock ? 'Required steps complete. Discord access is being prepared.'
            : `${completion.requiredComplete} of ${completion.requiredTotal} required steps complete`}
        </div>
        <div className="mt-5 space-y-3">{items.map((item) => {
          const done = item.kind === 'acknowledgement' ? Boolean(item.accepted_at) : Boolean(item.completed_at);
          return <article key={item.id} className="rounded-xl border border-[#e8e5ee] p-4">
            <div className="flex items-start gap-3">
              {done ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 size-5 shrink-0 text-[#aaa3b4]" />}
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">{item.title}</h2><span className="rounded-full bg-[#f3f0f7] px-2 py-0.5 text-[11px] text-[#625b6e]">{item.required ? 'Required' : 'Optional'}</span></div>
                {item.body && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#625d6a]">{item.body}</p>}
                {item.url && (preview
                  ? <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-[#7548ca]">Resource link (preview) <ExternalLink size={13} /></span>
                  : <a href={item.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-[#7548ca] hover:underline">Open resource <ExternalLink size={13} /></a>)}
                {item.kind === 'acknowledgement' && <p className="mt-2 text-xs text-[#77717f]">Your acceptance of version {item.version} is recorded with the time.</p>}
                {done ? <p className="mt-3 text-xs text-emerald-700">{item.kind === 'acknowledgement' ? 'Accepted' : 'Completed'} {new Date((item.kind === 'acknowledgement' ? item.accepted_at : item.completed_at)!).toLocaleString()}</p>
                  : <button type="button" disabled={preview || busy !== null} onClick={() => complete(item)} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#7548ca] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy === item.id && <Loader2 size={13} className="animate-spin" />}{item.kind === 'acknowledgement' ? `I accept version ${item.version}` : 'Mark complete'}</button>}
              </div>
            </div>
          </article>;
        })}</div>
        {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      </section>
    </div>
  </main>;
}
