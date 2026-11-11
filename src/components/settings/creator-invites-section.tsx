'use client';

/**
 * CreatorInvitesSection — brand join links in the admin Onboarding workspace.
 *
 * Generates per-brand invite codes that creators can use at /join/[code] to
 * onboard. The legacy /invites route points to this workspace.
 *
 * The brand list is passed in from the server component so we don't refetch.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Copy, Plus, Check, UserPlus, Loader2 } from 'lucide-react';
import { ChoiceMenu } from '@/components/ui/choice-menu';
import { Button } from '@/components/ui/button';
import { NavigationLink } from '@/components/ui/navigation-link';
import styles from './creator-invites-section.module.css';

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedBrand = initialBrand && brands.some(item => item.slug === initialBrand) ? initialBrand : brands.length === 1 ? brands[0].slug : '';
  const [invites, setInvites] = useState<Invite[]>([]);
  const [brand, setBrand] = useState(selectedBrand);
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const createRequest = useRef(0);
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const copyRequest = useRef(0);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setBrand(selectedBrand); }, [selectedBrand]);
  useEffect(() => () => {
    createRequest.current++;
    copyRequest.current++;
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  const createInvite = async () => {
    if (!brand || creatingRef.current) return;
    creatingRef.current = true;
    const request = ++createRequest.current;
    const requestedBrand = brand;
    setCreating(true);
    setError(null);
    setNotice('');
    try {
      const res = await fetch('/api/invites/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, tenant_id: tenantId }),
      });
      const data = await res.json();
      if (request !== createRequest.current) return;
      if (!res.ok) {
        setError(data.error || 'Failed to generate invite');
      } else if (typeof data.invite?.id === 'string' && data.invite.id
        && typeof data.invite.code === 'string' && /^[a-zA-Z0-9_-]{8,128}$/.test(data.invite.code)
        && data.invite.brand === requestedBrand && Number.isFinite(Date.parse(data.invite.expires_at))
        && Number.isInteger(data.invite.current_uses) && data.invite.current_uses >= 0
        && Number.isInteger(data.invite.max_uses) && data.invite.max_uses > data.invite.current_uses) {
        setInvites((prev) => [data.invite, ...prev]);
        setNotice(`Invitation created for ${brands.find(item => item.slug === requestedBrand)?.display_name || brands.find(item => item.slug === requestedBrand)?.name || requestedBrand}. Copy the link below to share it.`);
      } else {
        setError('The new link could not be confirmed. Refresh the page before trying again.');
      }
    } catch {
      if (request === createRequest.current) setError('Could not create the invitation. Check your connection and try again.');
    } finally {
      creatingRef.current = false;
      if (request === createRequest.current) setCreating(false);
    }
  };

  const changeBrand = (next: string) => {
    if (creatingRef.current || !brands.some(item => item.slug === next)) return;
    setBrand(next);
    setError(null);
    setCopyError(null);
    setNotice('');
    const params = new URLSearchParams(searchParams.toString());
    params.set('brand', next);
    params.delete('page');
    router.replace(`/roster/invitations?${params.toString()}`, { scroll: false });
  };

  const copyLink = async (code: string) => {
    const request = ++copyRequest.current;
    if (copyTimer.current) clearTimeout(copyTimer.current);
    setCopied(null);
    setCopyError(null);
    const url = `${window.location.origin}/join/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      if (request !== copyRequest.current) return;
      setCopied(code);
      copyTimer.current = setTimeout(() => setCopied(null), 2000);
    } catch {
      if (request === copyRequest.current) setCopyError('Could not copy the link. Select and copy the link below.');
    }
  };

  return (
    <section id="invites" className={styles.panel} aria-labelledby="creator-invites-heading">
      <div className={styles.heading}>
        <div className={styles.headingTitle}>
        <div className={styles.icon}>
          <UserPlus size={18} aria-hidden="true" />
        </div>
        <div>
          <h2 id="creator-invites-heading">Invite creators</h2>
          <p>A direct link to collect their details.</p>
        </div>
        </div>
        <NavigationLink href={brand ? `/roster?brand=${encodeURIComponent(brand)}` : '/roster'} className={styles.rosterLink}>Open creator roster</NavigationLink>
      </div>

      <div className={styles.body}>
        {/* Generate form */}
        <div className={styles.controls}>
          <div className={styles.brand}>
            <label htmlFor="invitation-brand">Brand</label>
            <ChoiceMenu id="invitation-brand" compact label="Direct invitation brand" value={brand}
              options={brands.map(b => ({ value: b.slug, label: b.display_name || b.name }))}
              onChange={changeBrand} disabled={creating || brands.length === 0} placeholder="Choose a brand" />
          </div>
          <Button
            onClick={createInvite}
            disabled={creating || !brand}
            aria-busy={creating}
            className="bg-foreground text-background"
          >
            {creating ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {creating ? 'Generating…' : 'Generate link'}
          </Button>
        </div>
        {brands.length === 0 ? <p className={styles.empty}>No active brands are available in this workspace. Add or reactivate a brand before creating an invitation.</p>
          : !brand && <p className={styles.hint}>Choose a brand to create its invitation link.</p>}

        {error && (
          <p role="alert" className={styles.error}>{error}</p>
        )}
        {copyError && <p role="alert" className={styles.error}>{copyError}</p>}
        <p role="status" aria-live="polite" className={notice || copied ? styles.notice : 'sr-only'}>{copied ? 'Invitation link copied.' : notice}</p>

        {/* Just-generated invites (session-only — page reload clears) */}
        {invites.length > 0 && (
          <section className={styles.results} aria-label="Generated invitation links">
            <h3>Created in this session</h3>
            {invites.map((inv) => (
              <div
                key={inv.id}
                className={styles.invite}
              >
                <div className={styles.details}>
                  <h4>{brands.find(item => item.slug === inv.brand)?.display_name || brands.find(item => item.slug === inv.brand)?.name || inv.brand.replace(/_/g, ' ')}</h4>
                  <p className={styles.url}>/join/{inv.code}</p>
                  <p className={styles.hint}>{inv.current_uses}/{inv.max_uses} uses · Expires {new Date(inv.expires_at).toLocaleDateString()}</p>
                  {copyError && <p className={styles.manualCopy}>{`${window.location.origin}/join/${inv.code}`}</p>}
                </div>
                <Button
                  variant="outline"
                  onClick={() => copyLink(inv.code)}
                  className="shrink-0"
                  aria-label={`Copy invitation link for ${brands.find(item => item.slug === inv.brand)?.display_name || brands.find(item => item.slug === inv.brand)?.name || inv.brand}`}
                >
                  {copied === inv.code ? (
                    <>
                      <Check aria-hidden="true" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy aria-hidden="true" />
                      <span>Copy link</span>
                    </>
                  )}
                </Button>
              </div>
            ))}
            <p className={styles.hint}>Copy these links before leaving. They stay valid until expiry but are not listed again after a page reload.</p>
          </section>
        )}

        <p className={styles.hint}>
          Each link allows 100 submissions and expires in 7 days. Generating a link does not send a message.
        </p>
      </div>
    </section>
  );
}
