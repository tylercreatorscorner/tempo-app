'use client';

/**
 * CreatorInvitesSection — brand join links in the admin Onboarding workspace.
 *
 * Generates per-brand invite codes that creators can use at /join/[code] to
 * onboard. The legacy /invites route points to this workspace.
 *
 * The brand list is passed in from the server component so we don't refetch.
 */

import { useState } from 'react';
import { Copy, Plus, Check, UserPlus } from 'lucide-react';
import { ChoiceMenu } from '@/components/ui/choice-menu';

interface BrandOption {
  slug: string;
  name: string;
  display_name: string | null;
}

interface Invite {
  id: string;
  brand: string;
  code: string;
  expires_at: string;
  max_uses: number;
  current_uses: number;
  active: boolean;
  created_at: string;
}

interface Props {
  tenantId: string;
  brands: BrandOption[];
  initialBrand?: string;
}

export function CreatorInvitesSection({ tenantId, brands, initialBrand }: Props) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [brand, setBrand] = useState(initialBrand && brands.some(item => item.slug === initialBrand) ? initialBrand : brands[0]?.slug ?? '');
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createInvite = async () => {
    if (!brand) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/invites/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, tenant_id: tenantId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to generate invite');
      } else if (data.invite) {
        setInvites((prev) => [data.invite, ...prev]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setCreating(false);
    }
  };

  const copyLink = (code: string) => {
    const url = `${window.location.origin}/join/${code}`;
    navigator.clipboard.writeText(url);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div id="invites" className="rounded-xl border border-border bg-card overflow-hidden scroll-mt-20">
      <div className="px-4 py-3.5 border-b border-border flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <UserPlus className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="font-semibold text-base">Invite creators</h2>
          <p className="text-sm text-muted-foreground">
            Generate a link for the brand they are joining.
          </p>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Generate form */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="w-full sm:w-60 [&>button]:w-full">
            <ChoiceMenu compact label="Direct invitation brand" value={brand}
              options={brands.map(b => ({ value: b.slug, label: b.display_name || b.name }))}
              onChange={setBrand} disabled={brands.length === 0} placeholder="Choose a brand" />
          </div>
          <button
            onClick={createInvite}
            disabled={creating || !brand}
            className="flex items-center justify-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {creating ? 'Generating…' : 'Generate link'}
          </button>
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        {/* Just-generated invites (session-only — page reload clears) */}
        {invites.length > 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
              Newly generated this session
            </p>
            {invites.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border/50"
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm capitalize truncate">{inv.brand.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                    /join/{inv.code} · {inv.current_uses}/{inv.max_uses} used · expires{' '}
                    {new Date(inv.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => copyLink(inv.code)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-border hover:bg-muted/40 transition-colors flex-shrink-0 ml-3"
                >
                  {copied === inv.code ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="text-emerald-600">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>Copy link</span>
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Links default to 100 uses and expire in 7 days.
        </p>
      </div>
    </div>
  );
}
