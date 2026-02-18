'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Store, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type AccountType = 'brand' | 'agency';
type Step = 'type' | 'details';

/** Signup form — asks brand vs agency, then collects details */
export function SignupForm() {
  const [step, setStep] = useState<Step>('type');
  const [accountType, setAccountType] = useState<AccountType>('brand');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
        data: {
          account_type: accountType,
          org_name: name,
        },
      },
    });

    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
    }
    setLoading(false);
  }

  if (success) {
    return (
      <div className="w-full max-w-sm text-center space-y-4">
        <div className="mx-auto h-12 w-12 rounded-xl bg-tempo-pink flex items-center justify-center">
          <span className="text-white font-bold text-xl">T</span>
        </div>
        <h1 className="text-2xl font-bold">Check your email</h1>
        <p className="text-sm text-muted-foreground">
          We sent a confirmation link to <strong>{email}</strong>
        </p>
      </div>
    );
  }

  // Step 1: Choose account type
  if (step === 'type') {
    return (
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto h-12 w-12 rounded-xl bg-tempo-pink flex items-center justify-center">
            <span className="text-white font-bold text-xl">T</span>
          </div>
          <h1 className="text-2xl font-bold">Get started with Tempo</h1>
          <p className="text-sm text-muted-foreground">How will you use Tempo?</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => setAccountType('brand')}
            className={cn(
              'flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all text-left',
              accountType === 'brand'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-muted-foreground/30'
            )}
          >
            <Store className="h-8 w-8 text-primary" />
            <div className="text-center">
              <p className="font-semibold text-sm">I&apos;m a Brand</p>
              <p className="text-xs text-muted-foreground mt-1">
                Manage my creators &amp; track TikTok Shop performance
              </p>
            </div>
          </button>

          <button
            onClick={() => setAccountType('agency')}
            className={cn(
              'flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all text-left',
              accountType === 'agency'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-muted-foreground/30'
            )}
          >
            <Building2 className="h-8 w-8 text-primary" />
            <div className="text-center">
              <p className="font-semibold text-sm">I&apos;m an Agency</p>
              <p className="text-xs text-muted-foreground mt-1">
                Manage multiple brands &amp; their creator programs
              </p>
            </div>
          </button>
        </div>

        <button
          onClick={() => setStep('details')}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity"
        >
          Continue
        </button>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="text-primary hover:underline">Sign in</Link>
        </p>
      </div>
    );
  }

  // Step 2: Account details
  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="text-center space-y-2">
        <div className="mx-auto h-12 w-12 rounded-xl bg-tempo-pink flex items-center justify-center">
          <span className="text-white font-bold text-xl">T</span>
        </div>
        <h1 className="text-2xl font-bold">
          {accountType === 'brand' ? 'Set up your brand' : 'Set up your agency'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {accountType === 'brand'
            ? "We'll create your brand workspace in one step"
            : 'Create your agency workspace — add brands later'}
        </p>
      </div>

      <form onSubmit={handleSignup} className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
        )}

        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-medium">
            {accountType === 'brand' ? 'Brand name' : 'Agency name'}
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder={accountType === 'brand' ? 'e.g., My Brand' : 'e.g., My Agency'}
            required
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="you@example.com"
            required
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="••••••••"
            minLength={6}
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {loading ? 'Creating account...' : accountType === 'brand' ? 'Create brand workspace' : 'Create agency workspace'}
        </button>
      </form>

      <button
        onClick={() => setStep('type')}
        className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        ← Back
      </button>
    </div>
  );
}
