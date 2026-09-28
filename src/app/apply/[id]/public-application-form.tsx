'use client';
import { useState, type FormEvent } from 'react';
import type { ApplicationQuestion } from '@/lib/applications/schema';
import type { DiscordIdentity } from '@/lib/applications/discord-identity';

export function PublicApplicationForm({ formId, formVersion, questions, identity, discordOutcome }: {
  formId: string; formVersion: number; questions: ApplicationQuestion[];
  identity: DiscordIdentity | null; discordOutcome?: string;
}) {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setPending(true);
    const values = new FormData(event.currentTarget);
    const answers = Object.fromEntries(questions.map(question => [question.id, String(values.get(question.id) || '')]));
    const gmv = values.get('gmvLast30DaysUsd');
    try {
      const response = await fetch(`/api/creator-application/${formId}/submit`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          fullName: values.get('fullName'), email: values.get('email'),
          phoneNumber: values.get('phoneNumber'),
          tiktokHandle: values.get('tiktokHandle'),
          gmvLast30DaysUsd: typeof gmv === 'string' && gmv.trim() ? Number(gmv) : null,
          dealPreference: values.get('dealPreference'),
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
  if (!identity) return <div className="mt-7 rounded-xl border border-[#ded9e7] bg-[#f8f7fb] p-5">
    <h2 className="text-base font-semibold">Connect Discord to apply</h2>
    <p className="mt-1 text-sm leading-6 text-[#60566d]">Sign in with Discord so the brand team can verify your account and link your application to you.</p>
    {discordOutcome && <p role="alert" className="mt-3 text-sm text-red-700">
      {discordOutcome === 'denied' ? 'Discord sign-in was canceled. You can try again.' : 'Discord sign-in did not finish. Please try again.'}
    </p>}
    <a href={`/auth/discord/application/start?form=${encodeURIComponent(formId)}`} className="mt-4 inline-flex rounded-lg bg-[#6d42c8] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5934ae]">Connect Discord</a>
  </div>;
  const input = 'mt-1.5 w-full rounded-lg border border-[#ded9e7] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#7650ce] focus:ring-2 focus:ring-[#7650ce]/15';
  return <form onSubmit={submit} className="mt-7 space-y-5">
    <div className="rounded-lg border border-[#d8c8f7] bg-[#f6f1ff] px-4 py-3 text-sm text-[#44346c]">
      Discord connected as <strong>{identity.globalName || identity.username}</strong> (@{identity.username}).
      {' '}<a href={`/auth/discord/application/start?form=${encodeURIComponent(formId)}`} className="underline underline-offset-2">Use another account</a>
    </div>
    <div className="grid gap-5 sm:grid-cols-2">
      <label className="block text-sm font-medium">Full name<input name="fullName" required maxLength={160} className={input} autoComplete="name" /></label>
      <label className="block text-sm font-medium">Email<input name="email" type="email" required maxLength={254} className={input} autoComplete="email" /></label>
    </div>
    <label className="block text-sm font-medium">Phone number<input name="phoneNumber" type="tel" required maxLength={30} className={input} autoComplete="tel" /></label>
    <div className="grid gap-5 sm:grid-cols-2">
      <label className="block text-sm font-medium">TikTok handle<input name="tiktokHandle" required maxLength={80} className={input} placeholder="@creator" /></label>
      <label className="block text-sm font-medium">Last 30 days of TikTok Shop GMV (USD)<input name="gmvLast30DaysUsd" type="number" min="0" max="1000000000" step="0.01" required className={input} placeholder="0.00" /></label>
    </div>
    <label className="block text-sm font-medium">What type of opportunity are you interested in?
      <select name="dealPreference" required defaultValue="" className={input}>
        <option value="" disabled>Select one</option>
        <option value="affiliate">Affiliate</option>
        <option value="retainer">Retainer</option>
        <option value="either">Either</option>
      </select>
    </label>
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
