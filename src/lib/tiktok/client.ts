import crypto from 'crypto';
import type { TikTokApiResponse } from './types';

const TIKTOK_BASE_URL = 'https://open-api.tiktokglobalshop.com';
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

interface TikTokClientConfig {
  appKey: string;
  appSecret: string;
  accessToken: string;
  shopId?: string;
}

/**
 * TikTok Shop API client with HMAC-SHA256 request signing,
 * token management, and rate limit handling with exponential backoff.
 */
export class TikTokClient {
  private appKey: string;
  private appSecret: string;
  private accessToken: string;
  private shopId?: string;

  constructor(config: TikTokClientConfig) {
    this.appKey = config.appKey;
    this.appSecret = config.appSecret;
    this.accessToken = config.accessToken;
    this.shopId = config.shopId;
  }

  /**
   * Create a client from env vars + a stored access token.
   */
  static fromEnv(accessToken: string, shopId?: string): TikTokClient {
    const appKey = process.env.TIKTOK_APP_KEY;
    const appSecret = process.env.TIKTOK_APP_SECRET;
    if (!appKey || !appSecret) {
      throw new Error('Missing TIKTOK_APP_KEY or TIKTOK_APP_SECRET env vars');
    }
    return new TikTokClient({ appKey, appSecret, accessToken, shopId });
  }

  /**
   * Generate HMAC-SHA256 signature per TikTok's auth spec.
   *
   * Sign string = app_secret + path + sorted_params_concatenated + body + app_secret
   * (Params exclude 'sign', 'access_token', and 'timestamp' from signing in some versions,
   *  but TikTok's current spec signs all query params except 'sign' itself.)
   */
  private generateSignature(
    path: string,
    params: Record<string, string>,
    body?: string
  ): string {
    // Sort params alphabetically, exclude 'sign'
    const sortedKeys = Object.keys(params)
      .filter((k) => k !== 'sign')
      .sort();

    const paramString = sortedKeys.map((k) => `${k}${params[k]}`).join('');

    const signBase = `${this.appSecret}${path}${paramString}${body || ''}${this.appSecret}`;
    return crypto
      .createHmac('sha256', this.appSecret)
      .update(signBase)
      .digest('hex');
  }

  /**
   * Make an authenticated GET request to the TikTok Shop API.
   */
  async get<T>(
    path: string,
    queryParams: Record<string, string> = {}
  ): Promise<TikTokApiResponse<T>> {
    return this.request<T>('GET', path, queryParams);
  }

  /**
   * Make an authenticated POST request to the TikTok Shop API.
   */
  async post<T>(
    path: string,
    queryParams: Record<string, string> = {},
    body?: Record<string, unknown>
  ): Promise<TikTokApiResponse<T>> {
    return this.request<T>('POST', path, queryParams, body);
  }

  /**
   * Core request method with signing, retries, and rate limit backoff.
   */
  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    queryParams: Record<string, string> = {},
    body?: Record<string, unknown>
  ): Promise<TikTokApiResponse<T>> {
    const timestamp = Math.floor(Date.now() / 1000).toString();

    // Build params that go into signing and URL
    const params: Record<string, string> = {
      app_key: this.appKey,
      timestamp,
      ...queryParams,
    };
    if (this.shopId) {
      params.shop_id = this.shopId;
    }

    const bodyStr = body ? JSON.stringify(body) : undefined;
    const sign = this.generateSignature(path, params, bodyStr);
    params.sign = sign;

    // Build URL
    const url = new URL(`${TIKTOK_BASE_URL}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }

    // Add access token as header (not signed)
    const headers: Record<string, string> = {
      'x-tts-access-token': this.accessToken,
      'Content-Type': 'application/json',
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        await sleep(delay);
      }

      try {
        const res = await fetch(url.toString(), {
          method,
          headers,
          body: bodyStr,
        });

        // Rate limited - retry with backoff
        if (res.status === 429) {
          const retryAfter = res.headers.get('retry-after');
          const waitMs = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : BASE_DELAY_MS * Math.pow(2, attempt);
          console.warn(
            `[TikTok] Rate limited on ${path}, waiting ${waitMs}ms (attempt ${attempt + 1})`
          );
          await sleep(waitMs);
          continue;
        }

        if (!res.ok) {
          const text = await res.text();
          throw new Error(
            `TikTok API error: ${res.status} ${res.statusText} - ${text}`
          );
        }

        const json = (await res.json()) as TikTokApiResponse<T>;

        // TikTok returns code != 0 for business errors
        if (json.code !== 0) {
          // Rate limit error codes
          if (json.code === 429 || json.message?.toLowerCase().includes('rate limit')) {
            console.warn(
              `[TikTok] Rate limit error on ${path} (attempt ${attempt + 1}): ${json.message}`
            );
            continue;
          }
          throw new Error(
            `TikTok API business error: code=${json.code}, message=${json.message}, request_id=${json.request_id}`
          );
        }

        return json;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < MAX_RETRIES) {
          console.warn(
            `[TikTok] Request to ${path} failed (attempt ${attempt + 1}): ${lastError.message}`
          );
        }
      }
    }

    throw lastError || new Error(`TikTok API request to ${path} failed after ${MAX_RETRIES + 1} attempts`);
  }

  // ============================================================
  // Token Management (static helpers)
  // ============================================================

  /**
   * Exchange an authorization code for access and refresh tokens.
   */
  static async getAccessToken(authCode: string): Promise<{
    access_token: string;
    refresh_token: string;
    access_token_expire_in: number;
    refresh_token_expire_in: number;
  }> {
    const appKey = process.env.TIKTOK_APP_KEY!;
    const appSecret = process.env.TIKTOK_APP_SECRET!;

    const url = new URL(`${TIKTOK_BASE_URL}/api/v2/token/get`);
    url.searchParams.set('app_key', appKey);
    url.searchParams.set('app_secret', appSecret);
    url.searchParams.set('auth_code', authCode);
    url.searchParams.set('grant_type', 'authorized_code');

    const res = await fetch(url.toString());
    const json = await res.json();

    if (json.code !== 0) {
      throw new Error(`Token exchange failed: ${json.message}`);
    }

    return json.data;
  }

  /**
   * Refresh an access token using a refresh token.
   */
  static async refreshAccessToken(refreshToken: string): Promise<{
    access_token: string;
    refresh_token: string;
    access_token_expire_in: number;
    refresh_token_expire_in: number;
  }> {
    const appKey = process.env.TIKTOK_APP_KEY!;
    const appSecret = process.env.TIKTOK_APP_SECRET!;

    const url = new URL(`${TIKTOK_BASE_URL}/api/v2/token/refresh`);
    url.searchParams.set('app_key', appKey);
    url.searchParams.set('app_secret', appSecret);
    url.searchParams.set('refresh_token', refreshToken);
    url.searchParams.set('grant_type', 'refresh_token');

    const res = await fetch(url.toString());
    const json = await res.json();

    if (json.code !== 0) {
      throw new Error(`Token refresh failed: ${json.message}`);
    }

    return json.data;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
