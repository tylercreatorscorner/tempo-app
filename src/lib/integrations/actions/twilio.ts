/**
 * Twilio (SMS) action library — direct HTTPS API.
 *
 * Tempo absorbs the SMS cost (no BYOK), so credentials are workspace-wide
 * env vars. Twilio's Messages API uses Basic auth: Account SID + Auth Token.
 *
 * Env required:
 *   TWILIO_ACCOUNT_SID    starts with "AC..."  (the public account id)
 *   TWILIO_AUTH_TOKEN     the secret token from the Twilio console
 *   TWILIO_FROM_NUMBER    E.164 sender number, e.g. "+18885551234"
 *                         (must be a number provisioned in your Twilio account)
 *
 * SMS pricing reference (US): ~$0.0079 per segment outbound.
 *   - 160 chars (GSM-7) = 1 segment
 *   - 70 chars (UCS-2 / emoji) = 1 segment
 *   - Longer messages auto-segment and bill per segment.
 * Multi-recipient: one Twilio API call per recipient (no native fan-out).
 */

const API_BASE = 'https://api.twilio.com/2010-04-01';

export interface TwilioSendResult {
  ok: boolean;
  /** Twilio Message SID (starts with "SM..."). */
  sid?: string;
  status?: number;
  error?: string;
  /** Number of recipients we actually sent to (for multi-recipient). */
  sentCount?: number;
  /** Per-recipient error details if any of the fan-out calls failed. */
  failures?: Array<{ to: string; error: string }>;
}

interface SendArgs {
  to: string;          // E.164, or comma-separated list for fan-out
  body: string;
  from?: string;       // override TWILIO_FROM_NUMBER
}

function splitNumbers(s: string): string[] {
  return s.split(',').map(p => p.trim()).filter(Boolean);
}

function isValidE164(num: string): boolean {
  // E.164 = "+" followed by up to 15 digits. Twilio is strict about this.
  return /^\+\d{7,15}$/.test(num);
}

function basicAuthHeader(sid: string, token: string): string {
  return 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
}

async function sendOne({
  to, body, from, accountSid, authToken,
}: {
  to: string; body: string; from: string;
  accountSid: string; authToken: string;
}): Promise<TwilioSendResult> {
  try {
    const res = await fetch(`${API_BASE}/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(accountSid, authToken),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
    });
    const j = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
    if (!res.ok) {
      return { ok: false, status: res.status, error: j.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, sid: j.sid };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

export async function sendSms({ to, body, from }: SendArgs): Promise<TwilioSendResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) return { ok: false, error: 'TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN env vars are required' };

  const fromNumber = from ?? process.env.TWILIO_FROM_NUMBER;
  if (!fromNumber) return { ok: false, error: 'TWILIO_FROM_NUMBER env var is required' };
  if (!isValidE164(fromNumber)) return { ok: false, error: `From number must be E.164 (got: ${fromNumber})` };

  const recipients = splitNumbers(to);
  if (recipients.length === 0) return { ok: false, error: '`to` is required (one or more E.164 phone numbers)' };
  if (!body.trim()) return { ok: false, error: 'body is required' };

  // Validate every recipient up-front so we don't partial-fail half a blast.
  const invalid = recipients.filter(r => !isValidE164(r));
  if (invalid.length > 0) {
    return { ok: false, error: `Invalid E.164 number(s): ${invalid.join(', ')}. Expected format like +18885551234.` };
  }

  // Single-recipient fast path
  if (recipients.length === 1) {
    return sendOne({ to: recipients[0], body, from: fromNumber, accountSid, authToken });
  }

  // Fan-out — Twilio bills per send, so this multiplies cost linearly.
  // Cap defensively at 100 to avoid runaway when someone pastes a huge list.
  if (recipients.length > 100) {
    return { ok: false, error: `Too many recipients (${recipients.length}). Cap is 100 per send — split into smaller batches.` };
  }

  const failures: Array<{ to: string; error: string }> = [];
  let lastSid: string | undefined;
  for (const r of recipients) {
    const result = await sendOne({ to: r, body, from: fromNumber, accountSid, authToken });
    if (result.ok) {
      lastSid = result.sid;
    } else {
      failures.push({ to: r, error: result.error ?? 'send failed' });
    }
  }

  const sentCount = recipients.length - failures.length;
  if (sentCount === 0) {
    return { ok: false, error: `All ${recipients.length} sends failed. First: ${failures[0]?.error}`, failures };
  }
  if (failures.length > 0) {
    return {
      ok: true,
      sid: lastSid,
      sentCount,
      failures,
      error: `${failures.length} of ${recipients.length} sends failed (partial success)`,
    };
  }
  return { ok: true, sid: lastSid, sentCount };
}
