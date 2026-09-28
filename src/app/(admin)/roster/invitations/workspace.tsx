'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, ExternalLink, Loader2 } from 'lucide-react';
import { DEFAULT_QUESTIONS, type ApplicationQuestion } from '@/lib/applications/schema';
import { ChoiceMenu } from '@/components/ui/choice-menu';

type Brand = { id: string; name: string; slug: string; canDecide: boolean };
type Form = { id: string; brand_id: string; title: string; introduction: string; questions: unknown; version: number; active: boolean };
type Submission = { id: string; brand_id: string; full_name: string; email: string; tiktok_handle: string; discord_username: string | null; answers: Record<string,string>; questions_snapshot: ApplicationQuestion[]; status: string; decision_note: string | null; decided_at: string | null; handoff_status: string; submitted_at: string };

export function OnboardingWorkspace({ brands, forms, submissions, canConfigure, selectedBrandId, page, totalCount, pendingCount }: { brands: Brand[]; forms: Form[]; submissions: Submission[]; canConfigure: boolean; selectedBrandId: string; page: number; totalCount: number; pendingCount: number }) {
  const router = useRouter();
  const brandId = selectedBrandId;
  const [selected, setSelected] = useState<string | null>(null);
  const [extra, setExtra] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const brand = brands.find(item => item.id === brandId);
  const form = forms.find(item => item.brand_id === brandId);
  const rows = submissions.filter(row => row.brand_id === brandId);
  const application = rows.find(row => row.id === selected);
  const url = form ? `${typeof window === 'undefined' ? 'https://app.tempoapp.ai' : window.location.origin}/apply/${form.id}` : '';
  useEffect(() => {
    const current = forms.find(item => item.brand_id === brandId);
    setExtra(Array.isArray(current?.questions)
      ? (current.questions as ApplicationQuestion[]).filter(question => question.id.startsWith('custom_')).map(question => question.label).join('\n')
      : '');
  }, [brandId, forms]);

  async function saveForm() {
    if (!brandId) return;
    setBusy(true); setError('');
    const existing = Array.isArray(form?.questions) ? form.questions as ApplicationQuestion[] : DEFAULT_QUESTIONS;
    const extraQuestions = extra.split('\n').map(line => line.trim()).filter(Boolean).slice(0, 9)
      .map((label, index) => ({ id: `custom_${index + 1}`, label, required: false }));
    try {
      const response = await fetch('/api/creator-applications/forms', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, title: form?.title || `${brand?.name} creator application`,
          introduction: form?.introduction || `Tell us about yourself and your content. The ${brand?.name} team will review your application.`,
          questions: [...existing.filter(question => !question.id.startsWith('custom_')), ...extraQuestions], active: true }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not save form.');
      setExtra(''); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save form.'); }
    finally { setBusy(false); }
  }
  async function decide(decision: 'approved' | 'declined' | 'needs_info') {
    if (!application) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/creator-applications/${application.id}/decision`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedStatus: application.status, decision, note }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not save decision.');
      setSelected(null); setNote(''); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save decision.'); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4">
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div><h2 className="text-sm font-semibold">Creator applications</h2><p className="text-xs text-muted-foreground">The assigned manager makes each brand’s final decision.</p></div>
      <div className="min-w-44 max-w-full">
        <ChoiceMenu compact label="Application brand" value={brandId} options={brands.map(item => ({ value: item.id, label: item.name }))}
          onChange={value => { setSelected(null); const selectedBrand = brands.find(item => item.id === value); router.push(`/roster/invitations?brand=${encodeURIComponent(selectedBrand?.slug ?? value)}`); }}
          disabled={brands.length === 0} placeholder="Choose a brand" />
      </div>
    </section>
    {!brand ? <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">No brand is assigned to your account.</div> : <>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">Application link</h3><p className="mt-1 text-xs text-muted-foreground">Share this with prospective creators. Their answers enter the review queue below.</p></div><span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">{form ? `Version ${form.version}` : 'Not created'}</span></div>
          {form && <div className="mt-4 flex flex-wrap items-center gap-2"><input readOnly value={url} aria-label="Application link" className="min-w-0 flex-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs" /><button onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy'}</button><a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium">Preview <ExternalLink size={13} /></a></div>}
          {canConfigure && <div className="mt-4 border-t border-border pt-4"><label className="block text-xs font-medium">Extra questions <span className="font-normal text-muted-foreground">one per line, optional</span><textarea value={extra} onChange={event => setExtra(event.target.value)} rows={2} placeholder="How did you hear about us?" className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></label><button disabled={busy} onClick={saveForm} className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60">{busy && <Loader2 size={14} className="animate-spin" />}{form ? 'Update form' : 'Create application link'}</button><p className="mt-2 text-xs text-muted-foreground">Updates affect future applicants only. Submitted answers keep the questions they saw.</p></div>}
        </section>
        <section className="rounded-xl border border-border bg-muted/25 p-4"><h3 className="text-sm font-semibold">After approval</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">The decision is saved with a time and audit trail. Identity matching, Discord access and Ticket Tool setup require a separate handoff. Approved applications remain pending handoff until those steps are verified.</p></section>
      </div>
      <section className="overflow-hidden rounded-xl border border-border bg-card"><div className="flex items-center justify-between border-b border-border px-4 py-3"><h3 className="text-sm font-semibold">Review queue</h3><span className="text-xs text-muted-foreground">{pendingCount} pending · {totalCount} total</span></div>
        {rows.length ? <div className="divide-y divide-border">{rows.map(row => <button key={row.id} onClick={() => { setSelected(row.id); setNote(row.decision_note || ''); }} className={`flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-muted/30 ${selected === row.id ? 'bg-primary/5' : ''}`}><span><span className="block text-sm font-medium">{row.full_name}</span><span className="text-xs text-muted-foreground">@{row.tiktok_handle} · {new Date(row.submitted_at).toLocaleDateString()}</span></span><span className={`rounded-full px-2 py-1 text-[11px] font-medium ${row.status === 'pending' ? 'bg-amber-100 text-amber-800' : row.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-muted text-muted-foreground'}`}>{row.status.replace('_',' ')}</span></button>)}</div> : <div className="p-8 text-center text-sm text-muted-foreground">No applications for this brand yet. Share the link above to start collecting them.</div>}
        {totalCount > 25 && <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs"><span>Page {page} of {Math.ceil(totalCount / 25)}</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => router.push(`/roster/invitations?brand=${brandId}&page=${page - 1}`)} className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40">Previous</button><button disabled={page * 25 >= totalCount} onClick={() => router.push(`/roster/invitations?brand=${brandId}&page=${page + 1}`)} className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40">Next</button></div></div>}
      </section>
      <p className="text-xs text-muted-foreground">Applications collected in the older Creators Corner dashboard are preserved there. This queue shows applications submitted through Tempo links; the older records need a verified brand mapping before import.</p>
      {application && <section className="rounded-xl border border-border bg-card p-5"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-base font-semibold">{application.full_name}</h3><p className="text-xs text-muted-foreground">{application.email} · @{application.tiktok_handle}{application.discord_username ? ` · Discord: ${application.discord_username}` : ''}</p></div><button onClick={() => setSelected(null)} className="text-xs text-muted-foreground hover:text-foreground">Close</button></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">{application.questions_snapshot.map(question => <div key={question.id} className="rounded-lg bg-muted/25 p-3"><p className="text-xs font-medium text-muted-foreground">{question.label}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{application.answers?.[question.id] || 'No answer'}</p></div>)}</div>
        {application.status === 'approved' && <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Approved · Discord and roster handoff pending. Verify identity and brand access before sharing a join link.</p>}
        {brand.canDecide && ['pending','needs_info'].includes(application.status) && <div className="mt-5 border-t border-border pt-4"><label className="text-xs font-medium">Decision note<textarea value={note} onChange={event => setNote(event.target.value)} maxLength={2000} rows={2} className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></label><div className="mt-3 flex flex-wrap gap-2"><button disabled={busy} onClick={() => decide('approved')} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60">Approve for onboarding</button><button disabled={busy} onClick={() => decide('needs_info')} className="rounded-lg border border-border px-3 py-2 text-xs font-medium disabled:opacity-60">Mark needs information</button><button disabled={busy} onClick={() => decide('declined')} className="rounded-lg border border-border px-3 py-2 text-xs font-medium disabled:opacity-60">Decline</button></div><p className="mt-2 text-xs text-muted-foreground">Tempo records this status but does not contact the applicant. Follow up directly if information is needed.</p></div>}
      </section>}
    </>}
    {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
  </div>;
}
