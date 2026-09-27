'use client';
import { useState, type FormEvent } from 'react';
import type { ApplicationQuestion } from '@/lib/applications/schema';

export function PublicApplicationForm({ formId, formVersion, questions }: { formId: string; formVersion: number; questions: ApplicationQuestion[] }) {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setPending(true);
    const values = new FormData(event.currentTarget);
    const answers = Object.fromEntries(questions.map(question => [question.id, String(values.get(question.id) || '')]));
    try {
      const response = await fetch(`/api/creator-application/${formId}/submit`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          fullName: values.get('fullName'), email: values.get('email'),
          tiktokHandle: values.get('tiktokHandle'), discordUsername: values.get('discordUsername'),
          website: values.get('website'), formVersion, answers,
        }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not submit.');
      setDone(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not submit.'); }
    finally { setPending(false); }
  }
  if (done) return <div className="mt-8 rounded-xl border border-[#d8c8f7] bg-[#f6f1ff] p-5">
    <h2 className="text-base font-semibold">Application received</h2>
    <p className="mt-1 text-sm text-[#60566d]">The brand team will review it. Keep an eye on the contact details you provided.</p>
  </div>;
  const input = 'mt-1.5 w-full rounded-lg border border-[#ded9e7] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#7650ce] focus:ring-2 focus:ring-[#7650ce]/15';
  return <form onSubmit={submit} className="mt-7 space-y-5">
    <div className="grid gap-5 sm:grid-cols-2">
      <label className="block text-sm font-medium">Full name<input name="fullName" required maxLength={160} className={input} autoComplete="name" /></label>
      <label className="block text-sm font-medium">Email<input name="email" type="email" required maxLength={254} className={input} autoComplete="email" /></label>
    </div>
    <div className="grid gap-5 sm:grid-cols-2">
      <label className="block text-sm font-medium">TikTok handle<input name="tiktokHandle" required maxLength={80} className={input} placeholder="@creator" /></label>
      <label className="block text-sm font-medium">Discord username <span className="font-normal text-[#817b8b]">optional</span><input name="discordUsername" maxLength={80} className={input} /></label>
    </div>
    {questions.map(question => <label key={question.id} className="block text-sm font-medium">{question.label}{question.required ? ' *' : ''}
      <textarea name={question.id} required={question.required} maxLength={3000} rows={3} className={input} />
    </label>)}
    <label className="absolute -left-[9999px]" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
    {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    <button disabled={pending} className="rounded-lg bg-[#6d42c8] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5934ae] disabled:opacity-60">
      {pending ? 'Submitting…' : 'Submit application'}
    </button>
  </form>;
}
