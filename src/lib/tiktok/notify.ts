/**
 * "A client just authorized — go bind their shop."
 *
 * The panel is the primary surface, but the panel only helps someone who is
 * already looking at it. This is the asynchronous flow's weak point: the client
 * clicks at 8am, the tokens sit in a table, and nothing anywhere says so.
 *
 * TWO REAL PATHS, both already used in production by this app, and NEITHER of
 * them the Railway Discord bot (dead since March — anything routed through it
 * would be a notification that silently never arrives):
 *
 *   1. An incoming webhook (Discord or Slack) via deliverToWebhook — the exact
 *      mechanism /api/cron/run-schedules uses to deliver report posts. It is a
 *      plain HTTPS POST from this app. Needs TIKTOK_ALERT_WEBHOOK_URL; when
 *      that is unset nothing is sent and nothing pretends otherwise.
 *   2. Email via Resend — the same helper behind invoice email. Addressed to
 *      the admin who ISSUED the link (tiktok_connect_invites.created_by), so
 *      there is no recipient to guess. Needs RESEND_API_KEY.
 *
 * Best effort, always. Never throws into the callback: the authorization is
 * already parked by the time this runs, and failing to announce it must not
 * turn a successful authorization into an error page for the client.
 *
 * Carries NO secrets — not the invite token, not a shop cipher, not a merchant
 * token. A notification goes to an inbox and a chat channel, which are exactly
 * the places a URL secret must never be copied into.
 */
import { deliverToWebhook } from '@/lib/messaging/webhook';
import { sendEmail } from '@/lib/integrations/actions/resend';

/** A hung fetch on this path would stall the client's redirect out of TikTok.
 *  The notice is worth a few seconds and not one more. */
const NOTIFY_TIMEOUT_MS = 4_000;

export interface AuthorizationNotice {
  brandLabel: string;
  brandSlug: string;
  sellerName: string | null;
  shopCount: number;
  /** When the parked authorization stops being confirmable. */
  confirmBy: string | null;
  /** The admin who issued the link, if known. */
  notifyEmail: string | null;
  /** Absolute URL of the Settings panel. */
  panelUrl: string;
}

export async function notifyPendingAuthorization(notice: AuthorizationNotice): Promise<void> {
  const deadline = notice.confirmBy ? new Date(notice.confirmBy) : null;
  const deadlineText =
    deadline && !Number.isNaN(deadline.getTime())
      ? `Confirm by ${deadline.toUTCString()} or they will have to authorize again.`
      : 'Confirm it soon — a parked authorization is erased once its window passes.';

  const summary =
    `TikTok Shop: ${notice.sellerName ? `${notice.sellerName} ` : 'A client '}` +
    `authorized ${notice.brandLabel} (${notice.brandSlug}). ` +
    `${notice.shopCount === 1 ? '1 shop is' : `${notice.shopCount} shops are`} waiting for you to ` +
    `pick which one maps to the brand — nothing is linked until you do. ` +
    `${deadlineText}\n${notice.panelUrl}`;

  await Promise.allSettled([
    withTimeout(sendWebhook(summary), 'webhook'),
    withTimeout(sendMail(notice, summary), 'email'),
  ]);
}

async function sendWebhook(summary: string): Promise<void> {
  const url = (process.env.TIKTOK_ALERT_WEBHOOK_URL ?? '').trim();
  if (!url) return;

  const result = await deliverToWebhook(url, summary);
  if (!result.ok) {
    console.warn(`[tiktok/notify] webhook delivery failed (${result.status}): ${result.error ?? 'unknown'}`);
  }
}

async function sendMail(notice: AuthorizationNotice, summary: string): Promise<void> {
  if (!notice.notifyEmail) return;
  // Checked here rather than letting sendEmail report it, so an unconfigured
  // deployment logs nothing per authorization.
  if (!process.env.RESEND_API_KEY) return;

  const result = await sendEmail({
    to: notice.notifyEmail,
    subject: `${notice.brandLabel} authorized TikTok Shop — link their shop`,
    body: summary,
  });
  if (!result.ok) {
    console.warn(`[tiktok/notify] email delivery failed: ${result.error ?? 'unknown'}`);
  }
}

/** Resolves either way. A notice that cannot be delivered is a log line, not a
 *  failed authorization. */
async function withTimeout(work: Promise<void>, label: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[tiktok/notify] ${label} notice timed out after ${NOTIFY_TIMEOUT_MS}ms`);
      resolve();
    }, NOTIFY_TIMEOUT_MS);
  });

  try {
    await Promise.race([work, timeout]);
  } catch (err) {
    console.warn(`[tiktok/notify] ${label} notice failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
