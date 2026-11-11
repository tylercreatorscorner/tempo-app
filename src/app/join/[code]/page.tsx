'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Check, Loader2, Plus, X } from 'lucide-react';
import { TempoLogo } from '@/components/ui/tempo-logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NavigationLink } from '@/components/ui/navigation-link';
import portal from '@/components/layout/portal-workspace.module.css';

type Step = 1 | 2 | 3;
type InviteState =
  | { status: 'loading' }
  | { status: 'ready'; brandName: string }
  | { status: 'error'; message: string; retryable: boolean };

const MAX_ACCOUNTS = 10;
const fieldClass = 'min-h-11 text-base sm:text-sm';
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function JoinInviteForm({ code }: { code: string }) {
  const [invite, setInvite] = useState<InviteState>({ status: 'loading' });
  const [validationAttempt, setValidationAttempt] = useState(0);
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [usernames, setUsernames] = useState(['']);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submitPending = useRef(false);
  const mounted = useRef(true);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function validate() {
      try {
        const res = await fetch(`/api/invites/${encodeURIComponent(code)}`, { signal: controller.signal });
        const data: unknown = await res.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (!res.ok) {
          setInvite({
            status: 'error',
            message: isRecord(data) && typeof data.error === 'string' ? data.error : 'We could not check this invitation.',
            retryable: res.status >= 500 || res.status === 429,
          });
        } else if (isRecord(data) && typeof data.brand === 'string' && data.brand
          && typeof data.brand_display_name === 'string' && data.brand_display_name) {
          setInvite({ status: 'ready', brandName: data.brand_display_name });
        } else {
          setInvite({ status: 'error', message: 'We could not check this invitation.', retryable: true });
        }
      } catch {
        if (!controller.signal.aborted) {
          setInvite({ status: 'error', message: 'We could not connect to check this invitation.', retryable: true });
        }
      }
    }
    void validate();
    return () => controller.abort();
  }, [code, validationAttempt]);

  useEffect(() => {
    if (invite.status !== 'loading') headingRef.current?.focus({ preventScroll: true });
  }, [step, invite.status]);

  useEffect(() => {
    if (error) errorRef.current?.focus({ preventScroll: true });
  }, [error]);

  const addUsername = () => {
    if (!submitPending.current) setUsernames(values => values.length < MAX_ACCOUNTS ? [...values, ''] : values);
  };
  const updateUsername = (index: number, value: string) => {
    if (!submitPending.current) setUsernames(values => values.map((item, i) => i === index ? value.replace(/^@/, '').trim() : item));
  };
  const removeUsername = (index: number) => {
    if (!submitPending.current) setUsernames(values => values.length > 1 ? values.filter((_, i) => i !== index) : values);
  };

  const handleSubmitInfo = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitPending.current || invite.status !== 'ready' || !name.trim() || !email.trim()) return;
    setError('');
    setStep(2);
  };

  const handleSubmitUsernames = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitPending.current || invite.status !== 'ready') return;
    const handles = Array.from(new Set(usernames.map(value => value.trim().toLowerCase()).filter(Boolean)));
    if (!handles.length) return;
    submitPending.current = true;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, name: name.trim(), email: email.trim(), tiktok_usernames: handles }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!mounted.current) return;
      if (!res.ok) {
        setError(isRecord(data) && typeof data.error === 'string' ? data.error : 'We could not save your details. Please try again.');
      } else if (!isRecord(data) || data.success !== true) {
        setError('We could not confirm your submission. Check with your brand manager before trying again.');
      } else {
        setStep(3);
      }
    } catch {
      if (mounted.current) setError('We could not confirm your submission. Check with your brand manager before trying again.');
    } finally {
      submitPending.current = false;
      if (mounted.current) setSubmitting(false);
    }
  };

  return (
    <div className={`${portal.theme} ${portal.entry}`}>
      <div className={portal.entryCard}>
        <div className="mb-6 flex justify-center"><TempoLogo size="lg" /></div>
        <section className="rounded-xl border border-border bg-card p-5 sm:p-6" aria-busy={invite.status === 'loading' || submitting}>
          {invite.status === 'loading' ? (
            <p role="status" className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Checking invitation…
            </p>
          ) : invite.status === 'error' ? (
            <div className="space-y-4 text-center">
              <h1 ref={headingRef} tabIndex={-1} className="text-xl font-semibold focus:outline-none">Invitation unavailable</h1>
              <p role="alert" className="text-sm leading-relaxed text-muted-foreground">{invite.message}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {invite.retryable ? 'Try checking again, or ask your brand manager for help.' : 'Ask your brand manager for a new invitation link.'}
              </p>
              {invite.retryable && <Button variant="outline" className="min-h-11 w-full" onClick={() => {
                setInvite({ status: 'loading' });
                setValidationAttempt(attempt => attempt + 1);
              }}>Try again</Button>}
              <NavigationLink href="/creator-login" className="min-h-11">Already have portal access? Sign in</NavigationLink>
            </div>
          ) : (
            <>
              <p className="mb-4 break-words text-center text-xs text-muted-foreground">
                {step === 3 ? 'Submitted to' : 'Joining'} <span className="font-semibold text-foreground">{invite.brandName}</span>
              </p>
              {step < 3 && <p className="mb-2 text-center text-xs text-muted-foreground" aria-live="polite">Step {step} of 2</p>}
              <h1 ref={headingRef} tabIndex={-1} className="mb-2 text-center text-xl font-semibold focus:outline-none">
                {step === 1 ? 'Tell us about yourself' : step === 2 ? 'Add your TikTok accounts' : 'Details received'}
              </h1>
              {step === 1 && (
                <>
                  <p className="mb-5 text-center text-sm leading-relaxed text-muted-foreground">Share your contact details for your brand manager to review.</p>
                  <form onSubmit={handleSubmitInfo} className="space-y-4">
                    <div className="space-y-1.5">
                      <label htmlFor="join-name" className="block text-sm font-medium">Full name</label>
                      <Input id="join-name" name="name" autoComplete="name" value={name} maxLength={100}
                        onChange={event => setName(event.target.value)} required className={fieldClass} />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="join-email" className="block text-sm font-medium">Email</label>
                      <Input id="join-email" name="email" type="email" inputMode="email" autoComplete="email" maxLength={254}
                        autoCapitalize="none" spellCheck={false} value={email} onChange={event => setEmail(event.target.value)} required className={fieldClass} />
                    </div>
                    <Button type="submit" className="min-h-11 w-full">Continue</Button>
                  </form>
                </>
              )}
              {step === 2 && (
                <>
                  <p id="join-handle-help" className="mb-5 text-center text-sm leading-relaxed text-muted-foreground">Use your TikTok usernames, without the @. Your brand manager will need to verify account ownership.</p>
                  <form onSubmit={handleSubmitUsernames} className="space-y-4">
                    <fieldset disabled={submitting} className="m-0 min-w-0 space-y-4 border-0 p-0">
                      <legend className="sr-only">TikTok accounts</legend>
                      {usernames.map((username, index) => (
                        <div key={index} className="space-y-1.5">
                          <label htmlFor={`join-handle-${index}`} className="block text-sm font-medium">TikTok username {index + 1}</label>
                          <div className="flex min-w-0 items-center gap-2">
                            <Input id={`join-handle-${index}`} name={`tiktok-${index}`} value={username}
                              onChange={event => updateUsername(index, event.target.value)} required={index === 0}
                              autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                              maxLength={24} pattern="[A-Za-z0-9_.]*[A-Za-z0-9_]"
                              title="Use letters, numbers, underscores or periods, without a period at the end."
                              aria-describedby="join-handle-help" className={`min-w-0 flex-1 ${fieldClass}`} />
                            {usernames.length > 1 && <Button variant="ghost" size="icon" className="min-h-11 min-w-11 shrink-0"
                              onClick={() => removeUsername(index)} aria-label={`Remove TikTok account ${index + 1}`}>
                              <X aria-hidden="true" />
                            </Button>}
                          </div>
                        </div>
                      ))}
                      <Button variant="outline" className="min-h-11 w-full" disabled={usernames.length >= MAX_ACCOUNTS} onClick={addUsername}>
                        <Plus aria-hidden="true" /> Add another account
                      </Button>
                      {usernames.length >= MAX_ACCOUNTS && <p className="text-xs text-muted-foreground">You can submit up to {MAX_ACCOUNTS} accounts.</p>}
                      <Button type="submit" className="min-h-11 w-full" disabled={submitting}>
                        {submitting && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                        {submitting ? 'Submitting…' : 'Submit details'}
                      </Button>
                      <Button variant="ghost" className="min-h-11 w-full" disabled={submitting} onClick={() => {
                        if (!submitPending.current) { setError(''); setStep(1); }
                      }}>Back</Button>
                    </fieldset>
                    {error && <p ref={errorRef} tabIndex={-1} role="alert" className="text-sm leading-relaxed text-destructive focus:outline-none">{error}</p>}
                    <p role="status" className="sr-only">{submitting ? 'Submitting your details. Please wait.' : ''}</p>
                  </form>
                </>
              )}
              {step === 3 && (
                <div className="space-y-4 text-center">
                  <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary"><Check className="size-5" aria-hidden="true" /></div>
                  <p className="text-sm leading-relaxed text-muted-foreground">Your details are saved. Brand and account review is still pending. Contact your brand manager for the next step.</p>
                  <NavigationLink href="/creator-login" className="min-h-11">Already have portal access? Sign in</NavigationLink>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  // A different invitation starts a fresh form immediately; no prior brand or
  // contact details can remain visible while the next validation request runs.
  return <JoinInviteForm key={code} code={code} />;
}
