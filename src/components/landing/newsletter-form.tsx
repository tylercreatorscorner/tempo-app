'use client';

import { useState, type FormEvent } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { LANDING_CONTENT } from '@/lib/landing-content';

const N = LANDING_CONTENT.footer.newsletter;

type Status = 'idle' | 'submitting' | 'success' | 'error';

export function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email || status === 'submitting') return;

    setStatus('submitting');
    setErrorMessage('');

    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Subscription failed');
      }
      setStatus('success');
      setEmail('');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Subscription failed');
    }
  }

  return (
    <div className="w-full max-w-sm">
      <p className="text-sm font-semibold text-white mb-1">{N.title}</p>
      <p className="text-xs text-[#6B7280] mb-3 leading-relaxed">{N.desc}</p>

      {status === 'success' ? (
        <div className="flex items-center gap-2 px-4 py-3 rounded-full bg-white/5 border border-white/10 text-sm text-[#D1D5DB]">
          <Check className="w-4 h-4 text-[#10B981]" />
          You&apos;re on the list. Talk soon.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            placeholder={N.placeholder}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={status === 'submitting'}
            className="flex-1 min-w-0 px-4 py-2.5 rounded-full bg-white/5 border border-white/10 text-sm text-white placeholder-[#4B5563] outline-none focus:border-white/25 focus:bg-white/8 transition-colors disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={status === 'submitting' || !email}
            className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white transition-all duration-200 hover:scale-[1.05] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, #FF4D8D, #7C5CFC)' }}
            aria-label={N.cta}
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      )}

      {status === 'error' && (
        <p className="mt-2 text-xs text-[#F87171]">{errorMessage}</p>
      )}
    </div>
  );
}
