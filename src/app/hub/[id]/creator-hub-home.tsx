'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, CheckCircle2, ExternalLink, LockKeyhole, Loader2, Play, ShieldCheck } from 'lucide-react';
import { BrandPortrait } from '@/components/creators/brand-portrait';
import type { CreatorHubCompletion } from '@/lib/creator-hub/completion';

type Item = {
  id: string; kind: string; required: boolean; completed_at: string | null; accepted_at: string | null;
  title: string; version: number; body: string; url: string | null;
};

export function CreatorHubHome({ enrollmentId, brandName, brandLogoUrl, brandColor, creatorName, items, completion, preview = false, previewNotice }: {
  enrollmentId: string; brandName: string; brandLogoUrl?: string | null; brandColor?: string | null;
  creatorName: string; items: Item[]; completion: CreatorHubCompletion; preview?: boolean; previewNotice?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const video = items.find(item => item.kind === 'video');
  const required = items.filter(item => item.required);
  const optional = items.filter(item => !item.required);
  const progress = completion.requiredTotal ? Math.round(100 * completion.requiredComplete / completion.requiredTotal) : 0;

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

  return <main className="min-h-screen bg-[#f6f5f7] text-[#1e1b24]">
    <div className="mx-auto max-w-[1180px] px-4 pb-16 pt-5 sm:px-6 lg:px-8">
      {preview && <div role="status" className="mb-5 rounded-xl border border-[#ded4ef] bg-[#f1eafa] px-4 py-3 text-sm text-[#4d356d]">
        <strong>Creator-view preview</strong> · {previewNotice || 'This page cannot save progress or grant access.'}
      </div>}
      <header className="flex items-center justify-between border-b border-[#e5e2e9] pb-5">
        <div className="flex min-w-0 items-center gap-3"><BrandPortrait name={brandName} source={brandLogoUrl} color={brandColor} size={42} />
          <div className="min-w-0"><p className="truncate text-sm font-semibold">{brandName}</p><p className="text-xs text-[#77717e]">Creator Hub</p></div>
        </div>
        <span className="rounded-full border border-[#ddd8e4] bg-white px-3 py-1.5 text-xs font-medium text-[#625b6b]">Signed in as {creatorName}</span>
      </header>

      <div className="py-7 sm:py-9">
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#6947a4]">Your space with {brandName}</p>
        <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-[-.035em] sm:text-4xl">Welcome to the {brandName} Creator Hub.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#696373] sm:text-base">Get to know the brand, complete your first steps, and see what happens before your creator channels and private coaching chat open.</p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,.85fr)]">
        <div className="space-y-5">
          <section aria-labelledby="welcome-video-heading" className="overflow-hidden rounded-2xl border border-[#e4e0e9] bg-white shadow-[0_14px_34px_-30px_rgba(38,25,56,.45)]">
            <div className="relative flex min-h-[260px] items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_24%_20%,#5d427c_0%,transparent_40%),linear-gradient(125deg,#272132,#17141e)] p-8 text-white sm:min-h-[340px]">
              <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(135deg,transparent_48%,white_49%,transparent_50%)] [background-size:26px_26px]" />
              <div className="relative flex flex-col items-center text-center">
                <div className="mb-4 rounded-2xl border border-white/25 bg-white/10 p-2 backdrop-blur-sm"><BrandPortrait name={brandName} source={brandLogoUrl} color={brandColor} size={56} /></div>
                <p className="text-xs font-semibold uppercase tracking-[.18em] text-white/70">A note from {brandName}</p>
                <p className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">{video?.title || `Welcome to ${brandName}`}</p>
                {video?.url && !preview && <a href={video.url} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#25202d] transition hover:bg-[#eee9f6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"><Play size={15} fill="currentColor" /> Watch welcome video <ExternalLink size={13} /></a>}
                {preview && <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-5 py-2.5 text-sm font-medium text-white/85"><Play size={15} /> Brand welcome video</span>}
                {!video?.url && !preview && <p className="mt-5 text-sm text-white/70">Your brand team has not added a welcome video yet.</p>}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4"><div><h2 id="welcome-video-heading" className="text-sm font-semibold">Start here</h2><p className="mt-0.5 text-xs text-[#77717e]">A personal introduction to your creator program.</p></div><span className="text-xs font-medium text-[#7656a1]">{video ? 'Part of your checklist' : 'From your brand team'}</span></div>
          </section>

          <section aria-labelledby="checklist-heading" className="rounded-2xl border border-[#e4e0e9] bg-white p-5 shadow-[0_14px_34px_-30px_rgba(38,25,56,.45)] sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#7454a0]">Your first steps</p><h2 id="checklist-heading" className="mt-1 text-xl font-semibold tracking-tight">Unlock your creator access</h2><p className="mt-1 text-sm text-[#716b78]">Complete each required item at your own pace.</p></div><span className="text-sm font-semibold tabular-nums text-[#563982]">{completion.requiredComplete} of {completion.requiredTotal} complete</span></div>
            <div role="progressbar" aria-label="Required steps completed" aria-valuemin={0} aria-valuemax={completion.requiredTotal} aria-valuenow={completion.requiredComplete} className="mt-5 h-1.5 overflow-hidden rounded-full bg-[#eeeaf3]"><div className="h-full rounded-full bg-[#7852b7] transition-all" style={{ width: `${progress}%` }} /></div>
            <div className="mt-4 divide-y divide-[#eeebf1]">{required.map((item, index) => {
              const done = item.kind === 'acknowledgement' ? Boolean(item.accepted_at) : Boolean(item.completed_at);
              return <article key={item.id} className="flex gap-3 py-4 first:pt-2 last:pb-0">
                <div className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done ? 'bg-[#e9f5ef] text-[#267250]' : 'bg-[#f1ecf7] text-[#7047a5]'}`}>{done ? <Check size={15} strokeWidth={2.5} /> : index + 1}</div>
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2"><h3 className="text-sm font-semibold">{item.title}</h3><span className="text-[11px] text-[#8a8290]">{item.kind === 'acknowledgement' ? 'Acknowledgment' : item.kind === 'video' ? 'Video' : 'Read & review'}</span></div>
                  {item.body && <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#6e6875]">{item.body}</p>}
                  {item.url && item.kind !== 'video' && (preview ? <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#7454a0]">Resource link in the live Hub</span> : <a href={item.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#6843a1] hover:underline">Open resource <ExternalLink size={12} /></a>)}
                  {item.kind === 'acknowledgement' && <p className="mt-2 text-xs text-[#827b89]">Your acceptance of version {item.version} is recorded with its time.</p>}
                  {done ? <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#267250]"><CheckCircle2 size={13} /> {item.kind === 'acknowledgement' ? 'Accepted' : 'Completed'}</p> : <button type="button" disabled={preview || busy !== null} onClick={() => complete(item)} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#25202d] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#513b6b] disabled:cursor-not-allowed disabled:opacity-50">{busy === item.id && <Loader2 size={13} className="animate-spin" />}{item.kind === 'acknowledgement' ? `I accept version ${item.version}` : 'Mark complete'}</button>}
                </div>
              </article>;
            })}</div>
            {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-[#dcd1ed] bg-[#eee8f6] p-5 sm:p-6"><div className="flex size-9 items-center justify-center rounded-xl bg-white text-[#744fa9]"><LockKeyhole size={18} /></div><p className="mt-5 text-[11px] font-semibold uppercase tracking-[.14em] text-[#705191]">Your access</p><h2 className="mt-1 text-lg font-semibold tracking-tight">{completion.canUnlock ? 'Your next chapter is opening' : 'Your creator space is almost ready'}</h2><p className="mt-2 text-sm leading-6 text-[#665b71]">{completion.canUnlock ? 'Your required steps are complete. Tempo is preparing your Discord access.' : 'Finish the required steps to unlock the creator channels and your private coaching chat.'}</p><div className="mt-5 space-y-3 border-t border-[#d9cbe9] pt-4 text-sm"><div className="flex items-center gap-2"><ShieldCheck size={16} className="text-[#744fa9]" /> Application approved</div><div className="flex items-center gap-2">{completion.canUnlock ? <CheckCircle2 size={16} className="text-[#267250]" /> : <LockKeyhole size={16} className="text-[#876e9f]" />} Required steps {completion.canUnlock ? 'complete' : 'in progress'}</div><div className="flex items-center gap-2"><LockKeyhole size={16} className="text-[#876e9f]" /> Creator channels and coaching chat</div></div></section>
          <section className="rounded-2xl border border-[#e4e0e9] bg-white p-5 sm:p-6"><p className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#7454a0]">After setup</p><h2 className="mt-1 text-base font-semibold">A clear place to begin</h2><p className="mt-2 text-sm leading-6 text-[#706a77]">Once access opens, head to the brand&apos;s Discord server for announcements, creator conversations, and your private coaching chat.</p></section>
          {optional.length > 0 && <section className="rounded-2xl border border-[#e4e0e9] bg-white p-5 sm:p-6"><p className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#7454a0]">Keep close</p><h2 className="mt-1 text-base font-semibold">Creator resources</h2><div className="mt-4 divide-y divide-[#eeebf1]">{optional.map(item => <div key={item.id} className="py-3 first:pt-0 last:pb-0"><h3 className="text-sm font-semibold">{item.title}</h3>{item.body && <p className="mt-1 text-xs leading-5 text-[#756e7c]">{item.body}</p>}{item.url && (preview ? <span className="mt-2 block text-xs font-medium text-[#7454a0]">Resource link in the live Hub</span> : <a href={item.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#6843a1] hover:underline">Open resource <ExternalLink size={12} /></a>)}{!item.completed_at && <button type="button" disabled={preview || busy !== null} onClick={() => complete(item)} className="mt-2 block text-xs font-semibold text-[#6843a1] disabled:cursor-not-allowed disabled:opacity-50">Mark complete</button>}</div>)}</div></section>}
        </aside>
      </div>
    </div>
  </main>;
}
