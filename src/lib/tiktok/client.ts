/**
 * TikTok Shop API client: signs and sends requests, classifies failures into
 * typed errors, and mints/refreshes tokens.
 *
 * Node-only (node:crypto, via ./signature) — callers must run on the nodejs
 * runtime, not edge.
 *
 * There is deliberately no ingestion, scheduling or audit code here. Those need
 * to be written against captured real responses, not against assumptions about
 * response shapes.
 */
import { signRequest } from './signature';
import type { TikTokEnvelope, TikTokTokenResponseData, TikTokTokens } from './types';

/**
 * Two hosts, and they are not interchangeable: data calls go to the open-api
 * host, token mint/refresh goes to the auth host. Sending token calls to the
 * API host makes the OAuth flow impossible.
 */
const TIKTOK_API_URL = 'https://open-api.tiktokglobalshop.com';
const TIKTOK_AUTH_URL = 'https://auth.tiktok-shops.com';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 500;
const MAX_ERROR_BODY_CHARS = 500;

/**
 * Shop-agnostic endpoints. These are how a caller discovers which shops it can
 * reach, so they must be sent WITHOUT a shop scope — the cipher is the thing
 * they return.
 */
const SHOP_AGNOSTIC_PATH = /^\/(authorization|seller)\/\d{6}\//;

// ============================================================
// Errors
// ============================================================

export interface TikTokErrorInit {
  /** HTTP status. 0 for network failures and timeouts, where none was received. */
  status: number;
  /** TikTok business code from the envelope, or null if we never got one. */
  code: number | null;
  message: string;
  requestId: string | null;
}

export class TikTokError extends Error {
  readonly status: number;
  readonly code: number | null;
  readonly requestId: string | null;

  constructor({ status, code, message, requestId }: TikTokErrorInit) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

/** Token rejected or expired. The only error the onTokenExpired hook reacts to. */
export class TikTokAuthError extends TikTokError {}

export class TikTokRateLimitError extends TikTokError {
  readonly retryAfterMs: number | null;

  constructor(init: TikTokErrorInit & { retryAfterMs?: number | null }) {
    super(init);
    this.retryAfterMs = init.retryAfterMs ?? null;
  }
}

/** A 4xx that will fail the same way on retry (bad params, missing scope). */
export class TikTokPermanentError extends TikTokError {}

/** 5xx, network failure or timeout — safe to retry an idempotent call. */
export class TikTokTransientError extends TikTokError {}

// ============================================================
// Client
// ============================================================

export interface TikTokClientOptions {
  accessToken: string;
  /**
   * Shop scope for data calls, injected as `shop_cipher`. NOT shop_id: shop_id
   * is not accepted by the 202309+ endpoints.
   */
  shopCipher?: string;
  /** Defaults to TIKTOK_APP_KEY / TIKTOK_APP_SECRET from the environment. */
  appKey?: string;
  appSecret?: string;
  /**
   * Called at most once per request, when TikTok rejects the access token.
   * Return a fresh token to have the request retried with it, or null to give
   * up and let the TikTokAuthError propagate.
   */
  onTokenExpired?: () => Promise<string | null>;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface TikTokResult<T> {
  /**
   * The envelope's `data`. Unverified shape — cast it at the call site until
   * generated types exist (see ./types).
   */
  data: T;
  requestId: string | null;
}

export interface TikTokRequestOptions {
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  /**
   * Opt in to retrying a non-GET call. Off by default: a retried write can
   * double-apply, and no TikTok write endpoint is known to be idempotent.
   */
  idempotent?: boolean;
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export class TikTokClient {
  private readonly appKey: string;
  private readonly appSecret: string;
  private readonly shopCipher?: string;
  private readonly onTokenExpired?: () => Promise<string | null>;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private accessToken: string;

  constructor(options: TikTokClientOptions) {
    if (!options.accessToken) throw new Error('TikTokClient: accessToken is required');

    const { appKey, appSecret } = resolveAppCredentials(options);
    this.appKey = appKey;
    this.appSecret = appSecret;
    this.accessToken = options.accessToken;
    this.shopCipher = options.shopCipher;
    this.onTokenExpired = options.onTokenExpired;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  get<T = unknown>(path: string, query?: TikTokRequestOptions['query']): Promise<TikTokResult<T>> {
    return this.request<T>('GET', path, { query });
  }

  post<T = unknown>(path: string, options: TikTokRequestOptions = {}): Promise<TikTokResult<T>> {
    return this.request<T>('POST', path, options);
  }

  /**
   * @param path request path only, e.g. `/authorization/202309/shops` — no host
   *   and no query string; put params in `options.query` so they get signed.
   */
  async request<T = unknown>(
    method: HttpMethod,
    path: string,
    options: TikTokRequestOptions = {}
  ): Promise<TikTokResult<T>> {
    try {
      return await this.send<T>(method, path, options);
    } catch (err) {
      if (err instanceof TikTokAuthError && this.onTokenExpired) {
        const fresh = await this.onTokenExpired();
        if (!fresh) throw err;
        this.accessToken = fresh;
        // Exactly one retry: if the fresh token is rejected too, that is real.
        return await this.send<T>(method, path, options);
      }
      throw err;
    }
  }

  private async send<T>(
    method: HttpMethod,
    path: string,
    options: TikTokRequestOptions
  ): Promise<TikTokResult<T>> {
    const retryAllowed = method === 'GET' || options.idempotent === true;
    const bodyText = options.body === undefined ? undefined : JSON.stringify(options.body);
    let lastError: TikTokError | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) await sleep(backoffMs(attempt, lastError));

      try {
        return await this.attempt<T>(method, path, options, bodyText);
      } catch (err) {
        const error =
          err instanceof TikTokError
            ? err
            : new TikTokTransientError({
                status: 0,
                code: null,
                requestId: null,
                message: err instanceof Error ? err.message : String(err),
              });

        const retryable =
          error instanceof TikTokRateLimitError || error instanceof TikTokTransientError;
        if (!retryable || !retryAllowed || attempt === this.maxRetries) throw error;

        lastError = error;
        // Path only, never the URL: the query string carries app_key and sign.
        console.warn(
          `[tiktok] ${method} ${path} attempt ${attempt + 1} failed (${error.name} ${error.status}); retrying`
        );
      }
    }

    throw lastError ?? new TikTokTransientError({
      status: 0,
      code: null,
      requestId: null,
      message: `${method} ${path} exhausted retries`,
    });
  }

  private async attempt<T>(
    method: HttpMethod,
    path: string,
    options: TikTokRequestOptions,
    bodyText: string | undefined
  ): Promise<TikTokResult<T>> {
    // Params, timestamp, signature and URL are rebuilt on every attempt: a
    // signature is bound to its timestamp, so replaying the first attempt's
    // URL after a backoff sends TikTok an increasingly stale request.
    const params: Record<string, string> = {
      app_key: this.appKey,
      timestamp: Math.floor(Date.now() / 1000).toString(),
    };
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== null) params[key] = String(value);
    }
    if (this.shopCipher && !SHOP_AGNOSTIC_PATH.test(path)) {
      params.shop_cipher = this.shopCipher;
    }

    const contentType = bodyText === undefined ? undefined : 'application/json';
    params.sign = signRequest({
      appSecret: this.appSecret,
      path,
      params,
      body: bodyText,
      method,
      contentType,
    });

    const url = new URL(path, TIKTOK_API_URL);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

    const headers: Record<string, string> = { 'x-tts-access-token': this.accessToken };
    if (contentType) headers['Content-Type'] = contentType;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: bodyText,
        signal: controller.signal,
        cache: 'no-store',
      });
    } catch (err) {
      // Never put `url` in the message: it carries app_key and sign.
      throw new TikTokTransientError({
        status: 0,
        code: null,
        requestId: null,
        message: controller.signal.aborted
          ? `${method} ${path} timed out after ${this.timeoutMs}ms`
          : `${method} ${path} network error: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      clearTimeout(timer);
    }

    // Read as text first and parse by hand: calling res.json() on an error page
    // throws a SyntaxError that buries the real status.
    const rawBody = await res.text().catch(() => '');
    const envelope = parseEnvelope(rawBody);
    const requestId = envelope?.request_id ?? null;

    if (!res.ok) {
      throw classifyStatus(res.status, {
        status: res.status,
        code: envelope?.code ?? null,
        requestId,
        message: `${method} ${path} failed: HTTP ${res.status} ${truncate(rawBody)}`,
        retryAfterMs: parseRetryAfter(res.headers.get('retry-after')),
      });
    }

    if (!envelope) {
      throw new TikTokTransientError({
        status: res.status,
        code: null,
        requestId,
        message: `${method} ${path} returned a non-JSON body: ${truncate(rawBody)}`,
      });
    }

    // TikTok reports business failures as HTTP 200 with a non-zero code.
    if (envelope.code !== 0) {
      const init: TikTokErrorInit = {
        status: res.status,
        code: envelope.code,
        requestId,
        message: `${method} ${path} failed: code=${envelope.code} ${envelope.message}`,
      };
      // Business errors are never retried here: which codes are retryable is
      // not verified against a live shop yet.
      throw looksLikeExpiredToken(envelope.message)
        ? new TikTokAuthError(init)
        : new TikTokPermanentError(init);
    }

    return { data: envelope.data as T, requestId };
  }
}

// ============================================================
// Tokens
// ============================================================

/** Exchange the auth code from the authorization redirect for a token pair. */
export async function exchangeAuthCode(authCode: string): Promise<TikTokTokens> {
  if (!authCode) throw new Error('exchangeAuthCode: authCode is required');
  return mintTokens('/api/v2/token/get', {
    auth_code: authCode,
    grant_type: 'authorized_code',
  });
}

/** Trade a refresh token for a new pair. Both tokens rotate. */
export async function refreshToken(refreshToken: string): Promise<TikTokTokens> {
  if (!refreshToken) throw new Error('refreshToken: refreshToken is required');
  return mintTokens('/api/v2/token/refresh', {
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
}

async function mintTokens(path: string, credentials: Record<string, string>): Promise<TikTokTokens> {
  const { appKey, appSecret } = resolveAppCredentials();

  // Vendor-dictated shape, not a preference: GET with every credential in the
  // QUERY STRING, and no signature — the app secret itself authenticates the
  // call. Verified against the reference SDK EcomPHP/tiktokshop-php:
  // src/Auth.php getToken()/refreshNewToken() pass RequestOptions::QUERY to an
  // HTTP GET, and tests/AuthTest.php asserts the method is GET.
  //   https://github.com/EcomPHP/tiktokshop-php/blob/master/src/Auth.php
  // Do NOT "harden" this into a POST with a JSON body: the auth host does not
  // accept that, and it fails at the one call that cannot be retried later.
  //
  // The app secret therefore travels in a URL, which is the vendor's contract
  // and not ours to change. The mitigation that IS ours: this URL is never
  // logged and never reaches an error message, and the response body — which
  // carries the tokens — is never echoed either (see below).
  const url = new URL(`${TIKTOK_AUTH_URL}${path}`);
  url.searchParams.set('app_key', appKey);
  url.searchParams.set('app_secret', appSecret);
  for (const [key, value] of Object.entries(credentials)) {
    url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (err) {
    throw new TikTokTransientError({
      status: 0,
      code: null,
      requestId: null,
      message: controller.signal.aborted
        ? `token ${path} timed out after ${DEFAULT_TIMEOUT_MS}ms`
        : `token ${path} network error: ${err instanceof Error ? err.message : String(err)}`,
    });
  } finally {
    clearTimeout(timer);
  }

  // A token response body holds the tokens themselves and echoes the auth code,
  // so unlike every other call it must never reach an error message or a log.
  const envelope = parseEnvelope<TikTokTokenResponseData>(await res.text().catch(() => ''));

  if (!res.ok) {
    throw classifyStatus(res.status, {
      status: res.status,
      code: envelope?.code ?? null,
      requestId: envelope?.request_id ?? null,
      message: `token ${path} failed: HTTP ${res.status}`,
    });
  }
  if (!envelope) {
    throw new TikTokTransientError({
      status: res.status,
      code: null,
      requestId: null,
      message: `token ${path} returned a non-JSON body`,
    });
  }
  if (envelope.code !== 0) {
    throw new TikTokPermanentError({
      status: res.status,
      code: envelope.code,
      requestId: envelope.request_id ?? null,
      message: `token ${path} rejected: code=${envelope.code} ${envelope.message}`,
    });
  }

  return toTokens(envelope.data, envelope.request_id ?? null, path);
}

function toTokens(
  data: TikTokTokenResponseData | undefined,
  requestId: string | null,
  path: string
): TikTokTokens {
  const missing: string[] = [];
  if (!data || typeof data.access_token !== 'string') missing.push('access_token');
  if (!data || typeof data.refresh_token !== 'string') missing.push('refresh_token');
  if (!data || typeof data.access_token_expire_in !== 'number') missing.push('access_token_expire_in');
  if (!data || typeof data.refresh_token_expire_in !== 'number') missing.push('refresh_token_expire_in');

  if (!data || missing.length > 0) {
    // Field names only — the values are the credentials.
    throw new TikTokPermanentError({
      status: 200,
      code: null,
      requestId,
      message: `token ${path} response is missing: ${missing.join(', ')}`,
    });
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    // `*_expire_in` are ABSOLUTE unix timestamps in seconds despite the name,
    // NOT a TTL. Read as a TTL they make every token look either long expired
    // or decades away, and the refresh job then never runs (or always does).
    accessTokenExpiresAt: new Date(data.access_token_expire_in * 1000),
    refreshTokenExpiresAt: new Date(data.refresh_token_expire_in * 1000),
    openId: data.open_id ?? null,
    sellerName: data.seller_name ?? null,
  };
}

// ============================================================
// Helpers
// ============================================================

function resolveAppCredentials(options?: { appKey?: string; appSecret?: string }): {
  appKey: string;
  appSecret: string;
} {
  const appKey = options?.appKey ?? process.env.TIKTOK_APP_KEY;
  const appSecret = options?.appSecret ?? process.env.TIKTOK_APP_SECRET;

  if (!appKey || !appSecret) {
    const missing = [
      appKey ? null : 'TIKTOK_APP_KEY',
      appSecret ? null : 'TIKTOK_APP_SECRET',
    ].filter((name): name is string => name !== null);
    throw new Error(`TikTok Shop is not configured: ${missing.join(' and ')} must be set`);
  }

  return { appKey, appSecret };
}

function parseEnvelope<T = unknown>(rawBody: string): TikTokEnvelope<T> | null {
  if (!rawBody) return null;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== 'object') return null;
    const envelope = parsed as TikTokEnvelope<T>;
    return typeof envelope.code === 'number' ? envelope : null;
  } catch {
    return null;
  }
}

function classifyStatus(
  status: number,
  init: TikTokErrorInit & { retryAfterMs?: number | null }
): TikTokError {
  if (status === 401) return new TikTokAuthError(init);
  if (status === 429) return new TikTokRateLimitError(init);
  if (status >= 500) return new TikTokTransientError(init);
  if (status >= 400) return new TikTokPermanentError(init);
  return new TikTokTransientError(init);
}

/**
 * TikTok reports an expired token as HTTP 200 plus a business code, and those
 * numeric codes are not verified against a live shop yet — so match the message
 * instead. Pin the codes from captured responses and delete this.
 */
function looksLikeExpiredToken(message: string): boolean {
  const text = (message ?? '').toLowerCase();
  return text.includes('token') && (text.includes('invalid') || text.includes('expire'));
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
}

function backoffMs(attempt: number, lastError?: TikTokError): number {
  if (lastError instanceof TikTokRateLimitError && lastError.retryAfterMs !== null) {
    return lastError.retryAfterMs;
  }
  return BASE_BACKOFF_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
}

function truncate(text: string): string {
  if (text.length <= MAX_ERROR_BODY_CHARS) return text;
  return `${text.slice(0, MAX_ERROR_BODY_CHARS)}... (${text.length} chars)`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
