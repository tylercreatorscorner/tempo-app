'use client';

/**
 * TikTok Shop connections — the operator surface for the OAuth flow.
 *
 * Lives inside the Settings → Data Sources card, replacing the hardcoded
 * "Not connected / pending" row that reported a status nothing was measuring.
 *
 * Reads /api/tiktok/connections and checks res.ok before consuming: a 500
 * parsed as JSON renders as an empty list, which here would claim "no brands
 * are connected" — the fake-empty variant of rendering $0 for a failed money
 * read. Cold failure shows an error surface; a failure after a good load keeps
 * the last-good data behind a stale banner.
 */

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  Copy,
  Link2,
  Loader2,
  Music2,
  RefreshCw,
  Store,
  Unplug,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Chip } from '@/components/ui/chip';

interface ConnectionStatus {
  brandSlug: string;
  shopId: string;
  shopName: string | null;
  sellerName: string | null;
  sellerBaseRegion: string | null;
  isActive: boolean;
  connectedAt: string | null;
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  lastTokenRefresh: string | null;
  lastApiCall: string | null;
  lastError: string | null;
}

interface PendingShop {
  id: string;
  name: string | null;
  region: string | null;
  code: string | null;
}

interface PendingAuthorization {
  state: string;
  brandSlug: string;
  shops: PendingShop[];
  sellerName: string | null;
  pendingExpiresAt: string;
}

interface BrandOption {
  slug: string;
  label: string;
}

/** Mirrors the server's classification (api/tiktok/connections). Derived there,
 *  not here, so it cannot drift from the SQL that decides the same thing.
 *  'redeemed' means the client was handed to TikTok and NOTHING has come back;
 *  only 'authorized' is evidence of a completed authorization. */
type InviteState = 'revoked' | 'authorized' | 'expired' | 'exhausted' | 'redeemed' | 'opened' | 'sent';

interface ClientInvite {
  id: string;
  brandSlug: string;
  url: string;
  createdAt: string;
  createdBy: string | null;
  expiresAt: string;
  lastOpenedAt: string | null;
  openCount: number;
  redeemCount: number;
  lastRedeemedAt: string | null;
  state: InviteState;
  /** An authorization for this brand is parked, waiting to be linked. */
  awaitingConfirm: boolean;
}

interface ConnectionsPayload {
  configured: boolean;
  configurationError: string | null;
  connections: ConnectionStatus[];
  pending: PendingAuthorization[];
  brands: BrandOption[];
  invites: ClientInvite[];
  /** Scoped to the Client links section — connections and pending authorizations
   *  are still live when this is set (e.g. deployed ahead of migration 118). */
  invitesError: string | null;
}

/** The callback route hands back a code, not a sentence — the wording lives
 *  here so it can change without touching the OAuth handler. */
const CALLBACK_MESSAGES: Record<string, string> = {
  missing_state: 'That authorization link was incomplete. Start the connection again.',
  invalid_state:
    'That authorization link had already been used, or it expired. Start the connection again.',
  denied: 'The authorization was cancelled on TikTok, so nothing was connected.',
  not_configured:
    'The token encryption key is missing on this deployment, so the authorization was refused rather than stored unsafely.',
  exchange_failed:
    'TikTok would not exchange the authorization code. Start the connection again; if it keeps failing, the app credentials are wrong.',
  shops_failed:
    'The authorization worked, but TikTok would not return the seller’s shops. Start the connection again.',
  no_shops:
    'That seller account has no shops this app can reach. Check the account authorized the right store, then try again.',
  store_failed: 'The authorization could not be saved. Start the connection again.',
};

export function TikTokShopSection() {
  return (
    // useSearchParams needs a boundary; the panel renders its own skeleton.
    <Suspense fallback={<PanelShell><LoadingRow /></PanelShell>}>
      <TikTokShopPanel />
    </Suspense>
  );
}

function TikTokShopPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // The callback's outcome is a ONE-SHOT message, so it is read into state and
  // the params are stripped from the URL. Left in place they outlive their
  // meaning: after a successful confirm empties the pending list, a lingering
  // ?tiktok=pending renders "no longer waiting for confirmation" right next to
  // "Connected <shop>", and a ?tiktok_error persists through every later
  // refresh, retry, confirm and disconnect.
  const [callbackOk, setCallbackOk] = useState<string | null>(null);
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const consumedCallbackParams = useRef(false);

  useEffect(() => {
    if (consumedCallbackParams.current) return;
    consumedCallbackParams.current = true;

    const ok = searchParams.get('tiktok');
    const failed = searchParams.get('tiktok_error');
    if (!ok && !failed) return;

    setCallbackOk(ok);
    setCallbackError(failed);
    router.replace('/settings#tiktok-shop', { scroll: false });
  }, [searchParams, router]);

  const [data, setData] = useState<ConnectionsPayload | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [selectedBrand, setSelectedBrand] = useState('');
  const [reconnectSlug, setReconnectSlug] = useState<string | null>(null);
  // Deliberately NOT the same flag as reconnectSlug: acknowledging "yes, send a
  // link for a brand that is already connected" is a different decision from
  // "yes, re-authorize it myself right now", and one must not arm the other.
  const [inviteReconnectSlug, setInviteReconnectSlug] = useState<string | null>(null);
  const [freshInvite, setFreshInvite] = useState<{ url: string; brandSlug: string; expiresAt: string } | null>(null);
  const [disconnectSlug, setDisconnectSlug] = useState<string | null>(null);
  const [shopChoice, setShopChoice] = useState<Record<string, string>>({});
  const [replaceArmed, setReplaceArmed] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tiktok/connections', { cache: 'no-store' });
      // res.ok BEFORE .json(): consuming an error body produces an object with
      // no `connections`, which renders as "nothing is connected".
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setLoadError(body?.error || `Could not load TikTok Shop connections (HTTP ${res.status}).`);
        return;
      }
      const body = (await res.json()) as ConnectionsPayload;
      setData(body);
      setHasLoadedOnce(true);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load TikTok Shop connections.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Preselect a brand once the list arrives, preferring one that is not
  // already connected.
  useEffect(() => {
    if (!data || selectedBrand) return;
    const connected = new Set(data.connections.filter((c) => c.isActive).map((c) => c.brandSlug));
    const next = data.brands.find((b) => !connected.has(b.slug)) ?? data.brands[0];
    if (next) setSelectedBrand(next.slug);
  }, [data, selectedBrand]);

  const post = useCallback(
    async (path: string, body: unknown): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; status: number; error: string; data: Record<string, unknown> }> => {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const parsed = ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
      if (!res.ok) {
        return {
          ok: false,
          status: res.status,
          error: typeof parsed.error === 'string' ? parsed.error : `Request failed (HTTP ${res.status}).`,
          data: parsed,
        };
      }
      return { ok: true, data: parsed };
    },
    [],
  );

  const startConnect = useCallback(
    async (brandSlug: string, reconnect: boolean) => {
      setBusy(`connect:${brandSlug}`);
      setActionError(null);
      setNotice(null);
      try {
        const result = await post('/api/tiktok/connections/start', { brandSlug, reconnect });
        if (!result.ok) {
          setActionError(result.error);
          if (result.data.requiresReconnect === true) setReconnectSlug(brandSlug);
          return;
        }
        const url = result.data.authorizeUrl;
        if (typeof url !== 'string') {
          setActionError('The server did not return an authorization link.');
          return;
        }
        // Full navigation, not a router push: the destination is TikTok.
        window.location.assign(url);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Could not start the connection.');
      } finally {
        setBusy(null);
      }
    },
    [post],
  );

  const createInvite = useCallback(
    async (brandSlug: string, reconnect: boolean) => {
      setBusy(`invite:${brandSlug}`);
      setActionError(null);
      setNotice(null);
      try {
        const result = await post('/api/tiktok/connections/invite', { brandSlug, reconnect });
        if (!result.ok) {
          setActionError(result.error);
          if (result.data.requiresReconnect === true) setInviteReconnectSlug(brandSlug);
          return;
        }
        const url = result.data.url;
        const expiresAt = result.data.expiresAt;
        if (typeof url !== 'string' || typeof expiresAt !== 'string') {
          // Never render a half-built link: an operator would paste it into an
          // email and only find out when the client says nothing happened.
          setActionError('The server did not return a usable link. Try again.');
          return;
        }
        setFreshInvite({ url, brandSlug, expiresAt });
        setInviteReconnectSlug(null);
        await load();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Could not create the link.');
      } finally {
        setBusy(null);
      }
    },
    [post, load],
  );

  /** Issue a fresh link for a brand whose old one is spent, expired-looking, or
   *  never came back. Selects the brand first so the connect block's
   *  "Create the link anyway" override targets the right one if the server
   *  refuses because the brand is already connected. */
  const reissueInvite = useCallback(
    async (brandSlug: string) => {
      setSelectedBrand(brandSlug);
      await createInvite(brandSlug, inviteReconnectSlug === brandSlug);
    },
    [createInvite, inviteReconnectSlug],
  );

  const revokeInvite = useCallback(
    async (id: string, url: string) => {
      setBusy(`revoke-invite:${id}`);
      setActionError(null);
      try {
        const result = await post('/api/tiktok/connections/invite/revoke', { id });
        if (!result.ok) {
          setActionError(result.error);
          return;
        }
        // Clear the copy field too if it was showing the link just killed —
        // leaving it on screen invites pasting a dead URL into an email.
        setFreshInvite((prev) => (prev && prev.url === url ? null : prev));
        setNotice('That link no longer works.');
        await load();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Could not revoke the link.');
      } finally {
        setBusy(null);
      }
    },
    [post, load],
  );

  const confirmShop = useCallback(
    async (state: string, shopId: string, replace: boolean) => {
      setBusy(`confirm:${state}`);
      setActionError(null);
      setNotice(null);
      try {
        const result = await post('/api/tiktok/connections/confirm', { state, shopId, replace });
        if (!result.ok) {
          setActionError(result.error);
          // Server-authoritative, mirroring start/'s reconnect flag: the client
          // never sends replace:true until the server has said a live link is in
          // the way and the operator has seen which one.
          if (result.data.requiresReplace === true) {
            setReplaceArmed((prev) => ({ ...prev, [state]: true }));
          }
          return;
        }
        const name = typeof result.data.shopName === 'string' ? result.data.shopName : 'the shop';
        const brand = typeof result.data.brandSlug === 'string' ? result.data.brandSlug : 'the brand';
        setNotice(`Connected ${name} to ${brand}.`);
        await load();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Could not confirm the shop.');
      } finally {
        setBusy(null);
      }
    },
    [post, load],
  );

  const discardPending = useCallback(
    async (state: string) => {
      setBusy(`cancel:${state}`);
      setActionError(null);
      try {
        const result = await post('/api/tiktok/connections/cancel', { state });
        if (!result.ok) {
          setActionError(result.error);
          return;
        }
        setNotice('Discarded the pending authorization.');
        await load();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Could not discard the authorization.');
      } finally {
        setBusy(null);
      }
    },
    [post, load],
  );

  const disconnect = useCallback(
    async (brandSlug: string) => {
      setBusy(`disconnect:${brandSlug}`);
      setActionError(null);
      try {
        const result = await post('/api/tiktok/connections/disconnect', { brandSlug });
        if (!result.ok) {
          setActionError(result.error);
          return;
        }
        setNotice(`Disconnected ${brandSlug} and erased its stored tokens.`);
        setDisconnectSlug(null);
        await load();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Could not disconnect the brand.');
      } finally {
        setBusy(null);
      }
    },
    [post, load],
  );

  // Cold failure: no data was ever loaded, so there is nothing honest to show.
  if (loadError && !hasLoadedOnce) {
    return (
      <PanelShell>
        <Banner tone="error" icon={<AlertTriangle className="h-4 w-4" />}>
          {loadError}
        </Banner>
        <div className="pt-3">
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      </PanelShell>
    );
  }

  if (!data) {
    return (
      <PanelShell>
        <LoadingRow />
      </PanelShell>
    );
  }

  const active = data.connections.filter((c) => c.isActive);
  const inactive = data.connections.filter((c) => !c.isActive);
  const connectedSlugs = new Set(active.map((c) => c.brandSlug));
  const olderInvites = data.invites.filter((i) => i.url !== freshInvite?.url);

  return (
    <PanelShell
      status={
        // A parked authorization outranks the connection count: it is the only
        // thing on this panel with a DEADLINE, and the client who authorized
        // has to redo it if nobody acts.
        data.pending.length > 0 ? (
          <Chip className="border-transparent bg-[var(--pulse-warn-bg)] text-[var(--pulse-warn)]">
            {data.pending.length} waiting on you
          </Chip>
        ) : active.length > 0 ? (
          <Chip className="border-transparent bg-[var(--pulse-pos-bg)] text-[var(--pulse-pos)]">
            {active.length} connected
          </Chip>
        ) : (
          <Chip className="text-muted-foreground">Not connected</Chip>
        )
      }
    >
      <div className="space-y-3">
        {/* Stale: a refresh failed but earlier data is still on screen. */}
        {loadError && hasLoadedOnce && (
          <Banner tone="warn" icon={<AlertTriangle className="h-4 w-4" />}>
            Showing the last successful read. {loadError}
          </Banner>
        )}

        {/* Loud, because the asynchronous flow has no other alarm: a client can
            authorize at 8am and the tokens are erased when the window passes. */}
        {data.pending.length > 0 && (
          <Banner tone="warn" icon={<AlertTriangle className="h-4 w-4" />}>
            {data.pending.length === 1
              ? 'A client has authorized TikTok Shop and is waiting for you to link their shop.'
              : `${data.pending.length} clients have authorized TikTok Shop and are waiting for you to link their shops.`}{' '}
            Nothing is connected until you confirm below, and an authorization
            that is left too long has to be done again.
          </Banner>
        )}

        {callbackError && (
          <Banner tone="error" icon={<AlertTriangle className="h-4 w-4" />}>
            {CALLBACK_MESSAGES[callbackError] ?? 'The TikTok authorization did not complete.'}
          </Banner>
        )}

        {callbackOk === 'pending' && data.pending.length === 0 && (
          <Banner tone="warn" icon={<AlertTriangle className="h-4 w-4" />}>
            TikTok returned an authorization, but it is no longer waiting for confirmation. It may
            have already been confirmed, discarded, or timed out.
          </Banner>
        )}

        {!data.configured && data.configurationError && (
          <Banner tone="error" icon={<AlertTriangle className="h-4 w-4" />}>
            {data.configurationError}
          </Banner>
        )}

        {notice && (
          <Banner tone="ok" icon={<CheckCircle2 className="h-4 w-4" />}>
            {notice}
          </Banner>
        )}

        {actionError && (
          <Banner tone="error" icon={<AlertTriangle className="h-4 w-4" />}>
            {actionError}
          </Banner>
        )}

        {/* Pending confirmations — the deliberate human step. */}
        {data.pending.map((pending) => {
          // Never preselect when there is a choice to make. A default here is
          // an invisible guess, and the whole point of this screen is that a
          // seller account can own several shops and only a person knows which
          // storefront is this client's.
          const chosen = shopChoice[pending.state] ?? (pending.shops.length === 1 ? pending.shops[0].id : '');
          const chosenShop = pending.shops.find((s) => s.id === chosen) ?? null;

          // What this brand points at TODAY. Shown up front so a rebind is
          // never a surprise the operator only discovers from a 409.
          const currentLink = active.find((c) => c.brandSlug === pending.brandSlug) ?? null;
          const willReplace = currentLink !== null && chosen !== '' && currentLink.shopId !== chosen;

          return (
            <div
              key={pending.state}
              className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-3"
            >
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Confirm which shop to link to {pending.brandSlug}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {pending.sellerName ? `Seller ${pending.sellerName} authorized ` : 'Authorized '}
                  {pending.shops.length === 1 ? '1 shop' : `${pending.shops.length} shops`}. Nothing is
                  linked until you confirm.
                </p>
                {currentLink && (
                  <p className="text-xs mt-1.5 text-[var(--pulse-warn)]">
                    {pending.brandSlug} is currently linked to{' '}
                    <span className="font-semibold">
                      {currentLink.shopName || currentLink.shopId}
                    </span>
                    . Confirming a different shop replaces that link.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                {pending.shops.map((shop) => {
                  const isChosen = shop.id === chosen;
                  return (
                    <label
                      key={shop.id}
                      className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                        isChosen ? 'border-primary bg-card' : 'border-border/60 hover:border-border'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`shop-${pending.state}`}
                        value={shop.id}
                        checked={isChosen}
                        onChange={() => {
                          setShopChoice((prev) => ({ ...prev, [pending.state]: shop.id }));
                          // Changing the target re-arms the guard: the operator
                          // approved replacing a link for a DIFFERENT shop.
                          setReplaceArmed((prev) => ({ ...prev, [pending.state]: false }));
                          setActionError(null);
                        }}
                        className="mt-1 accent-[var(--primary)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <Store className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium text-foreground truncate">
                            {shop.name || 'Unnamed shop'}
                          </span>
                          {shop.region && (
                            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                              {shop.region}
                            </span>
                          )}
                        </span>
                        <span className="block text-xs text-muted-foreground font-mono mt-0.5 truncate">
                          {shop.id}
                          {shop.code ? ` · ${shop.code}` : ''}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>

              <p className="text-xs text-muted-foreground">
                {chosenShop ? (
                  <>
                    <span className="font-semibold text-foreground">
                      {chosenShop.name || chosenShop.id}
                    </span>{' '}
                    will be linked to{' '}
                    <span className="font-semibold text-foreground">{pending.brandSlug}</span>. All of
                    that brand&apos;s numbers will come from this shop.
                  </>
                ) : (
                  'Pick a shop to continue.'
                )}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={replaceArmed[pending.state] ? 'danger' : 'primary'}
                  disabled={!chosen || busy !== null}
                  onClick={() =>
                    void confirmShop(pending.state, chosen, replaceArmed[pending.state] === true)
                  }
                >
                  {busy === `confirm:${pending.state}` ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  {replaceArmed[pending.state]
                    ? 'Replace the existing link'
                    : willReplace
                      ? 'Link this shop instead'
                      : 'Link this shop'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy !== null}
                  onClick={() => void discardPending(pending.state)}
                >
                  Discard
                </Button>
                <span className="text-xs text-muted-foreground">
                  Expires {formatDateTime(pending.pendingExpiresAt)}
                </span>
              </div>
            </div>
          );
        })}

        {/* Live connections */}
        {active.length === 0 && data.pending.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No brand is connected to TikTok Shop yet.
          </p>
        )}

        {active.map((conn) => (
          <ConnectionRow
            key={conn.brandSlug}
            conn={conn}
            busy={busy}
            confirming={disconnectSlug === conn.brandSlug}
            onAskDisconnect={() => setDisconnectSlug(conn.brandSlug)}
            onCancelDisconnect={() => setDisconnectSlug(null)}
            onDisconnect={() => void disconnect(conn.brandSlug)}
          />
        ))}

        {inactive.length > 0 && (
          <details className="rounded-lg border border-border/50">
            <summary className="cursor-pointer px-3 py-2 text-xs text-muted-foreground">
              {inactive.length} disconnected {inactive.length === 1 ? 'brand' : 'brands'} (tokens erased)
            </summary>
            <div className="px-3 pb-3 space-y-1">
              {inactive.map((conn) => (
                <p key={conn.brandSlug} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{conn.brandSlug}</span> &mdash;{' '}
                  {conn.shopName || conn.shopId}
                  {conn.connectedAt ? `, connected ${formatDateTime(conn.connectedAt)}` : ''}
                </p>
              ))}
            </div>
          </details>
        )}

        {/* Connect one brand */}
        <div className="pt-1 border-t border-border/50">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-3 pb-2">
            Connect a brand
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1">
              <Select
                value={selectedBrand}
                onChange={(e) => {
                  setSelectedBrand(e.target.value);
                  setReconnectSlug(null);
                  setInviteReconnectSlug(null);
                  setActionError(null);
                }}
                disabled={data.brands.length === 0 || !data.configured}
                aria-label="Brand to connect"
              >
                {data.brands.length === 0 ? (
                  <option value="">No store brands available</option>
                ) : (
                  data.brands.map((b) => (
                    <option key={b.slug} value={b.slug}>
                      {b.label}
                      {connectedSlugs.has(b.slug) ? ' (connected)' : ''}
                    </option>
                  ))
                )}
              </Select>
            </div>
            <Button
              className="sm:w-auto"
              disabled={!selectedBrand || !data.configured || busy !== null}
              onClick={() => void startConnect(selectedBrand, reconnectSlug === selectedBrand)}
            >
              {busy === `connect:${selectedBrand}` ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Music2 className="h-4 w-4" />
              )}
              {reconnectSlug === selectedBrand ? 'Reconnect anyway' : 'Connect'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Authorizes in <span className="font-medium text-foreground">this</span> browser &mdash;
            right when you are signed in to TikTok as the shop&apos;s main seller account. Only store
            brands appear here; an umbrella has no shop of its own.
          </p>

          {/* The client-authorizes path. Not a replacement for Connect above:
              that one is still correct when the admin IS the main account
              holder. */}
          <div className="mt-3 rounded-lg border border-border/60 p-3 space-y-2">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Can&apos;t authorize it yourself?
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                TikTok refuses sub-accounts, so for most shops only the client&apos;s main seller
                account can approve access. Send them a link instead. They approve at TikTok, the
                authorization comes back <span className="font-medium text-foreground">here</span>,
                and you still pick which shop maps to the brand &mdash; nothing is linked until you
                confirm.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              disabled={!selectedBrand || !data.configured || busy !== null}
              onClick={() =>
                void createInvite(selectedBrand, inviteReconnectSlug === selectedBrand)
              }
            >
              {busy === `invite:${selectedBrand}` ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Link2 className="h-3.5 w-3.5" />
              )}
              {inviteReconnectSlug === selectedBrand
                ? 'Create the link anyway'
                : 'Get a link for the client'}
            </Button>
          </div>

          {freshInvite && (
            <div className="mt-3 rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Link for {brandLabelOf(data.brands, freshInvite.brandSlug)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  Send it to whoever holds the shop&apos;s main TikTok seller account. It stops
                  working {describeRemaining(freshInvite.expiresAt)}, and they can retry a few
                  times if TikTok turns them away. The page tells them to switch off a sub-account
                  before they reach TikTok. When they approve, their shops appear here for you to
                  link.
                </p>
              </div>
              <CopyField url={freshInvite.url} />
            </div>
          )}

          {/* Scoped to this section ONLY. Connections and pending
              authorizations above are live and usable — the invite table is
              simply unreadable (most likely deployed ahead of its migration). */}
          {data.invitesError && (
            <div className="mt-3">
              <Banner tone="warn" icon={<AlertTriangle className="h-4 w-4" />}>
                Client links can&apos;t be listed right now, so any outstanding ones are not shown
                here. Everything above is live. {data.invitesError}
              </Banner>
            </div>
          )}

          {/* The link just created has its own panel above; listing it again
              would put two copies of the same URL on screen. */}
          {olderInvites.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-2">
                Client links
              </p>
              <div className="space-y-2">
                {olderInvites.map((invite) => (
                  <InviteRow
                    key={invite.id}
                    invite={invite}
                    brandLabel={brandLabelOf(data.brands, invite.brandSlug)}
                    busy={busy}
                    onRevoke={() => void revokeInvite(invite.id, invite.url)}
                    onReissue={() => void reissueInvite(invite.brandSlug)}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                &ldquo;Opened&rdquo; can also be an email scanner following the link, so treat it as
                a hint rather than proof the client saw it. A link can be re-opened a few times, so
                a client who gets refused for being on a sub-account can just try again.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button variant="ghost" size="sm" disabled={loading} onClick={() => void load()}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>
    </PanelShell>
  );
}

function ConnectionRow({
  conn,
  busy,
  confirming,
  onAskDisconnect,
  onCancelDisconnect,
  onDisconnect,
}: {
  conn: ConnectionStatus;
  busy: string | null;
  confirming: boolean;
  onAskDisconnect: () => void;
  onCancelDisconnect: () => void;
  onDisconnect: () => void;
}) {
  const expiry = describeExpiry(conn.accessTokenExpiresAt);
  const refreshExpiry = describeExpiry(conn.refreshTokenExpiresAt);

  return (
    <div className="rounded-lg border border-border/60 p-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {conn.shopName || 'Unnamed shop'}
            {conn.sellerBaseRegion && (
              <span className="ml-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                {conn.sellerBaseRegion}
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {conn.brandSlug}
            {conn.sellerName ? ` · ${conn.sellerName}` : ''}
            {conn.connectedAt ? ` · connected ${formatDateTime(conn.connectedAt)}` : ''}
          </p>
        </div>

        {confirming ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="danger"
              disabled={busy !== null}
              onClick={onDisconnect}
            >
              {busy === `disconnect:${conn.brandSlug}` ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Unplug className="h-3.5 w-3.5" />
              )}
              Confirm disconnect
            </Button>
            <Button size="sm" variant="ghost" disabled={busy !== null} onClick={onCancelDisconnect}>
              Keep
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="secondary" disabled={busy !== null} onClick={onAskDisconnect}>
            <Unplug className="h-3.5 w-3.5" />
            Disconnect
          </Button>
        )}
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs">
        <Field label="Access token" value={expiry.label} tone={expiry.tone} />
        <Field label="Authorization" value={refreshExpiry.label} tone={refreshExpiry.tone} />
        <Field
          label="Last refresh"
          value={conn.lastTokenRefresh ? formatDateTime(conn.lastTokenRefresh) : 'Never'}
        />
        <Field
          label="Last API call"
          value={conn.lastApiCall ? formatDateTime(conn.lastApiCall) : 'Never'}
        />
      </dl>

      {conn.lastError && (
        <p className="text-xs text-destructive flex items-start gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
          <span className="min-w-0">{conn.lastError}</span>
        </p>
      )}
    </div>
  );
}

/**
 * The copy-to-clipboard field for a client link.
 *
 * The URL is always visible in a selectable input, not hidden behind the
 * button: navigator.clipboard is unavailable on an insecure origin and can be
 * refused by permissions policy, and an operator who cannot see the link has
 * nothing to fall back on. The button selects the text on failure so a manual
 * copy still works.
 */
function CopyField({ url }: { url: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      inputRef.current?.select();
    }
  };

  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <Input
        ref={inputRef}
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="font-mono text-[11px]"
        aria-label="Client connect link"
      />
      <Button variant="secondary" size="sm" className="sm:w-auto shrink-0" onClick={() => void copy()}>
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'Copied' : 'Copy link'}
      </Button>
    </div>
  );
}

/**
 * One client link.
 *
 * The status line is the honest part. A REDEMPTION means the browser was handed
 * to TikTok and nothing more — it reads identically after a sub-account
 * refusal, a cancelled consent screen, or a closed tab — so it must never be
 * rendered as "the client authorized". Only `authorized` (stamped by the
 * callback once a pending authorization is actually parked) earns that
 * sentence. Reporting a click as a completed authorization is the same class of
 * lie as the Settings page that claimed a working TikTok sync off a backfilled
 * boolean.
 */
function InviteRow({
  invite,
  brandLabel,
  busy,
  onRevoke,
  onReissue,
}: {
  invite: ClientInvite;
  brandLabel: string;
  busy: string | null;
  onRevoke: () => void;
  onReissue: () => void;
}) {
  const authorized = invite.state === 'authorized';
  const spent = authorized || invite.state === 'exhausted';
  const chip = inviteChip(invite);

  return (
    <div className="rounded-lg border border-border/60 p-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{brandLabel}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sent {formatDateTime(invite.createdAt)} &middot; stops working{' '}
            {describeRemaining(invite.expiresAt)}
            {invite.createdBy ? ` · by ${invite.createdBy}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Chip className={chip.className}>{chip.label}</Chip>
          {/* A spent link is not a way in any more; offering Revoke would imply
              it was. Reissue is the action that actually helps. */}
          {spent ? (
            <Button size="sm" variant="ghost" disabled={busy !== null} onClick={onReissue}>
              {busy === `invite:${invite.brandSlug}` ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Link2 className="h-3.5 w-3.5" />
              )}
              Reissue
            </Button>
          ) : (
            <Button size="sm" variant="ghost" disabled={busy !== null} onClick={onRevoke}>
              {busy === `revoke-invite:${invite.id}` ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Ban className="h-3.5 w-3.5" />
              )}
              Revoke
            </Button>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">{inviteExplanation(invite)}</p>

      {!spent && <CopyField url={invite.url} />}
    </div>
  );
}

function inviteChip(invite: ClientInvite): { label: string; className: string } {
  const positive = 'border-transparent bg-[var(--pulse-pos-bg)] text-[var(--pulse-pos)]';
  const warn = 'border-transparent bg-[var(--pulse-warn-bg)] text-[var(--pulse-warn)]';

  switch (invite.state) {
    case 'authorized':
      return { label: invite.awaitingConfirm ? 'Authorized — link it' : 'Authorized', className: positive };
    case 'exhausted':
      return { label: 'Used up', className: warn };
    case 'redeemed':
      return { label: 'Sent to TikTok', className: warn };
    case 'opened':
      return { label: `Opened ${formatDateTime(invite.lastOpenedAt ?? invite.createdAt)}`, className: warn };
    default:
      return { label: 'Not opened yet', className: 'text-muted-foreground' };
  }
}

function inviteExplanation(invite: ClientInvite): string {
  switch (invite.state) {
    case 'authorized':
      return invite.awaitingConfirm
        ? 'The client granted access. Their shops are waiting above — pick which one maps to this brand.'
        : 'The client granted access. If nothing is waiting above, it has already been linked or the authorization lapsed; reissue to redo it.';
    case 'exhausted':
      return 'This link has been opened and sent to TikTok as many times as it allows, and no authorization came back. Reissue to send a fresh one.';
    case 'redeemed':
      return invite.lastRedeemedAt
        ? `Sent to TikTok ${formatDateTime(invite.lastRedeemedAt)} — nothing has come back yet. They may still be signing in as the main account owner; the link still works if they try again.`
        : 'Sent to TikTok — nothing has come back yet.';
    case 'opened':
      return 'Opened, but not sent to TikTok yet.';
    default:
      return 'Not opened yet. An email scanner would usually register an open, so this may not have reached them.';
  }
}

function Field({ label, value, tone }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`font-medium truncate ${toneText(tone)}`}>{value}</dd>
    </div>
  );
}

function PanelShell({ children, status }: { children: React.ReactNode; status?: React.ReactNode }) {
  return (
    <div id="tiktok-shop" className="rounded-lg border border-border/50 p-4 scroll-mt-24">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <p className="font-medium text-sm">TikTok Shop</p>
          <p className="text-xs text-muted-foreground">
            Authorized shops, per brand. One shop maps to exactly one store brand.
          </p>
        </div>
        {status}
      </div>
      {children}
    </div>
  );
}

function LoadingRow() {
  return (
    <p className="text-sm text-muted-foreground flex items-center gap-2">
      <Loader2 className="h-4 w-4 animate-spin" />
      Loading connections&hellip;
    </p>
  );
}

type Tone = 'ok' | 'warn' | 'error';

function Banner({
  tone,
  icon,
  children,
}: {
  tone: Tone;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const surface =
    tone === 'ok'
      ? 'border-transparent bg-[var(--pulse-pos-bg)]'
      : tone === 'warn'
        ? 'border-transparent bg-[var(--pulse-warn-bg)]'
        : 'border-destructive/30 bg-destructive/10';

  return (
    <div className={`flex items-start gap-2 rounded-lg border p-3 ${surface}`}>
      <span className={`shrink-0 mt-px ${toneText(tone)}`}>{icon}</span>
      {/* Body text keeps a TEXT token: a fixed-tint foreground on a themed
          surface goes near-invisible when the theme flips. */}
      <p className="text-xs text-foreground min-w-0">{children}</p>
    </div>
  );
}

function toneText(tone?: Tone): string {
  if (tone === 'ok') return 'text-[var(--pulse-pos)]';
  if (tone === 'warn') return 'text-[var(--pulse-warn)]';
  if (tone === 'error') return 'text-destructive';
  return 'text-foreground';
}

function describeExpiry(iso: string | null): { label: string; tone: Tone } {
  if (!iso) return { label: 'Unknown', tone: 'warn' };
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return { label: 'Unknown', tone: 'warn' };

  const ms = at - Date.now();
  if (ms <= 0) return { label: `Expired ${formatDateTime(iso)}`, tone: 'error' };

  const hours = ms / 3_600_000;
  if (hours < 1) return { label: `${Math.max(1, Math.round(ms / 60_000))}m left`, tone: 'warn' };
  if (hours < 24) return { label: `${Math.round(hours)}h left`, tone: hours < 6 ? 'warn' : 'ok' };
  return { label: `${Math.round(hours / 24)}d left`, tone: 'ok' };
}

function brandLabelOf(brands: BrandOption[], slug: string): string {
  return brands.find((b) => b.slug === slug)?.label ?? slug;
}

/**
 * "in 3 days" / "in 4 hours" — the operator is about to type this into an
 * email, so it has to read like something a person would write, not a
 * timestamp. Rounds DOWN: promising a client three days when 2.9 remain is the
 * error that produces a dead link on the third morning.
 */
function describeRemaining(iso: string): string {
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 'shortly';

  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `in ${Math.max(1, minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `in ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.floor(hours / 24);
  return `in ${days} days`;
}

function formatDateTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return 'Unknown';
  return at.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
