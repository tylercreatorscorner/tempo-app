/**
 * /connect/tiktok/[token] — the link a CLIENT receives by email.
 *
 * WHY THIS EXISTS. TikTok refuses an authorization from a sub-account ("Sub-
 * accounts are unable to authorize. To authorize, log out and retry with your
 * main seller account"), so the person who must click Connect is the shop's
 * main seller account holder, not the agency admin. The OAuth state nonce lives
 * ten minutes and must keep living ten minutes; this invite is the long-lived
 * artifact instead.
 *
 * PUBLIC. The client has no Tempo session and never will. '/connect/tiktok/' is
 * listed in PUBLIC_PATHS in lib/supabase/middleware — that list is matched with
 * startsWith and has now stranded three separate features that forgot it (the
 * Vercel crons, and /auth/tiktok/callback two hours ago). Without the entry the
 * auth guard 307s this request to /login and the client sees a login form for a
 * product they do not have an account in.
 *
 * A PAGE, NOT A ROUTE HANDLER, and the redemption is a POST to ./redeem:
 *   1. Email security (Outlook Safe Links, Proofpoint) and chat unfurlers GET
 *      every URL in a message before a human ever sees it. A GET that consumed
 *      the invite would burn it in transit and the client would open a dead
 *      link — the same class as the /r/[token] unfurl-bot problem, but fatal
 *      instead of cosmetic. Bots do not submit forms.
 *   2. The client needs to be TOLD to switch to the main seller account BEFORE
 *      they arrive at TikTok, otherwise they hit the refusal we are working
 *      around and give up.
 *   3. A failure has to render as a sentence a non-technical person can act on,
 *      which needs a themed page, not a redirect with an error code.
 *
 * This page WRITES nothing except the capped open stamp, and it decides
 * nothing: the client authorizes, and an authenticated admin still binds the
 * shop to a brand afterwards.
 */
import type { Metadata } from 'next';
import { ShieldCheck, Store, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getBrandRegistry, brandLabel } from '@/lib/data/brand-registry';
import { looksLikeInviteToken, openConnectInvite } from '@/lib/tiktok/connect-invites';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Connect your TikTok Shop',
  // Never INDEXED — the URL is the secret. But noindex does not stop a chat
  // client or mail scanner from unfurling, and they do: this link arrives in a
  // merchant's inbox and gets a preview card whether we design one or not. So
  // it gets the connect variant, which tells the reader what the link does
  // instead of pitching the product at them. Nothing here widens the leak —
  // the path already says /connect/tiktok — and the card names no brand, so a
  // forwarded link never discloses which client it belongs to.
  robots: { index: false, follow: false },
  openGraph: {
    title: 'Connect your TikTok Shop',
    description:
      'Authorize your agency to sync the performance data they already report on — no posting, no listings, no storefront changes.',
    images: [{ url: '/api/og?v=connect', width: 1200, height: 630, alt: 'Connect your TikTok Shop to Tempo' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Connect your TikTok Shop',
    description:
      'Authorize your agency to sync the performance data they already report on — no posting, no listings, no storefront changes.',
    images: ['/api/og?v=connect'],
  },
};

interface Props {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ issue?: string }>;
}

export default async function ConnectInvitePage({ params, searchParams }: Props) {
  const { token } = await params;
  const sp = await searchParams;

  // A malformed token cannot ever have been issued, so refusing it here reveals
  // nothing about what is in the table — it only keeps crawler noise off the
  // database.
  if (!token || !looksLikeInviteToken(token)) return <DeadLink />;

  let opened;
  try {
    opened = await openConnectInvite(token);
  } catch (err) {
    // A failed read is NOT "this link is dead" — saying so would send a client
    // back to their contact for a replacement that would fail the same way.
    console.error(
      `[tiktok/connect-invite] open failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return <Unavailable />;
  }

  if (opened.status !== 'live') {
    // Revoked, used, expired and never-issued all render the SAME page. The
    // distinction is in the server log, where it belongs; telling a prober
    // which of their guesses was closest is the one thing this route must not
    // do.
    return <DeadLink />;
  }

  const registry = await getBrandRegistry();
  const label = brandLabel(registry, opened.brandSlug);
  // If the registry read came back empty the label falls back to the raw slug
  // ('dr_dent'), which is internal jargon in front of a client. Show the brand
  // only when it reads like a name.
  const brandName = label && label !== opened.brandSlug ? label : null;

  return (
    <Shell>
      <div className="flex items-center gap-2 text-[var(--pulse-warn)]">
        <Store className="h-4 w-4" />
        <span className="text-[11px] font-bold uppercase tracking-[0.12em]">
          TikTok Shop access
        </span>
      </div>

      <h1 className="mt-3 text-xl font-bold tracking-tight text-foreground">
        Connect your TikTok Shop
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {brandName ? (
          <>
            This gives your team read-only access to <strong className="text-foreground">{brandName}</strong>&apos;s
            sales and creator performance, so your reporting stays up to date without anyone
            emailing spreadsheets around.
          </>
        ) : (
          <>
            This gives your team read-only access to your shop&apos;s sales and creator
            performance, so your reporting stays up to date without anyone emailing spreadsheets
            around.
          </>
        )}
      </p>

      {sp?.issue === 'unavailable' && (
        <Notice tone="error">
          Something went wrong on our side and the connection could not be started. Please try
          again in a few minutes, or ask your contact to send a new link.
        </Notice>
      )}

      {/* The whole reason this flow exists. It goes ABOVE the button, because a
          client who reads it afterwards has already been refused by TikTok. */}
      <Notice tone="warn">
        <strong className="font-semibold text-foreground">
          Use your main seller account.
        </strong>{' '}
        TikTok does not let sub-accounts approve this. If you are signed in to TikTok Seller Center
        as a staff or sub-account, sign out and back in as the main account owner first.
      </Notice>

      <form action={`/connect/tiktok/${encodeURIComponent(token)}/redeem`} method="POST" className="mt-5">
        <Button type="submit" size="lg" className="w-full">
          Continue to TikTok
        </Button>
      </form>

      <ul className="mt-5 space-y-2 text-xs leading-relaxed text-muted-foreground">
        <li className="flex gap-2">
          <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            TikTok will show you exactly what you are approving. You can remove the access later
            from TikTok Seller Center.
          </span>
        </li>
        <li className="flex gap-2">
          <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            This link is just for you and expires in a few days. If TikTok turns you away, sign in
            as the main account owner and open it again.
          </span>
        </li>
      </ul>
    </Shell>
  );
}

function DeadLink() {
  return (
    <Shell>
      <div className="flex items-center gap-2 text-muted-foreground">
        <TriangleAlert className="h-4 w-4" />
        <span className="text-[11px] font-bold uppercase tracking-[0.12em]">Link not active</span>
      </div>
      <h1 className="mt-3 text-xl font-bold tracking-tight text-foreground">
        This link isn&apos;t active anymore
      </h1>
      {/* One message for every failure — expired, revoked, already done, retry
          budget spent, never issued — so a prober cannot learn which. It still
          has to leave a real person with somewhere to go, and it must not
          suggest they did anything wrong: by far the likeliest reason someone
          reads this is that the link simply aged out. */}
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Nothing went wrong on your end. These links are time-limited for security, and this one has
        run out — or the shop is already connected, in which case there is nothing left for you to
        do.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        If you still need to connect the shop, reply to whoever sent you this and ask for a fresh
        link. It takes them a few seconds to send.
      </p>
    </Shell>
  );
}

function Unavailable() {
  return (
    <Shell>
      <div className="flex items-center gap-2 text-muted-foreground">
        <TriangleAlert className="h-4 w-4" />
        <span className="text-[11px] font-bold uppercase tracking-[0.12em]">Try again shortly</span>
      </div>
      <h1 className="mt-3 text-xl font-bold tracking-tight text-foreground">
        We couldn&apos;t open this page
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Something went wrong on our side — your link is probably fine. Please refresh in a few
        minutes, or let your agency contact know.
      </p>
    </Shell>
  );
}

function Notice({ tone, children }: { tone: 'warn' | 'error'; children: React.ReactNode }) {
  const surface =
    tone === 'warn'
      ? 'border-transparent bg-[var(--pulse-warn-bg)]'
      : 'border-destructive/30 bg-destructive/10';
  return (
    // Body text keeps a TEXT token: a fixed-tint foreground on a themed surface
    // goes near-invisible when the theme flips.
    <div className={`mt-4 rounded-lg border p-3 text-xs leading-relaxed text-foreground ${surface}`}>
      {children}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-[var(--pulse-elev-2)]">
        {children}
        <p className="mt-6 border-t border-border/60 pt-4 text-[11px] text-muted-foreground">
          Sent to you by your agency, powered by Tempo.
        </p>
      </div>
    </main>
  );
}
