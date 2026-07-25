/**
 * AES-256-GCM envelope for TikTok Shop OAuth tokens.
 *
 * The tokens in tiktok_shop_connections are the highest-value secret in the
 * product: they authorize reads (and, with the wrong scopes, writes) against a
 * client's live storefront. They are encrypted HERE, at the application layer,
 * so that the key never enters the database — a dump of the connections table,
 * a leaked read-replica, or a mis-scoped RLS policy yields ciphertext only.
 *
 * KEY: env `TIKTOK_TOKEN_ENC_KEY` — 32 raw bytes, BASE64-encoded (44 chars).
 *   Generate with:  openssl rand -base64 32
 * Base64 is the one accepted encoding; hex is rejected with an explicit message
 * rather than silently truncated to the wrong key.
 *
 * WIRE FORMAT: `v1.<iv>.<authTag>.<ciphertext>`, each part standard base64.
 *   - The `v1` prefix exists so a future key rotation or algorithm change can be
 *     detected on read instead of surfacing as a decrypt failure of unknown origin.
 *   - A FRESH random 12-byte IV per encryption. GCM catastrophically loses
 *     confidentiality and integrity if an (key, IV) pair is ever reused, so the
 *     IV is never derived from the plaintext, the row, or a counter.
 *   - The 16-byte auth tag is stored alongside, which is what makes a tampered
 *     ciphertext throw on decrypt rather than return garbage.
 *
 * NOTHING in this module logs, throws, or returns the plaintext, the key, or the
 * ciphertext. Error messages are deliberately content-free — an error string
 * ends up in logs, and logs are not a place for key material.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ENV_VAR = 'TIKTOK_TOKEN_ENC_KEY';
const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = 'v1';

let cachedKey: Buffer | null = null;

/** Resolve + validate the key. Throws loudly rather than falling back to a
 *  default, a zero key, or plaintext storage: a missing key must stop the
 *  connect flow, not quietly downgrade it. */
function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env[ENV_VAR];
  if (!raw || !raw.trim()) {
    throw new Error(
      `[tiktok/token-crypto] ${ENV_VAR} is not set. ` +
        `Generate one with: openssl rand -base64 32`,
    );
  }

  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    throw new Error(
      `[tiktok/token-crypto] ${ENV_VAR} looks like hex. This module expects ` +
        `base64 (openssl rand -base64 32); re-encode the key to base64.`,
    );
  }

  // Buffer.from(..., 'base64') never throws — it silently drops invalid
  // characters — so the byte-length check below is the ONLY real validation.
  const key = Buffer.from(trimmed, 'base64');

  if (key.length !== KEY_BYTES) {
    // Length only — never echo the value.
    throw new Error(
      `[tiktok/token-crypto] ${ENV_VAR} decodes to ${key.length} bytes; ` +
        `AES-256 needs exactly ${KEY_BYTES}. Generate with: openssl rand -base64 32`,
    );
  }

  cachedKey = key;
  return key;
}

/** Preflight for the connect flow and health checks: is the key present and the
 *  right shape? Lets the UI refuse to start an OAuth round trip it cannot
 *  finish, instead of failing after the merchant has already consented. */
export function isTokenEncryptionConfigured(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

/** Encrypt a token. Returns the `v1.iv.tag.ciphertext` envelope to store in
 *  tiktok_shop_connections.*_encrypted. */
export function encryptToken(plaintext: string): string {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('[tiktok/token-crypto] refusing to encrypt an empty token.');
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.');
}

/** Decrypt an envelope produced by encryptToken. Throws on a malformed
 *  envelope, an unknown version, a wrong key, or ANY tampering (GCM tag
 *  mismatch) — a decrypt failure is never recoverable into a partial result. */
export function decryptToken(envelope: string): string {
  if (typeof envelope !== 'string' || !envelope) {
    throw new Error('[tiktok/token-crypto] empty ciphertext envelope.');
  }

  const parts = envelope.split('.');
  if (parts.length !== 4) {
    throw new Error('[tiktok/token-crypto] malformed ciphertext envelope.');
  }

  const [version, ivB64, tagB64, dataB64] = parts;
  if (version !== VERSION) {
    throw new Error(`[tiktok/token-crypto] unsupported envelope version "${version}".`);
  }

  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES || data.length === 0) {
    throw new Error('[tiktok/token-crypto] malformed ciphertext envelope.');
  }

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    // Swallow the underlying message: node's is generic, but re-throwing a
    // caught error risks leaking buffers into a log line.
    throw new Error(
      '[tiktok/token-crypto] decryption failed (wrong key or tampered ciphertext).',
    );
  }
}

/** True when `value` already looks like one of our envelopes. Use it to assert
 *  at the DB boundary that a plaintext token is never about to be written. */
export function isEncryptedEnvelope(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(`${VERSION}.`) && value.split('.').length === 4;
}

/** Exported for the round-trip test and for ops docs. */
export const TOKEN_ENC_KEY_ENV_VAR = ENV_VAR;
