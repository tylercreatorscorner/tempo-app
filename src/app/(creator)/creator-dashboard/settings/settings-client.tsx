'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AtSign, Loader2, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { addCreatorHandle, removeCreatorHandle } from './actions';

interface Account {
  id: string;
  username: string;
  isPrimary: boolean;
  verified: boolean;
}

export function SettingsClient({
  realName,
  email,
  accounts,
}: {
  realName: string;
  email: string | null;
  accounts: Account[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newHandle, setNewHandle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const refresh = () => startTransition(() => router.refresh());

  const onAdd = async () => {
    const v = newHandle.trim();
    if (!v || adding) return;
    setError(null);
    setAdding(true);
    const res = await addCreatorHandle(v);
    setAdding(false);
    if (!res.ok) {
      setError(res.error || 'Could not add that handle.');
      return;
    }
    setNewHandle('');
    refresh();
  };

  const onRemove = async (id: string) => {
    setError(null);
    setBusyId(id);
    const res = await removeCreatorHandle(id);
    setBusyId(null);
    if (!res.ok) {
      setError(res.error || 'Could not remove that handle.');
      return;
    }
    refresh();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      <PageHeader
        eyebrow="Account"
        title="Settings"
        subtitle="Manage your profile and the TikTok handles linked to your account."
      />

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="Name" value={realName} />
          <Field label="Email" value={email || 'Not set'} muted={!email} />
          <p className="text-xs text-muted-foreground">
            To change your name or email, message your manager.
          </p>
        </CardContent>
      </Card>

      {/* TikTok accounts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="text-primary">
              <AtSign className="h-4 w-4" />
            </span>
            TikTok accounts
          </CardTitle>
          <Badge variant="neutral" size="sm">
            {accounts.length} linked
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            These are the TikTok handles we track for your GMV, videos, and rankings. Add any you post
            from, and remove any that aren't yours.
          </p>

          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {accounts.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
                  <AtSign className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">@{a.username}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    {a.isPrimary && (
                      <Badge variant="neutral" size="sm">
                        Primary
                      </Badge>
                    )}
                    {a.verified ? (
                      <Badge variant="positive" size="sm">
                        Verified
                      </Badge>
                    ) : (
                      <Badge variant="warning" size="sm">
                        Unverified
                      </Badge>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(a.id)}
                  disabled={pending || busyId === a.id}
                  aria-label={`Remove @${a.username}`}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-[var(--pulse-neg)]/10 hover:text-[var(--pulse-neg)] disabled:opacity-50"
                >
                  {busyId === a.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </li>
            ))}
          </ul>

          {/* Add form */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                @
              </span>
              <Input
                value={newHandle}
                onChange={(e) => setNewHandle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onAdd();
                }}
                placeholder="add-a-handle"
                className="pl-7"
                aria-label="Add a TikTok handle"
              />
            </div>
            <button
              type="button"
              onClick={onAdd}
              disabled={adding || !newHandle.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-pulse-grad px-3.5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </button>
          </div>

          {error && <p className="text-sm text-[var(--pulse-neg)]">{error}</p>}
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            New handles are marked unverified until your manager confirms them. A handle already linked to
            someone else can't be added.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium ${muted ? 'text-muted-foreground' : 'text-foreground'}`}>
        {value}
      </span>
    </div>
  );
}
