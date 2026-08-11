'use client';

import { useRouter } from 'next/navigation';
import { ShieldOff, LogOut } from 'lucide-react';
import { TempoLogo } from '@/components/ui/tempo-logo';
import { createClient } from '@/lib/supabase/client';

interface Props {
  email: string;
}

export function NoBrandAccess({ email }: Props) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ backgroundColor: 'var(--background)' }}
    >
      <div className="mb-6">
        <TempoLogo size="lg" animated />
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm p-8 max-w-md w-full text-center">
        <div className="h-12 w-12 mx-auto rounded-full bg-amber-50 dark:bg-amber-500/15 flex items-center justify-center mb-4">
          <ShieldOff className="h-6 w-6 text-amber-700 dark:text-amber-400" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">
          No brand assigned to your account
        </h1>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          Your account ({email}) is set up but hasn&apos;t been linked to a
          brand yet. Reach out to your account manager to be granted access.
        </p>
        <button
          onClick={handleLogout}
          className="mt-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}
